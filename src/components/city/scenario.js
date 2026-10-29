// Pure helpers for the city view: the fair-housing (need <-> opportunity) blend, scenario metrics for
// A/B compare and the council brief, explanation cleanup, and the shareable URL hash. No React.

export const AFFH_RULE_URL = 'https://www.federalregister.gov/documents/2015/07/16/2015-17032/affirmatively-furthering-fair-housing'
export const AFFH_REPEAL_URL = 'https://www.hud.gov/news/hud-no-25-034'
export const LIHTC_DB_URL = 'https://www.huduser.gov/portal/datasets/lihtc.html'

const fin = (v) => typeof v === 'number' && Number.isFinite(v)

/** v -> 0..1 linear min-max over the finite values given (null for non-finite input). */
function minmax(values) {
  const xs = values.filter(fin)
  if (!xs.length) return () => null
  const lo = Math.min(...xs)
  const hi = Math.max(...xs)
  const r = hi - lo
  return (v) => (fin(v) ? (r < 1e-12 ? 0.5 : (v - lo) / r) : null)
}

/**
 * Existing LIHTC units in a tract (HUD LIHTC database join). `existingLihtcUnits` is null when any project
 * lacks a unit count; then the reported-unit sum is used, which is a LOWER BOUND.
 */
export const lihtcUnits = (t) => (fin(t?.existingLihtcUnits) ? t.existingLihtcUnits : fin(t?.existingLihtcUnitsReported) ? t.existingLihtcUnitsReported : null)

/** Display text: "440" or "440 units reported (1 project with no unit count)". */
export function lihtcLabel(t) {
  if (fin(t?.existingLihtcUnits)) return Math.round(t.existingLihtcUnits).toLocaleString()
  if (!fin(t?.existingLihtcUnitsReported)) return null
  const n = t.existingLihtcProjectsUnitsUnreported ?? 0
  return `${Math.round(t.existingLihtcUnitsReported).toLocaleString()} units reported${n ? ` (${n} project${n === 1 ? '' : 's'} with no unit count)` : ''}`
}

/** True when any tract carries existing LIHTC unit data. */
export const hasLihtc = (tracts = {}) => Object.values(tracts).some((t) => lihtcUnits(t) != null)

/**
 * Opportunity component per tract, 0..1: 1 = lowest poverty rate in the jurisdiction, 0 = highest
 * (linear min-max of ACS povertyRate, inverted). With `avoidLihtc`, it is multiplied by
 * (1 - min-max of existing LIHTC units per renter household), so the most saturated tract gets 0.
 * That penalty shape is a MODEL ASSUMPTION, not a sourced factor.
 */
export function opportunityScores(areas, { avoidLihtc = false, tracts = {} } = {}) {
  const list = Object.values(areas)
  const nPov = minmax(list.map((a) => a.povertyRate))
  const lihtcShare = (a) => {
    const u = lihtcUnits(tracts[a.fips])
    return fin(u) && fin(a.renterHouseholds) && a.renterHouseholds > 0 ? u / a.renterHouseholds : fin(u) ? 0 : null
  }
  const nLihtc = minmax(list.map(lihtcShare))
  const out = {}
  for (const a of list) {
    const p = nPov(a.povertyRate)
    if (p == null) { out[a.fips] = null; continue }
    let o = 1 - p
    if (avoidLihtc) { const l = nLihtc(lihtcShare(a)); if (l != null) o *= 1 - l }
    out[a.fips] = o
  }
  return out
}

/**
 * Engine inputs for a need/opportunity blend t in 0..1 (0 = the engine's own need score, unchanged).
 * The engine computes need from area fields, so the opportunity component is carried in the
 * homelessness slot, which is null for every tract (no tract-level PIT data exists):
 * homelessPIT = expm1(opp) undoes the engine's log1p normalization, so that component equals `opp`.
 * The lens's shortage / rent-burden weights are scaled to (1 - t) and the carrier gets t.
 * Returns { states, weights } for allocateBudget; display code keeps using the original areas.
 */
export function blendInputs(areas, lensWeights, t, opp) {
  if (!(t > 0)) return { states: areas, weights: lensWeights }
  const ws = Math.max(lensWeights?.shortage ?? 0, 0)
  const wr = Math.max(lensWeights?.rentBurden ?? 0, 0)
  const [fs, fr] = ws + wr > 0 ? [ws / (ws + wr), wr / (ws + wr)] : [0.5, 0.5]
  const weights = { shortage: (1 - t) * fs, rentBurden: (1 - t) * fr, homelessness: t, costEfficiency: 0 }
  const states = {}
  for (const [k, a] of Object.entries(areas)) {
    const o = opp[a.fips]
    states[k] = { ...a, homelessPIT: fin(o) ? Math.expm1(o) : null, unshelteredPIT: null }
  }
  return { states, weights }
}

/** Fix engine wording for tract scale and for the blend carrier (engine strings are not edited here). */
export function cleanExplanation(lines = [], { t = 0, lensLabel = '' } = {}) {
  const pct = Math.round(t * 100)
  return lines.filter((s) => !/have missing metrics/.test(String(s))).map((s, i) => {
    let x = String(s).replace(/\$\{ctx\.noun\}/g, 'tract').replace(/ELI unit shortage/g, 'severe-burden unit shortage (ACS proxy)')
    if (t > 0) {
      if (i === 0 && /^(Custom weights|.+ lens):/.test(x)) x = `${lensLabel} lens, blended ${100 - pct}% need / ${pct}% opportunity (low poverty). The blend is a policy choice, not data.`
      x = x.replace(/need score (\d)/g, 'priority score $1')
      x = x.replace(/driven mostly by homelessness/g, 'driven mostly by the opportunity (low-poverty) component')
    }
    return x
  })
}

