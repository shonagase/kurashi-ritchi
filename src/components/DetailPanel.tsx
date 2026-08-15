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
import { legalStatusLabel } from '../lib/legalGate'
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
  if (meta?.unavailable || meta?.value == null) {
    return (
      <li className="metric-line">
        <div className="metric-main">
          <TypeBadge type="estimate" />
          <strong>{label}</strong>: —
        </div>
        <div className="muted small metric-meta">
          未収録（unavailable）
          {meta?.warning ? ` / ${meta.warning}` : ''}
        </div>
      </li>
    )
  }
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
  const refTag =
    candidate.locationEvalLevel === 'property'
      ? null
      : candidate.locationEvalLevel === 'reference'
        ? '丁目代表点の参考値'
        : candidate.locationEvalLevel === 'overview'
          ? '町域代表点の概況（物件固有ではない）'
          : '地点精度不足のため非表示'

  return (
    <aside className="detail-panel">
      <p className="eyebrow">地点詳細</p>
      <h2>{candidate.name}</h2>
      <p className="muted">{candidate.address}</p>
      <p className="muted small">
        座標: {candidate.lat.toFixed(5)}, {candidate.lon.toFixed(5)}
        {candidate.geocode.allowPointHazard ? '（この点を起点に距離計算）' : '（物件固有計算はスキップ）'}
      </p>
      <div
        className={`location-gate ${
          candidate.locationEvalLevel === 'property'
            ? 'ok'
            : candidate.locationEvalLevel === 'reference'
              ? 'mid'
              : 'warn'
        }`}
      >
        <div>
          <strong>地点精度</strong>: {candidate.geocode.labelJa}
          <span className="muted small">
            {' '}
            ／ confidence: {candidate.geocode.locationConfidence}
            ／ eval: {candidate.locationEvalLevel}
            ／ property_specific: {candidate.geocode.propertySpecific ? 'true' : 'false'}
          </span>
        </div>
        {candidate.geocode.gateMessage && (
          <p className="gate-message">{candidate.geocode.gateMessage}</p>
        )}
      </div>
      {candidate.invariantIssues.some((i) => i.severity === 'error') && (
        <div className="invariant-banner error">
          <strong>データ整合性エラー</strong>
          <ul>
            {candidate.invariantIssues
              .filter((i) => i.severity === 'error')
              .map((i) => (
                <li key={i.code}>{i.message}</li>
              ))}
          </ul>
        </div>
      )}
      {candidate.invariantIssues.some((i) => i.severity === 'warning') && (
        <div className="invariant-banner warn">
          <strong>データ整合性の注意</strong>
          <ul>
            {candidate.invariantIssues
              .filter((i) => i.severity === 'warning')
              .map((i) => (
                <li key={i.code}>{i.message}</li>
              ))}
          </ul>
        </div>
      )}

      <div
        className={`legal-gate ${
          candidate.legal.status === 'attention'
            ? 'warn'
            : candidate.legal.status === 'needs_verify'
              ? 'mid'
              : 'ok'
        }`}
      >
        <p className="eyebrow">Due Diligence ゲート（法務・都市計画）</p>
        <strong>{candidate.legal.summary}</strong>
        {candidate.legal.districtPlan && (
          <p className="muted small">
            出典:{' '}
            <a href={candidate.legal.districtPlan.sourceUrl} target="_blank" rel="noreferrer">
              {candidate.legal.districtPlan.sourceLabel}
            </a>
            （告示 {candidate.legal.districtPlan.referenceDate}／面積約
            {candidate.legal.districtPlan.areaHa}ha／照合
            {candidate.legal.matchMethod === 'address' ? '住所' : '概形PiP'}）
          </p>
        )}
        <ul className="plain-list legal-checklist">
          {candidate.legal.items.map((item) => (
            <li key={item.id} className="metric-line">
              <div className="metric-main">
                <TypeBadge type={item.valueType} />
                <span className={`legal-status status-${item.status}`}>
                  {legalStatusLabel(item.status)}
                </span>
                <strong>{item.label}</strong>
              </div>
              <div className="muted small">{item.detail}</div>
            </li>
          ))}
        </ul>
        <p className="note">
          中古戸建ては洪水リスクより、再建築・接道・地区計画適合の方が損失が大きいことがあります。ここは断定ではなく確認リストです。
        </p>
      </div>

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
            判定済み {candidate.zones.evaluatedCount}/{candidate.zones.displayOrder.length} ／ 未判定{' '}
            {candidate.zones.unknownCount}
            {nearestHazardDistanceM(candidate.zones) != null
              ? ` ／ 最寄り区域 約${nearestHazardDistanceM(candidate.zones)}m以内`
              : ''}
          </div>
          <div className="muted small">
            プロファイル: {candidate.zones.profile.label} — {candidate.zones.profile.note}
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
      {!candidate.geocode.allowPointHazard ? (
        <p className="error">
          地点精度が不足しているため物件固有ハザード判定は実行していません（{refTag}）。
        </p>
      ) : (
        <>
          <p className="muted small">
            優先軸: {candidate.zones.profile.priority.join(' / ')}。
            河川洪水タイルは統合配信のため荒川・江戸川等の個別シナリオには分割していません。
            {refTag ? ` ※${refTag}` : ''}
          </p>
          <ul className="plain-list">
            {candidate.zones.displayOrder.map((z) => (
              <li key={z.id} className="metric-line">
                <div className="metric-main">
                  <TypeBadge type={z.valueType} />
                  <span className={`legal-status status-${z.priority}`}>{z.priority}</span>
                  <strong>{z.label}</strong>: {z.detail}
                </div>
                {z.scenario && (
                  <div className="muted small">
                    scenario: {z.scenario}
                    {z.scenarioNote ? ` — ${z.scenarioNote}` : ''}
                  </div>
                )}
                <div className="muted small">
                  distance_to_hazard_area:{' '}
                  {z.distanceToHazardAreaM == null
                    ? 'null'
                    : z.distanceToHazardAreaM === 0
                      ? '0m（区域内）'
                      : `約${z.distanceToHazardAreaM}m以内`}
                  {' ／ '}
                  distance_to_boundary: null（ラスタでは未計算）
                  {' ／ '}
                  method_confidence: {z.methodConfidence}
                </div>
                {z.failReason && (
                  <div className="muted small">未判定コード: {z.failReason}</div>
                )}
                {z.sampledAtZoom != null && (
                  <div className="muted small">使用ズーム: z={z.sampledAtZoom}</div>
                )}
              </li>
            ))}
          </ul>
          <h4 className="subhead">ベクターPiP（第二手法）</h4>
          <p className="muted small">{candidate.vectorHazards.note}</p>
        </>
      )}
      {candidate.elevationM != null ? (
        <p className="muted small">
          <TypeBadge type="computed" /> 標高補助: {candidate.elevationM.toFixed(1)}m
          {candidate.elevationHsrc ? `（hsrc: ${candidate.elevationHsrc}）` : ''}
          ／ {FORMULAS.hazardFromElevation.note}
          {refTag ? ` ※${refTag}` : ''}
        </p>
      ) : !candidate.geocode.allowPointHazard ? (
        <p className="muted small">標高: 地点精度不足のため未取得</p>
      ) : null}

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
        <TypeBadge type="computed" /> 通勤・移動（直線距離・参考）
      </h3>
      {!candidate.geocode.allowPointHazard ? (
        <p className="error">地点精度不足のため駅・バス停距離は計算していません。</p>
      ) : candidate.transitFetchFailed ? (
        <p className="error">交通データの取得に失敗しました。時間をおいて候補を入れ直してください。</p>
      ) : (
        <>
          {refTag && <p className="muted small">※{refTag}</p>}
          <h4 className="subhead">最寄り駅（上位3件）</h4>
          {candidate.stations.length ? (
            <ul className="plain-list transit-list">
              {candidate.stations.slice(0, 3).map((s) => (
                <li key={`st-${s.name}-${s.meters}`}>
                  {s.name}
                  <div className="muted small">
                    直線距離 約{(s.meters / 1000).toFixed(2)}km ／ 参考換算 約{s.walkMin}分
                  </div>
                  <div className="muted small">実歩行時間：未取得（ルート探索なし）</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">直線30分換算圏内に駅が見つかりませんでした。</p>
          )}

          <h4 className="subhead">最寄りバス停（上位3件・本数未取得）</h4>
          {candidate.buses.length ? (
            <ul className="plain-list transit-list">
              {candidate.buses.slice(0, 3).map((s) => (
                <li key={`bus-${s.name}-${s.meters}`}>
                  {s.name}
                  <div className="muted small">
                    直線距離 約{(s.meters / 1000).toFixed(2)}km ／ 参考換算 約{s.walkMin}分
                  </div>
                  <div className="muted small">運行本数・始発終バス：未取得</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">直線30分換算圏内にバス停が見つかりませんでした。</p>
          )}
          {candidate.buses.length > 3 && (
            <p className="muted small">ほか {candidate.buses.length - 3} 停留所（一覧は省略）</p>
          )}
        </>
      )}
      <p className="note">
        ※{FORMULAS.straightWalkMin.formula}。徒歩分は実歩行ルートではありません。バス停の価値は距離より運行頻度の方が重要ですが、現状未取得です。
      </p>
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
      <p className="muted small">
        以下は市区町村全体の統計です。町丁目・半径500mの人口構成は未接続（市全体≠物件周辺）。
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
          display={m.metrics?.agingRate?.value != null ? `${m.agingRate}%` : '—'}
          meta={m.metrics?.agingRate}
        />
        <MetricLine
          label="単身世帯比率"
          display={
            m.metrics?.singleHouseholdRate?.value != null ? `${m.singleHouseholdRate}%` : '—'
          }
          meta={m.metrics?.singleHouseholdRate}
        />
        <MetricLine label="生活保護" display={formatWelfare(m)} meta={m.metrics?.welfareRatePercent} />
        <MetricLine label="犯罪認知" display={formatCrime(m)} meta={m.metrics?.crimePer100People} />
        <MetricLine
          label="窃盗認知"
          display={
            m.metrics?.theftPer100People && m.metrics.theftPer100People.value != null
              ? `年${m.theftPer100People.toFixed(2)}件/100人`
              : '—'
          }
          meta={m.metrics?.theftPer100People}
        />
        <MetricLine
          label="凶悪犯の割合"
          display={
            m.metrics?.heinousSharePercent?.value != null
              ? `${m.heinousSharePercent.toFixed(2)}%`
              : '—'
          }
          meta={m.metrics?.heinousSharePercent}
        />
        <MetricLine
          label="粗暴犯の割合"
          display={
            m.metrics?.violentSharePercent?.value != null
              ? `${m.violentSharePercent.toFixed(2)}%`
              : '—'
          }
          meta={m.metrics?.violentSharePercent}
        />
        <MetricLine
          label="窃盗犯の割合"
          display={
            m.metrics?.theftSharePercent?.value != null
              ? `${m.theftSharePercent.toFixed(2)}%`
              : '—'
          }
          meta={m.metrics?.theftSharePercent}
        />
        <MetricLine
          label="風俗犯の割合"
          display={
            m.metrics?.moralsSharePercent?.value != null
              ? `${m.moralsSharePercent.toFixed(2)}%`
              : '—'
          }
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

      <h3>
        <TypeBadge type="estimate" /> Current Conditions（保有リスク評価外）
      </h3>
      <p className="muted small">
        直近雨量は「今の浸水状況」向けの参考です。30年保有の物件リスク本体からは分離しています。
      </p>
      {!rain ? (
        <p className="muted">雨量コンテキストなし（地点精度不足または未取得）。</p>
      ) : rain.failed || rain.precipMm72h == null ? (
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
      {rain && (
        <p className="note">
          ※{rain.note} 出典: {rain.source}
        </p>
      )}
    </aside>
  )
}
