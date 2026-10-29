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

## Engine feature detection

The view imports `* as engine`, so it works with both the stub and the real optimizer.

- If `naiveBaseline` exists, it's used for the "vs. population split" stat, along with `efficiencyGain` when present.
- Otherwise, the same dollars actually spent are split by tract population at the first enabled intervention's cost.
- `explanation[]` is rendered under "Why this plan".

## Outputs

- **Export plan CSV:** GEOID, tract, name, isQCT, needScore, dollars, units, peopleHoused, and `units_<interventionId>` per type.
  - Every field is quoted.
  - It can be joined on GEOID in GIS.
- A "Request your city" link.
- A "Powered by Lepus Analytics" credit.
