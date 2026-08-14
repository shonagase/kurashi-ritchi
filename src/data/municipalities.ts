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
} as const

/**
 * 公開統計を参考にした市区町村プロファイル（MVP用概算値）。
 * 生活保護率・刑法犯認知は最新年次の公開値に近いオーダーで設定。
 */
export const municipalities: MunicipalityProfile[] = [
  { id: '13101', name: '千代田区', pref: '東京都', lat: 35.694, lon: 139.753, agingRate: 18.5, singleHouseholdRate: 58, welfareRatePercent: 0.7, crimePer100People: 1.45, industryType: '業務・行政集中', industryNote: '官公庁・本社機能が厚い都心。居住より就業地の性格が強い。' },
  { id: '13103', name: '港区', pref: '東京都', lat: 35.658, lon: 139.751, agingRate: 17.8, singleHouseholdRate: 55, welfareRatePercent: 0.8, crimePer100People: 1.1, industryType: '本社・サービス', industryNote: '高地価の業務・商業集積。国際ビジネスと高層住宅が共存。' },
  { id: '13104', name: '新宿区', pref: '東京都', lat: 35.694, lon: 139.703, agingRate: 19.2, singleHouseholdRate: 62, welfareRatePercent: 1.6, crimePer100People: 1.6, industryType: '商業・ターミナル', industryNote: '巨大ターミナル商業圏。夜間人口と来街者のギャップが大きい。' },
  { id: '13112', name: '世田谷区', pref: '東京都', lat: 35.646, lon: 139.653, agingRate: 20.5, singleHouseholdRate: 48, welfareRatePercent: 0.9, crimePer100People: 0.55, industryType: '住宅都市', industryNote: '都内有数の住宅地。商業は沿線・幹線に集中。' },
  { id: '13113', name: '渋谷区', pref: '東京都', lat: 35.664, lon: 139.698, agingRate: 17.1, singleHouseholdRate: 60, welfareRatePercent: 1.0, crimePer100People: 1.2, industryType: 'IT・商業', industryNote: 'コンテンツ・IT・商業の集積。若者流入が多い。' },
  { id: '13120', name: '練馬区', pref: '東京都', lat: 35.736, lon: 139.652, agingRate: 22.8, singleHouseholdRate: 42, welfareRatePercent: 1.3, crimePer100People: 0.5, industryType: '住宅・農地混在', industryNote: '都内でも農地が残る住宅区。ベッドタウン色が強い。' },
  { id: '13121', name: '足立区', pref: '東京都', lat: 35.775, lon: 139.805, agingRate: 24.5, singleHouseholdRate: 45, welfareRatePercent: 3.2, crimePer100People: 0.85, industryType: '住宅・物流', industryNote: '荒川流域の低地を含む住宅・流通エリア。水害ハザードの確認が重要。' },
  { id: '13122', name: '葛飾区', pref: '東京都', lat: 35.744, lon: 139.847, agingRate: 25.1, singleHouseholdRate: 43, welfareRatePercent: 2.8, crimePer100People: 0.8, industryType: '下町・ものづくり', industryNote: '下町工業と住宅が混在。中小製造業の歴史が厚い。' },
  { id: '13123', name: '江戸川区', pref: '東京都', lat: 35.707, lon: 139.868, agingRate: 22.0, singleHouseholdRate: 40, welfareRatePercent: 1.9, crimePer100People: 0.7, industryType: '住宅・デルタ地帯', industryNote: '河川に囲まれた低地が多い。浸水想定の確認が特に重要。' },
  { id: '14100', name: '横浜市', pref: '神奈川県', lat: 35.444, lon: 139.638, agingRate: 24.0, singleHouseholdRate: 44, welfareRatePercent: 1.7, crimePer100People: 0.7, industryType: '港湾・産業・住宅', industryNote: '港湾貿易と臨海工業、郊外ベッドタウンが同居する大都市。' },
  { id: '14130', name: '川崎市', pref: '神奈川県', lat: 35.531, lon: 139.703, agingRate: 21.5, singleHouseholdRate: 48, welfareRatePercent: 1.8, crimePer100People: 0.75, industryType: '京浜工業・住宅', industryNote: '京浜工業地帯の中核。内陸は住宅・研究開発も厚い。' },
  { id: '14150', name: '相模原市', pref: '神奈川県', lat: 35.571, lon: 139.373, agingRate: 25.2, singleHouseholdRate: 38, welfareRatePercent: 1.5, crimePer100People: 0.55, industryType: '内陸工業・住宅', industryNote: '内陸の工業団地と住宅が広がる。都心通勤圏の外縁。' },
  { id: '11100', name: 'さいたま市', pref: '埼玉県', lat: 35.862, lon: 139.646, agingRate: 23.8, singleHouseholdRate: 40, welfareRatePercent: 1.4, crimePer100People: 0.65, industryType: '県庁・ベッドタウン', industryNote: '行政中枢と都心通勤の住宅都市。鉄道結節が強い。' },
  { id: '11203', name: '川口市', pref: '埼玉県', lat: 35.808, lon: 139.724, agingRate: 23.0, singleHouseholdRate: 45, welfareRatePercent: 1.8, crimePer100People: 0.75, industryType: 'ものづくり・住宅', industryNote: '鋳物などものづくりの歴史と、都心近郊住宅が重なる。' },
  { id: '12100', name: '千葉市', pref: '千葉県', lat: 35.607, lon: 140.106, agingRate: 25.5, singleHouseholdRate: 41, welfareRatePercent: 1.6, crimePer100People: 0.7, industryType: '県庁・臨海', industryNote: '行政・業務と埋立臨海部、内陸住宅が並立。' },
  { id: '12204', name: '船橋市', pref: '千葉県', lat: 35.695, lon: 139.983, agingRate: 24.2, singleHouseholdRate: 39, welfareRatePercent: 1.5, crimePer100People: 0.65, industryType: '商業・住宅', industryNote: '東京通勤圏の大型商業・住宅都市。' },
  { id: '12207', name: '松戸市', pref: '千葉県', lat: 35.788, lon: 139.903, agingRate: 26.0, singleHouseholdRate: 38, welfareRatePercent: 1.7, crimePer100People: 0.7, industryType: 'ベッドタウン', industryNote: '常磐線沿線の典型的な都心通勤住宅都市。' },
  { id: '12217', name: '柏市', pref: '千葉県', lat: 35.868, lon: 139.976, agingRate: 25.0, singleHouseholdRate: 37, welfareRatePercent: 1.2, crimePer100People: 0.55, industryType: '商業・研究・住宅', industryNote: 'つくばエクスプレス沿線の商業・住宅・研究機能。' },
  { id: '12227', name: '東金市', pref: '千葉県', lat: 35.56, lon: 140.366, agingRate: 31.2, singleHouseholdRate: 33, welfareRatePercent: 1.8, crimePer100People: 0.6, industryType: '郊外住宅・商業', industryNote: '千葉県東部の郊外都市。住宅団地と幹線沿い商業が中心。' },
  { id: '14131', name: '藤沢市', pref: '神奈川県', lat: 35.339, lon: 139.491, agingRate: 25.8, singleHouseholdRate: 36, welfareRatePercent: 1.1, crimePer100People: 0.5, industryType: '湘南住宅・観光', industryNote: '湘南の住宅・観光・商業。沿岸部は高潮・津波も確認対象。' },
  { id: '22100', name: '静岡市', pref: '静岡県', lat: 34.976, lon: 138.383, agingRate: 29.5, singleHouseholdRate: 35, welfareRatePercent: 1.5, crimePer100People: 0.5, industryType: '県庁・商工業', industryNote: '東海道の商工都市。茶・製造業の歴史が厚い。' },
  { id: '22130', name: '浜松市', pref: '静岡県', lat: 34.711, lon: 137.727, agingRate: 28.0, singleHouseholdRate: 34, welfareRatePercent: 1.4, crimePer100People: 0.48, industryType: '輸送機・ものづくり', industryNote: '二輪・楽器などものづくり産業で成長した都市。' },
  { id: '23100', name: '名古屋市', pref: '愛知県', lat: 35.181, lon: 136.906, agingRate: 25.0, singleHouseholdRate: 46, welfareRatePercent: 1.9, crimePer100People: 0.8, industryType: '自動車関連中枢', industryNote: '中部経済の中核。自動車産業サプライチェーンの拠点。' },
  { id: '23200', name: '豊田市', pref: '愛知県', lat: 35.082, lon: 137.156, agingRate: 24.0, singleHouseholdRate: 32, welfareRatePercent: 0.9, crimePer100People: 0.45, industryType: '自動車産業都市', industryNote: 'トヨタ関連の集積で成長。雇用が産業に強く依存。' },
  { id: '27100', name: '大阪市', pref: '大阪府', lat: 34.694, lon: 135.502, agingRate: 25.5, singleHouseholdRate: 52, welfareRatePercent: 3.8, crimePer100People: 1.35, industryType: '商業・サービス中枢', industryNote: '関西の商業・サービスの中心。区ごとに性格差が大きい。' },
  { id: '27140', name: '堺市', pref: '大阪府', lat: 34.573, lon: 135.483, agingRate: 28.5, singleHouseholdRate: 38, welfareRatePercent: 2.2, crimePer100People: 0.85, industryType: '臨海工業・住宅', industryNote: '古墳文化と臨海工業、内陸住宅が重なる政令市。' },
  { id: '28100', name: '神戸市', pref: '兵庫県', lat: 34.690, lon: 135.196, agingRate: 28.0, singleHouseholdRate: 45, welfareRatePercent: 2.0, crimePer100People: 0.75, industryType: '港湾・観光・住宅', industryNote: '国際港湾と観光、六甲山麓の住宅地。震災の記憶も残る。' },
  { id: '26100', name: '京都市', pref: '京都府', lat: 35.012, lon: 135.768, agingRate: 28.5, singleHouseholdRate: 48, welfareRatePercent: 1.8, crimePer100People: 0.7, industryType: '観光・伝統産業・大学', industryNote: '観光・伝統産業・大学が都市の骨格。盆地特有の気候・水害も。' },
  { id: '34100', name: '広島市', pref: '広島県', lat: 34.385, lon: 132.455, agingRate: 25.5, singleHouseholdRate: 42, welfareRatePercent: 1.7, crimePer100People: 0.7, industryType: '自動車・造船・県庁', industryNote: 'デルタ都市。大雨時の浸水・土砂リスク確認が重要。' },
  { id: '40100', name: '北九州市', pref: '福岡県', lat: 33.883, lon: 130.875, agingRate: 32.0, singleHouseholdRate: 40, welfareRatePercent: 3.5, crimePer100People: 0.9, industryType: '重工業転換', industryNote: '鉄鋼など重工業で成長し、産業転換・高齢化が進む。' },
  { id: '40130', name: '福岡市', pref: '福岡県', lat: 33.590, lon: 130.402, agingRate: 22.0, singleHouseholdRate: 50, welfareRatePercent: 1.8, crimePer100People: 0.95, industryType: '商業・スタートアップ', industryNote: '九州のゲートウェイ。若年流入とサービス産業が厚い。' },
  { id: '01100', name: '札幌市', pref: '北海道', lat: 43.062, lon: 141.354, agingRate: 26.5, singleHouseholdRate: 48, welfareRatePercent: 2.1, crimePer100People: 0.8, industryType: '行政・サービス・雪国', industryNote: '道内中枢。積雪・凍結と広域生活圏が前提。' },
  { id: '04100', name: '仙台市', pref: '宮城県', lat: 38.268, lon: 140.872, agingRate: 24.5, singleHouseholdRate: 45, welfareRatePercent: 1.6, crimePer100People: 0.7, industryType: '東北中枢・学都', industryNote: '東北の業務・学都。沿岸部は津波履歴の確認が重要。' },
  { id: '43100', name: '熊本市', pref: '熊本県', lat: 32.803, lon: 130.708, agingRate: 26.0, singleHouseholdRate: 40, welfareRatePercent: 1.7, crimePer100People: 0.7, industryType: '県庁・半導体関連', industryNote: '県庁所在地。近年は半導体関連投資も。地震履歴あり。' },
  { id: '47201', name: '那覇市', pref: '沖縄県', lat: 26.212, lon: 127.679, agingRate: 22.5, singleHouseholdRate: 42, welfareRatePercent: 2.9, crimePer100People: 0.9, industryType: '観光・サービス', industryNote: '観光依存度が高い。台風・高潮リスクも生活前提。' },
  { id: '15100', name: '新潟市', pref: '新潟県', lat: 37.916, lon: 139.036, agingRate: 29.0, singleHouseholdRate: 36, welfareRatePercent: 1.5, crimePer100People: 0.5, industryType: '米どころ・日本海側中枢', industryNote: '農業と日本海側の拠点都市。低平地の浸水に注意。' },
  { id: '20201', name: '長野市', pref: '長野県', lat: 36.651, lon: 138.181, agingRate: 29.5, singleHouseholdRate: 35, welfareRatePercent: 1.4, crimePer100People: 0.45, industryType: '県庁・内陸', industryNote: '内陸県庁都市。土砂災害・善光寺平の水害も確認対象。' },
]

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
  return `保護 ${m.welfareRatePercent.toFixed(1)}%（100人中約${(m.welfareRatePercent).toFixed(1)}人）`
}

/**
 * 刑法犯認知を「100人あたり件数／おおよそ%」で表示。
 * ※被害者ユニーク人数ではなく、年間の認知件数ベース。
 */
export function formatCrime(m: MunicipalityProfile): string {
  return `犯罪 年${m.crimePer100People.toFixed(2)}件/100人（約${m.crimePer100People.toFixed(2)}%）`
}
