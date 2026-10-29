// CONTRACT STUB. The engine PR replaces the body; keep the exported names and result shape.
// See CONTRACTS.md for the full spec.

/** Lens presets mirror Lepus's stakeholder portals (owner / worker / tenant). */
export const LENSES = {
  balanced: { label: 'Planner', weights: { shortage: 0.35, homelessness: 0.25, rentBurden: 0.25, costEfficiency: 0.15 } },
  budget: { label: 'Budget Office', weights: { shortage: 0.2, homelessness: 0.1, rentBurden: 0.1, costEfficiency: 0.6 } },
  community: { label: 'Community Advocate', weights: { shortage: 0.3, homelessness: 0.45, rentBurden: 0.25, costEfficiency: 0 } },
}

/** Returns { [fips]: 0..1 } need score for every state. */
export function scoreNeed(states, weights) {
  const list = Object.values(states)
  const max = Math.max(...list.map((s) => s.eliUnitShortage ?? 0)) || 1
  return Object.fromEntries(list.map((s) => [s.fips, (s.eliUnitShortage ?? 0) / max]))
}

/**
 * @param {object} p
 * @param {number} p.budget                     total dollars
 * @param {object} p.states                     states.json `states`
 * @param {Array}  p.interventions              interventions.json `interventions`
 * @param {object} p.weights                    { shortage, homelessness, rentBurden, costEfficiency }
 * @param {string[]} [p.enabledInterventions]   ids; default all
 * @param {string[]} [p.excludedFips]
 * @param {number} [p.maxSharePerState]         0..1 cap of budget to one state; default 0.25
 */
export function allocateBudget({ budget, states, interventions, weights, enabledInterventions, excludedFips = [], maxSharePerState = 0.25 }) {
  const needScores = scoreNeed(states, weights)
  const ivs = interventions.filter((i) => !enabledInterventions || enabledInterventions.includes(i.id))
  const iv = ivs[0]
  const fipsList = Object.keys(states).filter((f) => !excludedFips.includes(f))
  const total = fipsList.reduce((a, f) => a + needScores[f], 0) || 1
  const allocations = fipsList.map((f) => {
    const dollars = Math.min(budget * (needScores[f] / total), budget * maxSharePerState)
    const units = iv ? Math.floor(dollars / iv.costPerUnit) : 0
    return { fips: f, interventionId: iv?.id, dollars, units, peopleHoused: units * (states[f].avgRenterHouseholdSize ?? 0), needScore: needScores[f] }
  })
  const byState = {}
  const byIntervention = {}
  for (const a of allocations) {
    const s = (byState[a.fips] ??= { dollars: 0, units: 0, peopleHoused: 0, needScore: a.needScore, rank: 0 })
    s.dollars += a.dollars; s.units += a.units; s.peopleHoused += a.peopleHoused
    const b = (byIntervention[a.interventionId] ??= { dollars: 0, units: 0 })
    b.dollars += a.dollars; b.units += a.units
  }
  Object.keys(byState).sort((x, y) => byState[y].dollars - byState[x].dollars).forEach((f, i) => { byState[f].rank = i + 1 })
  const totalSpent = allocations.reduce((a, x) => a + x.dollars, 0)
  const totalUnits = allocations.reduce((a, x) => a + x.units, 0)
  return {
    totalBudget: budget,
    totalSpent,
    totalUnits,
    peopleHoused: allocations.reduce((a, x) => a + x.peopleHoused, 0),
    avgCostPerUnit: totalUnits ? totalSpent / totalUnits : null,
    shortageClosedPct: null,
    allocations,
    byState,
    byIntervention,
    needScores,
    explanation: ['Stub allocator: proportional to ELI shortage, single intervention.'],
  }
}
