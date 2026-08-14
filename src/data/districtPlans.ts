import { approxBoxPolygon, type Polygon } from '../lib/pip'

export type DistrictConstraint = {
  id: string
  label: string
  value: string
  note?: string
}

export type DistrictPlanRecord = {
  id: string
  municipalityId: string
  name: string
  /** 住所・ジオコードラベル照合用 */
  nameMatchers: string[]
  areaHa: number
  sourceUrl: string
  sourceLabel: string
  referenceDate: string
  /**
   * 区域ポリゴン。公式座標ではない概形の場合は geometryConfidence=approximate。
   * 正式図は市の計画図を確認すること。
   */
  polygon: Polygon
  geometryConfidence: 'official' | 'approximate'
  constraints: DistrictConstraint[]
  zonesNote: string
}

/**
 * 人手で収録した地区計画カタログ。
 * 日吉台は公式ページの制限事項を反映。区域は概形矩形（約67.7ha相当）で参考判定。
 */
export const DISTRICT_PLANS: DistrictPlanRecord[] = [
  {
    id: 'togane-hiyoshidai',
    municipalityId: '12227',
    name: '日吉台地区地区計画',
    nameMatchers: [
      '日吉台一丁目',
      '日吉台二丁目',
      '日吉台三丁目',
      '日吉台四丁目',
      '日吉台五丁目',
      '日吉台六丁目',
      '日吉台七丁目',
      '日吉台',
    ],
    areaHa: 67.7,
    sourceUrl: 'https://www.city.togane.chiba.jp/0000001432.html',
    sourceLabel: '東金市 日吉台地区地区計画',
    referenceDate: '2013-01-29',
    // 中心付近の概形（約820m四方 ≈ 67ha）。正式区域は計画図で確認。
    polygon: approxBoxPolygon(35.5689, 140.3412, 410, 410),
    geometryConfidence: 'approximate',
    zonesNote:
      '低層住宅地区1/2・センター地区・業務地区など区分あり。区分ごとの用途制限は物件所在地との照合が必要。',
    constraints: [
      {
        id: 'min_lot',
        label: '敷地面積の最低限度',
        value: '165㎡',
        note: '地区計画決定時に既にあった敷地等は例外あり',
      },
      {
        id: 'setback',
        label: '壁面の位置の制限',
        value: '敷地境界から1.0m以上',
        note: '出窓・車庫・ポーチ等に例外あり',
      },
      {
        id: 'fence',
        label: 'かき・さくの構造',
        value: '道路面は生垣または開放柵を基本',
        note: '高さ1.2m以下の塀等に例外あり',
      },
      {
        id: 'use_limit',
        label: '用途制限（区分による）',
        value: '低層住宅地区1では長屋・共同住宅等を制限',
        note: '区分照合が必要。最終は市の計画図・届出',
      },
    ],
  },
]
