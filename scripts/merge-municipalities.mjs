#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const base = JSON.parse(fs.readFileSync(path.join(root, 'data/municipalities.base.json'), 'utf8'))
const stats = JSON.parse(fs.readFileSync(path.join(root, 'data/municipalities.stats.json'), 'utf8'))
const overrides = fs.existsSync(path.join(root, 'data/municipalities.overrides.json'))
  ? JSON.parse(fs.readFileSync(path.join(root, 'data/municipalities.overrides.json'), 'utf8'))
  : {}

for (const [id, fields] of Object.entries(overrides)) {
  stats.byId[id] = stats.byId[id] || {}
  for (const [field, metric] of Object.entries(fields)) {
    stats.byId[id][field] = metric
  }
}

function yearKey(ref) {
  if (!ref) return null
  const m = String(ref).match(/20\d{2}/)
  return m ? m[0] : null
}

function round2(n) {
  return Math.round(n * 100) / 100
}

/**
 * データ選択ルール:
 * 同一地点・同一年度の直接値 → 近接年度 → 上位地域推計 → unavailable
 * overrides 後に、異年度推計の取り残しと theft>crime を掃除・再計算する。
 */
function reconcileCrimeRow(row) {
  if (!row) return []
  const issues = []
  const crime = row.crimePer100People
  const cy = yearKey(crime?.referenceDate)

  const shareFields = [
    'heinousSharePercent',
    'violentSharePercent',
    'theftSharePercent',
    'moralsSharePercent',
  ]

  // locked crime があるとき、未 lock の異年度・都道府県推計を落とす
  if (crime?.locked) {
    for (const field of [...shareFields, 'theftPer100People']) {
      const m = row[field]
      if (!m || m.locked || m.unavailable) continue
      const my = yearKey(m.referenceDate)
      const crossYear = cy && my && cy !== my
      const prefEstimate =
        String(m.source || '').includes('prefecture') ||
        String(m.warning || '').includes('都道府県')
      if (crossYear || prefEstimate) {
        row[field] = {
          unavailable: true,
          valueType: 'estimate',
          source: 'reconcile: dropped cross-year/prefecture estimate',
          referenceDate: crime.referenceDate,
          warning:
            '同一地点・同一年度の直接値がないため非表示（異年度・上位地域推計は適用しない）',
        }
      }
    }
  }

  const share = row.theftSharePercent
  const theft = row.theftPer100People
  if (
    crime?.value != null &&
    !crime.unavailable &&
    share?.value != null &&
    !share.unavailable &&
    (!theft || !theft.locked)
  ) {
    const sy = yearKey(share.referenceDate)
    if (!cy || !sy || cy === sy) {
      row.theftPer100People = {
        value: round2((crime.value * share.value) / 100),
        unit: '件/100人・年',
        valueType: 'computed',
        source: `crimePer100People × theftSharePercent（同一年再計算）`,
        referenceDate: crime.referenceDate || share.referenceDate,
        catName: '窃盗認知率（計算）',
        warning: share.warning,
      }
    }
  }

  const t = row.theftPer100People
  if (
    crime?.value != null &&
    t?.value != null &&
    !crime.unavailable &&
    !t.unavailable &&
    t.value > crime.value + 1e-6
  ) {
    issues.push(
      `${crime.catName || 'crime'}: theft ${t.value} > crime ${crime.value}`,
    )
    if (!t.locked) {
      row.theftPer100People = {
        unavailable: true,
        valueType: 'estimate',
        source: 'reconcile: blocked by invariant theft_rate <= crime_rate',
        referenceDate: t.referenceDate,
        warning: '窃盗率が刑法犯率を超えたため公開停止（整合性エラー）',
      }
    }
  }

  return issues
}

const reconcileIssues = []
for (const [id, row] of Object.entries(stats.byId || {})) {
  for (const msg of reconcileCrimeRow(row)) {
    reconcileIssues.push(`${id}: ${msg}`)
  }
}
if (reconcileIssues.length) {
  console.warn('invariant errors after reconcile:')
  for (const msg of reconcileIssues) console.warn('  ', msg)
}

