import { useMemo, useState } from 'react'
import { municipalities, type MunicipalityProfile } from '../data/municipalities'
import { VALUE_TYPE_LABEL, type ValueType } from '../lib/formulas'

type RegionView = 'pop' | 'crime'

export type DemoSortKey =
  | 'population'
  | 'welfareRate'
  | 'welfareCount'
  | 'crimeRate'
  | 'crimeCount'
  | 'name'

export type CrimeSortKey =
  | 'crimeRate'
  | 'theftRate'
  | 'heinousShare'
  | 'violentShare'
  | 'theftShare'
  | 'moralsShare'
  | 'name'

type Props = {
  highlightIds: string[]
}

type DemoRow = {
  m: MunicipalityProfile
  welfareCount: number
  crimeCount: number
  highlighted: boolean
}

type CrimeRow = {
  m: MunicipalityProfile
  crimeCount: number
  heinousCount: number
  violentCount: number
  theftCount: number
  moralsCount: number
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

function shareCount(total: number, sharePercent: number): number {
  if (!total || !sharePercent) return 0
  return (total * sharePercent) / 100
}

function hasMetric(m: MunicipalityProfile, key: keyof NonNullable<MunicipalityProfile['metrics']>): boolean {
  return m.metrics?.[key] != null && Number.isFinite(m.metrics[key]?.value)
}

function fmtRate(v: number, has: boolean): string {
  return has ? `${v.toFixed(2)}件/100人` : '—'
}

function fmtShare(v: number, has: boolean): string {
  return has ? `${v.toFixed(2)}%` : '—'
}

function compareDemo(a: DemoRow, b: DemoRow, key: DemoSortKey): number {
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

function compareCrime(a: CrimeRow, b: CrimeRow, key: CrimeSortKey): number {
  switch (key) {
    case 'crimeRate':
      return b.m.crimePer100People - a.m.crimePer100People
    case 'theftRate':
      return b.m.theftPer100People - a.m.theftPer100People
    case 'heinousShare':
      return b.m.heinousSharePercent - a.m.heinousSharePercent
    case 'violentShare':
      return b.m.violentSharePercent - a.m.violentSharePercent
    case 'theftShare':
      return b.m.theftSharePercent - a.m.theftSharePercent
    case 'moralsShare':
      return b.m.moralsSharePercent - a.m.moralsSharePercent
    case 'name':
      return a.m.name.localeCompare(b.m.name, 'ja')
    default:
      return 0
  }
}

export function RegionStatsTab({ highlightIds }: Props) {
  const [view, setView] = useState<RegionView>('pop')
  const [demoSort, setDemoSort] = useState<DemoSortKey>('population')
  const [crimeSort, setCrimeSort] = useState<CrimeSortKey>('crimeRate')
  const [onlyCandidates, setOnlyCandidates] = useState(false)
  const highlightSet = useMemo(() => new Set(highlightIds), [highlightIds])

  const demoRows = useMemo(() => {
    const list: DemoRow[] = municipalities.map((m) => ({
      m,
      welfareCount: derivedWelfare(m),
      crimeCount: derivedCrime(m),
      highlighted: highlightSet.has(m.id),
    }))
    const filtered =
      onlyCandidates && highlightIds.length ? list.filter((r) => r.highlighted) : list
    return filtered.sort((a, b) => compareDemo(a, b, demoSort))
  }, [demoSort, highlightIds, highlightSet, onlyCandidates])

  const crimeRows = useMemo(() => {
    const list: CrimeRow[] = municipalities.map((m) => {
      const crimeCount = derivedCrime(m)
      return {
        m,
        crimeCount,
        heinousCount: shareCount(crimeCount, m.heinousSharePercent),
        violentCount: shareCount(crimeCount, m.violentSharePercent),
        theftCount: shareCount(crimeCount, m.theftSharePercent),
        moralsCount: shareCount(crimeCount, m.moralsSharePercent),
        highlighted: highlightSet.has(m.id),
      }
    })
    const filtered =
      onlyCandidates && highlightIds.length ? list.filter((r) => r.highlighted) : list
    return filtered.sort((a, b) => compareCrime(a, b, crimeSort))
  }, [crimeSort, highlightIds, highlightSet, onlyCandidates])

  return (
    <section className="panel table-panel region-stats-panel">
      <h2>地域統計比較</h2>

      <div className="app-tabs region-subtabs" aria-label="地域統計の表示">
        <button
          type="button"
          className={view === 'pop' ? 'app-tab active' : 'app-tab'}
          onClick={() => setView('pop')}
        >
          人口・保護
        </button>
        <button
          type="button"
          className={view === 'crime' ? 'app-tab active' : 'app-tab'}
          onClick={() => setView('crime')}
        >
          犯罪内訳
        </button>
      </div>

      {view === 'pop' ? (
        <p className="table-note">
          人口・生活保護・犯罪認知を市区町村単位で比較します。件数は「率 ×
          人口」の計算値です（公的な実人員・実件数の直接値ではない場合があります）。
        </p>
      ) : (
        <p className="table-note">
          刑法犯認知の種類別比較です。被害者数ではなく認知件数ベースです。市区町村の罪種別実件数は全国統一公開が薄いため、
          構成比は都道府県統計を市区町村に適用（推定）し、窃盗率は「市区町村の刑法犯率 ×
          窃盗構成比」の計算値です。詳細手口は都道府県警察庁統計を参照してください。
        </p>
      )}

      <div className="sort-bar">
        <span>並べ替え</span>
        {view === 'pop'
          ? (
              [
                ['population', '人口'],
                ['welfareRate', '保護率'],
                ['welfareCount', '保護人員(推計)'],
                ['crimeRate', '犯罪率'],
                ['crimeCount', '認知件数(推計)'],
                ['name', '名前'],
              ] as [DemoSortKey, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={demoSort === key ? 'chip active' : 'chip'}
                onClick={() => setDemoSort(key)}
              >
                {label}
              </button>
            ))
          : (
              [
                ['crimeRate', '総認知率'],
                ['theftRate', '窃盗率'],
                ['heinousShare', '凶悪%'],
                ['violentShare', '粗暴%'],
                ['theftShare', '窃盗%'],
                ['moralsShare', '風俗%'],
                ['name', '名前'],
              ] as [CrimeSortKey, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={crimeSort === key ? 'chip active' : 'chip'}
                onClick={() => setCrimeSort(key)}
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
        {view === 'pop' ? (
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
              {demoRows.map(({ m, welfareCount, crimeCount, highlighted }) => (
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
        ) : (
          <table className="compare-table region-stats-table crime-breakdown-table">
            <thead>
              <tr>
                <th>市区町村</th>
                <th>刑法犯総数</th>
                <th>窃盗率</th>
                <th>凶悪%</th>
                <th>粗暴%</th>
                <th>窃盗%</th>
                <th>風俗%</th>
                <th>推計件数（参考）</th>
              </tr>
            </thead>
            <tbody>
              {crimeRows.map(
                ({
                  m,
                  crimeCount,
                  heinousCount,
                  violentCount,
                  theftCount,
                  moralsCount,
                  highlighted,
                }) => (
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
                        <TypeBadge type={m.metrics?.crimePer100People?.valueType || 'estimate'} />
                        <span>
                          {fmtRate(m.crimePer100People, hasMetric(m, 'crimePer100People') || m.crimePer100People > 0)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="cell-stack">
                        <TypeBadge type={m.metrics?.theftPer100People?.valueType || 'estimate'} />
                        <span>{fmtRate(m.theftPer100People, hasMetric(m, 'theftPer100People'))}</span>
                      </div>
                    </td>
                    <td>
                      <div className="cell-stack">
                        <TypeBadge type={m.metrics?.heinousSharePercent?.valueType || 'estimate'} />
                        <span>{fmtShare(m.heinousSharePercent, hasMetric(m, 'heinousSharePercent'))}</span>
                      </div>
                    </td>
                    <td>
                      <div className="cell-stack">
                        <TypeBadge type={m.metrics?.violentSharePercent?.valueType || 'estimate'} />
                        <span>{fmtShare(m.violentSharePercent, hasMetric(m, 'violentSharePercent'))}</span>
                      </div>
                    </td>
                    <td>
                      <div className="cell-stack">
                        <TypeBadge type={m.metrics?.theftSharePercent?.valueType || 'estimate'} />
                        <span>{fmtShare(m.theftSharePercent, hasMetric(m, 'theftSharePercent'))}</span>
                      </div>
                    </td>
                    <td>
                      <div className="cell-stack">
                        <TypeBadge type={m.metrics?.moralsSharePercent?.valueType || 'estimate'} />
                        <span>{fmtShare(m.moralsSharePercent, hasMetric(m, 'moralsSharePercent'))}</span>
                      </div>
                    </td>
                    <td>
                      <div className="cell-stack">
                        <TypeBadge type="computed" />
                        <span className="crime-est-counts">
                          {crimeCount ? (
                            <>
                              総{fmt(crimeCount)} /
                              凶{fmt(heinousCount)} /
                              粗{fmt(violentCount)} /
                              窃{fmt(theftCount)} /
                              風{fmt(moralsCount)}
                            </>
                          ) : (
                            '—'
                          )}
                        </span>
                      </div>
                      <div className="muted small">総認知推計×構成比</div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
