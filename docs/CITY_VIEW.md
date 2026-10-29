# City view (`src/components/city`)

The city-scale planner lets a local government pick its jurisdiction, see its census tracts, set a budget, and have the shared engine (`allocateBudget`) allocate dollars across tracts and building types.

## Mounting

```jsx
import CityView from './components/city/CityView.jsx'
<CityView />                                   // defaults: Austin / Travis County (48453)
<CityView initialCityId="06075" interventions={myInterventions} />
```

| Prop | Default | Notes |
| --- | --- | --- |
| `interventions` | `src/data/interventions.json` | Either the array or the whole `{ meta, interventions }` object |
| `initialCityId` | `'48453'` | Falls back to the first entry in `cities/index.json` if it's missing |

The component renders its own dark `bg-zinc-950` shell, so it can be mounted under any app chrome. It does not import `ui.jsx`.

## Data

- The jurisdiction list comes from `fetch(BASE_URL + 'cities/index.json')`.
- Each jurisdiction comes from `fetch(BASE_URL + 'cities/' + file)`.
- The schema is in the CITY-DATA contract.
- Every field may be `null` and renders as "no data".
- Rates given as 0..1 fractions are shown as percentages.
- GeoJSON is rewound if it uses RFC 7946 counter-clockwise exterior rings (`geo.js`).

