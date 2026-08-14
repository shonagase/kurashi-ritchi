export type HazardLevel = 'low' | 'mid' | 'high'

export type RepairScenario = {
  id: string
  label: string
  minManYen: number
  maxManYen: number
  note: string
}

export const REPAIR_SCENARIOS: Record<HazardLevel, RepairScenario[]> = {
  low: [
    { id: 'flood', label: '浸水（軽微）', minManYen: 0, maxManYen: 50, note: '床下程度を想定した内装・清掃の目安' },
    { id: 'quake', label: '地震（壁・屋根）', minManYen: 30, maxManYen: 120, note: '部分補修の目安' },
    { id: 'foundation', label: '土台・沈下', minManYen: 0, maxManYen: 80, note: '軽微な不同沈下の目安' },
  ],
  mid: [
    { id: 'flood', label: '浸水（床上）', minManYen: 100, maxManYen: 350, note: '床・壁・設備交換を含む目安' },
    { id: 'quake', label: '地震（壁・屋根）', minManYen: 80, maxManYen: 250, note: '屋根・外壁のまとまった補修' },
    { id: 'foundation', label: '土台・沈下', minManYen: 100, maxManYen: 350, note: '沈下修正工事の目安' },
  ],
  high: [
    { id: 'flood', label: '浸水（大規模）', minManYen: 250, maxManYen: 600, note: '大規模修繕〜建て直し寄りの目安' },
    { id: 'quake', label: '地震（大破寄り）', minManYen: 200, maxManYen: 500, note: '構造補修が必要な水準の目安' },
    { id: 'foundation', label: '土台崩壊・不同沈下', minManYen: 200, maxManYen: 500, note: '基礎・地盤対策の重いケース' },
  ],
}

export function estimateHazardFromElevation(elevationM: number | null): HazardLevel {
  if (elevationM == null || Number.isNaN(elevationM)) return 'mid'
  if (elevationM < 5) return 'high'
  if (elevationM < 15) return 'mid'
  return 'low'
}

export function hazardLabel(level: HazardLevel): string {
  switch (level) {
    case 'low':
      return '相対的に低め'
    case 'mid':
      return '注意'
    case 'high':
      return '高め'
  }
}

export function totalRepairRange(level: HazardLevel): { min: number; max: number } {
  const scenarios = REPAIR_SCENARIOS[level]
  // 代表シナリオとして「最も重い単一被害」のレンジを採用（同時全損は想定しない）
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
  // 分速80m想定
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
