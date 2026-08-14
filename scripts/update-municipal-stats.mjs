#!/usr/bin/env node
/**
 * e-Stat API から社会・人口統計体系を取得し、自治体の統計値を更新する。
 *
 * 必要: ESTAT_APP_ID（無料登録: https://www.e-stat.go.jp/api/ ）
 *
 * 取得対象（名称マッチ）:
 * - 高齢化率 / 65歳以上人口割合
 * - 単身世帯割合
 * - 生活保護（人口千対 → % に換算）
 * - 刑法犯認知件数（人口千対 → 100人あたりに換算）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const basePath = path.join(root, 'data/municipalities.base.json')
const statsPath = path.join(root, 'data/municipalities.stats.json')
const generatedPath = path.join(root, 'src/data/municipalities.generated.json')

const APP_ID = process.env.ESTAT_APP_ID || process.env.ESTATA_APP_ID || ''
const API = 'https://api.e-stat.go.jp/rest/3.0/app/json'

function mustAppId() {
  if (!APP_ID) {
    console.error(`
ESTAT_APP_ID が未設定です。

1. https://www.e-stat.go.jp/api/ でアプリケーションIDを発行（無料）
2. ローカル: export ESTAT_APP_ID=xxxxxxxx
3. GitHub: Settings → Secrets → Actions に ESTAT_APP_ID を追加
`)
    process.exit(1)
  }
}

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json()
}

async function findStatsTables() {
  // 社会・人口統計体系
  const url =
    `${API}/getStatsList?appId=${encodeURIComponent(APP_ID)}` +
    `&lang=J&statsCode=00200502&limit=100`
  const data = await getJson(url)
  const result = data?.GET_STATS_LIST?.RESULT
  if (result?.STATUS !== 0 && result?.STATUS !== '0') {
    throw new Error(`getStatsList failed: ${JSON.stringify(result)}`)
  }
  const tables = data?.GET_STATS_LIST?.DATALIST_INF?.TABLE_INF || []
  const list = Array.isArray(tables) ? tables : [tables]
  return list.map((t) => ({
    id: String(t['@id'] || t.id || ''),
    title: String(t.TITLE?.$ || t.TITLE || ''),
    statsName: String(t.STATISTICS_NAME || ''),
  }))
}

function pickTable(tables, predicates) {
  for (const p of predicates) {
    const hit = tables.find((t) => p(t.title) || p(t.statsName))
    if (hit) return hit
  }
  return null
}

async function getMetaCat01(statsDataId) {
  const url =
    `${API}/getMetaInfo?appId=${encodeURIComponent(APP_ID)}` +
    `&lang=J&statsDataId=${encodeURIComponent(statsDataId)}`
  const data = await getJson(url)
  const classObjs =
    data?.GET_META_INFO?.METADATA_INF?.CLASS_INF?.CLASS_OBJ || []
  const list = Array.isArray(classObjs) ? classObjs : [classObjs]
  const cat01 = list.find((c) => c['@id'] === 'cat01' || c.id === 'cat01')
  const classes = cat01?.CLASS || []
  const items = Array.isArray(classes) ? classes : [classes]
  return items.map((c) => ({
    code: String(c['@code'] || c.code || ''),
    name: String(c['@name'] || c.name || ''),
    unit: String(c['@unit'] || c.unit || ''),
  }))
}

function findCat(items, keywords, exclude = []) {
  const scored = items
    .map((it) => {
      const name = it.name
      if (exclude.some((e) => name.includes(e))) return null
      const hit = keywords.every((k) => name.includes(k))
      return hit ? it : null
    })
    .filter(Boolean)
  return scored[0] || null
}

async function fetchLatestByArea(statsDataId, cdCat01) {
  // 全市区町村を一括取得（最新時点）
  const url =
    `${API}/getStatsData?appId=${encodeURIComponent(APP_ID)}` +
    `&lang=J&statsDataId=${encodeURIComponent(statsDataId)}` +
    `&cdCat01=${encodeURIComponent(cdCat01)}` +
    `&metaGetFlg=N&cntGetFlg=N&sectionHeaderFlg=1`
  const data = await getJson(url)
  const result = data?.GET_STATS_DATA?.RESULT
  if (result?.STATUS !== 0 && result?.STATUS !== '0') {
    throw new Error(`getStatsData failed (${cdCat01}): ${JSON.stringify(result)}`)
  }
  const values = data?.GET_STATS_DATA?.STATISTICAL_DATA?.DATA_INF?.VALUE || []
  const list = Array.isArray(values) ? values : [values]

  // area -> latest time value
  /** @type {Map<string, {time:string, value:number}>} */
  const map = new Map()
  for (const v of list) {
    const area = String(v['@area'] || v.area || '')
    const time = String(v['@time'] || v.time || '')
    const raw = String(v.$ ?? v.value ?? '')
    const num = Number(raw.replace(/,/g, ''))
    if (!area || !Number.isFinite(num)) continue
    const prev = map.get(area)
    if (!prev || time > prev.time) map.set(area, { time, value: num })
  }
  return map
}

function normalizeAreaCode(code) {
  // e-Stat は 5桁市区町村コードが多い。先頭0落ち対策
  const s = String(code)
  if (/^\d{4}$/.test(s)) return s.padStart(5, '0')
  if (/^\d{5}$/.test(s)) return s
  return s
}

