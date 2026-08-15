#!/usr/bin/env node
/**
 * 全国市区町村ベースを code4fukui/localgovjp から生成する。
 * - id は e-Stat と揃えた5桁市区町村コード（cid）
 * - 政令市は「市本体」を除外し、区単位を優先（地点マッチ精度のため）
 * - 既存 base の industryType/Note は id 一致で継承
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outPath = path.join(root, 'data/municipalities.base.json')
const archivePath = path.join(root, 'data/municipalities.base.seed37.json')
const SOURCE_URL = 'https://code4fukui.github.io/localgovjp/localgovjp.json'

const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'))
if (!fs.existsSync(archivePath) && prev.length < 100) {
  fs.writeFileSync(archivePath, JSON.stringify(prev, null, 2) + '\n')
  console.log(`archived previous ${prev.length} -> ${archivePath}`)
}

const industryById = Object.fromEntries(
  prev.map((m) => [m.id, { industryType: m.industryType, industryNote: m.industryNote }]),
)

console.log(`fetch ${SOURCE_URL}`)
const res = await fetch(SOURCE_URL)
if (!res.ok) throw new Error(`HTTP ${res.status}`)
const rows = await res.json()
if (!Array.isArray(rows) || rows.length < 1000) {
  throw new Error(`unexpected localgovjp size: ${rows?.length}`)
}

/** 政令市本体（区がある市）を検出して除外 */
const cityNamesWithWards = new Set()
for (const r of rows) {
  const name = String(r.city || '')
  if (name.includes(' ') && /区$/.test(name)) {
    cityNamesWithWards.add(name.split(' ')[0])
  }
}

const seen = new Set()
const municipalities = []
for (const r of rows) {
  const pref = String(r.pref || '')
  const city = String(r.city || '')
  const cid = String(r.cid || '').padStart(5, '0')
  const lat = Number(r.lat)
  const lon = Number(r.lng)
  if (!pref || !city || !/^\d{5}$/.test(cid)) continue
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
  // 都道府県行は通常含まれないが念のため
  if (city === pref) continue
  // 区がある政令市の「市」本体はスキップ（例: 横浜市 → 各区を使う）
  if (!city.includes(' ') && cityNamesWithWards.has(city)) continue

  if (seen.has(cid)) continue
  seen.add(cid)

  const displayName = city.includes(' ') ? city.replace(' ', '') : city
  const inherited = industryById[cid]
  municipalities.push({
    id: cid,
    name: displayName,
    pref,
    lat,
    lon,
    industryType: inherited?.industryType || '未分類',
    industryNote: inherited?.industryNote || '産業メモ未整備（全国マスタ自動取込）',
    source: {
      dataset: 'code4fukui/localgovjp',
      url: SOURCE_URL,
      lgcode: r.lgcode || null,
    },
  })
}

municipalities.sort((a, b) => a.id.localeCompare(b.id))
fs.writeFileSync(outPath, JSON.stringify(municipalities, null, 2) + '\n')
console.log(`wrote ${municipalities.length} municipalities -> ${outPath}`)
console.log(
  `sample: ${municipalities.find((m) => m.id === '13123')?.name}, ${municipalities.find((m) => m.id === '14103')?.name}`,
)
