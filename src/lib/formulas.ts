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
    label: '購入額に対するシナリオ上限修理費の比率',
    valueType: 'computed' as ValueType,
    formula: 'シナリオ上限修理費（万円） ÷ 購入額（万円） × 100',
    note: '危険度でも物理的最大損害でもない。設定シナリオ上限の価格比。',
  },
  officialZone: {
    label: '公式ハザード区域の機械判定',
    valueType: 'computed' as ValueType,
    formula: 'ハザードマップポータルのラスタタイルを地点サンプリング（z=15）',
    note: '公的データに基づく計算値。未判定を区域外に丸めない。区域外推定≠安全。最終確認は公式地図で。',
  },
  damageTier: {
    label: '独自修理費シナリオ（損害ティア）',
    valueType: 'judgment' as ValueType,
    formula: '区域該当結果 → 修理費ヒューリスティックテーブルを選択',
    note: '公式の被害額算定式ではない。モデル仮定のレンジ。',
  },
  hazardFromElevation: {
    label: '標高補助',
    valueType: 'computed' as ValueType,
    formula: '国土地理院標高API（elevation + hsrc）',
    note: '標高は補助情報。発生側ステータスの代替には使わない。',
  },
  straightWalkMin: {
    label: '直線距離換算時間',
    valueType: 'computed' as ValueType,
    formula: '直線距離(m) ÷ 80（分速m）',
    note: '道路距離・実歩行時間ではない。',
  },
  repairRange: {
    label: '独自修理費シナリオレンジ',
    valueType: 'judgment' as ValueType,
    formula: '損害ティアに応じた固定ヒューリスティック',
    note: '発生確率を掛けた期待損失ではない。物理最大損害でもない。',
  },
} as const
