import { useMemo, useState } from 'react'
import { ComparisonTable } from './components/ComparisonTable'
import { DetailPanel } from './components/DetailPanel'
import { MapView } from './components/MapView'
import { DATA_SOURCES, findNearestMunicipality, statsMeta } from './data/municipalities'
import { fetchElevation, fetchNearbyTransit, searchAddress } from './lib/geo'
import { estimateHazardFromElevation } from './lib/risk'
import type { Candidate, SortKey } from './types'
import './App.css'

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const DEMO_POINTS = [
  { name: '候補A（低地寄り）', address: '東京都江戸川区西葛西', purchaseManYen: 500 },
  { name: '候補B（内陸住宅）', address: '東京都世田谷区成城', purchaseManYen: 500 },
  { name: '候補C（ターミナル近傍）', address: '神奈川県横浜市西区南幸', purchaseManYen: 500 },
]

export default function App() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('lossImpact')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [price, setPrice] = useState(500)
  const [pickMode, setPickMode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = useMemo(
    () => candidates.find((c) => c.id === selectedId) ?? null,
    [candidates, selectedId],
  )

  const mapCenter: [number, number] = selected
    ? [selected.lat, selected.lon]
    : candidates[0]
      ? [candidates[0].lat, candidates[0].lon]
      : [35.6812, 139.7671]

  async function buildCandidate(input: {
    name: string
    address: string
    purchaseManYen: number
    lat: number
    lon: number
  }): Promise<Candidate> {
    const [elevationM, transit] = await Promise.all([
      fetchElevation(input.lat, input.lon),
      fetchNearbyTransit(input.lat, input.lon),
    ])
    const hazardLevel = estimateHazardFromElevation(elevationM)
    const municipality = findNearestMunicipality(input.lat, input.lon)

    return {
      id: uid(),
      name: input.name,
      address: input.address,
      purchaseManYen: input.purchaseManYen,
      lat: input.lat,
      lon: input.lon,
      elevationM,
      hazardLevel,
      municipality,
      stations: transit.stations,
      buses: transit.buses,
      transitFetchFailed: transit.fetchFailed,
      stationName: transit.stations[0]?.name ?? null,
      stationWalkMin: transit.stations[0]?.walkMin ?? null,
      busName: transit.buses[0]?.name ?? null,
      busWalkMin: transit.buses[0]?.walkMin ?? null,
      createdAt: Date.now(),
    }
  }

  async function addFromAddress() {
    setError(null)
    if (!address.trim()) {
      setError('住所を入力してください。')
      return
    }
    setLoading(true)
    try {
      const hit = await searchAddress(address)
      if (!hit) {
        setError('住所が見つかりませんでした。地図クリックで追加するか、表記を変えて再試行してください。')
        return
      }
      const candidate = await buildCandidate({
        name: name.trim() || `候補${candidates.length + 1}`,
        address: hit.label,
        purchaseManYen: price,
        lat: hit.lat,
        lon: hit.lon,
      })
      setCandidates((prev) => [...prev, candidate])
      setSelectedId(candidate.id)
      setName('')
      setAddress('')
      setPickMode(false)
    } finally {
      setLoading(false)
    }
  }

  async function addFromMap(lat: number, lon: number) {
    setError(null)
    setLoading(true)
    try {
      const candidate = await buildCandidate({
        name: name.trim() || `候補${candidates.length + 1}`,
        address: `緯度 ${lat.toFixed(5)}, 経度 ${lon.toFixed(5)}`,
        purchaseManYen: price,
        lat,
        lon,
      })
      setCandidates((prev) => [...prev, candidate])
      setSelectedId(candidate.id)
      setPickMode(false)
      setName('')
    } finally {
      setLoading(false)
    }
  }

  async function loadDemo() {
    setError(null)
    setLoading(true)
    try {
      const built: Candidate[] = []
      for (const demo of DEMO_POINTS) {
        const hit = await searchAddress(demo.address)
        if (!hit) continue
        built.push(
          await buildCandidate({
            name: demo.name,
            address: hit.label,
            purchaseManYen: demo.purchaseManYen,
            lat: hit.lat,
            lon: hit.lon,
          }),
        )
      }
      if (!built.length) {
        setError('デモ候補の取得に失敗しました。住所検索か地図クリックで追加してください。')
        return
      }
      setCandidates(built)
      setSelectedId(built[0].id)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-bg" aria-hidden />
        <div className="hero-inner">
          <p className="brand">くらし立地</p>
          <h1>買ったあと損しにくく、暮らせる立地かを比較する</h1>
          <p className="lead">
            安さだけでなく、災害時の想定修理費・駅やバス停までの距離・地域性を一覧比較できます。
          </p>
        </div>
      </header>

      <main className="layout">
        <section className="panel add-panel">
          <h2>候補を追加</h2>
          <div className="form-grid">
            <label>
              名前（任意）
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 候補A" />
            </label>
            <label>
              購入額（万円）
              <input
                type="number"
                min={1}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value) || 0)}
              />
            </label>
            <label className="wide">
              住所
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="例: 東京都世田谷区成城"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addFromAddress()
                }}
              />
            </label>
          </div>
          <div className="actions">
            <button type="button" className="button" disabled={loading} onClick={() => void addFromAddress()}>
              住所から追加
            </button>
            <button
              type="button"
              className={`button secondary ${pickMode ? 'active' : ''}`}
              disabled={loading}
              onClick={() => setPickMode((v) => !v)}
            >
              {pickMode ? '地図選択中…' : '地図をクリックして追加'}
            </button>
            <button type="button" className="button ghost" disabled={loading} onClick={() => void loadDemo()}>
              デモ3件を読み込む
            </button>
          </div>
          {loading && <p className="status">分析中…（標高・周辺交通を取得）</p>}
          {error && <p className="error">{error}</p>}
        </section>

        <section className="panel map-panel">
          <h2>地図</h2>
          <MapView
            center={mapCenter}
            candidates={candidates}
            selectedId={selectedId}
            pickMode={pickMode}
            onPick={(lat, lon) => void addFromMap(lat, lon)}
            onSelect={setSelectedId}
          />
        </section>

        <section className="panel table-panel">
          <h2>比較リスト</h2>
          <ComparisonTable
            candidates={candidates}
            selectedId={selectedId}
            sortKey={sortKey}
            onSort={setSortKey}
            onSelect={setSelectedId}
            onRemove={(id) => {
              setCandidates((prev) => prev.filter((c) => c.id !== id))
              if (selectedId === id) setSelectedId(null)
            }}
          />
        </section>

        <DetailPanel candidate={selected} />
      </main>

      <footer className="footer">
        <h2>データと免責</h2>
        <p className="stats-updated">
          地域統計の最終更新: <strong>{statsMeta.updatedAt}</strong>
          <span className="muted">（{statsMeta.source}）</span>
        </p>
        <ul className="source-list">
          <li>
            地域統計の自動更新:{' '}
            <a href={DATA_SOURCES.estatApi.url} target="_blank" rel="noreferrer">
              {DATA_SOURCES.estatApi.label}
            </a>
            （週次 GitHub Actions）
          </li>
          <li>
            背景地図:{' '}
            <a href={DATA_SOURCES.gsiMap.url} target="_blank" rel="noreferrer">
              {DATA_SOURCES.gsiMap.label}
            </a>
          </li>
          <li>
            標高:{' '}
            <a href={DATA_SOURCES.gsiElevation.url} target="_blank" rel="noreferrer">
              {DATA_SOURCES.gsiElevation.label}
            </a>
          </li>
          <li>
            住所検索:{' '}
            <a href={DATA_SOURCES.gsiAddress.url} target="_blank" rel="noreferrer">
              {DATA_SOURCES.gsiAddress.label}
            </a>
          </li>
          <li>
            公式ハザード:{' '}
            <a href={DATA_SOURCES.hazardPortal.url} target="_blank" rel="noreferrer">
              {DATA_SOURCES.hazardPortal.label}
            </a>
          </li>
          <li>
            駅・バス停:{' '}
            <a href={DATA_SOURCES.osm.url} target="_blank" rel="noreferrer">
              {DATA_SOURCES.osm.label}
            </a>
          </li>
          <li>
            高齢化・世帯:{' '}
            <a href={DATA_SOURCES.census.url} target="_blank" rel="noreferrer">
              {DATA_SOURCES.census.label}
            </a>
          </li>
          <li>
            生活保護率:{' '}
            <a href={DATA_SOURCES.welfare.url} target="_blank" rel="noreferrer">
              {DATA_SOURCES.welfare.label}
            </a>
          </li>
          <li>
            犯罪（刑法犯認知）:{' '}
            <a href={DATA_SOURCES.crime.url} target="_blank" rel="noreferrer">
              {DATA_SOURCES.crime.label}
            </a>
          </li>
          <li>
            産業:{' '}
            <a href={DATA_SOURCES.economicCensus.url} target="_blank" rel="noreferrer">
              {DATA_SOURCES.economicCensus.label}
            </a>
          </li>
        </ul>
        <p>
          本サービスは住宅購入の参考比較ツールです。危険度は標高などから推定した相対指標であり、正式なハザード判定や損害保険・不動産鑑定の代替ではありません。地域統計は e-Stat
          等の公開値を週次で取り込みます（秘密鍵 ESTAT_APP_ID 設定時）。犯罪は「被害者人数」ではなく「年間認知件数」ベースです。
        </p>
      </footer>
    </div>
  )
}
