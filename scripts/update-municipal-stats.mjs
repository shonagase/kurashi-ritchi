#!/usr/bin/env node
/**
 * e-Stat API から社会・人口統計体系を取得し、自治体の統計値を更新する。
 *
 * 必要: ESTAT_APP_ID（https://www.e-stat.go.jp/api/）
 *
 * 重要:
 * - 「単独世帯」は一般世帯に占める単独世帯割合を取る（65歳以上世帯員の単独世帯は除外）
 * - 高齢化率は「高齢化率」または「65歳以上人口割合」（年少・生産年齢を除外）
 * - 保護・犯罪は別分野表（福祉 / 安全）から取る
 * - 各指標に referenceDate / source / retrievedAt を付与する
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
    console.error('ESTAT_APP_ID が未設定です。https://www.e-stat.go.jp/api/ を参照。')
    process.exit(1)
  }
}

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json()
}

async function findStatsTables() {
  const url =
    `${API}/getStatsList?appId=${encodeURIComponent(APP_ID)}` +
    `&lang=J&statsCode=00200502&limit=200`
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
  // 市区町村表を優先し、都道府県表を除外
  const municipal = tables.filter(
    (t) =>
      (`${t.title} ${t.statsName}`.includes('市区町村') ||
        t.id.startsWith('000002')) &&
      !`${t.title} ${t.statsName}`.includes('都道府県'),
  )
  const pool = municipal.length ? municipal : tables
  for (const p of predicates) {
    const hit = pool.find((t) => p(`${t.title} ${t.statsName}`))
    if (hit) return hit
  }
  return pool[0] || null
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

/**
 * スコアリングで最良の cat01 を選ぶ。
 * must / prefer / exclude で誤マッチ（例: 65歳以上世帯員の単独世帯）を防ぐ。
 */
function findBestCat(items, { must = [], prefer = [], exclude = [], forbid = [] } = {}) {
  let best = null
  let bestScore = -Infinity
  for (const it of items) {
    const name = it.name
    if (exclude.some((e) => name.includes(e))) continue
    if (forbid.some((e) => name.includes(e))) continue
    if (!must.every((k) => name.includes(k))) continue
    const preferHits = prefer.filter((p) => name.includes(p)).length
    if (prefer.length && preferHits === 0 && must.length === 0) continue
    let score = 10 + preferHits * 8
    if (name === '高齢化率' || name.endsWith('_高齢化率')) score += 20
    if (name.includes('単独世帯割合') && !name.includes('65')) score += 15
    score -= Math.min(name.length, 40) * 0.01
    if (score > bestScore) {
      bestScore = score
      best = it
    }
  }
  return best
}

async function fetchLatestByArea(statsDataId, cdCat01) {
  const url =
    `${API}/getStatsData?appId=${encodeURIComponent(APP_ID)}` +
    `&lang=J&statsDataId=${encodeURIComponent(statsDataId)}` +
    `&cdCat01=${encodeURIComponent(cdCat01)}` +
    `&metaGetFlg=Y&cntGetFlg=N&sectionHeaderFlg=1`
  const data = await getJson(url)
  const result = data?.GET_STATS_DATA?.RESULT
  if (result?.STATUS !== 0 && result?.STATUS !== '0') {
    throw new Error(`getStatsData failed (${cdCat01}): ${JSON.stringify(result)}`)
  }

  // time code -> label
  const classObjs =
    data?.GET_STATS_DATA?.STATISTICAL_DATA?.CLASS_INF?.CLASS_OBJ || []
  const classList = Array.isArray(classObjs) ? classObjs : [classObjs]
  const timeObj = classList.find((c) => c['@id'] === 'time')
  const timeClasses = timeObj?.CLASS || []
  const timeItems = Array.isArray(timeClasses) ? timeClasses : [timeClasses]
  const timeLabel = Object.fromEntries(
    timeItems.map((c) => [String(c['@code']), String(c['@name'] || c['@code'])]),
  )

  const values = data?.GET_STATS_DATA?.STATISTICAL_DATA?.DATA_INF?.VALUE || []
  const list = Array.isArray(values) ? values : [values]
  /** @type {Map<string, {time:string, timeName:string, value:number, year:number}>} */
  const map = new Map()
  for (const v of list) {
    const area = String(v['@area'] || '')
    const time = String(v['@time'] || '')
    const timeName = timeLabel[time] || time
    const num = Number(String(v.$ ?? '').replace(/,/g, ''))
    if (!area || !Number.isFinite(num)) continue
    const yearMatch = timeName.match(/(19|20)\d{2}/)
    const year = yearMatch ? Number(yearMatch[0]) : Number(time.replace(/\D/g, '').slice(0, 4)) || 0
    const prev = map.get(area)
    if (!prev || year > prev.year || (year === prev.year && time > prev.time)) {
      map.set(area, { time, timeName, value: num, year })
    }
  }
  return map
}

