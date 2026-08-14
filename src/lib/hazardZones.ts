/**
 * ハザードマップポータル（国土地理院）の公式ラスタタイルを地点サンプリングし、
 * 洪水・土砂区域への該当を機械判定する。
 *
 * 注意:
 * - 行政による「区域外証明」ではない。公式データのラスタ1点からの推定。
 * - 属性付きポリゴンの厳密な空間結合ではない。
 * - 未判定（タイル取得失敗等）を「区域外」に丸めないこと。
 * - 最終確認は公式「重ねるハザードマップ」で行うこと。
 */

import type { ValueType } from './formulas'

export type ZoneHitStatus = 'in_zone' | 'likely_outside' | 'unknown'

/** 4層を踏まえた総合ステータス。unknown を安全側に丸めない */
export type HazardEvalStatus =
  | 'in_zone'
  | 'all_outside'
  | 'partially_evaluated'
  | 'unevaluated'

export type ZoneHit = {
  id: string
  label: string
  /** true=区域内推定, false=区域外推定, null=未判定 */
  inZone: boolean | null
  status: ZoneHitStatus
  detail: string
  sourceUrl: string
  legendUrl?: string
  method: 'gsi-raster-sample'
  /** 公的ラスタに基づく機械判定 → 計算値 */
  valueType: ValueType
  /** 実際にサンプリングしたズーム（フォールバック時は Z より小さい） */
  sampledAtZoom?: number
  /** 未判定時の理由コード */
  failReason?: 'tile_missing' | 'pixel_read' | 'network'
}

export type ZoneAssessment = {
  flood: ZoneHit
  sedimentSteep: ZoneHit
  sedimentDebris: ZoneHit
  sedimentSlide: ZoneHit
  /** @deprecated status を優先。後方互換のため残す */
  anyOfficialZone: boolean
  /** 全層が未判定 */
  fetchFailed: boolean
  /** Unknown を区域外に丸めない総合結果 */
  status: HazardEvalStatus
  evaluatedCount: number
  unknownCount: number
  /** 要求ズーム（フォールバック前） */
  sampledAtZoom: number
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

function loadImage(url: string): Promise<{ img: HTMLImageElement | null; failReason: 'tile_missing' | 'network' | null }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve({ img, failReason: null })
    img.onerror = () => resolve({ img: null, failReason: 'tile_missing' })
    try {
      img.src = url
    } catch {
      resolve({ img: null, failReason: 'network' })
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

/** 洪水タイル凡例の近似（RGB距離）から浸水深区分を推定 */
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

function failDetail(reason: 'tile_missing' | 'pixel_read' | 'network', zoomsTried: number[]): string {
  const z = zoomsTried.join('→')
  if (reason === 'tile_missing') return `未判定（タイル欠損/未配信, z=${z}）`
  if (reason === 'pixel_read') return `未判定（画素読み取り失敗, z=${z}）`
  return `未判定（通信エラー, z=${z}）`
}

function unknownHit(
  layer: (typeof LAYERS)[keyof typeof LAYERS],
  detail: string,
  url: string,
  failReason: ZoneHit['failReason'],
  sampledAtZoom?: number,
): ZoneHit {
  return {
    id: layer.id,
    label: layer.label,
    inZone: null,
    status: 'unknown',
    detail,
    sourceUrl: url,
    legendUrl: 'legendUrl' in layer ? layer.legendUrl : undefined,
    method: 'gsi-raster-sample',
    valueType: 'computed',
    failReason,
    sampledAtZoom,
  }
}

async function sampleLayerAtZoom(
  layer: (typeof LAYERS)[keyof typeof LAYERS],
  lat: number,
  lon: number,
  z: number,
): Promise<{ hit: ZoneHit | null; lastUrl: string; failReason: ZoneHit['failReason'] }> {
  const { x, y, px, py } = latLonToTile(lat, lon, z)
  const url = layer.url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
  const { img, failReason } = await loadImage(url)
  if (!img) {
    return { hit: null, lastUrl: url, failReason: failReason ?? 'tile_missing' }
  }
  const pix = samplePixel(img, px, py)
  if (!pix) {
    return { hit: null, lastUrl: url, failReason: 'pixel_read' }
  }
  const inZone = pix.a > 30
  let detail = inZone ? '機械判定：区域内推定' : '機械判定：区域外推定'
  if (inZone && layer.kind === 'flood') {
    detail = `機械判定：区域内推定（${classifyFloodDepth(pix.r, pix.g, pix.b)}）`
  }
  if (z !== ZOOM_CANDIDATES[0]) {
    detail += `（z=${z}へフォールバック）`
  }
  return {
    hit: {
      id: layer.id,
      label: layer.label,
      inZone,
      status: inZone ? 'in_zone' : 'likely_outside',
      detail,
      sourceUrl: url,
      legendUrl: 'legendUrl' in layer ? layer.legendUrl : undefined,
      method: 'gsi-raster-sample',
      valueType: 'computed',
      sampledAtZoom: z,
    },
    lastUrl: url,
    failReason: undefined,
  }
}

async function sampleLayer(
  layer: (typeof LAYERS)[keyof typeof LAYERS],
  lat: number,
  lon: number,
): Promise<ZoneHit> {
  const tried: number[] = []
  let lastUrl = ''
  let lastFail: ZoneHit['failReason'] = 'tile_missing'
  for (const z of ZOOM_CANDIDATES) {
    tried.push(z)
    const result = await sampleLayerAtZoom(layer, lat, lon, z)
    lastUrl = result.lastUrl
    if (result.hit) return result.hit
    lastFail = result.failReason
  }
  return unknownHit(layer, failDetail(lastFail ?? 'tile_missing', tried), lastUrl, lastFail, tried[tried.length - 1])
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
  const inZone = hits.some((h) => h.inZone === true)
  const evaluatedCount = evaluated.length
  const unknownCount = unknown.length

  if (inZone) {
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
      return '公式区域に該当（機械判定）'
    case 'all_outside':
      return '判定済み層は区域外推定'
    case 'partially_evaluated':
      return '一部判定済み（未判定あり）'
    case 'unevaluated':
      return '未判定'
  }
}

export async function assessOfficialHazardZones(lat: number, lon: number): Promise<ZoneAssessment> {
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
  }
}

/**
 * 発生側（区域該当）に応じた損害側テーブルキー。
 * 区域内該当があれば mid/high。
 * 未判定を「安全＝low」と断定しないが、シナリオ選定の既定は低ティアを使う
 *（表示上は発生側ステータスを別表示すること）。
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

  // 区域該当が確認できない場合のシナリオ既定（≠安全宣言）
  if (elevationM != null && elevationM < 5) return 'mid'
  return 'low'
}
