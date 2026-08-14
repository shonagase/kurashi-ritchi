import { relativeLabel } from '../data/municipalities'
import { officialHazardMapUrl } from '../lib/geo'
import { REPAIR_SCENARIOS, hazardLabel, lossImpactPercent, totalRepairRange } from '../lib/risk'
import type { Candidate } from '../types'

type Props = {
  candidate: Candidate | null
}

export function DetailPanel({ candidate }: Props) {
  if (!candidate) {
    return (
      <aside className="detail-panel">
        <h2>詳細</h2>
        <p className="muted">候補を選ぶと、想定損失の内訳と地域性を表示します。</p>
      </aside>
    )
  }

  const level = candidate.hazardLevel
  const range = totalRepairRange(level)
  const impact = lossImpactPercent(candidate.purchaseManYen, range.max)
  const scenarios = REPAIR_SCENARIOS[level] ?? REPAIR_SCENARIOS.mid
  const m = candidate.municipality

  return (
    <aside className="detail-panel">
      <p className="eyebrow">地点詳細</p>
      <h2>{candidate.name}</h2>
      <p className="muted">{candidate.address}</p>

      <div className="stat-row">
        <div>
          <span className="stat-label">購入額</span>
          <strong>{candidate.purchaseManYen}万円</strong>
        </div>
        <div>
          <span className="stat-label">損失インパクト</span>
          <strong className={impact >= 60 ? 'warn-text' : ''}>最大{impact}%</strong>
        </div>
        <div>
          <span className="stat-label">危険度</span>
          <strong>{hazardLabel(level)}</strong>
        </div>
      </div>

      <h3>被災時の想定修理費</h3>
      <ul className="scenario-list">
        {scenarios.map((s) => (
          <li key={s.id}>
            <div className="scenario-head">
              <strong>{s.label}</strong>
              <span>
                {s.minManYen}〜{s.maxManYen}万円
              </span>
            </div>
            <p className="muted small">{s.note}</p>
          </li>
        ))}
      </ul>
      <p className="note">
        ※同時に全被害が起きる想定ではなく、代表的な単一シナリオの目安です。正式な見積や保険の代替ではありません。
      </p>

      <h3>通勤・移動</h3>
      <ul className="plain-list">
        <li>
          最寄り駅: {candidate.stationName ?? '取得できず'}
          {candidate.stationWalkMin != null ? `（徒歩約${candidate.stationWalkMin}分）` : ''}
        </li>
        <li>
          最寄りバス停: {candidate.busName ?? '取得できず'}
          {candidate.busWalkMin != null ? `（徒歩約${candidate.busWalkMin}分）` : ''}
        </li>
      </ul>

      <h3>地域性（{m.pref} {m.name}）</h3>
      <p>{m.industryNote}</p>
      <ul className="plain-list">
        <li>産業タイプ: {m.industryType}</li>
        <li>高齢化率: {m.agingRate}%</li>
        <li>単身世帯比率: {m.singleHouseholdRate}%（概算）</li>
        <li>生活保護の相対水準: {relativeLabel(m.welfareRelative)}（自治体単位）</li>
        <li>犯罪の相対水準: {relativeLabel(m.crimeRelative)}（自治体単位）</li>
      </ul>

      <a
        className="button secondary"
        href={officialHazardMapUrl(candidate.lat, candidate.lon)}
        target="_blank"
        rel="noreferrer"
      >
        公式「重ねるハザードマップ」で確認
      </a>
    </aside>
  )
}
