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
| constructionCostIndex | HUD PIH, *2024 Unit Total Development Cost (TDC) Limits* | https://www.hud.gov/sites/dfiles/PIH/documents/2024_Units_TDC_Limits.pdf | 2024 (report dated 11/5/2024; latest posted on https://www.hud.gov/helping-americans/public-indian-housing-capfund as of 2026-10-29) | For every locality in the PDF, take the "Walkup" row, 2-bedroom TDC column (sixth number on the row). State value = unweighted mean of its localities. National = ACS-population-weighted mean of the 51 state values ($289,846). Index = state / national, 3 decimals. Range: AR/MS 0.855 to HI 1.295. Reproduce with `node scripts/build-cost-index.mjs tdc-walkup-2br.json --write` | TDC limits are HUD caps for public housing (built from RSMeans and Marshall & Swift cost data), not observed project costs. Localities are HUD-chosen cities, so the state mean is not population-weighted within a state. Spot check: Boston walk-up 2BR TDC = $349,184 |

## Interventions (`src/data/interventions.json`)

| id | costPerUnit | monthsToOccupancy | Source | Vintage | Caveats |
|---|---|---|---|---|---|
| new-construction | $190,804 | null | Abt Associates for NCSHA, *Variation in Development Costs for LIHTC Projects* (2018), Exhibit 3-11, New Construction median: https://ncsha.org/wp-content/uploads/2018/09/Final-LIHTC-Costs-Analysis_2018_08_31.pdf | Placed in service 2011-2016, constant 2016 dollars (RS Means index) | Was $164,757 (median for all LIHTC projects, new + rehab). Now the new-construction-only median from the same table. 2016 dollars, so it understates current cost |
| acquisition-rehab | $131,074 | null | Same report, Exhibit 3-11, Acquisition-Rehab median | same | Includes acquisition. Adds affordable stock only if the building was not already affordable |
| permanent-supportive-housing | $229,711 | null | Same report, Exhibit 3-16 "Per unit TDC by target population", Homeless median (107 projects, 7,586 units) | same | Capital cost only, excludes services and operating subsidy. Mix of new construction and rehab |
| hotel-conversion | $139,000 | 3 | Cost: CA Senate background paper citing HCD, Oct 30, 2020: https://shou.senate.ca.gov/sites/shou.senate.ca.gov/files/Project%20Roomkey%20and%20Project%20Homekey%2010.30.20.pdf. Timeline: HCD Homekey webinar, July 24, 2020: https://www.hcd.ca.gov/sites/default/files/docs/grants-and-funding/homekey/homekey-webinar-slide-deck-07-24-2020.pdf ("Tier 1 ... can be occupied 90 days from the time the property is acquired or leased") | Homekey Round 1 (2020) | State award per unit only (excludes local match); California-only. 90 days entered as 3 months; it is a program eligibility target, not a measured outcome |
| modular | not included | | | | No source with an actual national per-unit cost found (only percent-savings claims) |
| adu | not included | | | | Not researched within the time box |

`monthsToOccupancy` stays `null` for the three LIHTC types: no published national median timeline was found.

## How to refresh

1. **ACS**: `node scripts/fetch-census.mjs 2025` (next vintage). With `CENSUS_API_KEY` set it uses api.census.gov; without a key it uses the keyless data.census.gov table API (api.census.gov now rejects keyless requests).
2. **NLIHC Gap**: download `https://nlihc.org/gap/state/{xx}` for each state. From each page, take the ELI renter households, the "Surplus (Deficit)" row, and the "per 100" row at the ELI threshold, and check that the selected year is the latest. Save as `{ "CA": { eli, aa, surplus, per100 } }`.
3. **HUD PIT**: from the new AHAR Part 1 PDF, Appendix A state profiles ("Total Homeless, YYYY", "Sheltered (n)", "Unsheltered (n)"), or from HUD's "PIT Estimates by State" spreadsheet on huduser.gov. Save as `{ "California": { total, sheltered, unsheltered } }`.
4. `node scripts/merge-gap-pit.mjs nlihc.json pit.json`, then update the `sources` entries and `meta.updated`.
5. **HUD TDC cost index**: download the newest "Total Development Cost Limits" PDF from https://www.hud.gov/helping-americans/public-indian-housing-capfund. Extract each locality's "Walkup" row, 2BR TDC (sixth number), into `{ "STATE NAME": { "LOCALITY": tdc } }` (state headings are the lines followed by another heading; locality headings are followed by building-type rows; skip Guam, Puerto Rico, Virgin Islands). Then run `node scripts/build-cost-index.mjs that.json --write` and update the `hud-tdc-2024` source entry.
