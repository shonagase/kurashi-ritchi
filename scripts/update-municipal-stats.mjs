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

function prefAreaCandidates(muniId) {
  const pref = String(muniId).padStart(5, '0').slice(0, 2)
  return [`${pref}000`, pref, `0${pref}`, `${pref}00`, normalizeAreaCode(`${pref}000`)]
}

function lookupPref(map, muniId) {
  for (const code of prefAreaCandidates(muniId)) {
    const hit = lookupArea(map, code)
    if (hit) return hit
  }
  // 一部テーブルは都道府県を「13000」以外の表記で持つ
  for (const [area, row] of map.entries()) {
    if (String(area).padStart(5, '0').startsWith(String(muniId).padStart(5, '0').slice(0, 2))) {
      // 市区町村コード（5桁で末尾が000以外）は都道府県集計ではないのでスキップ
      if (/^\d{5}$/.test(area) && !area.endsWith('000')) continue
      return row
    }
  }
  return null
}

function metricRecord({ value, unit, source, referenceDate, catName, valueType = 'official', warning }) {
  const rec = {
    value,
    unit,
    valueType,
    source,
    referenceDate,
    retrievedAt: new Date().toISOString(),
    catName,
  }
  if (warning) rec.warning = warning
  return rec
}

/**
 * 罪種内訳は市区町村表に無いことが多い。
 * 1) 市区町村基礎 0000020211
 * 2) 都道府県基礎 0000010111（市区町村へ都道府県構成比を適用）
 */
