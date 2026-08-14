import generated from './municipalities.generated.json'
import type { ValueType } from '../lib/formulas'

export type MetricMeta = {
  value: number
  unit?: string
  valueType?: ValueType | string
  source?: string
  referenceDate?: string
  retrievedAt?: string
  catName?: string
  formula?: string
  warning?: string
}

export type MunicipalityProfile = {
  id: string
  name: string
  pref: string
  lat: number
  lon: number
  population: number
  agingRate: number
  singleHouseholdRate: number
  welfareRatePercent: number
  crimePer100People: number
  theftPer100People: number
  heinousSharePercent: number
  violentSharePercent: number
  theftSharePercent: number
  moralsSharePercent: number
  industryType: string
  industryNote: string
  metrics?: {
    population?: MetricMeta | null
    agingRate?: MetricMeta | null
    singleHouseholdRate?: MetricMeta | null
    welfareRatePercent?: MetricMeta | null
    crimePer100People?: MetricMeta | null
    theftPer100People?: MetricMeta | null
    heinousSharePercent?: MetricMeta | null
    violentSharePercent?: MetricMeta | null
    theftSharePercent?: MetricMeta | null
    moralsSharePercent?: MetricMeta | null
  }
}

export type StatsMeta = {
  retrievedAt?: string | null
  notes?: string
  fields?: Record<string, string>
}

export const DATA_SOURCES = {
  gsiMap: {
    label: '国土地理院 地理院地図・タイル',
    url: 'https://maps.gsi.go.jp/development/ichiran.html',
  },
  gsiElevation: {
    label: '国土地理院 標高API',
    url: 'https://maps.gsi.go.jp/development/elevation_s.html',
  },
  gsiAddress: {
    label: '国土地理院 住所検索',
    url: 'https://maps.gsi.go.jp/',
  },
  hazardPortal: {
    label: 'ハザードマップポータル（重ねるハザードマップ）',
    url: 'https://disaportal.gsi.go.jp/',
  },
  census: {
    label: '総務省統計局 国勢調査（e-Stat）',
    url: 'https://www.e-stat.go.jp/stat-search/files?page=1&toukei=00200521',
  },
  economicCensus: {
    label: '総務省・経産省 経済センサス（e-Stat）',
    url: 'https://www.e-stat.go.jp/stat-search/files?page=1&toukei=00200552',
  },
  welfare: {
    label: '厚生労働省 被保護者調査',
    url: 'https://www.mhlw.go.jp/toukei/list/74-16.html',
  },
  crime: {
    label: '警察庁 犯罪統計',
    url: 'https://www.npa.go.jp/publications/statistics/sousa/index.html',
  },
  osm: {
    label: 'OpenStreetMap / Overpass API',
    url: 'https://www.openstreetmap.org/copyright',
  },
  estatApi: {
    label: 'e-Stat API（社会・人口統計体系）',
    url: 'https://www.e-stat.go.jp/api/',
  },
  hazardTiles: {
    label: 'ハザードマップポータル 配信タイル（オープンデータ）',
    url: 'https://disaportal.gsi.go.jp/hazardmap/copyright/opendata.html',
  },
} as const

export const statsMeta: StatsMeta = generated.meta as StatsMeta

export const municipalities: MunicipalityProfile[] =
  generated.municipalities as MunicipalityProfile[]

export function findNearestMunicipality(lat: number, lon: number): MunicipalityProfile {
  let best = municipalities[0]
  let bestD = Infinity
  for (const m of municipalities) {
    const d = (m.lat - lat) ** 2 + (m.lon - lon) ** 2
    if (d < bestD) {
      bestD = d
      best = m
    }
  }
  return best
}

export function formatWelfare(m: MunicipalityProfile): string {
  const meta = m.metrics?.welfareRatePercent
  const perMille =
    meta?.formula?.includes('‰') || meta?.source?.includes('‰')
      ? `（${(m.welfareRatePercent * 10).toFixed(2)}‰換算）`
      : ''
  return `保護率 ${m.welfareRatePercent.toFixed(2)}%${perMille}`
}

export function formatCrime(m: MunicipalityProfile): string {
  return `人口100人当たり刑法犯認知 ${m.crimePer100People.toFixed(2)}件/年（参考計算・被害者数ではない）`
}
