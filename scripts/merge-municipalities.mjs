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

function readMetric(row, key) {
  const v = row?.[key]
  if (v == null) return { value: 0, metric: null }
  if (typeof v === 'object' && v.value != null) return { value: v.value, metric: v }
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
  return {
    ...b,
    agingRate: aging.value,
    singleHouseholdRate: single.value,
    welfareRatePercent: welfare.value,
    crimePer100People: crime.value,
    metrics: {
      agingRate: aging.metric,
      singleHouseholdRate: single.metric,
      welfareRatePercent: welfare.metric,
      crimePer100People: crime.metric,
    },
  }
})

const meta = {
  retrievedAt: stats.meta?.retrievedAt || stats.meta?.fetchedAt || stats.meta?.updatedAt || null,
  notes: stats.meta?.notes || '',
  fields: stats.meta?.fields || {},
}

const dest = path.join(root, 'src/data/municipalities.generated.json')
fs.writeFileSync(dest, JSON.stringify({ meta, municipalities }, null, 2) + '\n')
console.log(`merged ${municipalities.length} -> ${dest}`)
