/**
 * ハザードマップポータル（国土地理院）の公式ラスタタイルを地点・近傍サンプリングし、
 * 水害・土砂等への該当と「区域までの距離帯」を機械判定する。
 *
 * 注意:
 * - 行政による「区域外証明」ではない。公式データのラスタからの推定。
 * - 河川洪水タイルは複数河川シナリオの統合配信であり、荒川／江戸川等の個別シナリオではない。
 * - 属性付きポリゴンの厳密な空間結合ではない。
 * - 未判定を「区域外」に丸めないこと。
 * - distance_to_hazard_area と distance_to_boundary を混同しないこと。
 * - 最終確認は公式「重ねるハザードマップ」で行うこと。
 */

import { hazardProfileForMunicipality, type HazardAxisId, type HazardProfile } from '../data/hazardProfiles'
import type { ValueType } from './formulas'

export type ZoneHitStatus = 'in_zone' | 'nearby' | 'likely_outside' | 'unknown'

/** 総合ステータス。unknown を安全側に丸めない */
export type HazardEvalStatus =
  | 'in_zone'
  | 'nearby_zone'
  | 'all_outside'
  | 'partially_evaluated'
  | 'unevaluated'
  | 'skipped_low_precision'

/** 近傍探索の距離帯（m）。表示もこの単位で出す */
export const PROXIMITY_BANDS_M = [10, 20, 30, 50, 100] as const
const BEARING_COUNT = 8

export type ZoneHit = {
  id: HazardAxisId | string
  label: string
  /** true=地点が区域内推定, false=地点は区域外推定, null=未判定 */
  inZone: boolean | null
  status: ZoneHitStatus
  detail: string
  sourceUrl: string
  legendUrl?: string
  method: 'gsi-raster-sample' | 'unsupported' | 'skipped'
  valueType: ValueType
  sampledAtZoom?: number
  failReason?:
    | 'fetch_error'
    | 'tile_not_found'
    | 'pixel_read'
    | 'layer_not_published'
    | 'outside_coverage'
    | 'unsupported'
  /**
   * 区域までの距離帯（m）。
   * 0 = 地点が区域内（distance_to_hazard_area = 0）
   * 10/20/… = その半径以内に区域あり
   * null = 未検出または未判定
   */
  distanceToHazardAreaM: number | null
  /** @deprecated distanceToHazardAreaM を使う */
  nearestZoneWithinM: number | null
  /**
   * 区域境界線までの距離（m）。
   * ラスタ地点判定では計算不可 → 常に null。
   * 「区域内」でも境界まで0mとは限らない。
   */
  distanceToBoundaryM: null
  /** シナリオID。河川別分割前は composite / null */
  scenario: string | null
  scenarioNote?: string
  methodConfidence: 'low' | 'medium' | 'high'
  priority: 'priority' | 'secondary'
}