async function fillCrimeBreakdownFromBase(base, byId) {
  const codeSets = {
    total: ['K4201', '#K4201'],
    heinous: ['K420101', '#K420101'],
    violent: ['K420102', '#K420102'],
    theft: ['K420103', '#K420103'],
    morals: ['K420105', '#K420105'],
  }

  async function resolvePacks(statsDataId) {
    const resolved = {}
    for (const [key, candidates] of Object.entries(codeSets)) {
      const cat = await resolveCat(statsDataId, candidates[0], candidates.slice(1))
      if (!cat) continue
      console.log(`fetch crime-base ${key}: [${statsDataId}] ${cat.code} ${cat.name}`)
      resolved[key] = { cat, map: await fetchLatestByArea(statsDataId, cat.code) }
    }
    return resolved
  }

  // まず市区町村
  let statsDataId = '0000020211'
  let resolved = await resolvePacks(statsDataId)
  let scope = 'municipality'
  if (!resolved.heinous && !resolved.violent && !resolved.theft && !resolved.morals) {
    console.warn('municipal crime-type counts missing; trying prefecture table 0000010111')
    statsDataId = '0000010111'
    resolved = await resolvePacks(statsDataId)
    scope = 'prefecture'
  }

  if (!resolved.total) {
    console.warn('crime-base total not found; skip breakdown fill')
    return 0
  }

  const warning =
    scope === 'prefecture'
      ? '市区町村の罪種別公開が無いため、都道府県の構成比を当該市区町村に適用'
      : undefined

  let hits = 0
  for (const m of base) {
    const totalRow =
      scope === 'prefecture'
        ? lookupPref(resolved.total.map, m.id)
        : lookupArea(resolved.total.map, m.id)
    if (!totalRow || !totalRow.value) continue
    const total = totalRow.value
    byId[m.id] = byId[m.id] || {}

    const setShare = (field, pack) => {
      if (!pack || byId[m.id][field]) return
      const row =
        scope === 'prefecture' ? lookupPref(pack.map, m.id) : lookupArea(pack.map, m.id)
      if (!row || !Number.isFinite(row.value)) return
      byId[m.id][field] = metricRecord({
        value: round2((row.value / total) * 100),
        unit: '%',
        source: `e-Stat ${statsDataId} / ${pack.cat.code} ÷ ${resolved.total.cat.code}（${scope}）`,
        referenceDate: row.timeName,
        catName: pack.cat.name,
        valueType: scope === 'prefecture' ? 'estimate' : 'official',
        warning,
      })
    }

    setShare('heinousSharePercent', resolved.heinous)
    setShare('violentSharePercent', resolved.violent)
    setShare('theftSharePercent', resolved.theft)
    setShare('moralsSharePercent', resolved.morals)

    if (!byId[m.id].theftPer100People) {
      const theftShare = byId[m.id].theftSharePercent?.value
      const crimeRate = byId[m.id].crimePer100People?.value
      if (theftShare != null && crimeRate != null) {
        byId[m.id].theftPer100People = metricRecord({
          value: round2((crimeRate * theftShare) / 100),
          unit: '件/100人・年',
          source: `crimePer100People × theftSharePercent（${scope}構成比）`,
          referenceDate: byId[m.id].theftSharePercent?.referenceDate || totalRow.timeName,
          catName: '窃盗認知率（推計）',
          valueType: 'computed',
          warning:
            scope === 'prefecture'
              ? '市区町村窃盗率の直接値がないため、市区町村の刑法犯率×都道府県の窃盗構成比で推計'
              : '市区町村窃盗率の直接値がないため、刑法犯率×窃盗構成比で推計',
        })
      }
    }
    hits++
  }
  console.log(`  crime-base filled municipalities: ${hits} (scope=${scope})`)
  return hits
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

  // 刑法犯だけ上書きして窃盗が古い推計のまま残るのを防ぐ
  for (const [id, row] of Object.entries(byId)) {
    const crime = row.crimePer100People
    const share = row.theftSharePercent
    const theft = row.theftPer100People
    const yearOf = (ref) => {
      const m = String(ref || '').match(/20\d{2}/)
      return m ? m[0] : null
    }
    const cy = yearOf(crime?.referenceDate)
    for (const field of [
      'heinousSharePercent',
      'violentSharePercent',
      'theftSharePercent',
      'moralsSharePercent',
      'theftPer100People',
    ]) {
      const m = row[field]
      if (!crime?.locked || !m || m.locked || m.unavailable) continue
      const my = yearOf(m.referenceDate)
      const pref =
        String(m.source || '').includes('prefecture') ||
        String(m.warning || '').includes('都道府県')
      if ((cy && my && cy !== my) || pref) {
        row[field] = {
          unavailable: true,
          valueType: 'estimate',
          source: 'update: dropped cross-year/prefecture estimate',
          referenceDate: crime.referenceDate,
          warning:
            '同一地点・同一年度の直接値がないため非表示（異年度・上位地域推計は適用しない）',
          retrievedAt: new Date().toISOString(),
        }
      }
    }
    if (
      crime?.value != null &&
      !crime.unavailable &&
      share?.value != null &&
      !share.unavailable &&
      (!theft || !theft.locked)
    ) {
      const sy = yearOf(share.referenceDate)
      if (!cy || !sy || cy === sy) {
        row.theftPer100People = {
          value: Math.round(crime.value * share.value) / 100,
          unit: '件/100人・年',
          valueType: 'computed',
          source: 'crimePer100People × theftSharePercent（同一年再計算）',
          referenceDate: crime.referenceDate || share.referenceDate,
          catName: '窃盗認知率（計算）',
          retrievedAt: new Date().toISOString(),
        }
      }
    }
    const t = row.theftPer100People
    if (
      crime?.value != null &&
      t?.value != null &&
      !t.unavailable &&
      t.value > crime.value + 1e-6
    ) {
      console.warn(`invariant: ${id} theft ${t.value} > crime ${crime.value}`)
      if (!t.locked) {
        row.theftPer100People = {
          unavailable: true,
          valueType: 'estimate',
          source: 'update: blocked by invariant',
          warning: '窃盗率が刑法犯率を超えたため公開停止',
          retrievedAt: new Date().toISOString(),
        }
      }
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
