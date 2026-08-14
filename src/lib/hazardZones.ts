/**
 * ハザードマップポータル（国土地理院）の公式ラスタタイルを地点・近傍サンプリングし、
 * 洪水・土砂区域への該当と「区域までの距離帯」を機械判定する。
 *
 * 注意:
 * - 行政による「区域外証明」ではない。公式データのラスタからの推定。
 * - 属性付きポリゴンの厳密な空間結合ではない。
 * - 未判定（タイル取得失敗等）を「区域外」に丸めないこと。
 * - 距離は円周上の離散サンプリングによる「○m以内」帯であり、最短距離の厳密値ではない。
 * - 最終確認は公式「重ねるハザードマップ」で行うこと。
 */

import type { ValueType } from './formulas'

export type ZoneHitStatus = 'in_zone' | 'nearby' | 'likely_outside' | 'unknown'

/** 4層を踏まえた総合ステータス。unknown を安全側に丸めない */
export type HazardEvalStatus =
  | 'in_zone'
  | 'nearby_zone'
  | 'all_outside'
  | 'partially_evaluated'
  | 'unevaluated'

/** 近傍探索の距離帯（m）。表示もこの単位で出す */
export const PROXIMITY_BANDS_M = [10, 20, 30, 50, 100] as const
const BEARING_COUNT = 8

export type ZoneHit = {
  id: string
  label: string
  /** true=地点が区域内推定, false=地点は区域外推定, null=未判定 */
  inZone: boolean | null
  status: ZoneHitStatus
  detail: string
  sourceUrl: string
  legendUrl?: string
  method: 'gsi-raster-sample'
  valueType: ValueType
  sampledAtZoom?: number
  failReason?: 'tile_missing' | 'pixel_read' | 'network'
  /**
   * 区域を検出した最短の距離帯（m）。
   * 0 = 地点そのものが区域内
   * 10/20/30/50/100 = その半径以内に区域あり
   * null = 100m以内に未検出、または未判定
   */
  nearestZoneWithinM: number | null
}

export type ZoneAssessment = {
  flood: ZoneHit
  sedimentSteep: ZoneHit
  sedimentDebris: ZoneHit
  sedimentSlide: ZoneHit
  anyOfficialZone: boolean
  fetchFailed: boolean
  status: HazardEvalStatus
  evaluatedCount: number
  unknownCount: number
  sampledAtZoom: number
  proximityBandsM: readonly number[]
}

const ZOOM_CANDIDATES = [15, 14, 13] as const

const LAYERS = {
  flood: {
    id: 'flood',
    label: '洪水浸水想定区域（想定最大規模）',
    url: 'https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png',
    legendUrl: 'https://disaportal.gsi.go.jp/hazardmap/copyright/img/shinsui_legend2-1.png',
    kind: 'flood' as const,
  },
  sedimentSteep: {
    id: 'sedimentSteep',
    label: '土砂災害警戒区域（急傾斜地の崩壊）',
    url: 'https://disaportaldata.gsi.go.jp/raster/05_kyukeishakeikaikuiki/{z}/{x}/{y}.png',
    kind: 'sediment' as const,
  },
  sedimentDebris: {
    id: 'sedimentDebris',
    label: '土砂災害警戒区域（土石流）',
    url: 'https://disaportaldata.gsi.go.jp/raster/05_dosekiryukeikaikuiki/{z}/{x}/{y}.png',
    kind: 'sediment' as const,
  },
  sedimentSlide: {
    id: 'sedimentSlide',
    label: '土砂災害警戒区域（地すべり）',
    url: 'https://disaportaldata.gsi.go.jp/raster/05_jisuberikeikaikuiki/{z}/{x}/{y}.png',
    kind: 'sediment' as const,
  },
}

type LayerDef = (typeof LAYERS)[keyof typeof LAYERS]

const tileCache = new Map<string, HTMLImageElement | 'missing' | 'pending'>()
const tileWaiters = new Map<string, Array<(img: HTMLImageElement | null) => void>>()