export type ZoneAssessment = {
  flood: ZoneHit
  stormSurge: ZoneHit
  inlandFlood: ZoneHit
  liquefaction: ZoneHit
  sedimentSteep: ZoneHit
  sedimentDebris: ZoneHit
  sedimentSlide: ZoneHit
  /** 表示順（プロファイル反映） */
  displayOrder: ZoneHit[]
  profile: HazardProfile
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
    id: 'flood' as const,
    label: '河川洪水浸水想定（想定最大・統合タイル）',
    url: 'https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png',
    legendUrl: 'https://disaportal.gsi.go.jp/hazardmap/copyright/img/shinsui_legend2-1.png',
    kind: 'flood' as const,
    scenario: 'river_flood_l2_max_composite',
    scenarioNote:
      '荒川・江戸川・利根川等の個別シナリオではなく、配信タイル上の重畳／統合結果。個別シナリオ分割は未実装。',
  },
  stormSurge: {
    id: 'stormSurge' as const,
    label: '高潮浸水想定区域',
    url: 'https://disaportaldata.gsi.go.jp/raster/03_hightide_l2_shinsuishin_data/{z}/{x}/{y}.png',
    kind: 'flood' as const,
    scenario: 'storm_surge_l2',
    scenarioNote: '高潮シナリオ（統合タイル）。',
  },
  inlandFlood: {
    id: 'inlandFlood' as const,
    label: '内水（雨水出水）浸水想定区域',
    url: 'https://disaportaldata.gsi.go.jp/raster/02_naisui_data/{z}/{x}/{y}.png',
    kind: 'flood' as const,
    scenario: 'inland_flood',
    scenarioNote: '内水シナリオ。河川氾濫・高潮は含まない（配信仕様）。',
  },
  sedimentSteep: {
    id: 'sedimentSteep' as const,
    label: '土砂災害警戒区域（急傾斜地の崩壊）',
    url: 'https://disaportaldata.gsi.go.jp/raster/05_kyukeishakeikaikuiki/{z}/{x}/{y}.png',
    kind: 'sediment' as const,
    scenario: 'sediment_steep',
    scenarioNote: undefined as string | undefined,
  },
  sedimentDebris: {
    id: 'sedimentDebris' as const,
    label: '土砂災害警戒区域（土石流）',
    url: 'https://disaportaldata.gsi.go.jp/raster/05_dosekiryukeikaikuiki/{z}/{x}/{y}.png',
    kind: 'sediment' as const,
    scenario: 'sediment_debris',
    scenarioNote: undefined as string | undefined,
  },
  sedimentSlide: {
    id: 'sedimentSlide' as const,
    label: '土砂災害警戒区域（地すべり）',
    url: 'https://disaportaldata.gsi.go.jp/raster/05_jisuberikeikaikuiki/{z}/{x}/{y}.png',
    kind: 'sediment' as const,
    scenario: 'sediment_slide',
    scenarioNote: undefined as string | undefined,
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
  | { ok: false; url: string; failReason: NonNullable<ZoneHit['failReason']>; zTried: number[] }

async function samplePoint(layer: LayerDef, lat: number, lon: number): Promise<SampleResult> {
  const tried: number[] = []
  let lastUrl = ''
  let lastFail: NonNullable<ZoneHit['failReason']> = 'tile_not_found'
  for (const z of ZOOM_CANDIDATES) {
    tried.push(z)
    const { x, y, px, py } = latLonToTile(lat, lon, z)
    const url = layer.url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
    lastUrl = url
    let img: HTMLImageElement | null
    try {
      img = await loadImageCached(url)
    } catch {
      lastFail = 'fetch_error'
      continue
    }
    if (!img) {
      lastFail = 'tile_not_found'
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
  if (hit.distanceToHazardAreaM === 0) {
    return hit.detail.includes('浸水深')
      ? hit.detail
      : '地点は区域内推定（distance_to_hazard_area=0m／境界距離は未計算）'
  }
  if (hit.distanceToHazardAreaM != null) {
    return `地点は区域外推定／区域まで約${hit.distanceToHazardAreaM}m以内`
  }
  return `地点は区域外推定／${PROXIMITY_BANDS_M[PROXIMITY_BANDS_M.length - 1]}m以内には区域を検出せず`
}

function unknownDetail(failReason: NonNullable<ZoneHit['failReason']>, zTried: number[]): string {
  const z = zTried.join('→')
  switch (failReason) {
    case 'fetch_error':
      return `未判定（FETCH_ERROR: 通信失敗, z=${z}）`
    case 'tile_not_found':
      return `未判定（TILE_NOT_FOUND: タイル欠損。未配信・カバレッジ外・URL問題の可能性, z=${z}）`
    case 'pixel_read':
      return `未判定（PIXEL_READ: 画素読み取り失敗, z=${z}）`
    case 'layer_not_published':
      return `未判定（LAYER_NOT_PUBLISHED: 当該レイヤー非公開の可能性, z=${z}）`
    case 'outside_coverage':
      return `未判定（OUTSIDE_COVERAGE: 配信範囲外の可能性, z=${z}）`
    case 'unsupported':
      return `未判定（UNSUPPORTED: 全国ラスタ未配信, z=${z}）`
  }
}

function hitBase(
  layer: LayerDef,
  partial: Partial<ZoneHit> &
    Pick<ZoneHit, 'inZone' | 'status' | 'detail' | 'sourceUrl' | 'distanceToHazardAreaM'>,
): ZoneHit {
  const dist = partial.distanceToHazardAreaM ?? null
  return {
    id: layer.id,
    label: layer.label,
    inZone: partial.inZone,
    status: partial.status,
    detail: partial.detail,
    sourceUrl: partial.sourceUrl,
    method: 'gsi-raster-sample',
    valueType: 'computed',
    legendUrl: 'legendUrl' in layer ? layer.legendUrl : undefined,
    failReason: partial.failReason,
    sampledAtZoom: partial.sampledAtZoom,
    scenario: layer.scenario,
    scenarioNote: layer.scenarioNote,
    methodConfidence: partial.methodConfidence ?? 'medium',
    priority: partial.priority ?? 'priority',
    distanceToHazardAreaM: dist,
    nearestZoneWithinM: dist,
    distanceToBoundaryM: null,
  }
}

async function sampleLayer(layer: LayerDef, lat: number, lon: number): Promise<ZoneHit> {
  const center = await samplePoint(layer, lat, lon)
  if (!center.ok) {
    return hitBase(layer, {
      inZone: null,
      status: 'unknown',
      detail: unknownDetail(center.failReason, center.zTried),
      sourceUrl: center.url,
      failReason: center.failReason,
      sampledAtZoom: center.zTried[center.zTried.length - 1],
      distanceToHazardAreaM: null,
      methodConfidence: 'low',
    })
  }

  if (center.inZone) {
    let detail =
      '地点は区域内推定（distance_to_hazard_area=0m／distance_to_boundary=未計算）'
    if (center.depthLabel) {
      detail = `地点は区域内推定（distance_to_hazard_area=0m／${center.depthLabel}／境界距離未計算）`
    }
    if (layer.scenarioNote) detail += ` ※${layer.scenarioNote}`
    if (center.z !== ZOOM_CANDIDATES[0]) detail += `（z=${center.z}へフォールバック）`
    return hitBase(layer, {
      inZone: true,
      status: 'in_zone',
      detail,
      sourceUrl: center.url,
      sampledAtZoom: center.z,
      distanceToHazardAreaM: 0,
      methodConfidence: center.z === ZOOM_CANDIDATES[0] ? 'medium' : 'low',
    })
  }

  for (const radiusM of PROXIMITY_BANDS_M) {
    const pts = ringPoints(lat, lon, radiusM)
    const results = await Promise.all(pts.map((p) => samplePoint(layer, p.lat, p.lon)))
    const hit = results.find((r) => r.ok && r.inZone)
    if (hit && hit.ok) {
      let detail = `地点は区域外推定／区域まで約${radiusM}m以内（境界距離未計算）`
      if (center.z !== ZOOM_CANDIDATES[0]) detail += `（地点z=${center.z}）`
      return hitBase(layer, {
        inZone: false,
        status: 'nearby',
        detail,
        sourceUrl: center.url,
        sampledAtZoom: center.z,
        distanceToHazardAreaM: radiusM,
        methodConfidence: 'medium',
      })
    }
  }

  const maxM = PROXIMITY_BANDS_M[PROXIMITY_BANDS_M.length - 1]
  let detail = `地点は区域外推定／${maxM}m以内には区域を検出せず（境界距離未計算）`
  if (center.z !== ZOOM_CANDIDATES[0]) detail += `（z=${center.z}へフォールバック・境界精度注意）`
  return hitBase(layer, {
    inZone: false,
    status: 'likely_outside',
    detail,
    sourceUrl: center.url,
    sampledAtZoom: center.z,
    distanceToHazardAreaM: null,
    methodConfidence: center.z === ZOOM_CANDIDATES[0] ? 'medium' : 'low',
  })
}

function liquefactionUnsupported(municipalityId: string): ZoneHit {
  const tokyoNote =
    municipalityId === '13123'
      ? '江戸川区は東京都液状化予測図（2024改訂）を案内。全国統一ラスタは未配信のため未判定。'
      : '全国統一の液状化ラスタタイルは未配信。都道府県図の照合が必要。'
  return {
    id: 'liquefaction',
    label: '液状化予測',
    inZone: null,
    status: 'unknown',
    detail: `未判定（UNSUPPORTED: ${tokyoNote}）`,
    sourceUrl: 'https://www.mlit.go.jp/toshi/toshi_tobou_tk_000038.html',
    method: 'unsupported',
    valueType: 'estimate',
    failReason: 'unsupported',
    distanceToHazardAreaM: null,
    nearestZoneWithinM: null,
    distanceToBoundaryM: null,
    scenario: null,
    scenarioNote: 'シナリオ未接続',
    methodConfidence: 'low',
    priority: 'priority',
  }
}

function skippedHit(id: HazardAxisId, label: string): ZoneHit {
  return {
    id,
    label,
    inZone: null,
    status: 'unknown',
    detail: '地点精度不足のため物件固有判定をスキップ',
    sourceUrl: '',
    method: 'skipped',
    valueType: 'estimate',
    distanceToHazardAreaM: null,
    nearestZoneWithinM: null,
    distanceToBoundaryM: null,
    scenario: null,
    methodConfidence: 'low',
    priority: 'secondary',
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
  const nearby = hits.some((h) => h.distanceToHazardAreaM != null && h.distanceToHazardAreaM > 0)
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
    case 'skipped_low_precision':
      return '地点精度不足のため物件固有判定スキップ'
  }
}

/** 比較表用: 最も近い区域距離帯を返す（m）。無しは null */
export function nearestHazardDistanceM(zones: ZoneAssessment): number | null {
  const dists = zones.displayOrder
    .map((h) => h.distanceToHazardAreaM)
    .filter((d): d is number => d != null)
  if (!dists.length) return null
  return Math.min(...dists)
}

function assembleAssessment(
  hitsById: Record<HazardAxisId, ZoneHit>,
  profile: HazardProfile,
  statusOverride?: HazardEvalStatus,
): ZoneAssessment {
  const orderedIds = [
    ...profile.priority,
    ...profile.secondary.filter((a) => !profile.priority.includes(a)),
  ]
  const displayOrder = orderedIds.map((id) => {
    const hit = hitsById[id]
    return {
      ...hit,
      priority: profile.priority.includes(id) ? ('priority' as const) : ('secondary' as const),
    }
  })
  const summary = summarizeHazardStatus(displayOrder.filter((h) => h.method !== 'skipped'))
  return {
    flood: hitsById.flood,
    stormSurge: hitsById.stormSurge,
    inlandFlood: hitsById.inlandFlood,
    liquefaction: hitsById.liquefaction,
    sedimentSteep: hitsById.sedimentSteep,
    sedimentDebris: hitsById.sedimentDebris,
    sedimentSlide: hitsById.sedimentSlide,
    displayOrder,
    profile,
    anyOfficialZone: summary.anyOfficialZone,
    fetchFailed: summary.fetchFailed,
    status: statusOverride ?? summary.status,
    evaluatedCount: summary.evaluatedCount,
    unknownCount: summary.unknownCount,
    sampledAtZoom: ZOOM_CANDIDATES[0],
    proximityBandsM: PROXIMITY_BANDS_M,
  }
}

export function skippedHazardAssessment(municipalityId: string): ZoneAssessment {
  const profile = hazardProfileForMunicipality(municipalityId)
  const hitsById = {
    flood: skippedHit('flood', LAYERS.flood.label),
    stormSurge: skippedHit('stormSurge', LAYERS.stormSurge.label),
    inlandFlood: skippedHit('inlandFlood', LAYERS.inlandFlood.label),
    liquefaction: skippedHit('liquefaction', '液状化予測'),
    sedimentSteep: skippedHit('sedimentSteep', LAYERS.sedimentSteep.label),
    sedimentDebris: skippedHit('sedimentDebris', LAYERS.sedimentDebris.label),
    sedimentSlide: skippedHit('sedimentSlide', LAYERS.sedimentSlide.label),
  }
  return assembleAssessment(hitsById, profile, 'skipped_low_precision')
}

export async function assessOfficialHazardZones(
  lat: number,
  lon: number,
  municipalityId = '',
): Promise<ZoneAssessment> {
  tileCache.clear()
  tileWaiters.clear()
  const profile = hazardProfileForMunicipality(municipalityId)
  const [flood, stormSurge, inlandFlood, sedimentSteep, sedimentDebris, sedimentSlide] =
    await Promise.all([
      sampleLayer(LAYERS.flood, lat, lon),
      sampleLayer(LAYERS.stormSurge, lat, lon),
      sampleLayer(LAYERS.inlandFlood, lat, lon),
      sampleLayer(LAYERS.sedimentSteep, lat, lon),
      sampleLayer(LAYERS.sedimentDebris, lat, lon),
      sampleLayer(LAYERS.sedimentSlide, lat, lon),
    ])
  const liquefaction = liquefactionUnsupported(municipalityId)
  return assembleAssessment(
    {
      flood,
      stormSurge,
      inlandFlood,
      liquefaction,
      sedimentSteep,
      sedimentDebris,
      sedimentSlide,
    },
    profile,
  )
}

/**
 * 発生側に応じた損害側テーブルキー。
 * 地点が水害区域内なら mid/high。近傍のみの場合は mid。
 */
export function damageTierFromZones(
  zones: ZoneAssessment,
  elevationM: number | null,
): 'low' | 'mid' | 'high' {
  if (zones.status === 'skipped_low_precision') return 'low'

  const water =
    zones.flood.inZone === true ||
    zones.stormSurge.inZone === true ||
    zones.inlandFlood.inZone === true
  const sediment =
    zones.sedimentSteep.inZone === true ||
    zones.sedimentDebris.inZone === true ||
    zones.sedimentSlide.inZone === true

  if (water && sediment) return 'high'
  if (water) {
    const detail = `${zones.flood.detail} ${zones.stormSurge.detail}`
    if (detail.includes('10') || detail.includes('20') || detail.includes('5〜')) return 'high'
    return 'mid'
  }
  if (sediment) return 'mid'

  const near = nearestHazardDistanceM(zones)
  if (near != null && near > 0 && near <= 30) return 'mid'

  if (elevationM != null && elevationM < 5) return 'mid'
  return 'low'
}
