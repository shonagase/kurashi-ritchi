import generated from './municipalities.generated.json'

export type MunicipalityProfile = {
  id: string
  name: string
  pref: string
  lat: number
  lon: number
  /** 65歳以上人口割合（%） */
  agingRate: number
  /** 単身世帯割合（%） */
  singleHouseholdRate: number
  /** 人口に占める被保護人員の割合（%） */
  welfareRatePercent: number
  /**
   * 人口100人あたりの年間刑法犯認知件数。
   * 公式の「人口千人あたり」を /10 した値。被害者の実人数ではなく認知件数ベース。
   */
  crimePer100People: number
  industryType: string
  industryNote: string
}

export type StatsMeta = {
  updatedAt: string
  source: string
  notes?: string
  fetchedAt?: string
}

/** 出典リンク（確認用） */
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

/** 人口100人あたり被保護者（おおよそ） */
export function formatWelfare(m: MunicipalityProfile): string {
  return `保護 ${m.welfareRatePercent.toFixed(1)}%（100人中約${m.welfareRatePercent.toFixed(1)}人）`
}

/**
 * 刑法犯認知を「100人あたり件数／おおよそ%」で表示。
 * ※被害者ユニーク人数ではなく、年間の認知件数ベース。
 */
export function formatCrime(m: MunicipalityProfile): string {
  return `犯罪 年${m.crimePer100People.toFixed(2)}件/100人（約${m.crimePer100People.toFixed(2)}%）`
}
