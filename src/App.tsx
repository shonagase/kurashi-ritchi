import { useMemo, useState } from 'react'
import { ComparisonTable } from './components/ComparisonTable'
import { DetailPanel } from './components/DetailPanel'
import { MapView } from './components/MapView'
import { findNearestMunicipality } from './data/municipalities'
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
      stationName: transit.station?.name ?? null,
      stationWalkMin: transit.station?.walkMin ?? null,
      busName: transit.busStop?.name ?? null,
      busWalkMin: transit.busStop?.walkMin ?? null,
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
        <ul>
          <li>背景地図・標高・住所検索: 国土地理院</li>
          <li>公式ハザード確認: ハザードマップポータル（重ねるハザードマップ）</li>
          <li>駅・バス停: OpenStreetMap / Overpass API</li>
          <li>地域性: 国勢調査・経済センサス等を参考にした市区町村単位のMVP用相対指標</li>
        </ul>
        <p>
          本サービスは住宅購入の参考比較ツールです。危険度は標高などから推定した相対指標であり、正式なハザード判定や損害保険・不動産鑑定の代替ではありません。生活保護・犯罪は自治体単位の相対表示です。
        </p>
      </footer>
    </div>
  )
}