function latLonToTile(lat: number, lon: number, z: number) {
  const n = 2 ** z
  const x = Math.floor(((lon + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  )
  const xF = (((lon + 180) / 360) * n) % 1
  const yF =
    (((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n) % 1
  return { x, y, px: Math.min(255, Math.floor(xF * 256)), py: Math.min(255, Math.floor(yF * 256)) }
}

/** メートルオフセット（east/north）から緯度経度へ */
export function offsetLatLon(lat: number, lon: number, eastM: number, northM: number) {
  const dLat = northM / 111_320
  const cos = Math.cos((lat * Math.PI) / 180)
  const dLon = eastM / (111_320 * Math.max(0.2, cos))
  return { lat: lat + dLat, lon: lon + dLon }
}

function loadImageCached(url: string): Promise<HTMLImageElement | null> {
  const cached = tileCache.get(url)
  if (cached instanceof HTMLImageElement) return Promise.resolve(cached)
  if (cached === 'missing') return Promise.resolve(null)

  return new Promise((resolve) => {
    const waiters = tileWaiters.get(url) ?? []
    waiters.push(resolve)
    tileWaiters.set(url, waiters)
    if (cached === 'pending') return

    tileCache.set(url, 'pending')
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      tileCache.set(url, img)
      const list = tileWaiters.get(url) ?? []
      tileWaiters.delete(url)
      list.forEach((w) => w(img))
    }
    img.onerror = () => {
      tileCache.set(url, 'missing')
      const list = tileWaiters.get(url) ?? []
      tileWaiters.delete(url)
      list.forEach((w) => w(null))
    }
    try {
      img.src = url
    } catch {
      tileCache.set(url, 'missing')
      const list = tileWaiters.get(url) ?? []
      tileWaiters.delete(url)
      list.forEach((w) => w(null))
    }
  })
}

function samplePixel(
  img: HTMLImageElement,
  px: number,
  py: number,
): { r: number; g: number; b: number; a: number } | null {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, px, py, 1, 1, 0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return { r, g, b, a }
}

function classifyFloodDepth(r: number, g: number, b: number): string {
  const palette: Array<{ label: string; rgb: [number, number, number] }> = [
    { label: '浸水深 0.5m未満', rgb: [247, 245, 169] },
    { label: '浸水深 0.5〜3m', rgb: [255, 216, 192] },
    { label: '浸水深 3〜5m', rgb: [255, 183, 183] },
    { label: '浸水深 5〜10m', rgb: [255, 145, 145] },
    { label: '浸水深 10〜20m', rgb: [242, 133, 201] },
    { label: '浸水深 20m以上', rgb: [220, 122, 220] },
  ]
  let best = palette[0]
  let bestD = Infinity
  for (const p of palette) {
    const d = (r - p.rgb[0]) ** 2 + (g - p.rgb[1]) ** 2 + (b - p.rgb[2]) ** 2
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best.label
}

type SampleResult =
  | { ok: true; inZone: boolean; depthLabel?: string; url: string; z: number }
  | { ok: false; url: string; failReason: ZoneHit['failReason']; zTried: number[] }

async function samplePoint(layer: LayerDef, lat: number, lon: number): Promise<SampleResult> {
  const tried: number[] = []
  let lastUrl = ''
  let lastFail: ZoneHit['failReason'] = 'tile_missing'
  for (const z of ZOOM_CANDIDATES) {
    tried.push(z)
    const { x, y, px, py } = latLonToTile(lat, lon, z)
    const url = layer.url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
    lastUrl = url
    const img = await loadImageCached(url)
    if (!img) {
      lastFail = 'tile_missing'
      continue
    }
    const pix = samplePixel(img, px, py)
    if (!pix) {
      lastFail = 'pixel_read'
      continue
    }
    const inZone = pix.a > 30
    return {
      ok: true,
      inZone,
      depthLabel:
        inZone && layer.kind === 'flood' ? classifyFloodDepth(pix.r, pix.g, pix.b) : undefined,
      url,
      z,
    }
  }
  return { ok: false, url: lastUrl, failReason: lastFail, zTried: tried }
}

function ringPoints(lat: number, lon: number, radiusM: number) {
  const points: Array<{ lat: number; lon: number }> = []
  for (let i = 0; i < BEARING_COUNT; i++) {
    const rad = (i / BEARING_COUNT) * Math.PI * 2
    const east = Math.sin(rad) * radiusM
    const north = Math.cos(rad) * radiusM
    points.push(offsetLatLon(lat, lon, east, north))
  }
  return points
}

export function formatZoneProximity(hit: ZoneHit): string {
  if (hit.inZone === null) return hit.detail
  if (hit.nearestZoneWithinM === 0) {
    return hit.detail.includes('浸水深')
      ? hit.detail
      : '地点は区域内推定（距離 0m）'
  }
  if (hit.nearestZoneWithinM != null) {
    return `地点は区域外推定／区域まで約${hit.nearestZoneWithinM}m以内`
  }
  return `地点は区域外推定／${PROXIMITY_BANDS_M[PROXIMITY_BANDS_M.length - 1]}m以内には区域を検出せず`
}

async function sampleLayer(layer: LayerDef, lat: number, lon: number): Promise<ZoneHit> {
  const center = await samplePoint(layer, lat, lon)
  if (!center.ok) {
    const z = center.zTried.join('→')
    const detail =
      center.failReason === 'pixel_read'
        ? `未判定（画素読み取り失敗, z=${z}）`
        : `未判定（タイル欠損/未配信, z=${z}）`
    return {
      id: layer.id,
      label: layer.label,
      inZone: null,
      status: 'unknown',
      detail,
      sourceUrl: center.url,
      legendUrl: 'legendUrl' in layer ? layer.legendUrl : undefined,
      method: 'gsi-raster-sample',
      valueType: 'computed',
      failReason: center.failReason,
      sampledAtZoom: center.zTried[center.zTried.length - 1],
      nearestZoneWithinM: null,
    }
  }

  if (center.inZone) {
    let detail = '地点は区域内推定（距離 0m）'
    if (center.depthLabel) detail = `地点は区域内推定（距離 0m／${center.depthLabel}）`
    if (center.z !== ZOOM_CANDIDATES[0]) detail += `（z=${center.z}へフォールバック）`
    return {
      id: layer.id,
      label: layer.label,
      inZone: true,
      status: 'in_zone',
      detail,
      sourceUrl: center.url,
      legendUrl: 'legendUrl' in layer ? layer.legendUrl : undefined,
      method: 'gsi-raster-sample',
      valueType: 'computed',
      sampledAtZoom: center.z,
      nearestZoneWithinM: 0,
    }
  }

  // 地点外 → 距離帯を外側へ探索
  for (const radiusM of PROXIMITY_BANDS_M) {
    const pts = ringPoints(lat, lon, radiusM)
    const results = await Promise.all(pts.map((p) => samplePoint(layer, p.lat, p.lon)))
    const hit = results.find((r) => r.ok && r.inZone)
    if (hit && hit.ok) {
      let detail = `地点は区域外推定／区域まで約${radiusM}m以内`
      if (center.z !== ZOOM_CANDIDATES[0]) detail += `（地点z=${center.z}）`
      return {
        id: layer.id,
        label: layer.label,
        inZone: false,
        status: 'nearby',
        detail,
        sourceUrl: center.url,
        legendUrl: 'legendUrl' in layer ? layer.legendUrl : undefined,
        method: 'gsi-raster-sample',
        valueType: 'computed',
        sampledAtZoom: center.z,
        nearestZoneWithinM: radiusM,
      }
    }
  }

  const maxM = PROXIMITY_BANDS_M[PROXIMITY_BANDS_M.length - 1]
  let detail = `地点は区域外推定／${maxM}m以内には区域を検出せず`
  if (center.z !== ZOOM_CANDIDATES[0]) detail += `（z=${center.z}へフォールバック）`
  return {
    id: layer.id,
    label: layer.label,
    inZone: false,
    status: 'likely_outside',
    detail,
    sourceUrl: center.url,
    legendUrl: 'legendUrl' in layer ? layer.legendUrl : undefined,
    method: 'gsi-raster-sample',
    valueType: 'computed',
    sampledAtZoom: center.z,
    nearestZoneWithinM: null,
  }
}

export function summarizeHazardStatus(hits: ZoneHit[]): {
  status: HazardEvalStatus
  anyOfficialZone: boolean
  fetchFailed: boolean
  evaluatedCount: number
  unknownCount: number
} {
  const evaluated = hits.filter((h) => h.inZone !== null)
  const unknown = hits.filter((h) => h.inZone === null)
  const onPoint = hits.some((h) => h.inZone === true)
  const nearby = hits.some((h) => h.nearestZoneWithinM != null && h.nearestZoneWithinM > 0)
  const evaluatedCount = evaluated.length
  const unknownCount = unknown.length

  if (onPoint) {
    return {
      status: 'in_zone',
      anyOfficialZone: true,
      fetchFailed: false,
      evaluatedCount,
      unknownCount,
    }
  }
  if (evaluatedCount === 0) {
    return {
      status: 'unevaluated',
      anyOfficialZone: false,
      fetchFailed: true,
      evaluatedCount,
      unknownCount,
    }
  }
  if (nearby && unknownCount === 0) {
    return {
      status: 'nearby_zone',
      anyOfficialZone: false,
      fetchFailed: false,
      evaluatedCount,
      unknownCount,
    }
  }
  if (nearby && unknownCount > 0) {
    return {
      status: 'nearby_zone',
      anyOfficialZone: false,
      fetchFailed: false,
      evaluatedCount,
      unknownCount,
    }
  }
  if (unknownCount > 0) {
    return {
      status: 'partially_evaluated',
      anyOfficialZone: false,
      fetchFailed: false,
      evaluatedCount,
      unknownCount,
    }
  }
  return {
    status: 'all_outside',
    anyOfficialZone: false,
    fetchFailed: false,
    evaluatedCount,
    unknownCount,
  }
}

export function hazardStatusLabel(status: HazardEvalStatus): string {
  switch (status) {
    case 'in_zone':
      return '地点が公式区域内（機械判定）'
    case 'nearby_zone':
      return '地点外だが近傍に区域あり'
    case 'all_outside':
      return '判定済み層は近傍にも区域なし'
    case 'partially_evaluated':
      return '一部判定済み（未判定あり）'
    case 'unevaluated':
      return '未判定'
  }
}

/** 比較表用: 最も近い区域距離帯を返す（m）。無しは null */
export function nearestHazardDistanceM(zones: ZoneAssessment): number | null {
  const dists = [
    zones.flood.nearestZoneWithinM,
    zones.sedimentSteep.nearestZoneWithinM,
    zones.sedimentDebris.nearestZoneWithinM,
    zones.sedimentSlide.nearestZoneWithinM,
  ].filter((d): d is number => d != null)
  if (!dists.length) return null
  return Math.min(...dists)
}

export async function assessOfficialHazardZones(lat: number, lon: number): Promise<ZoneAssessment> {
  tileCache.clear()
  tileWaiters.clear()
  const results = await Promise.all([
    sampleLayer(LAYERS.flood, lat, lon),
    sampleLayer(LAYERS.sedimentSteep, lat, lon),
    sampleLayer(LAYERS.sedimentDebris, lat, lon),
    sampleLayer(LAYERS.sedimentSlide, lat, lon),
  ])
  const [flood, sedimentSteep, sedimentDebris, sedimentSlide] = results
  const summary = summarizeHazardStatus(results)

  return {
    flood,
    sedimentSteep,
    sedimentDebris,
    sedimentSlide,
    anyOfficialZone: summary.anyOfficialZone,
    fetchFailed: summary.fetchFailed,
    status: summary.status,
    evaluatedCount: summary.evaluatedCount,
    unknownCount: summary.unknownCount,
    sampledAtZoom: ZOOM_CANDIDATES[0],
    proximityBandsM: PROXIMITY_BANDS_M,
  }
}

/**
 * 発生側に応じた損害側テーブルキー。
 * 地点が区域内なら mid/high。近傍のみの場合は mid（境界近接の注意）。
 */
export function damageTierFromZones(
  zones: ZoneAssessment,
  elevationM: number | null,
): 'low' | 'mid' | 'high' {
  const flood = zones.flood.inZone === true
  const sediment =
    zones.sedimentSteep.inZone === true ||
    zones.sedimentDebris.inZone === true ||
    zones.sedimentSlide.inZone === true

  if (flood && sediment) return 'high'
  if (flood) {
    if (
      zones.flood.detail.includes('10') ||
      zones.flood.detail.includes('20') ||
      zones.flood.detail.includes('5〜')
    ) {
      return 'high'
    }
    return 'mid'
  }
  if (sediment) return 'mid'

  const near = nearestHazardDistanceM(zones)
  if (near != null && near > 0 && near <= 30) return 'mid'

  if (elevationM != null && elevationM < 5) return 'mid'
  return 'low'
}
