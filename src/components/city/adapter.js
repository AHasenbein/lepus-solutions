// Maps city tract records (public/cities/<id>.json) onto the engine's "area" schema
// so allocateBudget() runs unchanged at tract scale. Pure functions, no React.

const ACS_FIELDS = [
  'population', 'renterHouseholds', 'avgRenterHouseholdSize', 'medianHouseholdIncome', 'medianGrossRent',
  'rentBurdenedPct', 'severelyRentBurdenedPct', 'severelyBurdenedRenterHouseholds', 'povertyRate',
  'vacantUnits', 'vacantForRent', 'isQCT',
]

export const REHAB_ID = 'acquisition-rehab'

/** "Census Tract 1.01; Travis County; Texas" -> "1.01". Falls back to the 6-digit tract code. */
export function tractShortName(t) {
  const m = /Tract\s+([\d.]+)/i.exec(t?.name ?? '')
  if (m) return m[1]
  const code = String(t?.geoid ?? '').slice(5)
  return code ? `${Number(code.slice(0, 4))}.${code.slice(4)}` : '?'
}

/**
 * tracts -> { [geoid]: area } in the states.json schema.
 * eliUnitShortage is a PROXY: ACS severely cost-burdened renter households (50%+ of income on rent).
 * NLIHC ELI fields and HUD PIT counts do not exist at tract level, so they are null and the
 * engine renormalizes its weights over the fields that are present.
 */
export function tractsToAreas(tracts = {}) {
  const out = {}
  for (const [key, t] of Object.entries(tracts)) {
    const geoid = t.geoid ?? key
    const area = { fips: geoid, abbr: tractShortName({ ...t, geoid }), name: t.name ?? `Tract ${geoid}` }
    for (const f of ACS_FIELDS) area[f] = t[f] ?? null
    area.eliUnitShortage = t.severelyBurdenedRenterHouseholds ?? null
    area.eliRenterHouseholds = null
    area.affordableUnitsPer100Eli = null
    area.homelessPIT = null
    area.unshelteredPIT = null
    area.constructionCostIndex = null
    out[geoid] = area
  }
  return out
}

/** Rebuilds totals / byState / byIntervention from an allocations array (same shape as the engine). */
export function summarize(base, allocations, areas) {
  const byState = {}
  const byIntervention = {}
  for (const a of allocations) {
    const s = (byState[a.fips] ??= { dollars: 0, units: 0, peopleHoused: 0, needScore: a.needScore ?? base.needScores?.[a.fips] ?? 0, rank: 0 })
    s.dollars += a.dollars; s.units += a.units; s.peopleHoused += a.peopleHoused ?? 0
    const b = (byIntervention[a.interventionId] ??= { dollars: 0, units: 0 })
    b.dollars += a.dollars; b.units += a.units
  }
  Object.keys(byState).sort((x, y) => byState[y].dollars - byState[x].dollars).forEach((f, i) => { byState[f].rank = i + 1 })
  const totalSpent = allocations.reduce((s, x) => s + x.dollars, 0)
  const totalUnits = allocations.reduce((s, x) => s + x.units, 0)
  const capSum = Object.values(areas).reduce((s, a) => s + (a.eliUnitShortage ?? 0), 0)
  return {
    ...base,
    totalSpent,
    totalUnits,
    peopleHoused: allocations.reduce((s, x) => s + (x.peopleHoused ?? 0), 0),
    avgCostPerUnit: totalUnits ? totalSpent / totalUnits : null,
    shortageClosedPct: capSum ? (100 * totalUnits) / capSum : base.shortageClosedPct ?? null,
    allocations,
    byState,
    byIntervention,
  }
}

/**
 * Real-world constraint: acquisition-rehab can only buy buildings that exist. Clamp rehab units in each
 * tract to its ACS vacant housing units (B25002). Dollars beyond the cap are released (not re-spent),
 * reported as `vacancyCapReleased` so the planner sees what the constraint costs.
 */
export function applyVacancyCap(result, areas) {
  let released = 0
  let cappedTracts = 0
  const allocations = result.allocations.map((a) => {
    if (a.interventionId !== REHAB_ID || !a.units) return a
    const vac = areas[a.fips]?.vacantUnits
    if (vac == null || a.units <= vac) return a
    const perUnit = a.dollars / a.units
    const units = Math.max(0, Math.floor(vac))
    const dollars = units * perUnit
    released += a.dollars - dollars
    cappedTracts += 1
    const perPerson = a.units ? (a.peopleHoused ?? 0) / a.units : 0
    return { ...a, units, dollars, peopleHoused: units * perPerson }
  })
  const out = summarize(result, allocations, areas)
  out.vacancyCapReleased = released
  out.vacancyCappedTracts = cappedTracts
  return out
}

/** Population-proportional split of the same dollars (fallback when the engine has no naiveBaseline export). */
export function populationBaselineUnits(budget, areas, interventions, excluded = []) {
  const iv = interventions[0]
  if (!iv) return null
  const list = Object.values(areas).filter((a) => !excluded.includes(a.fips))
  const pop = list.reduce((s, a) => s + (a.population ?? 0), 0)
  if (!pop) return null
  return list.reduce((s, a) => s + Math.floor((budget * (a.population ?? 0)) / pop / iv.costPerUnit), 0)
}

const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

/** CSV for council packets / GIS joins (join on GEOID). One row per tract with dollars and units by type. */
export function toCSV(result, areas, interventions) {
  const ids = interventions.map((i) => i.id)
  const rows = {}
  for (const a of result.allocations) {
    if (!a.dollars && !a.units) continue
    const r = (rows[a.fips] ??= { dollars: 0, units: 0, people: 0, byType: {} })
    r.dollars += a.dollars; r.units += a.units; r.people += a.peopleHoused ?? 0
    r.byType[a.interventionId] = (r.byType[a.interventionId] ?? 0) + a.units
  }
  const header = ['GEOID', 'tract', 'name', 'isQCT', 'needScore', 'dollars', 'units', 'peopleHoused', ...ids.map((id) => `units_${id}`)]
  const lines = [header.map(q).join(',')]
  Object.entries(rows)
    .sort((x, y) => y[1].dollars - x[1].dollars)
    .forEach(([geoid, r]) => {
      const a = areas[geoid] ?? {}
      lines.push([
        geoid, a.abbr, a.name, a.isQCT == null ? '' : a.isQCT ? 'Y' : 'N',
        (result.needScores?.[geoid] ?? 0).toFixed(4), Math.round(r.dollars), r.units, Math.round(r.people),
        ...ids.map((id) => r.byType[id] ?? 0),
      ].map(q).join(','))
    })
  return lines.join('\n')
}
