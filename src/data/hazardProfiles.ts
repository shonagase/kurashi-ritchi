/**
 * 地域ごとに優先するハザード軸。
 * 全国一律4項目ではなく、意思決定に効く軸を先に出す。
 */

export type HazardAxisId =
  | 'flood'
  | 'stormSurge'
  | 'inlandFlood'
  | 'liquefaction'
  | 'sedimentSteep'
  | 'sedimentDebris'
  | 'sedimentSlide'

export type HazardProfile = {
  id: string
  label: string
  /** 画面上で優先表示する軸 */
  priority: HazardAxisId[]
  /** 折りたたみ／二次表示 */
  secondary: HazardAxisId[]
  note: string
}

const PROFILES: HazardProfile[] = [
  {
    id: 'edogawa_water',
    label: 'ゼロメートル水害優先（江戸川区型）',
    priority: ['flood', 'stormSurge', 'inlandFlood', 'liquefaction'],
    secondary: ['sedimentSteep', 'sedimentDebris', 'sedimentSlide'],
    note: '河川・高潮・内水・液状化を優先。土砂は二次。河川別シナリオ分割は未実装（統合タイル）。',
  },
  {
    id: 'ura_liquefaction',
    label: '埋立・液状化優先（浦安型）',
    priority: ['liquefaction', 'stormSurge', 'flood', 'inlandFlood'],
    secondary: ['sedimentSteep', 'sedimentDebris', 'sedimentSlide'],
    note: '液状化・高潮を優先。',
  },
  {
    id: 'togane_sediment',
    label: '丘陵住宅・土砂優先（東金日吉台型）',
    priority: ['sedimentSteep', 'sedimentDebris', 'sedimentSlide', 'flood'],
    secondary: ['stormSurge', 'inlandFlood', 'liquefaction'],
    note: '急傾斜・土石流・地すべりを優先。',
  },
  {
    id: 'default',
    label: '標準（水害＋土砂）',
    priority: ['flood', 'stormSurge', 'inlandFlood', 'sedimentSteep', 'sedimentDebris', 'sedimentSlide'],
    secondary: ['liquefaction'],
    note: '全国共通の既定セット。',
  },
]

const BY_MUNICIPALITY: Record<string, string> = {
  '13123': 'edogawa_water', // 江戸川区
  '12227': 'togane_sediment', // 東金市
}

export function hazardProfileForMunicipality(municipalityId: string): HazardProfile {
  const id = BY_MUNICIPALITY[municipalityId] ?? 'default'
  return PROFILES.find((p) => p.id === id) ?? PROFILES[PROFILES.length - 1]
}

export function orderedAxes(profile: HazardProfile): HazardAxisId[] {
  return [...profile.priority, ...profile.secondary.filter((a) => !profile.priority.includes(a))]
}
