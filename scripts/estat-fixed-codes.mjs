/**
 * e-Stat 社会・人口統計体系: 市区町村の固定コード。
 * 名称あいまいマッチは使わない。
 *
 * 参照ログ / 公開メタに基づく固定値。
 * 上書きが必要な自治体は data/municipalities.overrides.json を優先。
 */
export const ESTAT_FIXED_METRICS = {
  population: {
    field: 'population',
    statsDataId: '0000020301',
    cdCat01: '#A1101',
    fallbackCat01: ['#A110101'],
    unit: '人',
    label: '総人口',
    convert: 'identity',
  },
  agingRate: {
    field: 'agingRate',
    statsDataId: '0000020301',
    cdCat01: '#A03503',
    fallbackCat01: ['#A03506', '#A4101'],
    unit: '%',
    label: '65歳以上人口割合（高齢化率）',
    convert: 'percent',
  },
  singleHouseholdRate: {
    field: 'singleHouseholdRate',
    statsDataId: '0000020301',
    cdCat01: '#A06205',
    fallbackCat01: ['#A06301'],
    unit: '%',
    label: '単独世帯割合',
    convert: 'percent',
    /** 誤マッチ防止: 65歳以上世帯員の単独世帯は使わない */
    forbiddenNameSubstrings: ['65歳以上世帯員'],
  },
  welfareRatePercent: {
    field: 'welfareRatePercent',
    statsDataId: '0000020310',
    cdCat01: '#J01107',
    fallbackCat01: ['#J2301', '#J01101'],
    fallbackStatsDataIds: ['0000020210', '0000020301'],
    unit: '%',
    label: '生活保護被保護実人員（人口千人当たり）→%',
    convert: 'perThousandToPercent',
  },
  crimePer100People: {
    field: 'crimePer100People',
    statsDataId: '0000020311',
    cdCat01: '#K06101',
    fallbackCat01: ['#K4101'],
    unit: '件/100人・年',
    label: '刑法犯認知件数（人口千人当たり）→100人あたり',
    convert: 'perThousandToPer100',
  },
  theftPer100People: {
    field: 'theftPer100People',
    statsDataId: '0000020311',
    cdCat01: '#K06104',
    unit: '件/100人・年',
    label: '窃盗犯認知件数（人口千人当たり）→100人あたり',
    convert: 'perThousandToPer100',
  },
  heinousSharePercent: {
    field: 'heinousSharePercent',
    statsDataId: '0000020311',
    cdCat01: '#K06401',
    unit: '%',
    label: '刑法犯認知件数に占める凶悪犯の割合',
    convert: 'percent',
  },
  violentSharePercent: {
    field: 'violentSharePercent',
    statsDataId: '0000020311',
    cdCat01: '#K06402',
    unit: '%',
    label: '刑法犯認知件数に占める粗暴犯の割合',
    convert: 'percent',
  },
  theftSharePercent: {
    field: 'theftSharePercent',
    statsDataId: '0000020311',
    cdCat01: '#K06403',
    unit: '%',
    label: '刑法犯認知件数に占める窃盗犯の割合',
    convert: 'percent',
  },
  moralsSharePercent: {
    field: 'moralsSharePercent',
    statsDataId: '0000020311',
    cdCat01: '#K06405',
    unit: '%',
    label: '刑法犯認知件数に占める風俗犯の割合',
    convert: 'percent',
  },
}
