# Roadmap

Each item lists the real public dataset it would use. Contributors can pick items up from the [`roadmap` issues](https://github.com/AHasenbein/lepus-solutions/issues?q=is%3Aissue+label%3Aroadmap). Read [CONTRIBUTING.md](CONTRIBUTING.md) first: every number needs a cited source.

## Now (small, high value)

| Item | Dataset |
|---|---|
| **HUD Fair Market Rent in the state detail panel.** Show the 2-bedroom FMR next to the ACS median gross rent. | [HUD Fair Market Rents](https://www.huduser.gov/portal/datasets/fmr.html) |
| **ELI income limits.** Show the 30% AMI income limit so readers can see what "extremely low income" means locally. | [HUD Income Limits](https://www.huduser.gov/portal/datasets/il.html) |
| **Dark mode / theme polish.** Complete the Lepus Analytics dark zinc/indigo theme and add a light toggle. | n/a |
| **Accessibility audit.** Keyboard navigation for the map, color contrast, and a screen-reader table fallback for the choropleth. | [WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/) |
| **Scenario saving.** Encode budget, lens, and interventions in the URL so a scenario can be shared, with export to CSV/JSON. | n/a |

## Next (new data and models)

| Item | Dataset |
|---|---|
| **County/tract granularity.** Move from states to counties, then tracts. | [HUD CHAS](https://www.huduser.gov/portal/datasets/cp.html), [Census ACS](https://www.census.gov/programs-surveys/acs/data.html) via the [Census API](https://www.census.gov/data/developers.html) |
| **Small Area FMR rent baselines** for the optional `finance.js` subsidy-gap module (ported from Lepus Analytics). | [HUD Small Area FMRs](https://www.huduser.gov/portal/datasets/fmr/smallarea/index.html) |
| **LIHTC QCT/DDA overlays.** Show where the 130% basis boost applies. | [HUD Qualified Census Tracts & Difficult Development Areas](https://www.huduser.gov/portal/datasets/qct.html) |
| **Existing LIHTC properties.** Show existing supply and avoid over-concentration. | [HUD LIHTC Database](https://www.huduser.gov/portal/datasets/lihtc.html) |
| **Land values.** Add land price into cost per unit. | [FHFA residential land prices (WP 19-01)](https://www.fhfa.gov/research/papers/wp1901) |
| **Voucher vs. build comparison.** Compare cost per household-year of tenant-based assistance against capital investment. | [HUD Picture of Subsidized Households](https://www.huduser.gov/portal/datasets/assthsg.html), [HUD FMRs](https://www.huduser.gov/portal/datasets/fmr.html) |

## Later (bigger bets)

| Item | Dataset |
|---|---|
| **Transit and jobs access** as a siting signal. | [EPA Smart Location Database](https://www.epa.gov/smartgrowth/smart-location-mapping) |
| **Climate risk** as a siting penalty. | [FEMA National Risk Index](https://hazards.fema.gov/nri/) |
| **Multi-year budgets and phasing**, accounting for months to occupancy. | Existing intervention data |
| **City-specific deployments.** Pre-configured builds for a single city or CoC. | CoC-level [HUD AHAR / PIT data](https://www.huduser.gov/portal/datasets/ahar.html) |
| **REST API and Python notebook.** Expose the pure engine to analysts. | n/a |
| **Internationalization (i18n)**, starting with Spanish. | n/a |
