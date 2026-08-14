import { relativeLabel } from '../data/municipalities'
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
            ['lossImpact', '損失インパクト'],
            ['hazard', '危険度'],
            ['stationWalk', '駅徒歩'],
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
            <th>危険度</th>
            <th>想定修理費</th>
            <th>購入額比</th>
            <th>駅徒歩</th>
            <th>バス停</th>
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
                  <span className={`badge badge-${c.hazardLevel}`}>{hazardLabel(c.hazardLevel)}</span>
                  {c.elevationM != null && (
                    <div className="muted small">標高 {c.elevationM.toFixed(1)}m</div>
                  )}
                </td>
                <td>
                  {range.min}〜{range.max}万円
                </td>
                <td>
                  <strong className={impact >= 60 ? 'warn-text' : ''}>最大{impact}%</strong>
                </td>
                <td>{c.stationWalkMin != null ? `${c.stationWalkMin}分` : '—'}</td>
                <td>{c.busWalkMin != null ? `${c.busWalkMin}分` : '—'}</td>
                <td>
                  <div className="small">{c.municipality.industryType}</div>
                  <div className="muted small">
                    高齢{c.municipality.agingRate}% / 保護
                    {relativeLabel(c.municipality.welfareRelative)} / 犯罪
                    {relativeLabel(c.municipality.crimeRelative)}
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
    </div>
  )
}
