export type ValueType = 'input' | 'official' | 'computed' | 'estimate' | 'judgment'

export const VALUE_TYPE_LABEL: Record<ValueType, string> = {
  input: '入力値',
  official: '公的データ',
  computed: '計算値',
  estimate: '推定',
  judgment: '独自評価',
}

export const FORMULAS = {
  lossImpact: {
    label: '購入額に対する最大想定修理費比率',
    valueType: 'computed' as ValueType,
    formula: '想定修理費の上限（万円） ÷ 購入額（万円） × 100',
    note: '危険度そのものではない。損害額の価格比（損害側）。',
  },
  officialZone: {
    label: '公式ハザード区域該当',
    valueType: 'official' as ValueType,
    formula: 'ハザードマップポータルのラスタタイルを地点サンプリング',
    note: '発生側。ポリゴン厳密判定ではない。最終確認は公式地図で。',
  },
  damageTier: {
    label: '損害ティア',
    valueType: 'estimate' as ValueType,
    formula: '公式区域該当（洪水・土砂）→ 修理費テーブルを選択',
    note: '発生側と損害側を分けたうえでの損害額レンジ選定。',
  },
  hazardFromElevation: {
    label: '標高補助',
    valueType: 'judgment' as ValueType,
    formula: '標高は補助情報。公式区域判定を優先。',
    note: '区域外でも極低標高なら損害ティアを一段上げる場合あり。',
  },
  straightWalkMin: {
    label: '直線距離換算時間',
    valueType: 'computed' as ValueType,
    formula: '直線距離(m) ÷ 80（分速m）',
    note: '道路距離・実歩行時間ではない。',
  },
  repairRange: {
    label: '想定修理費レンジ',
    valueType: 'estimate' as ValueType,
    formula: '損害ティアに応じた固定テーブル',
    note: '発生確率を掛けた期待損失ではない。',
  },
} as const
