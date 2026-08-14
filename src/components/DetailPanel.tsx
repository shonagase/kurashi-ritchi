import {
  DATA_SOURCES,
  formatCrime,
  formatWelfare,
  statsMeta,
  type MetricMeta,
} from '../data/municipalities'
import { getFloodHistoryLink } from '../data/floodHistory'
import { FORMULAS, VALUE_TYPE_LABEL, type ValueType } from '../lib/formulas'
import { officialHazardMapUrl } from '../lib/geo'
import { hazardStatusLabel, nearestHazardDistanceM } from '../lib/hazardZones'
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
  const floodHistory = getFloodHistoryLink(m.id)
  const rain = candidate.rain

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
            <TypeBadge type="computed" /> 発生側（機械判定）
          </span>
          <strong>{hazardStatusLabel(candidate.zones.status)}</strong>
          <div className="muted small">
            判定済み {candidate.zones.evaluatedCount}/4 ／ 未判定 {candidate.zones.unknownCount}
            {nearestHazardDistanceM(candidate.zones) != null
              ? ` ／ 最寄り区域 約${nearestHazardDistanceM(candidate.zones)}m以内`
              : ''}
          </div>
          <div className="muted small">{FORMULAS.officialZone.note}</div>
        </div>
        <div>
          <span className="stat-label">
            <TypeBadge type="computed" /> シナリオ上限の価格比
          </span>
          <strong className={impact >= 60 ? 'warn-text' : ''}>
            設定シナリオ上限 {range.max}万円（{impact}%）
          </strong>
          <div className="muted small">{FORMULAS.lossImpact.note}</div>
        </div>
      </div>

      <h3>
        <TypeBadge type="computed" /> 発生側：公式ハザードの機械判定
      </h3>
      <p className="muted small">
        判定方式: 地点＋半径
        {candidate.zones.proximityBandsM?.join('/')}
        mの円周サンプリング（基準z={candidate.zones.sampledAtZoom}、欠損時は下位ズームへフォールバック）。
        「約Xm以内」は離散点探索の距離帯です（最短距離の厳密値ではない）。区域外推定は安全宣言ではありません。
      </p>
      <ul className="plain-list">
        {[
          candidate.zones.flood,
          candidate.zones.sedimentSteep,
          candidate.zones.sedimentDebris,
          candidate.zones.sedimentSlide,
        ].map((z) => (
          <li key={z.id} className="metric-line">
            <div className="metric-main">
              <TypeBadge type={z.valueType} />
              <strong>{z.label}</strong>: {z.detail}
            </div>
            {z.nearestZoneWithinM != null && (
              <div className="muted small">
                距離帯: {z.nearestZoneWithinM === 0 ? '0m（地点上）' : `約${z.nearestZoneWithinM}m以内`}
              </div>
            )}
            {z.sampledAtZoom != null && (
              <div className="muted small">使用ズーム: z={z.sampledAtZoom}</div>
            )}
          </li>
        ))}
      </ul>
      {candidate.elevationM != null && (
        <p className="muted small">
          <TypeBadge type="computed" /> 標高補助: {candidate.elevationM.toFixed(1)}m
          {candidate.elevationHsrc ? `（hsrc: ${candidate.elevationHsrc}）` : ''}
          ／ {FORMULAS.hazardFromElevation.note}
        </p>
      )}

      <h3>
        <TypeBadge type="estimate" /> 直近の雨量コンテキスト（参考）
      </h3>
      {rain.failed || rain.precipMm72h == null ? (
        <p className="muted">雨量コンテキストを取得できませんでした。</p>
      ) : (
        <ul className="plain-list">
          <li className="metric-line">
            <div className="metric-main">
              <TypeBadge type="estimate" />
              <strong>直近約72時間の累積雨量</strong>: {rain.precipMm72h}mm
            </div>
          </li>
          <li className="metric-line">
            <div className="metric-main">
              <TypeBadge type="estimate" />
              <strong>期間内の最大時間雨量</strong>: {rain.maxHourlyMm ?? '—'}mm
            </div>
          </li>
        </ul>
      )}
      <p className="note">
        ※{rain.note} 出典: {rain.source}
      </p>

      <h3>
        <TypeBadge type="official" /> 過去浸水（公的資料）
      </h3>
      <p className="muted small">
        浸水実績の公開形態は自治体・河川ごとに異なり、全国一律の地点自動照合は未対応です。
        ここは公的案内へのリンク／要約であり、「この座標が浸水した／していない」の判定ではありません。
      </p>
      {floodHistory ? (
        <div className="flood-history-card">
          <p>
            <strong>{floodHistory.title}</strong>
          </p>
          <p className="muted small">{floodHistory.summary}</p>
          <p className="muted small">
            対象: {floodHistory.asOf} ／ {floodHistory.note}
          </p>
          <p className="source-line">
            <a href={floodHistory.url} target="_blank" rel="noreferrer">
              公的資料を開く
            </a>
          </p>
        </div>
      ) : (
        <p className="muted">
          この市区町村の浸水実績リンクは未整備です。下記の公式地図で確認してください。
        </p>
      )}

      <h3>
        <TypeBadge type="judgment" /> 損害側：独自修理費シナリオ（{hazardLabel(level)}）
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
        ※これは物理的な最大損害額ではなく、モデルが置いた修理費シナリオです（{FORMULAS.repairRange.note}）。
        発生側（区域の機械判定）と損害側は分離しています。期待損失（発生確率×損害額）は未計算です。
        最終確認は公式地図で行ってください。
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
          label="総人口"
          display={m.population ? `${Math.round(m.population).toLocaleString('ja-JP')}人` : '—'}
          meta={m.metrics?.population}
        />
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
        <MetricLine
          label="窃盗認知"
          display={
            m.metrics?.theftPer100People
              ? `年${m.theftPer100People.toFixed(2)}件/100人`
              : '—'
          }
          meta={m.metrics?.theftPer100People}
        />
        <MetricLine
          label="凶悪犯の割合"
          display={m.metrics?.heinousSharePercent ? `${m.heinousSharePercent.toFixed(2)}%` : '—'}
          meta={m.metrics?.heinousSharePercent}
        />
        <MetricLine
          label="粗暴犯の割合"
          display={m.metrics?.violentSharePercent ? `${m.violentSharePercent.toFixed(2)}%` : '—'}
          meta={m.metrics?.violentSharePercent}
        />
        <MetricLine
          label="窃盗犯の割合"
          display={m.metrics?.theftSharePercent ? `${m.theftSharePercent.toFixed(2)}%` : '—'}
          meta={m.metrics?.theftSharePercent}
        />
        <MetricLine
          label="風俗犯の割合"
          display={m.metrics?.moralsSharePercent ? `${m.moralsSharePercent.toFixed(2)}%` : '—'}
          meta={m.metrics?.moralsSharePercent}
        />
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