function readMetric(row, key) {
  const v = row?.[key]
  if (v == null) return { value: 0, metric: null }
  if (typeof v === 'object') {
    if (v.unavailable || v.value == null) {
      return {
        value: 0,
        metric: {
          ...v,
          value: null,
          unavailable: true,
        },
      }
    }
    // Data Quality Gate（表示前に落とす）
    const blob = `${v.source ?? ''} ${v.referenceDate ?? ''} ${v.warning ?? ''} ${v.catName ?? ''}`
    if (/pending corrected|旧マッチ|legacy-flat/i.test(blob)) {
      return {
        value: 0,
        metric: {
          ...v,
          value: null,
          unavailable: true,
          warning: `DATA_MAPPING_ERROR: ${v.warning || '誤マッチ疑いのため非表示'}`,
        },
      }
    }
    if (/^seed$/i.test(String(v.referenceDate)) || /人口シード/i.test(blob)) {
      return {
        value: 0,
        metric: {
          ...v,
          value: null,
          unavailable: true,
          warning: 'SEED_VALUE: seed概算は非表示',
        },
      }
    }
    const year = String(v.referenceDate || '').match(/20\d{2}/)?.[0]
    if (year && Number(year) <= 2010 && /犯罪|刑法|K06101|crime/i.test(blob)) {
      return {
        value: 0,
        metric: {
          ...v,
          value: null,
          unavailable: true,
          warning: `STALE_SOURCE: ${year}年データは非表示`,
        },
      }
    }
    return { value: v.value, metric: v }
  }
  return {
    value: Number(v) || 0,
    metric: {
      value: Number(v) || 0,
      valueType: 'estimate',
      source: stats.meta?.source || 'legacy',
      referenceDate: stats.meta?.updatedAt || 'unknown',
    },
  }
}

const municipalities = base.map((b) => {
  const row = stats.byId[b.id] || {}
  const aging = readMetric(row, 'agingRate')
  const single = readMetric(row, 'singleHouseholdRate')
  const welfare = readMetric(row, 'welfareRatePercent')
  const crime = readMetric(row, 'crimePer100People')
  const population = readMetric(row, 'population')
  const theft = readMetric(row, 'theftPer100People')
  const heinous = readMetric(row, 'heinousSharePercent')
  const violent = readMetric(row, 'violentSharePercent')
  const theftShare = readMetric(row, 'theftSharePercent')
  const morals = readMetric(row, 'moralsSharePercent')
  return {
    ...b,
    agingRate: aging.value,
    singleHouseholdRate: single.value,
    welfareRatePercent: welfare.value,
    crimePer100People: crime.value,
    population: population.value,
    theftPer100People: theft.value,
    heinousSharePercent: heinous.value,
    violentSharePercent: violent.value,
    theftSharePercent: theftShare.value,
    moralsSharePercent: morals.value,
    metrics: {
      agingRate: aging.metric,
      singleHouseholdRate: single.metric,
      welfareRatePercent: welfare.metric,
      crimePer100People: crime.metric,
      population: population.metric,
      theftPer100People: theft.metric,
      heinousSharePercent: heinous.metric,
      violentSharePercent: violent.metric,
      theftSharePercent: theftShare.metric,
      moralsSharePercent: morals.metric,
    },
  }
})

const meta = {
  retrievedAt: stats.meta?.retrievedAt || stats.meta?.fetchedAt || stats.meta?.updatedAt || null,
  notes:
    (stats.meta?.notes || '') +
    ' 犯罪指標は同一地点・同一年度の直接値を優先。異年度×上位地域の組み合わせは reconcile で落とす。',
  fields: stats.meta?.fields || {},
}

const dest = path.join(root, 'src/data/municipalities.generated.json')
fs.writeFileSync(dest, JSON.stringify({ meta, municipalities }, null, 2) + '\n')
console.log(`merged ${municipalities.length} -> ${dest}`)
