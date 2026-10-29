# Module contracts (Lepus Solutions)

Parallel workstreams build against these interfaces. Change them only in a coordinated PR.

## Data: `src/data/states.json`
```jsonc
{
  "meta": { "placeholder": false, "geography": "state", "updated": "YYYY-MM-DD" },
  "sources": { "<sourceId>": { "title": "", "publisher": "", "url": "", "year": 2024, "accessed": "YYYY-MM-DD" } },
  "fieldSources": { "<field>": "<sourceId>" },
  "states": {
    "06": {                         // key = 2-digit state FIPS string (matches us-atlas ids)
      "fips": "06", "abbr": "CA", "name": "California",
      "population": 0,              // ACS
      "renterHouseholds": 0,        // ACS B25003
      "avgRenterHouseholdSize": 0,  // ACS B25010 (renter-occupied)
      "medianHouseholdIncome": 0,   // ACS B19013
      "medianGrossRent": 0,         // ACS B25064
      "rentBurdenedPct": 0,         // % renters paying 30%+ of income (ACS B25070)
      "severelyRentBurdenedPct": 0, // % renters paying 50%+ (ACS B25070)
      "eliRenterHouseholds": 0,     // NLIHC The Gap
      "affordableUnitsPer100Eli": 0,// NLIHC The Gap
      "eliUnitShortage": 0,         // NLIHC The Gap
      "homelessPIT": 0,             // HUD AHAR Point-in-Time
      "unshelteredPIT": 0,          // HUD AHAR Point-in-Time
      "constructionCostIndex": 1    // relative to national = 1.0; null if no sourced value
    }
  }
}
```
Every number must come from a cited public source. Unknown → `null`. Never estimate.

## Data: `src/data/interventions.json`
`{ meta, interventions: [{ id, name, short, costPerUnit, monthsToOccupancy, useCostIndex, permanence, sourceIds, notes }] }`
`costPerUnit` is a cited national figure in USD. `sourceIds` reference `states.json` `sources`, or the file can carry its own `sources` map.

## Engine: `src/engine/allocate.js`
- `LENSES`: `{ [key]: { label, weights } }` where weights = `{ shortage, homelessness, rentBurden, costEfficiency }`
- `scoreNeed(states, weights) → { [fips]: 0..1 }`
- `allocateBudget({ budget, states, interventions, weights, enabledInterventions?, excludedFips?, maxSharePerState? })` →
```js
{ totalBudget, totalSpent, totalUnits, peopleHoused, avgCostPerUnit, shortageClosedPct,
  allocations: [{ fips, interventionId, dollars, units, peopleHoused, needScore }],
  byState: { [fips]: { dollars, units, peopleHoused, needScore, rank } },
  byIntervention: { [id]: { dollars, units } },
  needScores: { [fips]: number }, explanation: string[] }
```
Pure functions, no React.

## Engine (optional): `src/engine/finance.js`
An optional subsidy-gap module, ported from the Lepus Analytics underwriting (NPV/IRR) deal math. The app must build and run without it. Load it with `import.meta.glob('../engine/finance.js')` (or a similar optional import), never with a static import that breaks when the file is missing.
- `subsidyGap({ costPerUnit, monthlyRent, operatingCostPerUnitYear, discountRate, years }) → { gapPerUnit, npvRentPerUnit, irr|null }`
  - `monthlyRent`: an ELI-affordable rent (for example 30% of 30% AMI) or a HUD SAFMR baseline. It must be cited and is `null` if unknown.
  - The result is `null` if any input is `null`. Never fill gaps with guesses.
- Pure functions, no React. Tests go in `src/engine/finance.test.mjs`.

## Map: `src/components/USMap.jsx`
Default export. Props: `values, selectedFips, onSelect, formatValue, legendLabel, markers?, names?`.

## UI kit: `src/components/ui.jsx`
`Button, Card, Badge, Stat, PoweredBy, PlaceholderBanner`. Every screen must render `<PoweredBy />`, which renders the text "Powered by Lepus Analytics".
The design language follows Lepus Analytics: dark zinc neutrals with indigo accents.
