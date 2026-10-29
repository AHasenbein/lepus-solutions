// Null-safe formatting helpers shared by the dashboard.
export const NO_DATA = 'no data'

const ok = (n) => n != null && n !== '' && Number.isFinite(Number(n))

export function fmtMoney(n) {
  if (!ok(n)) return NO_DATA
  const v = Number(n)
  const a = Math.abs(v)
  if (a >= 1e9) return `$${(v / 1e9).toFixed(a >= 1e10 ? 1 : 2)}B`
  if (a >= 1e6) return `$${(v / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`
  if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}
export const fmtUSD = (n) => (ok(n) ? `$${Math.round(Number(n)).toLocaleString()}` : NO_DATA)
export const fmtNum = (n) => (ok(n) ? Math.round(Number(n)).toLocaleString() : NO_DATA)
export const fmtPct = (n, d = 1) => (ok(n) ? `${Number(n).toFixed(d)}%` : NO_DATA)
export const fmtDec = (n, d = 2) => (ok(n) ? Number(n).toFixed(d) : NO_DATA)
export const isNum = ok

/** Every state field shown in the detail panel, with a label and formatter. */
export const STATE_FIELDS = [
  { key: 'population', label: 'Population', fmt: fmtNum },
  { key: 'renterHouseholds', label: 'Renter households', fmt: fmtNum },
  { key: 'avgRenterHouseholdSize', label: 'Avg renter household size', fmt: (n) => fmtDec(n, 2) },
  { key: 'medianHouseholdIncome', label: 'Median household income', fmt: fmtUSD },
  { key: 'medianGrossRent', label: 'Median gross rent', fmt: fmtUSD },
  { key: 'rentBurdenedPct', label: 'Rent burdened (30%+)', fmt: (n) => fmtPct(n) },
  { key: 'severelyRentBurdenedPct', label: 'Severely rent burdened (50%+)', fmt: (n) => fmtPct(n) },
  { key: 'eliRenterHouseholds', label: 'ELI renter households', fmt: fmtNum },
  { key: 'affordableUnitsPer100Eli', label: 'Affordable units per 100 ELI', fmt: (n) => fmtDec(n, 0) },
  { key: 'eliUnitShortage', label: 'ELI unit shortage', fmt: fmtNum },
  { key: 'homelessPIT', label: 'Homeless (PIT count)', fmt: fmtNum },
  { key: 'unshelteredPIT', label: 'Unsheltered (PIT count)', fmt: fmtNum },
  { key: 'constructionCostIndex', label: 'Construction cost index', fmt: (n) => fmtDec(n, 2) },
]

export const WEIGHT_LABELS = {
  shortage: 'ELI unit shortage',
  homelessness: 'Homelessness',
  rentBurden: 'Severe rent burden',
  costEfficiency: 'Cost efficiency',
}

/** 0..1 need score -> 0..5 rating */
export const needRating = (s) => (ok(s) ? Math.max(0, Math.min(5, Math.round(Number(s) * 5))) : null)

/** Resolve a source id against the merged sources map. */
export const sourceFor = (sources, id) => (id && sources?.[id]) || null
