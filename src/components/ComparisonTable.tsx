import { hazardStatusLabel, nearestHazardDistanceM } from '../lib/hazardZones'
import { hazardLabel, lossImpactPercent, totalRepairRange } from '../lib/risk'
import type { Candidate, SortKey } from '../types'

type Props = {
  candidates: Candidate[]
  selectedId: string | null
  sortKey: SortKey
  onSort: (key: SortKey) => void
  onSelect: (id: string) => void
  onRemove: (id: string) => void
}

function hazardRank(level: Candidate['hazardLevel']): number {
  return level === 'high' ? 2 : level === 'mid' ? 1 : 0
}

export function compareCandidates(a: Candidate, b: Candidate, sortKey: SortKey): number {
  const ra = totalRepairRange(a.hazardLevel)
  const rb = totalRepairRange(b.hazardLevel)
  const ia = lossImpactPercent(a.purchaseManYen, ra.max)
  const ib = lossImpactPercent(b.purchaseManYen, rb.max)

  switch (sortKey) {
    case 'lossImpact':
      return ia - ib
    case 'stationWalk':
      return (a.stationWalkMin ?? 999) - (b.stationWalkMin ?? 999)
    case 'hazard':
      return hazardRank(a.hazardLevel) - hazardRank(b.hazardLevel)
    case 'aging':
      return a.municipality.agingRate - b.municipality.agingRate
    case 'purchase':
      return a.purchaseManYen - b.purchaseManYen
    default:
      return 0
  }
}

export function ComparisonTable({
  candidates,
  selectedId,
  sortKey,
  onSort,
  onSelect,
  onRemove,
}: Props) {
  const sorted = [...candidates].sort((a, b) => compareCandidates(a, b, sortKey))

  if (!candidates.length) {
    return (
      <div className="empty-table">
        <p>まだ候補がありません。住所検索か地図クリックで追加してください。</p>
      </div>
    )
  }

  return (
    <div className="table-wrap">
      <div className="sort-bar">
        <span>並べ替え</span>
        {(
          [
            ['lossImpact', '損害額比率'],
            ['hazard', '修理費シナリオ'],
            ['stationWalk', '駅(直線)'],
            ['aging', '高齢化率'],
            ['purchase', '購入額'],
          ] as [SortKey, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={sortKey === key ? 'chip active' : 'chip'}
            onClick={() => onSort(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <table className="compare-table">
        <thead>
          <tr>
            <th>候補</th>
            <th>購入額</th>
            <th>発生側（機械判定）</th>
            <th>損害側（シナリオ）</th>
            <th>シナリオ上限比</th>
            <th>駅(直線)</th>
            <th>バス停(直線)</th>
            <th>地域性</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => {
            const range = totalRepairRange(c.hazardLevel)
            const impact = lossImpactPercent(c.purchaseManYen, range.max)
            return (
              <tr
                key={c.id}
                className={selectedId === c.id ? 'selected' : ''}
                onClick={() => onSelect(c.id)}
              >
                <td>
                  <strong>{c.name}</strong>
                  <div className="muted small">{c.address}</div>
                </td>
                <td>{c.purchaseManYen}万円</td>
                <td>
                  {c.zones.status === 'in_zone' ? (
                    <>
                      <span className="badge badge-high">地点が区域内</span>
                      <div className="muted small">距離 0m</div>
                    </>
                  ) : c.zones.status === 'nearby_zone' ? (
                    <>
                      <span className="badge badge-mid">近傍に区域</span>
                      <div className="muted small">
                        約{nearestHazardDistanceM(c.zones)}m以内
                      </div>
                    </>
                  ) : c.zones.status === 'all_outside' ? (
                    <>
                      <span className="badge badge-low">近傍にもなし</span>
                      <div className="muted small">100m以内未検出（≠安全）</div>
                    </>
                  ) : c.zones.status === 'partially_evaluated' ? (
                    <>
                      <span className="badge badge-mid">一部判定済み</span>
                      <div className="muted small">
                        判定{c.zones.evaluatedCount}/4・未判定{c.zones.unknownCount}
                      </div>
                    </>
                  ) : (
                    <span className="muted">{hazardStatusLabel(c.zones.status)}</span>
                  )}
                </td>
                <td>
                  <span className={`badge badge-${c.hazardLevel}`}>{hazardLabel(c.hazardLevel)}</span>
                  <div className="muted small">
                    シナリオ {range.min}〜{range.max}万円
                  </div>
                </td>
                <td>
                  <strong className={impact >= 60 ? 'warn-text' : ''}>{impact}%</strong>
                  <div className="muted small">
                    上限{range.max}万円 / {c.purchaseManYen}万円
                  </div>
                </td>
                <td>
                  {c.stationWalkMin != null ? (
                    <>
                      直線換算{c.stationWalkMin}分
                      <div className="muted small">
                        圏内{c.stations.length}駅
                        {c.stations[0] ? ` / ${(c.stations[0].meters / 1000).toFixed(2)}km` : ''}
                      </div>
                    </>
                  ) : c.transitFetchFailed ? (
                    '取得失敗'
                  ) : (
                    '圏外'
                  )}
                </td>
                <td>
                  {c.busWalkMin != null ? (
                    <>
                      直線換算{c.busWalkMin}分
                      <div className="muted small">圏内{c.buses.length}停留所</div>
                    </>
                  ) : c.transitFetchFailed ? (
                    '取得失敗'
                  ) : (
                    '圏外'
                  )}
                </td>
                <td>
                  <div className="small">{c.municipality.name}・{c.municipality.industryType}</div>
                  <div className="muted small">高齢{c.municipality.agingRate}%</div>
                  <div className="muted small">
                    保護{c.municipality.welfareRatePercent.toFixed(1)}% / 犯罪
                    {c.municipality.crimePer100People.toFixed(2)}件/100人・年
                  </div>
                </td>
                <td>
                  <button
                    type="button"
                    className="linkish"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove(c.id)
                    }}
                  >
                    削除
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="note table-note">
        犯罪は刑法犯の年間認知件数（人口100人あたり）。被害者人数そのものではありません。保護は人口に占める被保護人員の割合です。
      </p>
    </div>
  )
}
