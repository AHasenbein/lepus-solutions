// Affordable-housing development finance.
//
// Ported from Lepus Analytics underwriting (client/src/lib/underwrite.js and
// server/ml/underwriting.js): `monthlyPayment`, `loanBalance` and `irr` are
// straight ports, and `makeSubsidyScreen` follows the same idea as Lepus's
// O(1) `makeScreen`: with the assumptions fixed, year-one NOI and supportable
// debt are linear in rent, so each (state, intervention) pair costs a handful
// of multiplications. That keeps the allocator fast enough for live sliders.
//
// The investor question Lepus asks ("what price clears my DSCR?") is turned
// around for a government funder: "given an affordable rent, how much
// permanent debt can a unit carry, and how much subsidy must fill the rest?"

/**
 * Default finance assumptions. Each key either cites a source or is flagged
 * `assumption: true`, meaning a user-editable input (Lepus AssumptionsPanel
 * style) with no single authoritative value.
 * @type {Record<string, { value: number, label: string, source?: string, assumption?: boolean }>}
 */
export const FINANCE_DEFAULTS = {
  amiPct: {
    value: 30,
    label: 'Target income (% of area income)',
    source: 'HUD defines extremely low-income (ELI) households as earning at or below 30% of Area Median Income (24 CFR 5.603; NLIHC "The Gap" uses the same cutoff).',
  },
  rentToIncomePct: {
    value: 30,
    label: 'Affordable rent (% of income)',
    source: 'HUD affordability standard: housing costs at or below 30% of household income (HUD "Rental Burden" definition; ACS B25070 uses the same threshold).',
  },
  termYears: {
    value: 40,
    label: 'Permanent loan term (years)',
    source: 'HUD/FHA Section 221(d)(4) multifamily loans amortize over up to 40 years (HUD Multifamily Housing program description).',
  },
  interestRate: { value: 6.5, label: 'Permanent loan interest rate (%)', assumption: true },
  dscr: { value: 1.15, label: 'Required debt service coverage ratio', assumption: true },
  vacancyPct: { value: 5, label: 'Vacancy and collection loss (%)', assumption: true },
  opexPerUnitAnnual: { value: 6500, label: 'Operating expenses per unit per year ($)', assumption: true },
  minSubsidySharePct: {
    value: 5,
    label: 'Minimum public share of cost (% of TDC)',
    assumption: true,
  },
}

/** Plain `{ key: value }` view of FINANCE_DEFAULTS. */
export const financeDefaultValues = () =>
  Object.fromEntries(Object.entries(FINANCE_DEFAULTS).map(([k, v]) => [k, v.value]))

const num = (v, fallback) => (Number.isFinite(v) ? v : fallback)

/**
 * Monthly payment on a fully amortizing loan. Ported from Lepus Analytics underwriting.
 * @param {number} principal
 * @param {number} annualRatePct e.g. 6.5
 * @param {number} termYears
 * @returns {number}
 */
export const monthlyPayment = (principal, annualRatePct, termYears) => {
  if (principal <= 0) return 0
  const r = annualRatePct / 100 / 12
  const n = termYears * 12
  if (r === 0) return principal / n
  return (principal * r) / (1 - Math.pow(1 + r, -n))
}

/**
 * Remaining balance after `monthsPaid` payments. Ported from Lepus Analytics underwriting.
 * @returns {number}
 */
export const loanBalance = (principal, annualRatePct, termYears, monthsPaid) => {
  if (principal <= 0) return 0
  const r = annualRatePct / 100 / 12
  const pmt = monthlyPayment(principal, annualRatePct, termYears)
  if (r === 0) return Math.max(principal - pmt * monthsPaid, 0)
  const grown = principal * Math.pow(1 + r, monthsPaid)
  const paid = pmt * ((Math.pow(1 + r, monthsPaid) - 1) / r)
  return Math.max(grown - paid, 0)
}

/**
 * IRR by bisection on NPV; cash flows per period starting at t=0.
 * Ported from Lepus Analytics underwriting. Returns null when no sign change.
 * @param {number[]} cashFlows
 * @returns {number|null} rate as a fraction (0.08 = 8%)
 */
