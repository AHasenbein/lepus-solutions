// Lepus Solutions allocation engine. Pure functions, no React. See docs/ENGINE.md.
//
// 1. Need scoring: four components per state, each normalized 0..1 across
//    states (log-scale min-max for counts, linear min-max for percentages),
//    combined with the stakeholder lens weights. Null metrics drop out and the
//    remaining weights are renormalized for that state.
// 2. Allocation: greedy marginal-impact optimization in budget chunks. Each
//    chunk goes to the (state, intervention) pair with the highest
//    need x diminishing-returns / cost-per-unit, subject to shortage, state
//    share, intervention share, exclusion and enablement constraints.

import { affordableRent, makeSubsidyScreen } from './finance.js'

/**
 * Lens presets mirror Lepus's stakeholder portals (owner / worker / tenant).
 * Weights are { shortage, homelessness, rentBurden, costEfficiency }.
 */
export const LENSES = {
  balanced: { label: 'Planner', description: 'Balances the unit shortage, homelessness and rent burden.', weights: { shortage: 0.35, homelessness: 0.25, rentBurden: 0.25, costEfficiency: 0.15 } },
  budget: { label: 'Budget Office', description: 'Maximizes units per dollar in low-cost states.', weights: { shortage: 0.2, homelessness: 0.1, rentBurden: 0.1, costEfficiency: 0.6 } },
  community: { label: 'Community Advocate', description: 'Prioritizes people experiencing homelessness.', weights: { shortage: 0.3, homelessness: 0.45, rentBurden: 0.25, costEfficiency: 0 } },
}

/** Need components, in display order. */
export const COMPONENTS = ['shortage', 'homelessness', 'rentBurden', 'costEfficiency']

export const COMPONENT_LABELS = {
  shortage: 'ELI unit shortage',
  homelessness: 'homelessness',
  rentBurden: 'severe rent burden',
  costEfficiency: 'low construction cost',
}

/** Default optimizer settings. */
export const ENGINE_DEFAULTS = {
  maxSharePerState: 0.25,
  maxSharePerIntervention: 0.6,
  chunks: 1000,
  alpha: 1,
  costBasis: 'tdc',
}

const fin = (v) => typeof v === 'number' && Number.isFinite(v)
const EPS_NEED = 1e-6

/** Returns v -> 0..1 (or null) normalizing over the finite values given. */
function normalizer(values, { log = false } = {}) {
  const t = (v) => (log ? Math.log1p(Math.max(v, 0)) : v)
  const xs = values.filter(fin).map(t)
  if (!xs.length) return () => null
  let min = Infinity
  let max = -Infinity
  for (const x of xs) { if (x < min) min = x; if (x > max) max = x }
  const range = max - min
  if (range < 1e-12) return (v) => (fin(v) ? 0.5 : null)
  return (v) => (fin(v) ? (t(v) - min) / range : null)
}

/** Expected (average) cost multiplier across interventions for a state. */
function costIndexFor(state) {
  return fin(state.constructionCostIndex) && state.constructionCostIndex > 0 ? state.constructionCostIndex : null
}

/**
 * Per-state need components (0..1) and missing metrics.
 * @param {object} states states.json `states`
 * @param {object} [opts]
 * @param {Array} [opts.interventions] used for expected cost per unit (costEfficiency)
 * @returns {{ components: Record<string, Record<string, number|null>>, missing: Record<string, string[]> }}
 */
