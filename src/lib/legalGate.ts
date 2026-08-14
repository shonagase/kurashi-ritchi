/**
 * 法務・都市計画ゲート。
 * ハザードより金銭インパクトが大きいことがあるため、詳細の最上位で出す。
 */

import { DISTRICT_PLANS, type DistrictPlanRecord } from '../data/districtPlans'
import { pointInPolygon } from './pip'
import type { ValueType } from './formulas'

export type LegalCheckStatus =
  | 'matched'
  | 'likely_matched'
  | 'not_in_catalog'
  | 'unevaluated'
  | 'needs_verify'

export type LegalCheckItem = {
  id: string
  label: string
  status: LegalCheckStatus
  detail: string
  valueType: ValueType
  sourceUrl?: string
}

export type LegalGateResult = {
  /** 総合: matched があれば要注意、未評価項目があれば needs_verify */
  status: 'attention' | 'needs_verify' | 'clear_unknown'
  summary: string
  districtPlan: DistrictPlanRecord | null
  matchMethod: 'address' | 'approx_pip' | 'none'
  items: LegalCheckItem[]
}

function matchDistrictPlan(input: {
  address: string
  municipalityId: string
  lat: number
  lon: number
}): { plan: DistrictPlanRecord; method: 'address' | 'approx_pip' } | null {
  const text = input.address
  for (const plan of DISTRICT_PLANS) {
    if (plan.municipalityId !== input.municipalityId) continue
    if (plan.nameMatchers.some((m) => text.includes(m))) {
      return { plan, method: 'address' }
    }
  }
  for (const plan of DISTRICT_PLANS) {
    if (plan.municipalityId !== input.municipalityId) continue
    if (pointInPolygon(input.lon, input.lat, plan.polygon)) {
      return { plan, method: 'approx_pip' }
    }
  }
  return null
}

export function assessLegalGate(input: {
  address: string
  municipalityId: string
  municipalityName: string
  lat: number
  lon: number
}): LegalGateResult {
  const hit = matchDistrictPlan(input)
  const items: LegalCheckItem[] = []

  if (hit) {
    const geomNote =
      hit.plan.geometryConfidence === 'approximate'
        ? '区域図形は概形（参考）。正式区域は市の計画図で確認。'
        : '区域図形は収録ポリゴンに基づく。'
    items.push({
      id: 'district_plan',
      label: '地区計画',
      status: hit.method === 'address' ? 'matched' : 'likely_matched',
      detail: `${hit.plan.name}に該当する可能性（照合: ${
        hit.method === 'address' ? '住所表記' : '概形PiP'
      }）。${geomNote} ${hit.plan.zonesNote}`,
      valueType: 'official',
      sourceUrl: hit.plan.sourceUrl,
    })
    for (const c of hit.plan.constraints) {
      items.push({
        id: c.id,
        label: c.label,
        status: 'needs_verify',
        detail: `${c.value}${c.note ? `（${c.note}）` : ''} — 物件区画との適合は未確認`,
        valueType: 'official',
        sourceUrl: hit.plan.sourceUrl,
      })
    }
  } else {
    items.push({
      id: 'district_plan',
      label: '地区計画',
      status: 'not_in_catalog',
      detail: `${input.municipalityName}について、当アプリ収録の地区計画カタログに該当なし（≠地区計画なし）。公式都市計画図で要確認。`,
      valueType: 'estimate',
    })
  }

  // 全国共通で未評価の法務チェック（意図的に断定しない）
  const unevaluated: Array<{ id: string; label: string; detail: string }> = [
    {
      id: 'rebuild',
      label: '再建築の可否',
      detail: '建築基準法の接道・既存不適格等は未評価。法務局・建築確認情報の確認が必要。',
    },
    {
      id: 'road_access',
      label: '接道義務',
      detail: '前面道路幅員・位置指定道路の適法性は未評価。',
    },
    {
      id: 'retaining_wall',
      label: '擁壁・崖条例',
      detail: '擁壁の安全性・条例該当は未評価。現地・検査済証の確認が必要。',
    },
    {
      id: 'nonconformity',
      label: '既存不適格・違反増築',
      detail: '増改築履歴・建築確認との整合は未評価。',
    },
  ]
  for (const u of unevaluated) {
    items.push({
      id: u.id,
      label: u.label,
      status: 'unevaluated',
      detail: u.detail,
      valueType: 'judgment',
    })
  }

  if (hit) {
    return {
      status: 'attention',
      summary: `${hit.plan.name}の制限が物件価値に直結しうるため、ハザードより先に確認推奨`,
      districtPlan: hit.plan,
      matchMethod: hit.method,
      items,
    }
  }

  return {
    status: 'needs_verify',
    summary: '地区計画カタログ外。再建築・接道・擁壁など法務項目はすべて未評価',
    districtPlan: null,
    matchMethod: 'none',
    items,
  }
}

export function legalStatusLabel(status: LegalCheckStatus): string {
  switch (status) {
    case 'matched':
      return '該当の可能性'
    case 'likely_matched':
      return '概形上の該当候補'
    case 'not_in_catalog':
      return 'カタログ外'
    case 'unevaluated':
      return '未評価'
    case 'needs_verify':
      return '適合未確認'
  }
}
