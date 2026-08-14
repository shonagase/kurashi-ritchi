import { useMemo, useState } from 'react'
import { municipalities, type MunicipalityProfile } from '../data/municipalities'
import { VALUE_TYPE_LABEL, type ValueType } from '../lib/formulas'

export type RegionSortKey =
  | 'population'
  | 'welfareRate'
  | 'welfareCount'
  | 'crimeRate'
  | 'crimeCount'
  | 'name'

type Props = {
  highlightIds: string[]
}

type RegionRow = {
  m: MunicipalityProfile
  welfareCount: number
  crimeCount: number
  highlighted: boolean
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('ja-JP')
}

function TypeBadge({ type }: { type: ValueType | string }) {
  const t = (type in VALUE_TYPE_LABEL ? type : 'estimate') as ValueType
  return <span className={`type-badge type-${t}`}>{VALUE_TYPE_LABEL[t]}</span>
}

function derivedWelfare(m: MunicipalityProfile): number {
  if (!m.population || !m.welfareRatePercent) return 0
  return (m.population * m.welfareRatePercent) / 100
}

function derivedCrime(m: MunicipalityProfile): number {
  if (!m.population || !m.crimePer100People) return 0
  return (m.population * m.crimePer100People) / 100
}

function compareRows(a: RegionRow, b: RegionRow, key: RegionSortKey): number {
  switch (key) {
    case 'population':
      return b.m.population - a.m.population
    case 'welfareRate':
      return b.m.welfareRatePercent - a.m.welfareRatePercent
    case 'welfareCount':
      return b.welfareCount - a.welfareCount
    case 'crimeRate':
      return b.m.crimePer100People - a.m.crimePer100People
    case 'crimeCount':
      return b.crimeCount - a.crimeCount
    case 'name':
      return a.m.name.localeCompare(b.m.name, 'ja')
    default:
      return 0
  }
}

export function RegionStatsTab({ highlightIds }: Props) {
  const [sortKey, setSortKey] = useState<RegionSortKey>('population')
  const [onlyCandidates, setOnlyCandidates] = useState(false)
  const highlightSet = useMemo(() => new Set(highlightIds), [highlightIds])

  const rows = useMemo(() => {
    const list: RegionRow[] = municipalities.map((m) => ({
      m,
      welfareCount: derivedWelfare(m),
      crimeCount: derivedCrime(m),
      highlighted: highlightSet.has(m.id),
    }))
    const filtered = onlyCandidates && highlightIds.length
      ? list.filter((r) => r.highlighted)
      : list
    return filtered.sort((a, b) => compareRows(a, b, sortKey))
  }, [highlightIds, highlightSet, onlyCandidates, sortKey])

  return (
    <section className="panel table-panel region-stats-panel">
      <h2>地域統計比較</h2>
      <p className="table-note">
        人口・生活保護・犯罪認知を市区町村単位で比較します。件数は「率 ×
        人口」の計算値です（公的な実人員・実件数の直接値ではない場合があります）。
      </p>

      <div className="sort-bar">
        <span>並べ替え</span>
        {(
          [
            ['population', '人口'],
            ['welfareRate', '保護率'],
            ['welfareCount', '保護人員(推計)'],
            ['crimeRate', '犯罪率'],
            ['crimeCount', '認知件数(推計)'],
            ['name', '名前'],
          ] as [RegionSortKey, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={sortKey === key ? 'chip active' : 'chip'}
            onClick={() => setSortKey(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="sort-bar">
        <label className="filter-check">
          <input
            type="checkbox"
            checked={onlyCandidates}
            disabled={!highlightIds.length}
            onChange={(e) => setOnlyCandidates(e.target.checked)}
          />
          立地比較の候補市区町村のみ
          {!highlightIds.length && <span className="muted">（候補追加後に利用可）</span>}
        </label>
      </div>

      <div className="table-wrap">
        <table className="compare-table region-stats-table">
          <thead>
            <tr>
              <th>市区町村</th>
              <th>人口</th>
              <th>生活保護率</th>
              <th>保護人員（推計）</th>
              <th>犯罪率</th>
              <th>認知件数（推計）</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ m, welfareCount, crimeCount, highlighted }) => (
              <tr key={m.id} className={highlighted ? 'selected' : undefined}>
                <td>
                  <strong>
                    {m.pref}
                    {m.name}
                  </strong>
                  {highlighted && <span className="pill">候補</span>}
                </td>
                <td>
                  <div className="cell-stack">
                    <TypeBadge type={m.metrics?.population?.valueType || 'estimate'} />
                    <span>{m.population ? `${fmt(m.population)}人` : '—'}</span>
                  </div>
                  <div className="muted small">{m.metrics?.population?.referenceDate || ''}</div>
                </td>
                <td>
                  <div className="cell-stack">
                    <TypeBadge type={m.metrics?.welfareRatePercent?.valueType || 'estimate'} />
                    <span>{m.welfareRatePercent.toFixed(2)}%</span>
                  </div>
                </td>
                <td>
                  <div className="cell-stack">
                    <TypeBadge type="computed" />
                    <span>{welfareCount ? `${fmt(welfareCount)}人` : '—'}</span>
                  </div>
                  <div className="muted small">人口×保護率</div>
                </td>
                <td>
                  <div className="cell-stack">
                    <TypeBadge type={m.metrics?.crimePer100People?.valueType || 'estimate'} />
                    <span>{m.crimePer100People.toFixed(2)}件/100人</span>
                  </div>
                </td>
                <td>
                  <div className="cell-stack">
                    <TypeBadge type="computed" />
                    <span>{crimeCount ? `${fmt(crimeCount)}件/年` : '—'}</span>
                  </div>
                  <div className="muted small">人口×犯罪率</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
