# Methodology (for policymakers)

This page explains in plain language how Lepus Solutions turns public data into a recommended allocation. For the exact formulas, see [ENGINE.md](ENGINE.md). For every dataset, its year, and its link, see [DATA_SOURCES.md](DATA_SOURCES.md).

## 1. What "need" means

Lepus Solutions focuses on **extremely-low-income (ELI) households**. NLIHC defines these as households with incomes at or below either the federal poverty guideline or 30% of area median income, whichever is greater ([NLIHC, *The Gap*](https://nlihc.org/gap)). For each state, the tool combines four signals:

| Signal | What it measures | Source |
|---|---|---|
| **Shortage** | Rental homes missing that would be affordable and available to ELI renters | NLIHC *The Gap* |
| **Homelessness** | People counted as homeless (and unsheltered) on one night in January | HUD AHAR Point-in-Time count |
| **Rent burden** | Share of renters paying 30%+ (and 50%+) of income on rent | Census ACS (table B25070) |
| **Cost efficiency** | How many homes a dollar buys in that state | Per-unit costs × state cost index (where sourced) |

Each signal is scaled to a 0-1 range across states, so no single unit of measure dominates. The signals are then combined with weights into one **need score** per state.

## 2. Lenses: whose priorities?

Different stakeholders weigh these signals differently. Instead of hiding that choice, the tool lets you switch between lenses. This mirrors the role-based portals (owner/worker/tenant) of the Lepus product family.

- **Planner**: a balanced view across shortage, homelessness, rent burden, and cost.
- **Budget Office**: puts the most weight on cost efficiency (the most homes per dollar).
- **Community Advocate**: puts the most weight on homelessness and the deepest need, and gives cost efficiency no weight.

The exact weights for each lens are shown in the app and defined in `src/engine/allocate.js`. Switching lenses changes the recommendation. That is intended: the lens makes the value judgment visible.

## 3. The optimizer

Given a budget, the optimizer spends money step by step on the combination of **state × intervention** that delivers the most weighted need met per dollar at that moment.

- **Diminishing returns.** The first homes in a state address the most acute need. Each further dollar in the same state counts for a bit less, so money spreads across states and does not all go to one place.
- **Capped at the shortage.** The tool never funds more ELI homes in a state than that state's documented shortage.
- **Per-state cap.** A configurable maximum share of the budget can go to any one state (25% by default).
- **People housed.** Units are converted to people using the state's average renter household size from the ACS.

Every recommendation comes with a short explanation of why it was chosen, and each one can be approved or rejected in the review queue.

## 4. Cost per unit, by intervention

| Intervention | Typical role |
|---|---|
| New construction (LIHTC-style) | Most expensive and slowest, but adds permanent new supply |
| Acquisition + rehab | Preserves or converts existing buildings, usually faster and cheaper |
| Modular / factory-built | Can shorten construction time |
| Hotel/motel conversion | Fastest to occupancy, often used for people leaving homelessness |

The actual per-unit dollar figures, months to occupancy, and their citations are in `src/data/interventions.json` and documented in [DATA_SOURCES.md](DATA_SOURCES.md). When a sourced state construction cost index is available, it scales the costs of interventions that depend on local construction prices. Otherwise national figures apply.

### Optional: subsidy gap (from Lepus Analytics underwriting)

Lepus Solutions comes from [Lepus Analytics](https://github.com/AHasenbein/lepus-analytics), a real-estate analytics product whose underwriting engine computes deal NPV and IRR. An optional module (`src/engine/finance.js`) ports that logic to estimate the **subsidy gap**: the public dollars a project needs on top of what ELI-affordable rents can support. Rent baselines would come from HUD Small Area Fair Market Rents. When the module is present, a planner can see both the up-front cost per unit and the subsidy needed per unit.

## 5. Comparison with a naive baseline

To show the value of targeting, every plan is compared with a **population-proportional baseline**, in which each state gets budget in proportion to its population. The dashboard shows the difference in homes funded, people housed, and share of the shortage closed. The baseline is a reference point and not a strawman: it is roughly how a formula grant without need targeting would behave.

## 6. Caveats

- **State-level aggregation hides local variation.** Need is concentrated in particular metros, counties, and neighborhoods. Use the results to decide which states to look at more closely, not where to put a specific building.
- **The PIT count is a point-in-time undercount.** It counts one night in January and misses people who are doubled up, in hidden locations, or cycling in and out of homelessness.
- **Costs are national averages** unless a sourced cost index is applied. Land, labor, and regulatory costs vary widely.
- **Data vintages differ.** Datasets are released on different schedules. Check [DATA_SOURCES.md](DATA_SOURCES.md) for the year behind each figure.
- **Not modeled (yet):** operating subsidies, vouchers, land availability, siting constraints, fair housing analysis, and multi-year phasing. See [ROADMAP.md](../ROADMAP.md).

Lepus Solutions is a decision-support tool. It does not replace local planning, community engagement, or legal review.
