import {
  DATA_SOURCES,
  formatCrime,
  formatWelfare,
  statsMeta,
  type MetricMeta,
} from '../data/municipalities'
import { FORMULAS, VALUE_TYPE_LABEL, type ValueType } from '../lib/formulas'
import { officialHazardMapUrl } from '../lib/geo'
import { REPAIR_SCENARIOS, hazardLabel, lossImpactPercent, totalRepairRange } from '../lib/risk'
import type { Candidate } from '../types'

type Props = {
  candidate: Candidate | null
}

function TypeBadge({ type }: { type: ValueType }) {
  return <span className={`type-badge type-${type}`}>{VALUE_TYPE_LABEL[type]}</span>
}

function MetricLine({
  label,
  display,
  meta,
}: {
  label: string
  display: string
  meta?: MetricMeta | null
}) {
  const type = (meta?.valueType as ValueType) || 'estimate'
  return (
    <li className="metric-line">
      <div className="metric-main">
        <TypeBadge type={type} />
        <strong>{label}</strong>: {display}
      </div>
      {meta && (
        <div className="muted small metric-meta">
          対象時点: {meta.referenceDate || '不明'}
          {meta.source ? ` / 出典: ${meta.source}` : ''}
          {meta.warning ? ` / 注意: ${meta.warning}` : ''}
        </div>
      )}
    </li>
  )
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
      <p className="muted small">
        座標: {candidate.lat.toFixed(5)}, {candidate.lon.toFixed(5)}（この点を起点に距離計算）
      </p>

      <div className="stat-row">
        <div>
          <span className="stat-label">
            <TypeBadge type="input" /> 購入額（母数）
          </span>
          <strong>{candidate.purchaseManYen}万円</strong>
        </div>
        <div>
          <span className="stat-label">
            <TypeBadge type="computed" /> 損害額比率
          </span>
          <strong className={impact >= 60 ? 'warn-text' : ''}>
            最大{range.max}万円（{impact}%）
          </strong>
          <div className="muted small">{FORMULAS.lossImpact.formula}</div>
          <div className="muted small">{FORMULAS.lossImpact.note}</div>
        </div>
        <div>
          <span className="stat-label">
            <TypeBadge type="judgment" /> 標高ベース区分
          </span>
          <strong>{hazardLabel(level)}</strong>
          <div className="muted small">{FORMULAS.hazardFromElevation.formula}</div>
          <div className="muted small">{FORMULAS.hazardFromElevation.note}</div>
        </div>
      </div>

      <h3>
        <TypeBadge type="estimate" /> 被災時の想定修理費
      </h3>
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
        ※これは発生確率を掛けた期待損失ではありません。修理費テーブルによる推定です。
        公式ハザード区域への該当判定は別途「重ねるハザードマップ」で確認してください。
      </p>

      <h3>
        <TypeBadge type="computed" /> 通勤・移動（直線30分換算圏）
      </h3>
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
                  <div className="muted small">
                    直線距離 約{(s.meters / 1000).toFixed(2)}km ／ 直線換算 約{s.walkMin}分
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">直線30分換算圏内に駅が見つかりませんでした。</p>
          )}

          <h4 className="subhead">バス停（{candidate.buses.length}件）</h4>
          {candidate.buses.length ? (
            <ul className="plain-list transit-list">
              {candidate.buses.map((s) => (
                <li key={`bus-${s.name}-${s.meters}`}>
                  {s.name}
                  <div className="muted small">
                    直線距離 約{(s.meters / 1000).toFixed(2)}km ／ 直線換算 約{s.walkMin}分
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">直線30分換算圏内にバス停が見つかりませんでした。</p>
          )}
        </>
      )}
      <p className="note">※{FORMULAS.straightWalkMin.formula}。実歩行ルートではありません。</p>
      <p className="source-line">
        地点データ出典:{' '}
        <a href={DATA_SOURCES.osm.url} target="_blank" rel="noreferrer">
          {DATA_SOURCES.osm.label}
        </a>
      </p>

      <h3>地域性（{m.pref} {m.name}）</h3>
      <p className="muted small">
        取得バッチ: {statsMeta.retrievedAt || '不明'}（これは取得日であり、各指標の対象時点ではありません）
      </p>
      <p>
        <TypeBadge type="judgment" /> 産業メモ: {m.industryType} — {m.industryNote}
      </p>
      <ul className="plain-list">
        <MetricLine
          label="高齢化率"
          display={`${m.agingRate}%`}
          meta={m.metrics?.agingRate}
        />
        <MetricLine
          label="単身世帯比率"
          display={`${m.singleHouseholdRate}%`}
          meta={m.metrics?.singleHouseholdRate}
        />
        <MetricLine label="生活保護" display={formatWelfare(m)} meta={m.metrics?.welfareRatePercent} />
        <MetricLine label="犯罪認知" display={formatCrime(m)} meta={m.metrics?.crimePer100People} />
      </ul>
      <p className="source-line">
        出典ポータル:{' '}
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
      </p>

      <div className="detail-actions">
        <a
          className="button secondary"
          href={officialHazardMapUrl(candidate.lat, candidate.lon)}
          target="_blank"
          rel="noreferrer"
        >
          公式「重ねるハザードマップ」で区域判定を確認
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
