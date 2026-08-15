/**
 * 公開前の内部整合性検証。
 * API・推計・overrides が「構造上あり得ない値」を出しても止める。
 */

import type { MunicipalityProfile, MetricMeta } from '../data/municipalities'
import type { ZoneAssessment } from './hazardZones'

export type InvariantIssue = {
  code: string
  severity: 'error' | 'warning'
  message: string
  field?: string
}

function yearKey(ref?: string | null): string | null {
  if (!ref) return null
  const m = String(ref).match(/20\d{2}/)
  return m ? m[0] : null
}

function metric(m: MunicipalityProfile, key: keyof NonNullable<MunicipalityProfile['metrics']>): MetricMeta | null {
  return m.metrics?.[key] ?? null
}

/** 窃盗 ⊆ 刑法犯、年度混在、件数関係など */
export function checkMunicipalityInvariants(m: MunicipalityProfile): InvariantIssue[] {
  const issues: InvariantIssue[] = []
  const crime = m.crimePer100People
  const theft = m.theftPer100People
  const crimeMeta = metric(m, 'crimePer100People')
  const theftMeta = metric(m, 'theftPer100People')
  const theftShareMeta = metric(m, 'theftSharePercent')

  if (Number.isFinite(crime) && Number.isFinite(theft) && theftMeta && crimeMeta) {
    if (theft > crime + 1e-6) {
      issues.push({
        code: 'theft_rate_gt_crime_rate',
        severity: 'error',
        field: 'theftPer100People',
        message: `窃盗率(${theft}) が刑法犯率(${crime})を超えています（窃盗 ⊆ 刑法犯）`,
      })
    }
  }

  if (theftShareMeta && Number.isFinite(m.theftSharePercent)) {
    if (m.theftSharePercent < 0 || m.theftSharePercent > 100) {
      issues.push({
        code: 'theft_share_out_of_range',
        severity: 'error',
        field: 'theftSharePercent',
        message: `窃盗構成比 ${m.theftSharePercent}% は 0–100 の範囲外です`,
      })
    }
  }

  const shareKeys = [
    'heinousSharePercent',
    'violentSharePercent',
    'theftSharePercent',
    'moralsSharePercent',
  ] as const
  const shareSum = shareKeys.reduce((acc, k) => {
    const meta = metric(m, k)
    if (!meta || meta.value == null || !Number.isFinite(meta.value)) return acc
    return acc + meta.value
  }, 0)
  if (shareSum > 100 + 0.5) {
    issues.push({
      code: 'share_sum_gt_100',
      severity: 'error',
      message: `罪種構成比の合計 ${shareSum.toFixed(2)}% が 100% を超えています`,
    })
  }

  const cy = yearKey(crimeMeta?.referenceDate)
  const ty = yearKey(theftMeta?.referenceDate)
  if (cy && ty && cy !== ty && theftMeta && crimeMeta) {
    issues.push({
      code: 'crime_year_mismatch',
      severity: 'warning',
      field: 'theftPer100People',
      message: `刑法犯(${cy})と窃盗率(${ty})で対象年が異なります`,
    })
  }

  const sy = yearKey(theftShareMeta?.referenceDate)
  if (cy && sy && cy !== sy && theftShareMeta && crimeMeta) {
    issues.push({
      code: 'share_year_mismatch',
      severity: 'warning',
      field: 'theftSharePercent',
      message: `刑法犯(${cy})と窃盗構成比(${sy})で対象年が異なります`,
    })
  }

  return issues
}

export function checkZoneInvariants(zones: ZoneAssessment): InvariantIssue[] {
  const issues: InvariantIssue[] = []
  const hits = zones.displayOrder?.length
    ? zones.displayOrder
    : [zones.flood, zones.sedimentSteep, zones.sedimentDebris, zones.sedimentSlide]
  const evaluated = hits.filter((h) => h.inZone !== null).length
  const unknown = hits.filter((h) => h.inZone === null).length
  if (evaluated + unknown !== hits.length) {
    issues.push({
      code: 'zone_count_mismatch',
      severity: 'error',
      message: `判定済み+未判定が層数と一致しません (${evaluated}+${unknown}≠${hits.length})`,
    })
  }
  if (zones.evaluatedCount !== evaluated || zones.unknownCount !== unknown) {
    issues.push({
      code: 'zone_summary_mismatch',
      severity: 'error',
      message: 'ZoneAssessment の evaluated/unknown 集計が個票と不一致です',
    })
  }
  const inside = hits.filter((h) => h.inZone === true).length
  if (inside > hits.length) {
    issues.push({
      code: 'inside_gt_layers',
      severity: 'error',
      message: '区域内層数が適用層数を超えています',
    })
  }
  return issues
}

export function filterBlockingIssues(issues: InvariantIssue[]): InvariantIssue[] {
  return issues.filter((i) => i.severity === 'error')
}

/** UI用: 公開を止めるべきエラーがあるか */
export function hasBlockingInvariantErrors(
  municipality: MunicipalityProfile,
  zones?: ZoneAssessment,
): InvariantIssue[] {
  const all = [
    ...checkMunicipalityInvariants(municipality),
    ...(zones ? checkZoneInvariants(zones) : []),
  ]
  return filterBlockingIssues(all)
}
