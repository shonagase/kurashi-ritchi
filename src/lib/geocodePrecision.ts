/**
 * ジオコード精度ゲート。
 * 町域代表点で物件固有のハザード・距離を断定しないための最上位分類。
 */

export type GeocodePrecision =
  | 'exact_address'
  | 'block'
  | 'chome'
  | 'town'
  | 'municipality'
  | 'unknown'

export type LocationConfidence = 'high' | 'medium' | 'low'

export type GeocodeQuality = {
  precision: GeocodePrecision
  locationConfidence: LocationConfidence
  /** 物件地点評価として使ってよいか（town 以下は参考扱い） */
  pointEvaluationOk: boolean
  labelJa: string
  gateMessage: string | null
}

const PRECISION_LABEL: Record<GeocodePrecision, string> = {
  exact_address: '番地レベル（物件地点に近い）',
  block: '街区・番レベル',
  chome: '丁目レベル',
  town: '町域・大字の代表点',
  municipality: '市区町村の代表点',
  unknown: '精度不明',
}

export function inferGeocodePrecision(input: {
  query?: string
  resultLabel?: string
  source: 'gsi' | 'nominatim' | 'map_pick' | 'demo'
}): GeocodeQuality {
  if (input.source === 'map_pick') {
    return {
      precision: 'exact_address',
      locationConfidence: 'high',
      pointEvaluationOk: true,
      labelJa: PRECISION_LABEL.exact_address,
      gateMessage: null,
    }
  }

  const text = `${input.query ?? ''} ${input.resultLabel ?? ''}`
  const hasBanchi = /\d+[-−ー]\d+|番地|号/.test(text)
  const hasChome = /丁目/.test(text)
  const muniOnly =
    /^(?:.+[都道府県])?.+(?:市|区|町|村)$/.test((input.resultLabel || input.query || '').trim()) &&
    !hasChome &&
    !hasBanchi &&
    !/大字|字/.test(text)

  let precision: GeocodePrecision = 'unknown'
  if (hasBanchi) precision = 'exact_address'
  else if (/街区|番$|番地/.test(text) && !hasChome) precision = 'block'
  else if (hasChome) precision = 'chome'
  else if (muniOnly) precision = 'municipality'
  else if (/市|区|町|村/.test(text)) precision = 'town'
  else precision = 'unknown'

  const locationConfidence: LocationConfidence =
    precision === 'exact_address' || precision === 'block'
      ? 'high'
      : precision === 'chome'
        ? 'medium'
        : 'low'

  const pointEvaluationOk =
    precision === 'exact_address' || precision === 'block' || precision === 'chome'

  const gateMessage = pointEvaluationOk
    ? null
    : `地点精度は「${PRECISION_LABEL[precision]}」です。町域・市区町村の代表点による参考評価であり、物件地点そのものの評価ではありません。ハザード・駅距離・標高は目安として扱ってください。`

  return {
    precision,
    locationConfidence,
    pointEvaluationOk,
    labelJa: PRECISION_LABEL[precision],
    gateMessage,
  }
}
