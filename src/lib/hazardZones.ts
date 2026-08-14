/**
 * ハザードマップポータル（国土地理院）の公式ラスタタイルを地点サンプリングし、
 * 洪水・土砂区域への該当を判定する。
 *
 * 注意: ラスタ色からの判定であり、属性付きポリゴンの厳密な空間結合ではない。
 * 最終確認は公式「重ねるハザードマップ」で行うこと。
 */

export type ZoneHit = {
  id: string
  label: string
  inZone: boolean | null
  detail: string
  sourceUrl: string
  legendUrl?: string
  method: 'gsi-raster-sample'
  valueType: 'official'
}

export type ZoneAssessment = {
  flood: ZoneHit
  sedimentSteep: ZoneHit
  sedimentDebris: ZoneHit
  sedimentSlide: ZoneHit
  /** いずれかの公式区域に該当 */
  anyOfficialZone: boolean
  /** タイル取得失敗など */
  fetchFailed: boolean
  sampledAtZoom: number
}

const Z = 15 // 地点判定用。細かすぎるとタイル欠損、粗すぎると誤判定

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

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
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
  // タイル内の1pxを切り出し
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

async function sampleLayer(
  layer: (typeof LAYERS)[keyof typeof LAYERS],
  lat: number,
  lon: number,
  z: number,
): Promise<ZoneHit> {
  const { x, y, px, py } = latLonToTile(lat, lon, z)
  const url = layer.url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
  const img = await loadImage(url)
  if (!img) {
    return {
      id: layer.id,
      label: layer.label,
      inZone: null,
      detail: 'タイル取得失敗（未判定）',
      sourceUrl: url,
      legendUrl: 'legendUrl' in layer ? layer.legendUrl : undefined,
      method: 'gsi-raster-sample',
      valueType: 'official',
    }
  }
  const pix = samplePixel(img, px, py)
  if (!pix) {
    return {
      id: layer.id,
      label: layer.label,
      inZone: null,
      detail: '画素読み取り失敗',
      sourceUrl: url,
      method: 'gsi-raster-sample',
      valueType: 'official',
    }
  }
  const inZone = pix.a > 30
  let detail = inZone ? '区域内' : '区域外（このタイル上）'
  if (inZone && layer.kind === 'flood') {
    detail = `区域内（推定: ${classifyFloodDepth(pix.r, pix.g, pix.b)}）`
  }
  return {
    id: layer.id,
    label: layer.label,
    inZone,
    detail,
    sourceUrl: url,
    legendUrl: 'legendUrl' in layer ? layer.legendUrl : undefined,
    method: 'gsi-raster-sample',
    valueType: 'official',
  }
}

export async function assessOfficialHazardZones(lat: number, lon: number): Promise<ZoneAssessment> {
  const results = await Promise.all([
    sampleLayer(LAYERS.flood, lat, lon, Z),
    sampleLayer(LAYERS.sedimentSteep, lat, lon, Z),
    sampleLayer(LAYERS.sedimentDebris, lat, lon, Z),
    sampleLayer(LAYERS.sedimentSlide, lat, lon, Z),
  ])
  const [flood, sedimentSteep, sedimentDebris, sedimentSlide] = results
  const known = results.filter((r) => r.inZone !== null)
  const fetchFailed = known.length === 0
  const anyOfficialZone = results.some((r) => r.inZone === true)

  return {
    flood,
    sedimentSteep,
    sedimentDebris,
    sedimentSlide,
    anyOfficialZone,
    fetchFailed,
    sampledAtZoom: Z,
  }
}

/**
 * 発生側（区域該当）に応じた損害側テーブルキー。
 * 公式区域に入っていれば mid/high、入っていなければ low。
 * 標高は補助情報として残す。
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
    // 深い浸水色は高ダメージ寄り（detail文字列で粗い判定）
    if (zones.flood.detail.includes('10') || zones.flood.detail.includes('20') || zones.flood.detail.includes('5〜')) {
      return 'high'
    }
    return 'mid'
  }
  if (sediment) return 'mid'

  // 区域外でも極低標高は注意寄り（補助）
  if (elevationM != null && elevationM < 5) return 'mid'
  return 'low'
}
