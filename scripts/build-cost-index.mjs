// Builds states.json `constructionCostIndex` from HUD's 2024 Unit Total
// Development Cost (TDC) Limits.
//
// Source PDF: https://www.hud.gov/sites/dfiles/PIH/documents/2024_Units_TDC_Limits.pdf
// Input: a JSON file { "STATE NAME": { "LOCALITY": tdc, ... }, ... } holding, for
// every locality in the PDF, the "Walkup" row's 2-bedroom TDC column (the sixth
// number on the row: 0BR HCC, 0BR TDC, 1BR HCC, 1BR TDC, 2BR HCC, 2BR TDC, ...).
//
// Method:
//   state TDC   = unweighted mean of that state's localities' 2BR walk-up TDC
//   national    = population-weighted mean of the 51 state TDCs (ACS population in states.json)
//   index       = state TDC / national, rounded to 3 decimals
//
// Usage: node scripts/build-cost-index.mjs tdc-walkup-2br.json [--write]

import { readFileSync, writeFileSync } from 'node:fs'

const [input, flag] = process.argv.slice(2)
if (!input) {
  console.error('usage: node scripts/build-cost-index.mjs tdc-walkup-2br.json [--write]')
  process.exit(1)
}
const statesPath = new URL('../src/data/states.json', import.meta.url)
const tdc = JSON.parse(readFileSync(input, 'utf8'))
const doc = JSON.parse(readFileSync(statesPath, 'utf8'))

const stateTdc = {}
for (const s of Object.values(doc.states)) {
  const locs = tdc[s.name.toUpperCase()]
  if (!locs) throw new Error(`no TDC localities for ${s.name}`)
  const vals = Object.values(locs)
  stateTdc[s.fips] = vals.reduce((a, b) => a + b, 0) / vals.length
}
let num = 0
let den = 0
for (const s of Object.values(doc.states)) { num += stateTdc[s.fips] * s.population; den += s.population }
const national = num / den
console.log(`population-weighted national mean 2BR walk-up TDC: $${national.toFixed(0)}`)

const rows = []
for (const s of Object.values(doc.states)) {
  const idx = Math.round((stateTdc[s.fips] / national) * 1000) / 1000
  rows.push([s.abbr, Math.round(stateTdc[s.fips]), idx])
  s.constructionCostIndex = idx
}
rows.sort((a, b) => b[2] - a[2])
for (const r of rows) console.log(r.join('\t'))

if (flag === '--write') {
  writeFileSync(statesPath, JSON.stringify(doc, null, 2) + '\n')
  console.log('wrote', statesPath.pathname)
}