export function needComponents(states, { interventions } = {}) {
  const list = Object.values(states)
  const ivs = (interventions ?? []).filter((i) => fin(i.costPerUnit))
  // Expected cost per unit in a state: mean over interventions of costPerUnit x (index if useCostIndex).
  const expectedCost = (s) => {
    const idx = costIndexFor(s)
    if (idx === null) return null
    if (!ivs.length) return idx
    return ivs.reduce((a, i) => a + i.costPerUnit * (i.useCostIndex ? idx : 1), 0) / ivs.length
  }
  const gap = (s) => (fin(s.affordableUnitsPer100Eli) ? 100 - s.affordableUnitsPer100Eli : null)
  const homeless = (s) => (fin(s.homelessPIT) ? s.homelessPIT + (fin(s.unshelteredPIT) ? s.unshelteredPIT : 0) : null)
  const invCost = (s) => { const c = expectedCost(s); return c ? 1 / c : null }

  const nShort = normalizer(list.map((s) => s.eliUnitShortage), { log: true })
  const nGap = normalizer(list.map(gap))
  const nHomeless = normalizer(list.map(homeless), { log: true })
  const nBurden = normalizer(list.map((s) => s.severelyRentBurdenedPct))
  const nCost = normalizer(list.map(invCost))

  const components = {}
  const missing = {}
  for (const s of list) {
    const miss = []
    for (const f of ['eliUnitShortage', 'affordableUnitsPer100Eli', 'homelessPIT', 'unshelteredPIT', 'severelyRentBurdenedPct', 'constructionCostIndex', 'avgRenterHouseholdSize', 'population']) {
      if (!fin(s[f])) miss.push(f)
    }
    const parts = [nShort(s.eliUnitShortage), nGap(gap(s))].filter((x) => x !== null)
    components[s.fips] = {
      shortage: parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null,
      homelessness: nHomeless(homeless(s)),
      rentBurden: nBurden(s.severelyRentBurdenedPct),
      costEfficiency: nCost(invCost(s)),
    }
    if (miss.length) missing[s.fips] = miss
  }
  return { components, missing }
}

/**
 * Need scores with component detail.
 * @param {object} states
 * @param {object} weights { shortage, homelessness, rentBurden, costEfficiency }
 * @param {object} [opts] { interventions }
 * @returns {{ scores: Record<string, number>, components: object, missing: Record<string, string[]>, drivers: Record<string, string|null> }}
 *   `drivers[fips]` is the component contributing most to that state's score.
 */
export function scoreNeedDetailed(states, weights, opts = {}) {
  const { components, missing } = needComponents(states, opts)
  const scores = {}
  const drivers = {}
  for (const [fips, c] of Object.entries(components)) {
    let sum = 0
    let wsum = 0
    let best = null
    let bestContrib = -Infinity
    for (const k of COMPONENTS) {
      const w = Math.max(weights?.[k] ?? 0, 0)
      if (c[k] === null || w === 0) continue
      sum += w * c[k]
      wsum += w
      if (w * c[k] > bestContrib) { bestContrib = w * c[k]; best = k }
    }
    scores[fips] = wsum > 0 ? sum / wsum : 0
    drivers[fips] = best
  }
  return { scores, components, missing, drivers }
}

/**
 * Returns { [fips]: 0..1 } need score for every state (contract API).
 * @param {object} states states.json `states`
 * @param {object} weights lens weights
 * @param {object} [opts] { interventions } for the costEfficiency component
 * @returns {Record<string, number>}
 */
export function scoreNeed(states, weights, opts = {}) {
  return scoreNeedDetailed(states, weights, opts).scores
}

/** Renter-household-weighted national mean household size, with provenance. */
function nationalHouseholdSize(list) {
  let num = 0
  let den = 0
  for (const s of list) {
    if (fin(s.avgRenterHouseholdSize) && fin(s.renterHouseholds)) { num += s.avgRenterHouseholdSize * s.renterHouseholds; den += s.renterHouseholds }
  }
  if (den > 0) return { size: num / den, how: 'renter-household-weighted national mean' }
  const xs = list.map((s) => s.avgRenterHouseholdSize).filter(fin)
  if (xs.length) return { size: xs.reduce((a, b) => a + b, 0) / xs.length, how: 'unweighted mean across states' }
  return { size: 1, how: 'no household-size data at all, so 1 person per unit' }
}