/** Median of finite values, or null. */
export function median(values) {
  const xs = values.filter(fin).sort((a, b) => a - b)
  if (!xs.length) return null
  const m = Math.floor(xs.length / 2)
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2
}

/**
 * High-opportunity tract = poverty rate below the jurisdiction's median tract poverty rate.
 * A definition chosen for this tool (relative, unit-free), not an official HUD designation.
 */
export function highOpportunitySet(areas) {
  const med = median(Object.values(areas).map((a) => a.povertyRate))
  if (med == null) return new Set()
  return new Set(Object.values(areas).filter((a) => fin(a.povertyRate) && a.povertyRate < med).map((a) => a.fips))
}

/** Headline metrics for a plan, shared by the compare panel and the brief. */
export function scenarioMetrics(result, areas, highOpp) {
  if (!result) return null
  const by = result.byState ?? {}
  const spent = result.totalSpent || 0
  let qct = 0
  let hi = 0
  let funded = 0
  const dollars = {}
  for (const [g, s] of Object.entries(by)) {
    if (!(s.dollars > 0)) continue
    funded += 1
    dollars[g] = s.dollars
    if (areas[g]?.isQCT) qct += s.dollars
    if (highOpp.has(g)) hi += s.dollars
  }
  return {
    units: result.totalUnits,
    people: result.peopleHoused,
    spent,
    funded,
    qctPct: spent ? (100 * qct) / spent : null,
    highOppPct: spent ? (100 * hi) / spent : null,
    dollars,
  }
}

/** Tracts whose dollars differ most between two dollar maps: [{ geoid, a, b, delta }]. */
export function topDiffs(aDollars = {}, bDollars = {}, n = 8) {
  const ids = new Set([...Object.keys(aDollars), ...Object.keys(bDollars)])
  return [...ids]
    .map((g) => ({ geoid: g, a: aDollars[g] ?? 0, b: bDollars[g] ?? 0 }))
    .map((r) => ({ ...r, delta: r.b - r.a }))
    .filter((r) => Math.abs(r.delta) >= 1)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
    .slice(0, n)
}

// ---------- URL hash (c-prefixed keys; App.jsx owns b,l,w,x,e,s) ----------

export const CITY_KEYS = ['view', 'cid', 'cb', 'cl', 'cc', 'co', 'cq', 'cv', 'cd', 'cx', 'ca']

/** Reads the city scenario from location.hash. Unknown / invalid values come back null. */
export function readCityHash(hash = typeof window !== 'undefined' ? window.location.hash : '') {
  try {
    const p = new URLSearchParams(String(hash).replace(/^#/, ''))
    const num = (k) => (p.get(k) !== null && p.get(k) !== '' && Number.isFinite(Number(p.get(k))) ? Number(p.get(k)) : null)
    const list = (k) => (p.get(k) ? p.get(k).split(',').filter(Boolean) : null)
    const flag = (k) => (p.get(k) === '1' ? true : p.get(k) === '0' ? false : null)
    const b = num('cb')
    const c = num('cc')
    const o = num('co')
    return {
      isCity: p.get('view') === 'city',
      cityId: /^\d{5}$/.test(p.get('cid') ?? '') ? p.get('cid') : null,
      budget: b != null && b > 0 ? b : null,
      lens: p.get('cl') || null,
      cap: c != null && c >= 2 && c <= 50 ? c / 100 : null,
      opp: o != null && o >= 0 && o <= 100 ? o / 100 : null,
      qctOnly: flag('cq'),
      vacancyCap: flag('cv'),
      disabledIv: list('cd'),
      excluded: list('cx')?.filter((g) => /^\d{11}$/.test(g)) ?? null,
      avoidLihtc: flag('ca'),
    }
  } catch {
    return { isCity: false }
  }
}

/** Merges the city scenario into an existing hash string, keeping App's keys. Returns "#...". */
export function writeCityHash(s, hash = '') {
  const p = new URLSearchParams(String(hash).replace(/^#/, ''))
  for (const k of CITY_KEYS) p.delete(k)
  p.set('view', 'city')
  if (s.cityId) p.set('cid', s.cityId)
  p.set('cb', String(Math.round(s.budget)))
  p.set('cl', s.lens)
  p.set('cc', String(Math.round(s.cap * 100)))
  if (s.opp > 0) p.set('co', String(Math.round(s.opp * 100)))
  if (s.qctOnly) p.set('cq', '1')
  if (!s.vacancyCap) p.set('cv', '0')
  if (s.disabledIv?.length) p.set('cd', s.disabledIv.join(','))
  if (s.excluded?.length) p.set('cx', s.excluded.join(','))
  if (s.avoidLihtc) p.set('ca', '1')
  return `#${p.toString().replace(/%2C/g, ',')}`
}

/** Removes the city keys (on unmount, so the states tab gets a clean hash). */
export function stripCityHash(hash = '') {
  const p = new URLSearchParams(String(hash).replace(/^#/, ''))
  for (const k of CITY_KEYS) p.delete(k)
  const s = p.toString()
  return s ? `#${s}` : ''
}
