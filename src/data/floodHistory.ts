/**
 * 自治体・河川ごとの浸水関連公的資料（リンク／要約）。
 * 地点の浸水有無の自動判定ではない。URL未確認の自治体は載せない。
 */
export type FloodHistoryLink = {
  municipalityId: string
  title: string
  summary: string
  url: string
  asOf: string
  coverage: 'municipality_guidance' | 'hazard_map' | 'flood_history_map'
  note: string
}

export const FLOOD_HISTORY_LINKS: FloodHistoryLink[] = [
  {
    municipalityId: '12227',
    title: '東金市 ハザードマップ（洪水・土砂など）',
    summary:
      '市のハザードマップで地点ごとの洪水・土砂区域を確認できる。千葉県は警戒区域外でも土砂災害の可能性を注記している。',
    url: 'https://www.city.togane.lg.jp/0000001630.html',
    asOf: '2026',
    coverage: 'hazard_map',
    note: '地点の浸水有無の自動判定ではない',
  },
  {
    municipalityId: '13101',
    title: '千代田区 洪水・内水ハザードマップ',
    summary: '区が公開する洪水・内水ハザードマップ。想定区域であり過去浸水の網羅リストではない。',
    url: 'https://www.city.chiyoda.lg.jp/koho/bosa/bosai/hazardmap.html',
    asOf: '2026',
    coverage: 'hazard_map',
    note: '地点の浸水有無の自動判定ではない',
  },
  {
    municipalityId: '13103',
    title: '港区 ハザードマップ',
    summary: '区のハザードマップポータル。洪水・高潮・土砂などの想定情報。',
    url: 'https://www.city.minato.tokyo.jp/bousai/bosai/hazardmap.html',
    asOf: '2026',
    coverage: 'hazard_map',
    note: '地点の浸水有無の自動判定ではない',
  },
  {
    municipalityId: '13104',
    title: '新宿区 洪水ハザードマップ',
    summary: '区の洪水・内水関連ハザードマップ案内。',
    url: 'https://www.city.shinjuku.lg.jp/anzen/file07_04_00004.html',
    asOf: '2026',
    coverage: 'hazard_map',
    note: '地点の浸水有無の自動判定ではない',
  },
  {
    municipalityId: '13112',
    title: '世田谷区 洪水・内水ハザードマップ',
    summary: '区の洪水・内水ハザードマップ。想定最大規模など。',
    url: 'https://www.city.setagaya.lg.jp/mokuji/kuyakusho/004/015/002/d00155652.html',
    asOf: '2026',
    coverage: 'hazard_map',
    note: '地点の浸水有無の自動判定ではない',
  },
  {
    municipalityId: '13113',
    title: '渋谷区 ハザードマップ',
    summary: '区の洪水・土砂等ハザードマップ案内。',
    url: 'https://www.city.shibuya.tokyo.jp/anzen/bousai/hazardmap.html',
    asOf: '2026',
    coverage: 'hazard_map',
    note: '地点の浸水有無の自動判定ではない',
  },
  {
    municipalityId: '13120',
    title: '練馬区 洪水ハザードマップ',
    summary: '区の洪水ハザードマップ等の防災地図。',
    url: 'https://www.city.nerima.tokyo.jp/kurashi/bosai/hazardmap/index.html',
    asOf: '2026',
    coverage: 'hazard_map',
    note: '地点の浸水有無の自動判定ではない',
  },
  {
    municipalityId: '13121',
    title: '足立区 洪水ハザードマップ',
    summary: '区の洪水ハザードマップ。荒川等の想定区域情報。',
    url: 'https://www.city.adachi.tokyo.jp/bosai/bosai/hazardmap.html',
    asOf: '2026',
    coverage: 'hazard_map',
    note: '地点の浸水有無の自動判定ではない',
  },
  {
    municipalityId: '13122',
    title: '葛飾区 洪水ハザードマップ',
    summary: '区の洪水ハザードマップ案内。',
    url: 'https://www.city.katsushika.lg.jp/kurashi/1000061/1006347/1006357.html',
    asOf: '2026',
    coverage: 'hazard_map',
    note: '地点の浸水有無の自動判定ではない',
  },
  {
    municipalityId: '13123',
    title: '江戸川区 洪水ハザードマップ',
    summary: '区の洪水ハザードマップ。海抜ゼロメートル地帯の想定情報が中心。',
    url: 'https://www.city.edogawa.tokyo.jp/bousai/bosai/hazardmap.html',
    asOf: '2026',
    coverage: 'hazard_map',
    note: '地点の浸水有無の自動判定ではない',
  },
  {
    municipalityId: '14100',
    title: '横浜市 洪水ハザードマップ',
    summary: '市の洪水ハザードマップ・防災地図。想定区域情報。',
    url: 'https://www.city.yokohama.lg.jp/kurashi/bousai-kyukyu-bohan/bousai-kasai/bosai/hazardmap/',
    asOf: '2026',
    coverage: 'hazard_map',
    note: '地点の浸水有無の自動判定ではない',
  },
  {
    municipalityId: '14130',
    title: '川崎市 ハザードマップ',
    summary: '市の洪水・土砂等ハザードマップ案内。',
    url: 'https://www.city.kawasaki.jp/kurashi/category/29-1-5-0-0-0-0-0-0-0.html',
    asOf: '2026',
    coverage: 'hazard_map',
    note: '地点の浸水有無の自動判定ではない',
  },
  {
    municipalityId: '12100',
    title: '千葉市 洪水ハザードマップ',
    summary: '市の洪水ハザードマップ等。',
    url: 'https://www.city.chiba.jp/somu/kikikanri/hazardmap.html',
    asOf: '2026',
    coverage: 'hazard_map',
    note: '地点の浸水有無の自動判定ではない',
  },
  {
    municipalityId: '27100',
    title: '大阪市 洪水ハザードマップ',
    summary: '市の洪水・津波等ハザードマップ。',
    url: 'https://www.city.osaka.lg.jp/kikikanri/page/0000541067.html',
    asOf: '2026',
    coverage: 'hazard_map',
    note: '地点の浸水有無の自動判定ではない',
  },
  {
    municipalityId: '23100',
    title: '名古屋市 洪水ハザードマップ',
    summary: '市の洪水ハザードマップ案内。',
    url: 'https://www.city.nagoya.jp/bousai/page/0000128340.html',
    asOf: '2026',
    coverage: 'hazard_map',
    note: '地点の浸水有無の自動判定ではない',
  },
  {
    municipalityId: '40130',
    title: '福岡市 洪水ハザードマップ',
    summary: '市の洪水ハザードマップ等。',
    url: 'https://www.city.fukuoka.lg.jp/bousai/bousai/life/bousai/hazardmap.html',
    asOf: '2026',
    coverage: 'hazard_map',
    note: '地点の浸水有無の自動判定ではない',
  },
  {
    municipalityId: '01100',
    title: '札幌市 洪水ハザードマップ',
    summary: '市の洪水ハザードマップ案内。',
    url: 'https://www.city.sapporo.jp/kikikanri/hazardmap/index.html',
    asOf: '2026',
    coverage: 'hazard_map',
    note: '地点の浸水有無の自動判定ではない',
  },
]

const byId = new Map(FLOOD_HISTORY_LINKS.map((l) => [l.municipalityId, l]))

export function getFloodHistoryLink(municipalityId: string): FloodHistoryLink | null {
  return byId.get(municipalityId) ?? null
}