/** Shared setup for the optimizer and the baseline. */
function prepare(params) {
  const {
    budget, states, interventions, weights,
    enabledInterventions, excludedFips = [],
    costBasis = ENGINE_DEFAULTS.costBasis, financeAssumptions = {},
  } = params
  const notes = []
  const allStates = Object.values(states).sort((a, b) => (a.fips < b.fips ? -1 : 1))
  const excluded = new Set(excludedFips)
  const ivAll = (interventions ?? []).filter((i) => !enabledInterventions || enabledInterventions.includes(i.id))
  const ivs = ivAll.filter((i) => fin(i.costPerUnit) && i.costPerUnit > 0)
  for (const i of ivAll) if (!ivs.includes(i)) notes.push(`${i.name ?? i.id} skipped: no cost per unit in the data.`)

  const detail = scoreNeedDetailed(states, weights, { interventions: ivs })
  const hh = nationalHouseholdSize(allStates)
  const screen = costBasis === 'subsidyGap' ? makeSubsidyScreen(financeAssumptions) : null

  const nullIndex = []
  const nullHh = []
  const nullIncome = []
  const st = allStates.map((s) => {
    const idx = costIndexFor(s)
    if (idx === null) nullIndex.push(s.abbr ?? s.fips)
    const hhSize = fin(s.avgRenterHouseholdSize) ? s.avgRenterHouseholdSize : (nullHh.push(s.abbr ?? s.fips), hh.size)
    let rent = null
    if (screen) {
      rent = affordableRent(s.medianHouseholdIncome, screen.assumptions.amiPct, screen.assumptions.rentToIncomePct)
      if (rent === null) nullIncome.push(s.abbr ?? s.fips)
    }
    const costs = ivs.map((i) => {
      const tdc = i.costPerUnit * (i.useCostIndex ? idx ?? 1 : 1)
      return screen && rent !== null ? screen.gap(tdc, rent) : tdc
    })
    return {
      s, fips: s.fips, idx, hhSize, rent, costs,
      need: detail.scores[s.fips] ?? 0,
      shortage: fin(s.eliUnitShortage) ? Math.max(s.eliUnitShortage, 0) : Infinity,
      excluded: excluded.has(s.fips),
    }
  })
  if (nullIndex.length) notes.push(`No construction cost index for ${nullIndex.join(', ')}; national average costs were used there.`)
  if (nullHh.length) notes.push(`No renter household size for ${nullHh.join(', ')}; used the ${hh.how} (${hh.size.toFixed(2)} people per unit).`)
  if (screen) {
    notes.push(`Cost basis: public subsidy gap per unit (TDC minus permanent debt supportable at a ${screen.assumptions.amiPct}%-of-income rent, DSCR ${screen.assumptions.dscr}, ${screen.assumptions.interestRate}% / ${screen.assumptions.termYears} yr). Rents use state median household income as a proxy for HUD AMI.`)
    if (nullIncome.length) notes.push(`No median household income for ${nullIncome.join(', ')}; full development cost used as the subsidy there.`)
  }
  const nullShort = st.filter((x) => x.shortage === Infinity).map((x) => x.s.abbr ?? x.fips)
  if (nullShort.length) notes.push(`No ELI shortage for ${nullShort.join(', ')}; those states have no unit cap or diminishing returns, only the state share cap.`)
  return { budget: Math.max(fin(budget) ? budget : 0, 0), weights, ivs, st, detail, notes }
}

/** Turns a spend matrix (dollars[stateIdx][ivIdx]) into the contract result. */
function buildResult(ctx, dollars, extraNotes = []) {
  const { budget, ivs, st, detail } = ctx
  const allocations = []
  const byState = {}
  const byIntervention = Object.fromEntries(ivs.map((i) => [i.id, { dollars: 0, units: 0, peopleHoused: 0 }]))
  let totalSpent = 0
  let totalUnits = 0
  let peopleHoused = 0
  let shortageSum = 0
  const nullMonths = new Set()
  const deliveries = []
  st.forEach((x, si) => {
    const b = (byState[x.fips] = { dollars: 0, units: 0, peopleHoused: 0, needScore: x.need, rank: 0, shortage: fin(x.s.eliUnitShortage) ? x.s.eliUnitShortage : null, shortageClosedPct: null, driver: detail.drivers[x.fips], excluded: x.excluded })
    if (fin(x.s.eliUnitShortage)) shortageSum += Math.max(x.s.eliUnitShortage, 0)
    ivs.forEach((iv, ii) => {
      const d = dollars[si][ii]
      if (!(d > 0)) return
      const units = Math.floor(d / x.costs[ii] + 1e-9)
      const people = units * x.hhSize
      allocations.push({ fips: x.fips, interventionId: iv.id, dollars: d, units, peopleHoused: people, needScore: x.need, costPerUnit: x.costs[ii] })
      b.dollars += d; b.units += units; b.peopleHoused += people
      const bi = byIntervention[iv.id]
      bi.dollars += d; bi.units += units; bi.peopleHoused += people
      totalSpent += d; totalUnits += units; peopleHoused += people
      if (fin(iv.monthsToOccupancy)) deliveries.push([iv.monthsToOccupancy, units])
      else nullMonths.add(iv.name ?? iv.id)
    })
    if (b.shortage) b.shortageClosedPct = (b.units / b.shortage) * 100
  })
  Object.keys(byState)
    .sort((a, c) => byState[c].dollars - byState[a].dollars || byState[c].needScore - byState[a].needScore || (a < c ? -1 : 1))
    .forEach((f, i) => { byState[f].rank = i + 1 })

  const maxMonth = deliveries.reduce((m, [mo]) => Math.max(m, mo), 0)
  const timeline = []
  for (let m = 0; m <= maxMonth; m++) timeline.push({ month: m, units: deliveries.reduce((a, [mo, u]) => a + (mo <= m ? u : 0), 0) })

  const notes = [...ctx.notes, ...extraNotes]
  if (nullMonths.size) notes.push(`No months-to-occupancy for ${[...nullMonths].join(', ')}; those units are left out of the timeline.`)
  return {
    totalBudget: budget,
    totalSpent,
    totalUnits,
    peopleHoused,
    avgCostPerUnit: totalUnits ? totalSpent / totalUnits : null,
    shortageClosedPct: shortageSum > 0 ? (totalUnits / shortageSum) * 100 : null,
    allocations,
    byState,
    byIntervention,
    needScores: detail.scores,
    needComponents: detail.components,
    missingData: detail.missing,
    timeline,
    explanation: notes,
  }
}

