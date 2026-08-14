import { DATA_SOURCES, formatCrime, formatWelfare, statsMeta } from '../data/municipalities'
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
          <span className="stat-label">購入額（母数）</span>
          <strong>{candidate.purchaseManYen}万円</strong>
        </div>
        <div>
          <span className="stat-label">損失インパクト</span>
          <strong className={impact >= 60 ? 'warn-text' : ''}>最大{range.max}万円</strong>
          <div className="muted small">
            想定修理費上限 ÷ 購入額 = {impact}%
          </div>
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
        ※損失インパクトは「想定修理費の上限（{range.max}万円）÷ 購入額（{candidate.purchaseManYen}万円）」。
        同時全損ではなく、代表的な単一シナリオの目安です。
      </p>

      <h3>通勤・移動（徒歩30分圏）</h3>
      {candidate.transitFetchFailed ? (
        <p className="error">交通データの取得に失敗しました。時間をおいて候補を入れ直してください。</p>
      ) : (
        <>
          <h4 className="subhead">駅・電停（{candidate.stations.length}件）</h4>
          {candidate.stations.length ? (
            <ul className="plain-list transit-list">
              {candidate.stations.map((s) => (
                <li key={`st-${s.name}-${s.meters}`}>
                  {s.name}
                  <span className="muted"> 徒歩約{s.walkMin}分（{s.meters}m）</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">徒歩30分圏内に駅が見つかりませんでした。</p>
          )}

          <h4 className="subhead">バス停（{candidate.buses.length}件）</h4>
          {candidate.buses.length ? (
            <ul className="plain-list transit-list">
              {candidate.buses.map((s) => (
                <li key={`bus-${s.name}-${s.meters}`}>
                  {s.name}
                  <span className="muted"> 徒歩約{s.walkMin}分（{s.meters}m）</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">徒歩30分圏内にバス停が見つかりませんでした。</p>
          )}
        </>
      )}
      <p className="note">※徒歩分数は直線距離÷分速80mの概算です。実際の道路距離とは差があります。</p>
      <p className="source-line">
        出典:{' '}
        <a href={DATA_SOURCES.osm.url} target="_blank" rel="noreferrer">
          {DATA_SOURCES.osm.label}
        </a>
      </p>

      <h3>地域性（{m.pref} {m.name}）</h3>
      <p className="muted small">統計更新日: {statsMeta.updatedAt}</p>
      <p>{m.industryNote}</p>
      <ul className="plain-list">
        <li>産業タイプ: {m.industryType}</li>
        <li>高齢化率: {m.agingRate}%</li>
        <li>単身世帯比率: {m.singleHouseholdRate}%（概算）</li>
        <li>{formatWelfare(m)}</li>
        <li>
          {formatCrime(m)}
          <div className="muted small">※年間の刑法犯認知件数ベース（被害者人数そのものではない）</div>
        </li>
      </ul>
      <p className="source-line">
        出典:{' '}
        <a href={DATA_SOURCES.estatApi.url} target="_blank" rel="noreferrer">
          {DATA_SOURCES.estatApi.label}
        </a>
        {' / '}
        <a href={DATA_SOURCES.census.url} target="_blank" rel="noreferrer">
          {DATA_SOURCES.census.label}
        </a>
        {' / '}
        <a href={DATA_SOURCES.welfare.url} target="_blank" rel="noreferrer">
          {DATA_SOURCES.welfare.label}
        </a>
        {' / '}
        <a href={DATA_SOURCES.crime.url} target="_blank" rel="noreferrer">
          {DATA_SOURCES.crime.label}
        </a>
        {' / '}
        <a href={DATA_SOURCES.economicCensus.url} target="_blank" rel="noreferrer">
          {DATA_SOURCES.economicCensus.label}
        </a>
      </p>

      <div className="detail-actions">
        <a
          className="button secondary"
          href={officialHazardMapUrl(candidate.lat, candidate.lon)}
          target="_blank"
          rel="noreferrer"
        >
          公式「重ねるハザードマップ」で確認
        </a>
        <a
          className="button ghost"
          href={DATA_SOURCES.gsiElevation.url}
          target="_blank"
          rel="noreferrer"
        >
          標高データの出典を開く
        </a>
      </div>
    </aside>
  )
}