export const irr = (cashFlows) => {
  const npv = (rate) => cashFlows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0)
  let lo = -0.99
  let hi = 10
  let fLo = npv(lo)
  const fHi = npv(hi)
  if (Number.isNaN(fLo) || fLo * fHi > 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const fMid = npv(mid)
    if (Math.abs(fMid) < 1e-7) return mid
    if (fLo * fMid < 0) hi = mid
    else { lo = mid; fLo = fMid }
  }
  return (lo + hi) / 2
}

/**
 * Affordable monthly rent for a household at `amiPct` of income.
 * PROXY: state median household income (ACS B19013) is NOT HUD Area Median
 * Income (which is family-based, county/metro-level and household-size
 * adjusted). Treat the result as an order-of-magnitude rent, not a HUD limit.
 * @param {number|null} medianHouseholdIncome annual $
 * @param {number} [amiPct=30]
 * @param {number} [rentToIncomePct=30]
 * @returns {number|null} $/month, or null when income is unknown
 */
export function affordableRent(medianHouseholdIncome, amiPct = 30, rentToIncomePct = 30) {
  if (!Number.isFinite(medianHouseholdIncome)) return null
  return (medianHouseholdIncome * (amiPct / 100) * (rentToIncomePct / 100)) / 12
}

/**
 * O(1) screen in the style of Lepus `makeScreen`: precomputes the constants so
 * each call is a few multiplications.
 * @param {object} [input] overrides for FINANCE_DEFAULTS values
 * @returns {{ assumptions: object, noiAnnual: (rent:number)=>number, supportableDebt: (rent:number)=>number, gap: (costPerUnit:number, rent:number)=>number }}
 */
export function makeSubsidyScreen(input = {}) {
  const d = financeDefaultValues()
  const a = {}
  for (const k of Object.keys(d)) a[k] = num(input[k], d[k])
  a.termYears = Math.min(Math.max(Math.round(a.termYears), 1), 40)
  a.dscr = Math.max(a.dscr, 0.01)
  const rentToEgi = 12 * (1 - a.vacancyPct / 100)
  const annualDebtPerDollar = monthlyPayment(1, a.interestRate, a.termYears) * 12
  const minShare = a.minSubsidySharePct / 100
  const noiAnnual = (rent) => rent * rentToEgi - a.opexPerUnitAnnual
  const supportableDebt = (rent) => Math.max(noiAnnual(rent) / a.dscr / annualDebtPerDollar, 0)
  const gap = (costPerUnit, rent) =>
    Math.max(costPerUnit - supportableDebt(rent), costPerUnit * minShare)
  return { assumptions: a, noiAnnual, supportableDebt, gap }
}

/**
 * Subsidy gap for one unit: total development cost minus the permanent debt
 * the unit's NOI can support at the required DSCR.
 * @param {object} p
 * @param {number} p.costPerUnit         total development cost (TDC) per unit, $
 * @param {number} p.monthlyRent         affordable rent, $/month
 * @param {number} [p.vacancyPct]
 * @param {number} [p.opexPerUnitAnnual]
 * @param {number} [p.interestRate]      % per year
 * @param {number} [p.termYears]
 * @param {number} [p.dscr]
 * @returns {{ noiAnnual: number, supportableDebt: number, subsidyGap: number, debtSharePct: number }}
 *   `subsidyGap` is the raw gap (cost minus debt, floored at 0). The allocator
 *   additionally applies `minSubsidySharePct` via makeSubsidyScreen.
 */
export function subsidyGapPerUnit({ costPerUnit, monthlyRent, ...rest }) {
  const s = makeSubsidyScreen(rest)
  const noi = s.noiAnnual(monthlyRent)
  const debt = Math.min(s.supportableDebt(monthlyRent), costPerUnit)
  return {
    noiAnnual: noi,
    supportableDebt: debt,
    subsidyGap: Math.max(costPerUnit - debt, 0),
    debtSharePct: costPerUnit > 0 ? (debt / costPerUnit) * 100 : 0,
  }
}