const money = (d) => (d >= 1e9 ? `$${(d / 1e9).toFixed(2)}B` : d >= 1e6 ? `$${(d / 1e6).toFixed(1)}M` : `$${Math.round(d).toLocaleString('en-US')}`)

/** Name of the lens whose weights match, or null. */
function lensFor(weights) {
  for (const [k, l] of Object.entries(LENSES)) {
    if (COMPONENTS.every((c) => Math.abs((l.weights[c] ?? 0) - (weights?.[c] ?? 0)) < 1e-9)) return k
  }
  return null
}

/**
 * Greedy diminishing-returns allocation.
 * @param {object} p
 * @param {number} p.budget                     total dollars
 * @param {object} p.states                     states.json `states`
 * @param {Array}  p.interventions              interventions.json `interventions`
 * @param {object} p.weights                    { shortage, homelessness, rentBurden, costEfficiency }
 * @param {string[]} [p.enabledInterventions]   ids; default all
 * @param {string[]} [p.excludedFips]
 * @param {number} [p.maxSharePerState]         0..1 cap of budget to one state; default 0.25
 * @param {number} [p.maxSharePerIntervention]  0..1 cap of budget to one intervention; default 0.6
 *                                              (raised to 1/nEnabled when fewer interventions are on)
 * @param {number} [p.chunks]                   number of budget chunks; default 1000
 * @param {number} [p.alpha]                    diminishing-returns exponent; default 1
 * @param {'tdc'|'subsidyGap'} [p.costBasis]    dollars per unit = full development cost, or public subsidy gap
 * @param {object} [p.financeAssumptions]       overrides for FINANCE_DEFAULTS (subsidyGap basis)
 * @returns {object} contract result plus needComponents, missingData, timeline, settings
 */