function normalizeAreaCode(code) {
  const s = String(code)
  if (/^\d{4}$/.test(s)) return s.padStart(5, '0')
  return s
}

function round1(n) {
  return Math.round(n * 10) / 10
}
function round2(n) {
  return Math.round(n * 100) / 100
}

function toPercentFromPerThousand(value, unit, name) {
  if (unit.includes('千') || name.includes('千対') || name.includes('千人あたり') || name.includes('人口千')) {
    return round1(value / 10)
  }
  return round1(value)
}

function toCrimePer100(value, unit, name) {
  if (unit.includes('千') || name.includes('千対') || name.includes('千人') || name.includes('人口千')) {
    return round2(value / 10)
  }
  return null
}

function writeMerged(base, stats) {
  const municipalities = base.map((b) => {
    const s = stats.byId[b.id] || {}
    return {
      ...b,
      agingRate: s.agingRate?.value ?? 0,
      singleHouseholdRate: s.singleHouseholdRate?.value ?? 0,
      welfareRatePercent: s.welfareRatePercent?.value ?? 0,
      crimePer100People: s.crimePer100People?.value ?? 0,
      metrics: {
        agingRate: s.agingRate || null,
        singleHouseholdRate: s.singleHouseholdRate || null,
        welfareRatePercent: s.welfareRatePercent || null,
        crimePer100People: s.crimePer100People || null,
      },
    }
  })
  fs.writeFileSync(
    generatedPath,
    JSON.stringify({ meta: stats.meta, municipalities }, null, 2) + '\n',
  )
}

function metricRecord({ value, unit, source, referenceDate, catName, valueType = 'official' }) {
  return {
    value,
    unit,
    valueType,
    source,
    referenceDate,
    retrievedAt: new Date().toISOString(),
    catName,
  }
}

async function updateField({
  field,
  tables,
  tablePredicates,
  catOpts,
  convert,
  unit,
  byId,
  base,
}) {
  const table = pickTable(tables, tablePredicates)
  if (!table) {
    console.warn(`skip ${field}: table not found`)
    return false
  }
  const cats = await getMetaCat01(table.id)
  const cat = findBestCat(cats, catOpts)
  if (!cat) {
    console.warn(`skip ${field}: category not found in ${table.id} (${table.title})`)
    console.warn(
      '  available sample:',
      cats.slice(0, 12).map((c) => c.name).join(' | '),
    )
    return false
  }
  console.log(`fetch ${field}: [${table.id}] ${cat.code} ${cat.name}`)
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
    byId[m.id] = byId[m.id] || {}
    byId[m.id][field] = metricRecord({
      value: next,
      unit,
      source: `e-Stat ${table.id} / ${table.title}`,
      referenceDate: row.timeName,
      catName: cat.name,
    })
    hits++
  }
  console.log(`  updated: ${hits}`)
  return hits > 0
}

