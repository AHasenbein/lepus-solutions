# Contributing to Lepus Solutions

Thanks for helping governments spend housing dollars better. The most important rule:

> **Every number has a cited public source. If you don't have a source, use `null` and never a guess.**

## Dev setup

Requires Node 22.

```bash
git clone https://github.com/AHasenbein/lepus-solutions.git
cd lepus-solutions
npm ci
npm run dev              # http://localhost:5173/lepus-solutions/
npm run lint
node --test src/engine/  # engine unit tests
npm run build
```

## Module contracts

The project is split into modules with fixed interfaces, all documented in [CONTRACTS.md](CONTRACTS.md):

- **Data**: `src/data/states.json` and `src/data/interventions.json`
- **Engine**: `src/engine/allocate.js` (`LENSES`, `scoreNeed`, `allocateBudget`), plus the optional `src/engine/finance.js` (subsidy gap, ported from Lepus Analytics underwriting). These are pure functions with no React.
- **Map**: `src/components/USMap.jsx`
- **UI kit**: `src/components/ui.jsx`. Every screen renders `<PoweredBy />` ("Powered by Lepus Analytics").

Changing a contract needs its own coordinated PR that updates `CONTRACTS.md` and every consumer.

## Adding a data source

1. Add an entry to `sources` in `src/data/states.json`: `{ title, publisher, url, year, accessed }`.
2. Map each new field to its source in `fieldSources`.
3. Put every value from the source in by hand or with a script in `scripts/`. Missing values are `null`.
4. Document the dataset, its vintage, and any transformations in [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).
5. If a fetch script is involved, add an `npm run fetch:*` script so others can reproduce the data.

## Adding an intervention

1. Add an object to `interventions` in `src/data/interventions.json`: `{ id, name, short, costPerUnit, monthsToOccupancy, useCostIndex, permanence, sourceIds, notes }`.
2. `costPerUnit` must be a published per-unit figure in USD, with its source in `sourceIds`. Use `notes` to record the year and whether it is a median or mean.
3. Set `useCostIndex: true` only if the cost scales with local construction prices.
4. Add an engine test that checks the new intervention is picked when it is the cheapest per unit of need met.

## Adding a lens

1. Add an entry to `LENSES` in `src/engine/allocate.js`: `{ label, weights: { shortage, homelessness, rentBurden, costEfficiency } }`. The weights should sum to 1.
2. Describe the lens and whose perspective it represents in [docs/METHODOLOGY.md](docs/METHODOLOGY.md).
3. Add a test asserting the lens returns a valid allocation.

## PR checklist

- [ ] Every new number has a cited source (in `sources` / `sourceIds` and `docs/DATA_SOURCES.md`)
- [ ] Unknown values are `null`, not estimated
- [ ] `npm run lint` has no errors
- [ ] `node --test src/engine/` passes
- [ ] `npm run build` succeeds
- [ ] Contracts are unchanged, or `CONTRACTS.md` is updated with every consumer
- [ ] Screens still render `<PoweredBy />`
- [ ] Docs are updated (README, METHODOLOGY, ROADMAP as relevant)