export function allocateBudget(params) {
  const ctx = prepare(params)
  const { budget, ivs, st } = ctx
  const chunks = Math.max(Math.round(params.chunks ?? ENGINE_DEFAULTS.chunks), 1)
  const alpha = fin(params.alpha) ? Math.max(params.alpha, 0) : ENGINE_DEFAULTS.alpha
  const shareState = Math.min(Math.max(params.maxSharePerState ?? ENGINE_DEFAULTS.maxSharePerState, 0), 1)
  const requestedIvShare = Math.min(Math.max(params.maxSharePerIntervention ?? ENGINE_DEFAULTS.maxSharePerIntervention, 0), 1)
  const shareIv = ivs.length ? Math.max(requestedIvShare, 1 / ivs.length) : requestedIvShare
  const extra = []
  if (ivs.length && shareIv > requestedIvShare) extra.push(`Only ${ivs.length} intervention(s) enabled, so the per-intervention cap was raised to ${Math.round(shareIv * 100)}% to let the full budget be spent.`)

  const nS = st.length
  const nI = ivs.length
  const dollars = st.map(() => new Array(nI).fill(0))
  const filled = new Float64Array(nS)
  const stateSpent = new Float64Array(nS)
  const ivSpent = new Float64Array(nI)
  const stateCap = budget * shareState
  const ivCap = budget * shareIv
  const chunk = budget / chunks
  const perm = ivs.map((i) => (fin(i.permanence) ? Math.max(i.permanence, 0) : 1))
  const active = []
  for (let si = 0; si < nS; si++) if (!st[si].excluded) active.push(si)

  let left = budget
  const maxIter = chunks * 5 + nS * nI
  for (let iter = 0; iter < maxIter && left > 0.5; iter++) {
    let bestS = -1
    let bestI = -1
    let bestV = -Infinity
    let bestAmt = 0
    for (const si of active) {
      const x = st[si]
      const room = x.shortage - filled[si]
      if (room <= 1e-9) continue
      const stateRoom = stateCap - stateSpent[si]
      if (stateRoom < 1) continue
      const decay = x.shortage === Infinity || alpha === 0 ? 1 : Math.pow(1 - filled[si] / x.shortage, alpha)
      const base = (x.need + EPS_NEED) * decay
      for (let ii = 0; ii < nI; ii++) {
        const ivRoom = ivCap - ivSpent[ii]
        if (ivRoom < 1) continue
        const cost = x.costs[ii]
        const v = (base * perm[ii]) / cost
        if (v <= bestV) continue
        const amt = Math.min(chunk, left, stateRoom, ivRoom, room * cost)
        if (amt < 1) continue
        bestV = v; bestS = si; bestI = ii; bestAmt = amt
      }
    }
    if (bestS < 0) break
    dollars[bestS][bestI] += bestAmt
    filled[bestS] += bestAmt / st[bestS].costs[bestI]
    stateSpent[bestS] += bestAmt
    ivSpent[bestI] += bestAmt
    left -= bestAmt
  }

  const result = buildResult(ctx, dollars, extra)
  result.settings = { maxSharePerState: shareState, maxSharePerIntervention: shareIv, chunks, alpha, costBasis: params.costBasis ?? ENGINE_DEFAULTS.costBasis }
  result.explanation = [...explain(ctx, result, { shareState, shareIv }), ...result.explanation]
  return result
}

/** Why-bullets for the top of the explanation list. */
function explain(ctx, r, { shareState, shareIv }) {
  const out = []
  const w = ctx.weights ?? {}
  const lensKey = lensFor(w)
  const wsum = COMPONENTS.reduce((a, k) => a + Math.max(w[k] ?? 0, 0), 0) || 1
  const top = [...COMPONENTS].sort((a, b) => (w[b] ?? 0) - (w[a] ?? 0))[0]
  out.push(`${lensKey ? `${LENSES[lensKey].label} lens` : 'Custom weights'}: ${COMPONENT_LABELS[top]} carries the most weight (${Math.round(((w[top] ?? 0) / wsum) * 100)}%).`)
  if (!r.totalSpent) {
    out.push('Nothing was allocated: no eligible state and intervention combination (check exclusions and enabled interventions).')
    return out
  }
  const ranked = Object.entries(r.byState).filter(([, b]) => b.dollars > 0).sort((a, b) => a[1].rank - b[1].rank)
  for (const [fips, b] of ranked.slice(0, 3)) {
    const s = ctx.st.find((x) => x.fips === fips).s
    const capped = b.dollars >= ctx.budget * shareState - 1 ? ' (hit the state share cap)' : ''
    out.push(`${s.name ?? fips} gets ${money(b.dollars)} for ${b.units.toLocaleString('en-US')} units${capped}: need score ${b.needScore.toFixed(2)}, driven mostly by ${COMPONENT_LABELS[b.driver] ?? 'n/a'}.`)
  }
  out.push(`${ranked.length} states funded. ${r.totalUnits.toLocaleString('en-US')} units at an average ${money(r.avgCostPerUnit ?? 0)} each${r.shortageClosedPct !== null ? ` close ${r.shortageClosedPct.toFixed(2)}% of the national ELI shortage` : ''}.`)
  const mix = Object.entries(r.byIntervention).filter(([, b]) => b.dollars > 0).sort((a, b) => b[1].dollars - a[1].dollars)
  if (mix.length) {
    const [id, b] = mix[0]
    const iv = ctx.ivs.find((i) => i.id === id)
    const capped = b.dollars >= ctx.budget * shareIv - 1 ? ', its share cap' : ''
    out.push(`${iv.name ?? id} takes the largest share of dollars (${Math.round((b.dollars / r.totalSpent) * 100)}%${capped}) because it delivers the most need-weighted units per dollar.`)
  }
  const unspent = ctx.budget - r.totalSpent
  if (unspent > ctx.budget * 0.001) out.push(`${money(unspent)} left unallocated: the state, intervention and shortage caps all bind.`)
  const nMissing = Object.keys(r.missingData).length
  if (nMissing) out.push(`${nMissing} state(s) have missing metrics; their need scores reweight the remaining components (see missingData).`)
  return out
}

