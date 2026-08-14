#!/usr/bin/env node
/**
 * e-Stat API: 固定コードのみで市区町村統計を更新する（名称あいまいマッチ禁止）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESTAT_FIXED_METRICS } from './estat-fixed-codes.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const basePath = path.join(root, 'data/municipalities.base.json')
const statsPath = path.join(root, 'data/municipalities.stats.json')
const generatedPath = path.join(root, 'src/data/municipalities.generated.json')
const overridesPath = path.join(root, 'data/municipalities.overrides.json')

const APP_ID = process.env.ESTAT_APP_ID || ''
const API = 'https://api.e-stat.go.jp/rest/3.0/app/json'

function mustAppId() {
  if (!APP_ID) {
    console.error('ESTAT_APP_ID が未設定です')
    process.exit(1)
  }
}

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function getMetaCat01(statsDataId) {
  const url =
    `${API}/getMetaInfo?appId=${encodeURIComponent(APP_ID)}` +
    `&lang=J&statsDataId=${encodeURIComponent(statsDataId)}`
  const data = await getJson(url)
  const classObjs =
    data?.GET_META_INFO?.METADATA_INF?.CLASS_INF?.CLASS_OBJ || []
  const list = Array.isArray(classObjs) ? classObjs : [classObjs]
  const cat01 = list.find((c) => c['@id'] === 'cat01')
  const classes = cat01?.CLASS || []
  const items = Array.isArray(classes) ? classes : [classes]
  return items.map((c) => ({
    code: String(c['@code'] || ''),
    name: String(c['@name'] || ''),
    unit: String(c['@unit'] || ''),
  }))
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
    throw new Error(`getStatsData failed ${statsDataId} ${cdCat01}: ${JSON.stringify(result)}`)
  }

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

function convertValue(raw, convert, unit, name) {
  if (convert === 'identity') return Math.round(raw)
  if (convert === 'percent') return round1(raw)
  if (convert === 'perThousandToPercent') {
    if (unit.includes('千') || name.includes('千')) return round1(raw / 10)
    return round1(raw)
  }
  if (convert === 'perThousandToPer100') {
    if (unit.includes('千') || name.includes('千')) return round2(raw / 10)
    return null
  }
  return round1(raw)
}

function lookupArea(map, id) {
  return (
    map.get(id) ||
    map.get(normalizeAreaCode(id)) ||
    map.get(id.replace(/^0/, '')) ||
    null
  )
}

/** 市区町村基礎データ（件数）から罪種構成比・窃盗率を補完 */
async function fillCrimeBreakdownFromBase(base, byId) {
  const statsDataId = '0000020211'
  const codes = {
    total: ['K4201', '#K4201'],
    heinous: ['K420101', '#K420101'],
    violent: ['K420102', '#K420102'],
    theft: ['K420103', '#K420103'],
    morals: ['K420105', '#K420105'],
  }

  const resolved = {}
  for (const [key, candidates] of Object.entries(codes)) {
    const cat = await resolveCat(statsDataId, candidates[0], candidates.slice(1))
    if (!cat) continue
    console.log(`fetch crime-base ${key}: [${statsDataId}] ${cat.code} ${cat.name}`)
    resolved[key] = { cat, map: await fetchLatestByArea(statsDataId, cat.code) }
  }
  if (!resolved.total) {
    console.warn('crime-base total not found; skip breakdown fill')
    return 0
  }

  let hits = 0
  for (const m of base) {
    const totalRow = lookupArea(resolved.total.map, m.id)
    if (!totalRow || !totalRow.value) continue
    const total = totalRow.value
    byId[m.id] = byId[m.id] || {}

    const setShare = (field, pack) => {
      if (!pack) return
      const row = lookupArea(pack.map, m.id)
      if (!row || !Number.isFinite(row.value)) return
      byId[m.id][field] = metricRecord({
        value: round2((row.value / total) * 100),
        unit: '%',
        source: `e-Stat ${statsDataId} / ${pack.cat.code} ÷ ${resolved.total.cat.code}`,
        referenceDate: row.timeName,
        catName: pack.cat.name,
      })
    }

    if (!byId[m.id].heinousSharePercent) setShare('heinousSharePercent', resolved.heinous)
    if (!byId[m.id].violentSharePercent) setShare('violentSharePercent', resolved.violent)
    if (!byId[m.id].theftSharePercent) setShare('theftSharePercent', resolved.theft)
    if (!byId[m.id].moralsSharePercent) setShare('moralsSharePercent', resolved.morals)

    if (!byId[m.id].theftPer100People && resolved.theft) {
      const theftRow = lookupArea(resolved.theft.map, m.id)
      const pop = byId[m.id].population?.value
      if (theftRow && pop > 0) {
        byId[m.id].theftPer100People = metricRecord({
          value: round2((theftRow.value / pop) * 100),
          unit: '件/100人・年',
          source: `e-Stat ${statsDataId} / ${resolved.theft.cat.code} ÷ population`,
          referenceDate: theftRow.timeName,
          catName: resolved.theft.cat.name,
        })
      }
    }
    hits++
  }
  console.log(`  crime-base filled municipalities: ${hits}`)
  return hits
}