To add any county, run `node scripts/build-cities.mjs <countyFIPS>`, or [request your city](https://github.com/AHasenbein/lepus-solutions/issues/new).

## Adapter (`adapter.js`)

`tractsToAreas` maps each tract onto the engine's state schema:

- `fips` = GEOID; `abbr` = the short tract name (e.g. `1.01`).
- The ACS fields pass through.
- **`eliUnitShortage` = `severelyBurdenedRenterHouseholds`.** This is a proxy. NLIHC's extremely-low-income (ELI) shortage is published only for states and metros, so ACS renter households paying 50%+ of income on rent stand in as the tract's need and unit cap.
- These are `null`, so the engine renormalizes the weights over the fields that are present:
  - `eliRenterHouseholds`
  - `affordableUnitsPer100Eli`
  - `homelessPIT`
  - `unshelteredPIT`
  - `constructionCostIndex`
- The engine's `maxSharePerState` is used per tract. It defaults to 0.08 and can be adjusted from 2% to 50%.

## Local policy levers

- **Prioritize HUD Qualified Census Tracts.** Restricts spending to QCTs by excluding non-QCT GEOIDs. LIHTC projects in QCTs qualify for a 130% eligible-basis boost (IRC §42(d)(5)(B)). Source: [HUD QCT data](https://www.huduser.gov/portal/datasets/qct.html).
  - It restricts rather than boosting the need score, because any boost factor would be an unsourced number.
  - It's disabled when the file has no QCT flags.
- **Cap acquisition-rehab by vacant units.** A post-process (`applyVacancyCap`) clamps `acquisition-rehab` units in each tract to ACS `vacantUnits`.
  - Dollars above the cap are released, not re-spent.
  - The amount released is shown.
- **Approve / Reject queue.** Covers the top 8 tracts.
  - Reject adds the GEOID to `excludedFips`, and the plan re-runs live.
  - Rejected tracts can be restored.
  - The map's "Exclude" click mode toggles exclusion directly.
- **Lens.** `LENSES` from the engine. A lens comparison panel shows each lens's result under the same levers.

## Fair-housing balance (Need ↔ Opportunity)

A slider from 0 (pure need score, the default) to 100% opportunity. It is labeled in the UI as a **policy choice**, not data.

- **Opportunity** = 1 − min-max(ACS `povertyRate`) across the jurisdiction's tracts, so the lowest-poverty tract scores 1. It reflects the concern about concentrating subsidized housing in high-poverty areas set out in HUD's [2015 Affirmatively Furthering Fair Housing rule](https://www.federalregister.gov/documents/2015/07/16/2015-17032/affirmatively-furthering-fair-housing). HUD [terminated that rule in 2025](https://www.hud.gov/news/hud-no-25-034); the UI says so.
- **How it reaches the engine without editing `src/engine/*`** (`scenario.js` → `blendInputs`): the engine computes need from area fields, so the opportunity component rides in the homelessness slot, which is null for every tract (no tract-level PIT data exists). `homelessPIT = expm1(opp)` undoes the engine's log1p normalization. The lens's shortage and rent-burden weights are scaled to `1 − t` and the carrier gets `t`. At `t = 0` the original areas and lens weights are passed, so results are identical to before. Display code always uses the real areas. The lens comparison applies the same blend.
- `cleanExplanation` rewrites the engine's lens line and "driven mostly by homelessness" when `t > 0`, and fixes tract-scale wording.
- **LIHTC concentration (feature-detected).** If any tract has `existingLihtcUnits` ([HUD LIHTC database](https://www.huduser.gov/portal/datasets/lihtc.html)), an "Avoid concentrating" toggle, an "Existing LIHTC units" map metric, and a tract-detail row appear. The toggle multiplies opportunity by `1 − min-max(existing LIHTC units per renter household)`. This penalty shape is a **model assumption**. It applies only when Opportunity > 0. Everything is hidden when the field is absent.
- **High-opportunity tract** (used in compare and the brief) = poverty rate below the jurisdiction's median tract. This is a definition used by this tool, not a HUD designation.

## Council brief

"Print council brief" opens a light, print-optimized one-pager (`CouncilBrief.jsx`) in a portal. `@media print` in `city.css` hides `#root`, so only the brief prints (US Letter, 0.5in margins). It contains:

- jurisdiction, budget, lens and all levers
- headline numbers, including % of dollars to QCTs and to high-opportunity tracts
- a static light SVG map (dollars per tract, QCT hatch)
- the top 10 tracts with dollars, units by building type, poverty rate and QCT flag
- "Why this plan", data sources with vintages (`meta.acsVintage`, `tractVintage`, `qctYear`), limitations and assumptions, the generation date, the scenario link, and "Powered by Lepus Analytics"

Esc or Close dismisses it.

## Scenario compare

"Pin scenario A" snapshots the current plan's metrics for this jurisdiction. The panel then shows A vs. the live plan B:

- units, people housed, tracts funded and dollars
- % of dollars to QCTs and to high-opportunity tracts
- the 8 tracts whose dollars differ most

## Shareable URL hash

App.jsx owns `b,l,w,x,e,s`. The city view merges its own keys into the hash and preserves App's:

| Key | Meaning |
| --- | --- |
| `view=city` | open the City / County tab (App.jsx reads this once to pick the initial tab) |
| `cid` | county FIPS, e.g. `48453` |
| `cb` | budget in dollars |
| `cl` | lens key |
| `cc` | max share per tract, percent (2–50) |
| `co` | opportunity weight, percent (omitted when 0) |
| `cq=1` | QCT-only |
| `cv=0` | vacancy cap off |
| `cd` | disabled intervention ids |
| `cx` | excluded tract GEOIDs |
| `ca=1` | avoid LIHTC concentration |

The write is deferred with `setTimeout(0)` so it lands after App's own `replaceState`. When the city view unmounts, its keys are removed.

## Engine feature detection

The view imports `* as engine`, so it works with both the stub and the real optimizer.

- If `naiveBaseline` exists, it's used for the "vs. population split" stat, along with `efficiencyGain` when present.
- Otherwise, the same dollars actually spent are split by tract population at the first enabled intervention's cost.
- `explanation[]` is rendered under "Why this plan".

## Outputs

- **Export plan CSV:** GEOID, tract, name, isQCT, needScore, dollars, units, peopleHoused, and `units_<interventionId>` per type.
  - Every field is quoted.
  - It can be joined on GEOID in GIS.
- **Print council brief** (above).
- A "Request your city" link.
- A "Powered by Lepus Analytics" credit.