function toWelfarePercent(value, unit, name) {
  // 人口千対 → %
  if (unit.includes('千') || name.includes('千対') || name.includes('千人')) {
    return round1(value / 10)
  }
  // すでに % っぽい
  if (unit.includes('%') || name.includes('割合') || name.includes('率')) {
    return round1(value)
  }
  return round1(value)
}

function toCrimePer100(value, unit, name) {
  // 人口千対 → 100人あたり
  if (unit.includes('千') || name.includes('千対') || name.includes('千人')) {
    return round2(value / 10)
  }
  if (name.includes('百対') || unit.includes('百')) {
    return round2(value)
  }
  // 件数そのものの場合は人口換算できないので null
  return null
}

function round1(n) {
  return Math.round(n * 10) / 10
}
function round2(n) {
  return Math.round(n * 100) / 100
}

function writeMerged(base, stats) {
  const municipalities = base.map((b) => ({
    ...b,
    ...(stats.byId[b.id] || {
      agingRate: 0,
      singleHouseholdRate: 0,
      welfareRatePercent: 0,
      crimePer100People: 0,
    }),
  }))
  fs.writeFileSync(
    generatedPath,
    JSON.stringify({ meta: stats.meta, municipalities }, null, 2) + '\n',
  )
}

async function main() {
  mustAppId()
  const base = JSON.parse(fs.readFileSync(basePath, 'utf8'))
  const prev = JSON.parse(fs.readFileSync(statsPath, 'utf8'))
  const byId = { ...prev.byId }

  console.log('Listing e-Stat tables (00200502)...')
  const tables = await findStatsTables()
  console.log(`tables: ${tables.length}`)

  // 市区町村の社会生活統計指標寄りを優先
  const table =
    pickTable(tables, [
      (t) => t.includes('市区町村') && t.includes('社会生活統計指標'),
      (t) => t.includes('市区町村のすがた') && t.includes('指標'),
      (t) => t.includes('市区町村') && t.includes('指標'),
      (t) => t.includes('A 人口・世帯') && t.includes('市区町村'),
    ]) || tables[0]

  if (!table?.id) throw new Error('対象統計表が見つかりません')
  console.log(`Using table ${table.id}: ${table.title}`)

  const cats = await getMetaCat01(table.id)
  console.log(`cat01 items: ${cats.length}`)

  const agingCat =
    findCat(cats, ['高齢化率']) ||
    findCat(cats, ['65歳以上', '割合']) ||
    findCat(cats, ['老年人口', '割合'])
  const singleCat =
    findCat(cats, ['単独世帯', '割合']) ||
    findCat(cats, ['単身', '割合']) ||
    findCat(cats, ['一人世帯'])
  const welfareCat =
    findCat(cats, ['生活保護'], ['世帯', '停止', '開始']) ||
    findCat(cats, ['被保護'], ['世帯'])
  const crimeCat =
    findCat(cats, ['刑法犯', '認知']) ||
    findCat(cats, ['刑法犯認知件数'])

  console.log('matched:', {
    aging: agingCat?.name,
    single: singleCat?.name,
    welfare: welfareCat?.name,
    crime: crimeCat?.name,
  })

  const wanted = [
    ['agingRate', agingCat, (v, c) => round1(v)],
    ['singleHouseholdRate', singleCat, (v, c) => round1(v)],
    [
      'welfareRatePercent',
      welfareCat,
      (v, c) => toWelfarePercent(v, c.unit, c.name),
    ],
    [
      'crimePer100People',
      crimeCat,
      (v, c) => toCrimePer100(v, c.unit, c.name),
    ],
  ]

  let updatedFields = 0
  for (const [field, cat, convert] of wanted) {
    if (!cat) {
      console.warn(`skip ${field}: category not found`)
      continue
    }
    console.log(`fetch ${field}: ${cat.code} ${cat.name}`)
    const map = await fetchLatestByArea(table.id, cat.code)
    let hits = 0
    for (const m of base) {
      const row =
        map.get(m.id) ||
        map.get(normalizeAreaCode(m.id)) ||
        map.get(m.id.replace(/^0/, ''))
      if (!row) continue
      const next = convert(row.value, cat)
      if (next == null || !Number.isFinite(next)) continue
      byId[m.id] = { ...(byId[m.id] || {}), [field]: next }
      hits++
    }
    console.log(`  updated municipalities: ${hits}`)
    updatedFields += hits > 0 ? 1 : 0
  }

  if (updatedFields === 0) {
    throw new Error('統計値を1件も更新できませんでした。統計表IDや項目名マッチを見直してください。')
  }

  const stats = {
    meta: {
      updatedAt: new Date().toISOString().slice(0, 10),
      source: `e-Stat API / ${table.id} / ${table.title}`,
      notes:
        '犯罪は人口100人あたり年間刑法犯認知件数（千対を換算）。保護は人口比率%（千対を換算）。',
      fetchedAt: new Date().toISOString(),
    },
    byId,
  }

  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2) + '\n')
  writeMerged(base, stats)
  console.log(`Wrote ${statsPath}`)
  console.log(`Wrote ${generatedPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
