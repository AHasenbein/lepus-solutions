import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  LENSES, scoreNeed, allocateBudget, compareLenses, naiveBaseline, efficiencyGain, sensitivity,
} from './allocate.js'
import { subsidyGapPerUnit, affordableRent, makeSubsidyScreen, monthlyPayment, loanBalance, irr, FINANCE_DEFAULTS } from './finance.js'

const load = (f) => JSON.parse(fs.readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'))
const STATES = load('states.json').states
const IVS = load('interventions.json').interventions
const clone = (x) => JSON.parse(JSON.stringify(x))
const base = (over = {}) => ({ budget: 1e9, states: STATES, interventions: IVS, weights: LENSES.balanced.weights, ...over })

test('need scores are 0..1 for every state', () => {
  for (const lens of Object.values(LENSES)) {
    const s = scoreNeed(STATES, lens.weights)
    assert.equal(Object.keys(s).length, Object.keys(STATES).length)
    for (const v of Object.values(s)) assert.ok(v >= 0 && v <= 1 && Number.isFinite(v))
  }
})

test('budget is never exceeded', () => {
  for (const budget of [0, 1e6, 1e9, 5e10, 1e13]) {
    const r = allocateBudget(base({ budget }))
    assert.ok(r.totalSpent <= budget + 1e-6, `spent ${r.totalSpent} > ${budget}`)
    const sum = r.allocations.reduce((a, x) => a + x.dollars, 0)
    assert.ok(Math.abs(sum - r.totalSpent) < 1e-3)
  }
})

test('no state exceeds its shortage cap or share cap', () => {
  const budget = 1e12 // big enough that shortage caps bind
  const r = allocateBudget(base({ budget }))
  for (const [fips, b] of Object.entries(r.byState)) {
    assert.ok(b.units <= STATES[fips].eliUnitShortage, `${fips} ${b.units} > ${STATES[fips].eliUnitShortage}`)
    assert.ok(b.dollars <= budget * 0.25 + 1)
  }
  for (const b of Object.values(r.byIntervention)) assert.ok(b.dollars <= budget * 0.6 + 1)
})

test('excluded states get $0', () => {
  const top = allocateBudget(base()).allocations.map((a) => a.fips)
  const excludedFips = [...new Set(top)].slice(0, 3)
  const r = allocateBudget(base({ excludedFips }))
  for (const f of excludedFips) {
    assert.equal(r.byState[f].dollars, 0)
    assert.ok(!r.allocations.some((a) => a.fips === f))
  }
})

test('null metrics do not crash and are reported', () => {
  const states = clone(STATES)
  const keys = Object.keys(states)
  const fields = ['eliUnitShortage', 'affordableUnitsPer100Eli', 'homelessPIT', 'unshelteredPIT', 'severelyRentBurdenedPct', 'constructionCostIndex', 'avgRenterHouseholdSize', 'population', 'medianHouseholdIncome']
  keys.slice(0, 5).forEach((f, i) => { for (const k of fields.slice(i)) states[f][k] = null })
  const ivs = clone(IVS)
  ivs[1].monthsToOccupancy = null
  const r = allocateBudget(base({ states, interventions: ivs }))
  assert.ok(r.totalSpent > 0 && Number.isFinite(r.peopleHoused))
  assert.ok(r.missingData[keys[0]].includes('eliUnitShortage'))
  assert.ok(r.explanation.some((e) => /national average costs/.test(e)))
  assert.ok(r.explanation.some((e) => /household size/.test(e)))
  assert.ok(r.explanation.some((e) => /months-to-occupancy/.test(e)))
  for (const v of Object.values(r.needScores)) assert.ok(Number.isFinite(v))
  assert.ok(Number.isFinite(naiveBaseline(base({ states })).totalUnits))
  assert.ok(Number.isFinite(allocateBudget(base({ states, costBasis: 'subsidyGap' })).totalUnits))
})

test('all-null and constant columns are handled', () => {
  const states = clone(STATES)
  for (const s of Object.values(states)) { s.homelessPIT = null; s.unshelteredPIT = null; s.severelyRentBurdenedPct = 20 }
  const s = scoreNeed(states, LENSES.community.weights)
  for (const v of Object.values(s)) assert.ok(Number.isFinite(v))
  assert.ok(allocateBudget(base({ states })).totalSpent > 0)
})

test('empty inputs return a zeroed result', () => {
  const r1 = allocateBudget(base({ enabledInterventions: [] }))
  assert.equal(r1.totalSpent, 0)
  assert.equal(r1.totalUnits, 0)
  const r2 = allocateBudget(base({ excludedFips: Object.keys(STATES) }))
  assert.equal(r2.totalSpent, 0)
  assert.equal(Object.keys(r2.byState).length, Object.keys(STATES).length)
})

test('single intervention raises the intervention cap so the budget is spent', () => {
  const r = allocateBudget(base({ enabledInterventions: ['new-construction'] }))
  assert.ok(r.totalSpent > 0.99e9)
})

test('optimizer houses at least as many people as the naive baseline', () => {
  for (const lens of Object.values(LENSES)) {
    const p = base({ weights: lens.weights })
    const g = efficiencyGain(allocateBudget(p), naiveBaseline(p))
    assert.ok(g.extraPeopleHoused >= 0, `${lens.label}: ${g.extraPeopleHoused}`)
  }
})

test('output is deterministic', () => {
  assert.deepEqual(allocateBudget(base()), allocateBudget(base()))
})

test('result fields: shortageClosedPct, timeline, peopleHoused', () => {
  const r = allocateBudget(base())
  const short = Object.values(STATES).reduce((a, s) => a + s.eliUnitShortage, 0)
  assert.ok(Math.abs(r.shortageClosedPct - (r.totalUnits / short) * 100) < 1e-9)
  // Interventions with no sourced monthsToOccupancy are left out of the timeline.
  const timed = IVS.filter((iv) => Number.isFinite(iv.monthsToOccupancy)).reduce((a, iv) => a + (r.byIntervention[iv.id]?.units ?? 0), 0)
  assert.equal(r.timeline.at(-1)?.units ?? 0, timed)
  for (let i = 1; i < r.timeline.length; i++) assert.ok(r.timeline[i].units >= r.timeline[i - 1].units)
  assert.ok(r.peopleHoused > r.totalUnits)
  assert.ok(r.explanation.length >= 3)
  const ranks = Object.values(r.byState).map((b) => b.rank).sort((a, b) => a - b)
  assert.deepEqual(ranks, ranks.map((_, i) => i + 1))
})

test('compareLenses and sensitivity', () => {
  const c = compareLenses(base())
  assert.deepEqual(Object.keys(c), Object.keys(LENSES))
  assert.equal(c.budget.lensLabel, 'Budget Office')
  const s = sensitivity(base(), 'budget', [-0.5, 0, 0.5])
  assert.ok(s[0].totalUnits < s[1].totalUnits && s[1].totalUnits < s[2].totalUnits)
  assert.equal(sensitivity(base(), 'weights.homelessness', [0, 1]).length, 2)
})

test('benchmark: under 30 ms per run (51 states x 5 interventions x 1000 chunks)', () => {
  const ivs = [...IVS, { ...IVS[0], id: 'extra', costPerUnit: 260000 }]
  const p = base({ interventions: ivs })
  allocateBudget(p) // warm up
  const n = 20
  const t = performance.now()
  for (let i = 0; i < n; i++) allocateBudget(p)
  const ms = (performance.now() - t) / n
  console.log(`# allocateBudget avg ${ms.toFixed(2)} ms`)
  assert.ok(ms < 30, `${ms} ms`)
})

// ---- finance.js (ported from Lepus Analytics underwriting) ----

test('finance: amortization math', () => {
  assert.ok(Math.abs(monthlyPayment(100000, 6, 30) - 599.55) < 0.01)
  assert.equal(monthlyPayment(1200, 0, 1), 100)
  assert.ok(loanBalance(100000, 6, 30, 360) < 1e-6)
  assert.ok(Math.abs(irr([-100, 110]) - 0.1) < 1e-6)
  assert.equal(irr([100, 100]), null)
})

test('finance: affordable rent and subsidy gap', () => {
  assert.equal(affordableRent(80000), 600) // 80k x 30% x 30% / 12
  assert.equal(affordableRent(null), null)
  const lo = subsidyGapPerUnit({ costPerUnit: 300000, monthlyRent: 600 })
  const hi = subsidyGapPerUnit({ costPerUnit: 300000, monthlyRent: 2500 })
  assert.ok(lo.subsidyGap > hi.subsidyGap)
  assert.ok(Math.abs(hi.subsidyGap + hi.supportableDebt - 300000) < 1e-6)
  assert.ok(hi.supportableDebt > 0)
  const s = makeSubsidyScreen()
  assert.ok(Math.abs(s.supportableDebt(2500) - hi.supportableDebt) < 1e-6)
  assert.ok(s.gap(300000, 1e6) >= 300000 * 0.05) // minimum public share
  for (const v of Object.values(FINANCE_DEFAULTS)) assert.ok(v.source || v.assumption === true)
})

test('allocator subsidyGap cost basis', () => {
  const r = allocateBudget(base({ costBasis: 'subsidyGap' }))
  const t = allocateBudget(base())
  assert.ok(r.totalSpent <= 1e9 + 1e-6)
  assert.ok(r.totalUnits >= t.totalUnits)
  assert.ok(r.explanation.some((e) => /proxy/.test(e)))
})