function metricRecord({ value, unit, source, referenceDate, catName }) {
  return {
    value,
    unit,
    valueType: 'official',
    source,
    referenceDate,
    retrievedAt: new Date().toISOString(),
    catName,
  }
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
      population: s.population?.value ?? 0,
      theftPer100People: s.theftPer100People?.value ?? 0,
      heinousSharePercent: s.heinousSharePercent?.value ?? 0,
      violentSharePercent: s.violentSharePercent?.value ?? 0,
      theftSharePercent: s.theftSharePercent?.value ?? 0,
      moralsSharePercent: s.moralsSharePercent?.value ?? 0,
      metrics: {
        agingRate: s.agingRate || null,
        singleHouseholdRate: s.singleHouseholdRate || null,
        welfareRatePercent: s.welfareRatePercent || null,
        crimePer100People: s.crimePer100People || null,
        population: s.population || null,
        theftPer100People: s.theftPer100People || null,
        heinousSharePercent: s.heinousSharePercent || null,
        violentSharePercent: s.violentSharePercent || null,
        theftSharePercent: s.theftSharePercent || null,
        moralsSharePercent: s.moralsSharePercent || null,
      },
    }
  })
  fs.writeFileSync(
    generatedPath,
    JSON.stringify({ meta: stats.meta, municipalities }, null, 2) + '\n',
  )
}

async function resolveCat(statsDataId, preferred, fallbacks = [], forbidden = []) {
  const cats = await getMetaCat01(statsDataId)
  const byCode = new Map(cats.map((c) => [c.code, c]))
  const candidates = [preferred, ...fallbacks]
  for (const code of candidates) {
    const hit = byCode.get(code)
    if (!hit) continue
    if (forbidden.some((f) => hit.name.includes(f))) {
      console.warn(`skip forbidden cat ${code} ${hit.name}`)
      continue
    }
    return hit
  }
  console.warn(
    `cat not found in ${statsDataId}. wanted=${candidates.join(',')} sample=`,
    cats.slice(0, 8).map((c) => `${c.code}:${c.name}`).join(' | '),
  )
  return null
}

async function updateFixedMetric(def, base, byId) {
  const statsIds = [def.statsDataId, ...(def.fallbackStatsDataIds || [])]
  for (const statsDataId of statsIds) {
    const cat = await resolveCat(
      statsDataId,
      def.cdCat01,
      def.fallbackCat01 || [],
      def.forbiddenNameSubstrings || [],
    )
    if (!cat) continue

    console.log(`fetch ${def.field}: [${statsDataId}] ${cat.code} ${cat.name}`)
    const map = await fetchLatestByArea(statsDataId, cat.code)
    let hits = 0
    for (const m of base) {
      const row =
        map.get(m.id) ||
        map.get(normalizeAreaCode(m.id)) ||
        map.get(m.id.replace(/^0/, ''))
      if (!row) continue
      const next = convertValue(row.value, def.convert, cat.unit, cat.name)
      if (next == null || !Number.isFinite(next)) continue
      byId[m.id] = byId[m.id] || {}
      byId[m.id][def.field] = metricRecord({
        value: next,
        unit: def.unit,
        source: `e-Stat ${statsDataId} / ${cat.code}`,
        referenceDate: row.timeName,
        catName: cat.name,
      })
      hits++
    }
    console.log(`  updated: ${hits}`)
    if (hits > 0) return true
  }
  return false
}

async function main() {
  mustAppId()
  const base = JSON.parse(fs.readFileSync(basePath, 'utf8'))
  const prev = JSON.parse(fs.readFileSync(statsPath, 'utf8'))
  const overrides = fs.existsSync(overridesPath)
    ? JSON.parse(fs.readFileSync(overridesPath, 'utf8'))
    : {}

  const byId = { ...(prev.byId || {}) }

  let okCount = 0
  for (const def of Object.values(ESTAT_FIXED_METRICS)) {
    const ok = await updateFixedMetric(def, base, byId)
    if (ok) okCount++
  }

  const baseHits = await fillCrimeBreakdownFromBase(base, byId)
  if (baseHits > 0) okCount++

  // locked overrides win
  for (const [id, fields] of Object.entries(overrides)) {
    byId[id] = byId[id] || {}
    for (const [field, metric] of Object.entries(fields)) {
      byId[id][field] = { ...metric, retrievedAt: new Date().toISOString() }
    }
  }

  if (okCount === 0) throw new Error('固定コードでの更新が0件でした')

  const stats = {
    meta: {
      retrievedAt: new Date().toISOString(),
      notes:
        'e-Statは固定コードのみ使用。overrides の locked 値は人手検証優先。retrievedAtは取得日であり各指標の対象時点ではない。',
      coding: ESTAT_FIXED_METRICS,
      fields: {
        population: ESTAT_FIXED_METRICS.population.label,
        agingRate: ESTAT_FIXED_METRICS.agingRate.label,
        singleHouseholdRate: ESTAT_FIXED_METRICS.singleHouseholdRate.label,
        welfareRatePercent: ESTAT_FIXED_METRICS.welfareRatePercent.label,
        crimePer100People: ESTAT_FIXED_METRICS.crimePer100People.label,
        theftPer100People: ESTAT_FIXED_METRICS.theftPer100People.label,
        heinousSharePercent: ESTAT_FIXED_METRICS.heinousSharePercent.label,
        violentSharePercent: ESTAT_FIXED_METRICS.violentSharePercent.label,
        theftSharePercent: ESTAT_FIXED_METRICS.theftSharePercent.label,
        moralsSharePercent: ESTAT_FIXED_METRICS.moralsSharePercent.label,
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
