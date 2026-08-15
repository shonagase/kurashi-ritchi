/**
 * Data Quality Gate.
 * 評価に使う前に「使ってよいデータか」を先に判定する。
 */

import type { MunicipalityProfile, MetricMeta } from '../data/municipalities'
import type { GeocodePrecision } from './geocodePrecision'

export type GateCode =
  | 'LOCATION_TOO_COARSE'
  | 'STALE_SOURCE'
  | 'DATA_MAPPING_ERROR'
  | 'SEED_VALUE'
  | 'MISSING_PROVENANCE'
  | 'AMBIGUOUS_HAZARD'
  | 'CONSISTENCY_FAIL'

export type GateVerdict = {
  pass: boolean
  code?: GateCode
  reason: string
}

export type LocationEvalLevel = 'property' | 'reference' | 'overview' | 'blocked'

/** 地点精度 → 物件固有判定の可否 */
export function locationEvalLevel(precision: GeocodePrecision): LocationEvalLevel {
  switch (precision) {
    case 'exact_address':
    case 'block':
      return 'property'
    case 'chome':
      return 'reference'
    case 'town':
      return 'overview'
    case 'municipality':
    case 'unknown':
      return 'blocked'
  }
}

export function locationGate(precision: GeocodePrecision): GateVerdict {
  const level = locationEvalLevel(precision)
  if (level === 'blocked') {
    return {
      pass: false,
      code: 'LOCATION_TOO_COARSE',
      reason: '市区町村／精度不明のため物件固有のハザード・交通判定を禁止',
    }
  }
  if (level === 'overview') {
    return {
      pass: false,
      code: 'LOCATION_TOO_COARSE',
      reason: '町域代表点のため物件固有判定は不可（概況のみ）',
    }
  }
  return { pass: true, reason: '地点精度は物件／丁目レベル' }
}

/** メトリクス公開可否。FAILなら数値を出さない */
export function metricPublishGate(meta: MetricMeta | null | undefined): GateVerdict {
  if (!meta) {
    return { pass: false, code: 'MISSING_PROVENANCE', reason: 'メトリクス無し' }
  }
  if (meta.unavailable) {
    return { pass: false, code: 'DATA_MAPPING_ERROR', reason: meta.warning || 'unavailable' }
  }
  if (meta.value == null || !Number.isFinite(meta.value)) {
    return { pass: false, code: 'MISSING_PROVENANCE', reason: '値なし' }
  }

  const src = `${meta.source ?? ''} ${meta.referenceDate ?? ''} ${meta.warning ?? ''} ${meta.catName ?? ''}`
  if (/pending corrected|旧マッチ|legacy-flat|DATA_MAPPING/i.test(src)) {
    return {
      pass: false,
      code: 'DATA_MAPPING_ERROR',
      reason: 'マッチング誤り疑いのため非表示',
    }
  }
  if (/^seed$/i.test(String(meta.referenceDate)) || /人口シード|seed/i.test(src)) {
    return { pass: false, code: 'SEED_VALUE', reason: 'seed概算値は非表示' }
  }
  if (!meta.source || !meta.referenceDate || meta.referenceDate === 'unknown') {
    return { pass: false, code: 'MISSING_PROVENANCE', reason: '出典または対象時点が不明' }
  }

  const year = String(meta.referenceDate).match(/20\d{2}/)?.[0]
  // 刑法犯系で極端に古い直接値（例: 2005）は鮮度FAIL
  if (year && Number(year) <= 2010 && /犯罪|刑法|K06101|crime/i.test(src)) {
    return {
      pass: false,
      code: 'STALE_SOURCE',
      reason: `${year}年データは古すぎる（新しい直接値を優先）`,
    }
  }

  return { pass: true, reason: '公開可' }
}

/** 自治体プロフィールをゲート通過後の表示用にマスク */
export function applyMunicipalityPublishGates(m: MunicipalityProfile): MunicipalityProfile {
  const keys = [
    'population',
    'agingRate',
    'singleHouseholdRate',
    'welfareRatePercent',
    'crimePer100People',
    'theftPer100People',
    'heinousSharePercent',
    'violentSharePercent',
    'theftSharePercent',
    'moralsSharePercent',
  ] as const

  const metrics: NonNullable<MunicipalityProfile['metrics']> = { ...(m.metrics ?? {}) }
  const next: MunicipalityProfile = { ...m, metrics }

  for (const key of keys) {
    const meta = metrics[key]
    const gate = metricPublishGate(meta)
    if (!gate.pass) {
      metrics[key] = {
        value: null,
        unavailable: true,
        valueType: meta?.valueType ?? 'estimate',
        warning: `${gate.code}: ${gate.reason}`,
        source: meta?.source ?? 'quality-gate',
        referenceDate: meta?.referenceDate ?? 'blocked',
      }
      if (key === 'population') next.population = 0
      if (key === 'agingRate') next.agingRate = 0
      if (key === 'singleHouseholdRate') next.singleHouseholdRate = 0
      if (key === 'welfareRatePercent') next.welfareRatePercent = 0
      if (key === 'crimePer100People') next.crimePer100People = 0
      if (key === 'theftPer100People') next.theftPer100People = 0
      if (key === 'heinousSharePercent') next.heinousSharePercent = 0
      if (key === 'violentSharePercent') next.violentSharePercent = 0
      if (key === 'theftSharePercent') next.theftSharePercent = 0
      if (key === 'moralsSharePercent') next.moralsSharePercent = 0
    }
  }
  next.metrics = metrics
  return next
}