async function main() {
  mustAppId()
  const base = JSON.parse(fs.readFileSync(basePath, 'utf8'))
  const prev = JSON.parse(fs.readFileSync(statsPath, 'utf8'))
  const overridesPath = path.join(root, 'data/municipalities.overrides.json')
  const overrides = fs.existsSync(overridesPath)
    ? JSON.parse(fs.readFileSync(overridesPath, 'utf8'))
    : {}

  // 旧形式（平たい数値）からの移行も吸収
  /** @type {Record<string, any>} */
  const byId = {}
  for (const [id, row] of Object.entries(prev.byId || {})) {
    if (row && typeof row === 'object' && row.agingRate && typeof row.agingRate === 'object') {
      byId[id] = { ...row }
    } else {
      byId[id] = {
        agingRate: row?.agingRate != null
          ? metricRecord({
              value: row.agingRate,
              unit: '%',
              source: prev.meta?.source || 'seed',
              referenceDate: prev.meta?.updatedAt || 'unknown',
              catName: 'legacy',
              valueType: 'estimate',
            })
          : undefined,
        singleHouseholdRate: row?.singleHouseholdRate != null
          ? metricRecord({
              value: row.singleHouseholdRate,
              unit: '%',
              source: prev.meta?.source || 'seed',
              referenceDate: prev.meta?.updatedAt || 'unknown',
              catName: 'legacy',
              valueType: 'estimate',
            })
          : undefined,
        welfareRatePercent: row?.welfareRatePercent != null
          ? metricRecord({
              value: row.welfareRatePercent,
              unit: '%',
              source: prev.meta?.source || 'seed',
              referenceDate: prev.meta?.updatedAt || 'unknown',
              catName: 'legacy',
              valueType: 'estimate',
            })
          : undefined,
        crimePer100People: row?.crimePer100People != null
          ? metricRecord({
              value: row.crimePer100People,
              unit: '件/100人・年',
              source: prev.meta?.source || 'seed',
              referenceDate: prev.meta?.updatedAt || 'unknown',
              catName: 'legacy',
              valueType: 'estimate',
            })
          : undefined,
      }
    }
  }

  console.log('Listing e-Stat tables...')
  const tables = await findStatsTables()
  console.log(`tables: ${tables.length}`)

  const okAging = await updateField({
    field: 'agingRate',
    tables,
    tablePredicates: [
      (t) => t.includes('社会生活統計指標') && t.includes('人口') && t.includes('市区町村'),
      (t) => t.includes('市区町村') && t.includes('人口・世帯'),
      (t) => t.includes('人口・世帯') && !t.includes('都道府県'),
    ],
    catOpts: {
      must: [],
      prefer: ['高齢化率', '65歳以上人口割合', '老年人口割合'],
      exclude: ['世帯', '単独', '対前年', '男', '女', '外国人', '千人当たり', '人口千'],
      forbid: ['15歳未満', '生産年齢', '年少'],
    },
    convert: (v) => round1(v),
    unit: '%',
    byId,
    base,
  })

  const okSingle = await updateField({
    field: 'singleHouseholdRate',
    tables,
    tablePredicates: [
      (t) => t.includes('社会生活統計指標') && t.includes('市区町村') && (t.includes('人口') || t.includes('世帯')),
      (t) => t.includes('市区町村') && t.includes('人口・世帯'),
      (t) => t.includes('人口・世帯') && !t.includes('都道府県'),
    ],
    catOpts: {
      must: ['単独世帯'],
      prefer: ['一般世帯', '割合', '単独世帯割合'],
      exclude: ['65歳以上', '高齢', '親族', '核家族'],
      forbid: ['65歳以上世帯員'],
    },
    convert: (v) => round1(v),
    unit: '%',
    byId,
    base,
  })

  const okWelfare = await updateField({
    field: 'welfareRatePercent',
    tables,
    tablePredicates: [
      (t) => t.includes('社会生活統計指標') && t.includes('市区町村') && (t.includes('福祉') || t.includes('社会保障')),
      (t) => t.includes('市区町村') && t.includes('福祉'),
      (t) => (t.includes('福祉・社会保障') || t.includes('福祉')) && !t.includes('都道府県'),
    ],
    catOpts: {
      must: ['生活保護'],
      prefer: ['人口千', '被保護', '千対', '保護率', '実人員'],
      exclude: ['開始', '廃止', '停止', '世帯類型', '保護費'],
    },
    convert: (v, c) => toPercentFromPerThousand(v, c.unit, c.name),
    unit: '%',
    byId,
    base,
  })

  const okCrime = await updateField({
    field: 'crimePer100People',
    tables,
    tablePredicates: [
      (t) => t.includes('社会生活統計指標') && t.includes('市区町村') && (t.includes('安全') || t.includes('治安')),
      (t) => t.includes('市区町村') && t.includes('安全'),
      (t) => (t.includes('Ｋ　安全') || t.includes('K　安全') || t.includes('安全')) && !t.includes('都道府県'),
    ],
    catOpts: {
      must: ['刑法犯'],
      prefer: ['認知件数', '人口千', '千対'],
      exclude: ['検挙', '少年', '交通事故', '特別法'],
    },
    convert: (v, c) => toCrimePer100(v, c.unit, c.name),
    unit: '件/100人・年',
    byId,
    base,
  })

  if (![okAging, okSingle, okWelfare, okCrime].some(Boolean)) {
    throw new Error('統計値を1件も更新できませんでした')
  }

  // 人手検証の locked 値は API 結果で上書きしない
  for (const [id, fields] of Object.entries(overrides)) {
    byId[id] = byId[id] || {}
    for (const [field, metric] of Object.entries(fields)) {
      byId[id][field] = {
        ...metric,
        retrievedAt: new Date().toISOString(),
      }
    }
  }

  const stats = {
    meta: {
      retrievedAt: new Date().toISOString(),
      notes:
        '各指標は field ごとに referenceDate / source を持つ。retrievedAt は取得日時であり、統計の対象時点ではない。overrides の locked 値は人手検証優先。',
      fields: {
        agingRate: '高齢化率（65歳以上人口割合）',
        singleHouseholdRate: '一般世帯に占める単独世帯割合（高齢単独世帯は除外）',
        welfareRatePercent: '生活保護（人口千対を%換算）',
        crimePer100People: '刑法犯認知（人口千対を100人あたり換算）',
      },
    },
    byId,
  }

  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2) + '\n')
  writeMerged(base, stats)
  console.log('done')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
