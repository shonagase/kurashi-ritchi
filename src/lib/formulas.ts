/**
 * 指標の性質と計算式の定義（UI・更新スクリプトで共有する説明用）。
 *
 * valueType:
 * - input: ユーザー入力
 * - official: 公的統計（正しく取得できた場合）
 * - computed: 入力や一次データからの計算
 * - estimate: 独自の修理費などの推定
 * - judgment: 独自評価ラベル
 */
export type ValueType = 'input' | 'official' | 'computed' | 'estimate' | 'judgment'

export const VALUE_TYPE_LABEL: Record<ValueType, string> = {
  input: '入力値',
  official: '公的統計',
  computed: '計算値',
  estimate: '推定',
  judgment: '独自評価',
}

export const FORMULAS = {
  lossImpact: {
    label: '購入額に対する最大想定修理費比率',
    valueType: 'computed' as ValueType,
    formula: '想定修理費の上限（万円） ÷ 購入額（万円） × 100',
    note: '危険度そのものではない。損害額の価格比。',
  },
  hazardFromElevation: {
    label: '標高からの便宜的区分',
    valueType: 'judgment' as ValueType,
    formula: '標高 < 5m → 高め / < 15m → 注意 / それ以外 → 相対的に低め',
    note: '公式ハザード区域判定ではない。',
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
    formula: '標高区分に応じた固定テーブル参照',
    note: '発生確率を掛けた期待損失ではない。',
  },
} as const
