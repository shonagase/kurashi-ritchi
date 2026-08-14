#!/usr/bin/env node
/** base + stats を結合して src/data/municipalities.generated.json を作る */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const base = JSON.parse(fs.readFileSync(path.join(root, 'data/municipalities.base.json'), 'utf8'))
const stats = JSON.parse(fs.readFileSync(path.join(root, 'data/municipalities.stats.json'), 'utf8'))

const municipalities = base.map((b) => ({
  ...b,
  ...(stats.byId[b.id] || {
    agingRate: 0,
    singleHouseholdRate: 0,
    welfareRatePercent: 0,
    crimePer100People: 0,
  }),
}))

const out = { meta: stats.meta, municipalities }
const dest = path.join(root, 'src/data/municipalities.generated.json')
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n')
console.log(`merged ${municipalities.length} -> ${dest}`)
