# Lepus Solutions allocation engine

*Powered by Lepus Analytics.* Source: `src/engine/allocate.js` and `src/engine/finance.js`. All functions are pure and run in the browser, so sliders re-run the full model on every change (about 4 ms for 51 states × 5 interventions × 1,000 budget chunks).

This page explains, for policy analysts, how the engine decides **where** (which states) and **how** (which building approach) a fixed budget for extremely low-income (ELI) housing is spent.

## 1. Need score (0 to 1 per state)

Each state gets four components, and each is normalized to 0..1 across all states:

| Component | Inputs | Normalization |
|---|---|---|
| `shortage` | Mean of `eliUnitShortage` (log scale) and `100 − affordableUnitsPer100Eli` (linear) | min-max |
| `homelessness` | `homelessPIT + unshelteredPIT` (unsheltered people count twice) | min-max on log(1+x) |
| `rentBurden` | `severelyRentBurdenedPct` | min-max |
| `costEfficiency` | 1 / expected cost per unit (mean over enabled interventions of `costPerUnit × constructionCostIndex` where `useCostIndex`) | min-max |

Counts use a log scale so that California does not flatten every other state toward zero. When every state has the same value (for example, a constant cost index), the component is a neutral 0.5 for everyone, so it ranks nobody.

**Lens weights** combine the components: `need = Σ wₖ·cₖ / Σ wₖ`, summed over the components that are not null **for that state**. A missing metric does not count as zero. It drops out, and the state is scored on the remaining weights. Every missing field is listed in `missingData[fips]`. Each state's `driver` is the component that contributes most to its score.

| Lens (Lepus portal analogue) | shortage | homelessness | rentBurden | costEfficiency |
|---|---|---|---|---|
| Planner (owner) | 0.35 | 0.25 | 0.25 | 0.15 |
| Budget Office (worker) | 0.20 | 0.10 | 0.10 | 0.60 |
| Community Advocate (tenant) | 0.30 | 0.45 | 0.25 | 0.00 |

## 2. Cost per unit

`cost(state, intervention) = costPerUnit × (useCostIndex ? constructionCostIndex ?? 1 : 1)`

When the index is null, the national average cost is used and `explanation` says so. When `costBasis: 'subsidyGap'`, the cost per unit becomes the public subsidy gap instead (see section 5).

## 3. Allocation: greedy marginal impact with diminishing returns

The budget is split into `chunks` (default 1,000). Each chunk goes to the (state, intervention) pair with the highest value per dollar:

```
value per $ = (need_s) × (1 − filled_s / shortage_s)^α × permanence_i / cost_{s,i}
```

* `filled_s` counts units already funded in the state, across all interventions. As a state's shortage fills, its next unit is worth less, which is the diminishing-returns term (`alpha`, default 1).
* Constraints are applied to every chunk:
  * units in a state never exceed `eliUnitShortage`
  * dollars per state stay at or below `maxSharePerState × budget` (default 25%)
  * dollars per intervention stay at or below `maxSharePerIntervention × budget` (default 60%). Rehab and conversion stock is finite, so the mix stays diversified. When fewer than 1/cap interventions are enabled, the cap rises to `1/nEnabled` so the budget can still be spent, and the explanation says so.
  * `excludedFips` get $0, and only `enabledInterventions` are used
* Ties are broken by FIPS order, then intervention order, so the output is deterministic.
* When a state's shortage is null, the state has no unit cap and no decay, only the share cap. This is flagged.

This is the standard greedy algorithm for a separable concave objective with linear budget constraints. It is near-optimal at chunk resolution, but the side caps (state and intervention share) can make it slightly sub-optimal in edge cases.

At realistic budgets (around $1B, so about 6,000 units against a shortage of about 7 million units), `filled/shortage` stays small, so the decay is weak, and the state share cap mostly drives the spread across states. Raise `alpha` (try 10 to 20) or lower `maxSharePerState` to fund more states.

## 4. Outputs

Contract fields: `totalBudget, totalSpent, totalUnits, peopleHoused, avgCostPerUnit, shortageClosedPct, allocations[], byState{}, byIntervention{}, needScores{}, explanation[]`.

Added fields:

* `shortageClosedPct = totalUnits / Σ eliUnitShortage × 100` (the sum covers non-null shortages)
* `timeline: [{ month, units }]`: cumulative units ready for occupancy, from 0 to the longest `monthsToOccupancy`. Interventions with a null value are left out and noted.
* `missingData: { [fips]: string[] }`, plus `needComponents: { [fips]: { shortage, homelessness, rentBurden, costEfficiency } }`
* `peopleHoused = units × avgRenterHouseholdSize`. When that is null, the fallback is the renter-household-weighted national mean computed from the data, and this is noted.
* `allocations[].costPerUnit`; `byState[fips]` also has `shortage, shortageClosedPct, driver, excluded`; `byIntervention[id].peopleHoused`
* `settings`: the effective caps, `chunks`, `alpha` and `costBasis` actually used

Other exports:

* `compareLenses(params)` returns `{ balanced, budget, community }`, one full result per lens, each with `lens` and `lensLabel`
* `naiveBaseline(params)`: dollars split by population, then evenly across enabled interventions, capped at shortage. It has the same result shape.
* `efficiencyGain(result, baseline)` returns `{ extraUnits, extraPeopleHoused, pct }`
* `sensitivity(params, field, deltas)`: re-runs the allocator with `field` scaled by `(1+delta)`. `field` is `budget`, `maxSharePerState`, `maxSharePerIntervention`, `alpha` or `weights.<component>`.
* `scoreNeed`, `scoreNeedDetailed`, `needComponents`, `LENSES`, `COMPONENTS`, `COMPONENT_LABELS`, `ENGINE_DEFAULTS`

## 5. Development finance (`finance.js`, ported from Lepus Analytics underwriting)

`monthlyPayment`, `loanBalance` and `irr` (bisection on NPV) are straight ports of the Lepus Analytics underwriting model. `makeSubsidyScreen` follows the design of Lepus's O(1) `makeScreen`: assumptions are fixed once, so each per-unit evaluation takes only a few multiplications.

The investor question ("what price clears my DSCR?") becomes the funder's question: **how much subsidy does one affordable unit need?**

```
rent            = medianHouseholdIncome × amiPct × rentToIncomePct / 12   (PROXY, see below)
NOI             = rent × 12 × (1 − vacancy) − opexPerUnitAnnual
supportableDebt = max(NOI / DSCR, 0) / (annual debt service per $1 of loan)
subsidyGap      = max(TDC − supportableDebt, TDC × minSubsidySharePct)
```

`allocateBudget({ costBasis: 'subsidyGap', financeAssumptions })` uses `subsidyGap` as the dollars per unit. It answers "how many units can our *subsidy* dollars unlock when private permanent debt covers the rest?" At 30%-of-income rents, NOI is close to opex, so the gap is close to full cost. This is the well-known reason ELI units need deep subsidy.

**Proxy warning:** `affordableRent` uses state median *household* income (ACS B19013), which is **not** HUD Area Median Income. HUD AMI is family-based, set at the county or metro level, and adjusted for household size. Treat the resulting rents as order-of-magnitude figures.

### `FINANCE_DEFAULTS`

| Key | Default | Basis |
|---|---|---|
| `amiPct` | 30 | Source: HUD's ELI definition, ≤30% of AMI (24 CFR 5.603). NLIHC "The Gap" uses the same cutoff. |
| `rentToIncomePct` | 30 | Source: HUD's affordability standard (cost burden above 30% of income), the same threshold as ACS B25070 |
| `termYears` | 40 | Source: HUD/FHA Section 221(d)(4) multifamily loans amortize over up to 40 years |
| `interestRate` | 6.5% | **User-editable assumption** |
| `dscr` | 1.15 | **User-editable assumption** |
| `vacancyPct` | 5% | **User-editable assumption** |
| `opexPerUnitAnnual` | $6,500 | **User-editable assumption** |
| `minSubsidySharePct` | 5% | **User-editable assumption** (floor on public dollars per unit, so a self-supporting unit is never treated as free) |

The dashboard should show the assumption rows as editable inputs, in the style of the Lepus AssumptionsPanel.

## 6. Assumptions and limitations

* State-level averages hide large within-state variation, especially between metro and rural areas.
* Cost per unit is a national figure scaled by one state index. It ignores land, local regulation and project size.
* "Units" means units funded. Delivery depends on pipeline capacity, which is not modeled except through `monthsToOccupancy`.
* `peopleHoused` assumes each unit houses an average renter household, which may overstate figures for single-adult supportive housing.
* Homelessness counts are a one-night point-in-time count, which undercounts people who are doubled up.
* Need weights are value judgments. The lenses make that explicit, and they are not empirical estimates.
* The naive baseline is a strawman (population share). A fairer comparison would be the current HUD formula allocations.