/**
 * Runs allocateBudget once per lens.
 * @param {object} params allocateBudget params (weights ignored)
 * @returns {Record<string, object>} { [lensKey]: result }, each result has `lens` and `lensLabel`
 */
export function compareLenses(params) {
  return Object.fromEntries(Object.entries(LENSES).map(([k, l]) => {
    const r = allocateBudget({ ...params, weights: l.weights })
    r.lens = k
    r.lensLabel = l.label
    return [k, r]
  }))
}

/**
 * Naive baseline: dollars split across non-excluded states in proportion to
 * population, then evenly across enabled interventions, capped at each
 * state's shortage. Same result shape as allocateBudget.
 * @param {object} params allocateBudget params
 * @returns {object}
 */
export function naiveBaseline(params) {
  const ctx = prepare(params)
  const { budget, ivs, st } = ctx
  const dollars = st.map(() => new Array(ivs.length).fill(0))
  const elig = st.map((x, si) => [x, si]).filter(([x]) => !x.excluded && fin(x.s.population) && x.s.population > 0)
  const popSum = elig.reduce((a, [x]) => a + x.s.population, 0)
  if (popSum > 0 && ivs.length) {
    for (const [x, si] of elig) {
      const per = (budget * (x.s.population / popSum)) / ivs.length
      let room = x.shortage
      ivs.forEach((iv, ii) => {
        const d = Math.min(per, room * x.costs[ii])
        dollars[si][ii] = d
        room -= d / x.costs[ii]
      })
    }
  }
  const r = buildResult(ctx, dollars, ['Naive baseline: dollars split by population, then evenly across interventions, capped at each state\'s shortage.'])
  r.explanation = r.explanation.slice(-1).concat(r.explanation.slice(0, -1))
  return r
}

/**
 * How much better the optimizer does than a baseline.
 * @param {object} result   allocateBudget result
 * @param {object} baseline naiveBaseline result
 * @returns {{ extraUnits: number, extraPeopleHoused: number, pct: number|null }} pct = extra people housed as % of baseline
 */
export function efficiencyGain(result, baseline) {
  const extraUnits = result.totalUnits - baseline.totalUnits
  const extraPeopleHoused = result.peopleHoused - baseline.peopleHoused
  return { extraUnits, extraPeopleHoused, pct: baseline.peopleHoused > 0 ? (extraPeopleHoused / baseline.peopleHoused) * 100 : null }
}

/**
 * One-at-a-time sensitivity: re-runs the allocator with `field` scaled by
 * (1 + delta). `field` is a numeric param (budget, maxSharePerState,
 * maxSharePerIntervention, alpha) or a weight as 'weights.<component>'.
 * @param {object} params
 * @param {string} field
 * @param {number[]} [deltas=[-0.2,-0.1,0,0.1,0.2]]
 * @returns {Array<{ delta: number, value: number, totalUnits: number, peopleHoused: number, shortageClosedPct: number|null, statesFunded: number }>}
 */
export function sensitivity(params, field, deltas = [-0.2, -0.1, 0, 0.1, 0.2]) {
  return deltas.map((delta) => {
    const p = { ...params, weights: { ...params.weights } }
    let value
    if (field.startsWith('weights.')) {
      const k = field.slice(8)
      value = (p.weights[k] ?? 0) * (1 + delta)
      p.weights[k] = value
    } else {
      const base = params[field] ?? ENGINE_DEFAULTS[field]
      value = base * (1 + delta)
      p[field] = value
    }
    const r = allocateBudget(p)
    return { delta, value, totalUnits: r.totalUnits, peopleHoused: r.peopleHoused, shortageClosedPct: r.shortageClosedPct, statesFunded: Object.values(r.byState).filter((b) => b.dollars > 0).length }
  })
}
