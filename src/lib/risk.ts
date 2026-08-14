export type HazardLevel = 'low' | 'mid' | 'high'

export type RepairScenario = {
  id: string
  label: string
  minManYen: number
  maxManYen: number
  note: string
}

/** 損害側テーブル（発生側の区域該当結果から選ぶ） */
export const REPAIR_SCENARIOS: Record<HazardLevel, RepairScenario[]> = {
  low: [
    { id: 'flood', label: '浸水（軽微）', minManYen: 0, maxManYen: 50, note: '区域外〜軽微想定の内装・清掃目安' },
    { id: 'quake', label: '地震（壁・屋根）', minManYen: 30, maxManYen: 120, note: '部分補修の目安（区域判定とは独立）' },
    { id: 'foundation', label: '土台・沈下', minManYen: 0, maxManYen: 80, note: '軽微な不同沈下の目安' },
  ],
  mid: [
    { id: 'flood', label: '浸水（床上）', minManYen: 100, maxManYen: 350, note: '公式浸水/土砂区域該当時の代表レンジ' },
    { id: 'quake', label: '地震（壁・屋根）', minManYen: 80, maxManYen: 250, note: '屋根・外壁のまとまった補修' },
    { id: 'foundation', label: '土台・沈下', minManYen: 100, maxManYen: 350, note: '沈下修正工事の目安' },
  ],
  high: [
    { id: 'flood', label: '浸水（大規模）', minManYen: 250, maxManYen: 600, note: '深い浸水や複合該当時の重いレンジ' },
    { id: 'quake', label: '地震（大破寄り）', minManYen: 200, maxManYen: 500, note: '構造補修が必要な水準の目安' },
    { id: 'foundation', label: '土台崩壊・不同沈下', minManYen: 200, maxManYen: 500, note: '基礎・地盤対策の重いケース' },
  ],
}

/** @deprecated 標高のみの便宜区分。公式区域判定を優先すること */
export function estimateHazardFromElevation(elevationM: number | null): HazardLevel {
  if (elevationM == null || Number.isNaN(elevationM)) return 'mid'
  if (elevationM < 5) return 'high'
  if (elevationM < 15) return 'mid'
  return 'low'
}

export function hazardLabel(level: HazardLevel): string {
  switch (level) {
    case 'low':
      return '損害ティア: 低'
    case 'mid':
      return '損害ティア: 中'
    case 'high':
      return '損害ティア: 高'
  }
}

export function totalRepairRange(level: HazardLevel): { min: number; max: number } {
  const scenarios = REPAIR_SCENARIOS[level]
  let min = Infinity
  let max = 0
  for (const s of scenarios) {
    min = Math.min(min, s.minManYen)
    max = Math.max(max, s.maxManYen)
  }
  return { min: min === Infinity ? 0 : min, max }
}

export function lossImpactPercent(purchaseManYen: number, repairMax: number): number {
  if (purchaseManYen <= 0) return 0
  return Math.round((repairMax / purchaseManYen) * 100)
}

export function walkMinutesFromMeters(meters: number): number {
  return Math.max(1, Math.round(meters / 80))
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
