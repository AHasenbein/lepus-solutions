# Data sources: Lepus Solutions

Powered by Lepus Analytics. Every number in `src/data/states.json` and `src/data/interventions.json` comes from the public source listed here. Missing values are `null`, never estimated. Data accessed 2026-10-29.

## State fields (`src/data/states.json`, 50 states + DC, keyed by 2-digit FIPS; Puerto Rico excluded)

| Field | Source | URL | Vintage | Derivation | Caveats |
|---|---|---|---|---|---|
| population | Census ACS 5-year, B01003_001E | https://data.census.gov/table/ACSDT5Y2024.B01003 | 2020-2024 | Direct | 5-year average, not a point estimate; MOEs not stored |
| renterHouseholds | ACS 5-year, B25003_003E | https://data.census.gov/table/ACSDT5Y2024.B25003 | 2020-2024 | Renter-occupied housing units | |
| avgRenterHouseholdSize | ACS 5-year, B25010_003E | https://data.census.gov/table/ACSDT5Y2024.B25010 | 2020-2024 | Direct | |
| medianHouseholdIncome | ACS 5-year, B19013_001E | https://data.census.gov/table/ACSDT5Y2024.B19013 | 2020-2024 | Direct (2024 inflation-adjusted $) | All households, not just renters |
| medianGrossRent | ACS 5-year, B25064_001E | https://data.census.gov/table/ACSDT5Y2024.B25064 | 2020-2024 | Direct (monthly $) | |
| rentBurdenedPct | ACS 5-year, B25070 | https://data.census.gov/table/ACSDT5Y2024.B25070 | 2020-2024 | (\_007+\_008+\_009+\_010) / (\_001 − \_011) × 100, 1 decimal | Excludes "not computed" renters (no/negative income, no cash rent) |
| severelyRentBurdenedPct | ACS 5-year, B25070 | same | 2020-2024 | \_010 / (\_001 − \_011) × 100 | Same exclusion |
| eliRenterHouseholds | NLIHC, *The Gap* 2026 | https://nlihc.org/gap/state/{xx} | 2026 edition (2024 ACS PUMS) | "Extremely Low Income Renter Households" | ELI = income at or below the greater of 30% AMI or the poverty guideline |
| affordableUnitsPer100Eli | NLIHC, *The Gap* 2026 | same | same | "Affordable and Available Rental Units per 100 Households, At or below Extremely Low Income" | |
| eliUnitShortage | NLIHC, *The Gap* 2026 | same | same | −1 × "Surplus (Deficit) of Affordable and Available Rental Units, At or below EXTREMELY LOW INCOME" (positive = units short) | Checked: ELI households − affordable & available homes = deficit for all 51 |
| homelessPIT | HUD, 2025 AHAR Part 1, Appendix A state profiles | https://www.huduser.gov/portal/sites/default/files/pdf/2025-AHAR-Part-1.pdf | January 2025 PIT count | "Total Homeless, 2025" | PIT is a one-night count; methods vary by CoC. 51 states sum to 742,420 vs. 745,652 national (the difference is PR and territories) |
| unshelteredPIT | HUD, 2025 AHAR Part 1, Appendix A | same | January 2025 | "Unsheltered (n)" | Checked: sheltered + unsheltered = total for all 51 |
| constructionCostIndex | none | n/a | n/a | `null` for every state | No public per-state index was found and verified within the data sprint. The engine must treat `null` as "no adjustment". Candidate: HUD Total Development Cost limits by market area |

## Interventions (`src/data/interventions.json`)

| id | costPerUnit | Source | Vintage | Caveats |
|---|---|---|---|---|
| new-construction | $164,757 | Abt Associates for NCSHA, *Variation in Development Costs for LIHTC Projects* (2018), via https://nlihc.org/resource/report-analyzes-development-costs-lihtc-projects | Projects placed in service 2011-2016 | Median TDC for ALL LIHTC projects (new + rehab mix), nominal dollars; understates current new-build cost |
| hotel-conversion | $139,000 | CA Senate background paper citing HCD, Oct 30, 2020: https://shou.senate.ca.gov/sites/shou.senate.ca.gov/files/Project%20Roomkey%20and%20Project%20Homekey%2010.30.20.pdf | Homekey Round 1 (2020) | State award per unit only (excludes local match); California-only |
| acquisition-rehab | dropped | n/a | n/a | No verified national per-unit figure found |
| modular | dropped | n/a | n/a | No verified national per-unit figure found |

`monthsToOccupancy` is `null` for every intervention (no verified timeline source).

## How to refresh

1. **ACS**: `node scripts/fetch-census.mjs 2025` (next vintage). With `CENSUS_API_KEY` set it uses api.census.gov; without a key it uses the keyless data.census.gov table API (api.census.gov now rejects keyless requests).
2. **NLIHC Gap**: download `https://nlihc.org/gap/state/{xx}` for each state. From each page, take the ELI renter households, the "Surplus (Deficit)" row, and the "per 100" row at the ELI threshold, and check that the selected year is the latest. Save as `{ "CA": { eli, aa, surplus, per100 } }`.
3. **HUD PIT**: from the new AHAR Part 1 PDF, Appendix A state profiles ("Total Homeless, YYYY", "Sheltered (n)", "Unsheltered (n)"), or from HUD's "PIT Estimates by State" spreadsheet on huduser.gov. Save as `{ "California": { total, sheltered, unsheltered } }`.
4. `node scripts/merge-gap-pit.mjs nlihc.json pit.json`, then update the `sources` entries and `meta.updated`.
