# City-scale data (census tracts)

Lepus Solutions' local-government view uses census-tract data for one county, or county-equivalent, per jurisdiction. Everything is built by `scripts/build-cities.mjs`, a Node script with no dependencies that uses the global `fetch`. Every value comes from a cited public source. A value that is unknown or suppressed is `null`. Nothing is estimated.

## Jurisdictions

Each jurisdiction is a county FIPS code. Where possible it is a consolidated city-county, or a county that is close to the city, so tracts nest cleanly.

| FIPS  | Name | Geography | HUD CoC used for PIT |
|-------|------|-----------|----------------------|
| 48453 | Austin (Travis County), the default | Travis County, TX | TX-503 Austin/Travis County CoC, 2025 |
| 06075 | San Francisco | consolidated city-county | CA-501 San Francisco CoC, 2024 (the 2025 row is sheltered-only) |
| 42101 | Philadelphia | consolidated city-county | PA-500 Philadelphia CoC, 2025 |
| 11001 | Washington, DC | District | DC-500 District of Columbia CoC, 2025 |
| 08031 | Denver | consolidated city-county | CO-503 Metropolitan Denver CoC, 2025 (**covers 7 counties**) |
| 24510 | Baltimore | independent city | MD-501 Baltimore CoC, 2025 |
| 22071 | New Orleans (Orleans Parish) | consolidated parish | LA-503 New Orleans/Jefferson Parish CoC, 2025 (**includes Jefferson Parish**) |
| 47037 | Nashville-Davidson | consolidated city-county | TN-504 Nashville/Davidson County CoC, 2025 |
| 25025 | Boston (Suffolk County) | Suffolk County, MA (also Chelsea, Revere, Winthrop) | MA-500 Boston CoC, 2025 (City of Boston only) |
| 29510 | St. Louis | independent city | MO-501 St. Louis City CoC, 2025 |

## Files

- `public/cities/index.json` lists `{ id, name, state, stateFips, population, tractCount, file }`. Austin is first and is the default.
- `public/cities/<fips>.json` holds `meta`, `sources`, `fieldSources`, `jurisdiction`, `tracts` (keyed by 11-digit GEOID) and `geometry` (a GeoJSON FeatureCollection whose `properties.GEOID` is the tract's GEOID).

## Sources

| id | Source | Vintage |
|----|--------|---------|
| `acs5` | U.S. Census Bureau, American Community Survey 5-Year Estimates, Detailed Tables. The script uses `api.census.gov` when `CENSUS_API_KEY` is set, and otherwise the keyless `data.census.gov/api/access/data/table` endpoint, because `api.census.gov` now rejects requests without a key. | 2020-2024 (ACS 2024 5-year, the latest release) |
| `tiger` | Census TIGERweb `tigerWMS_ACS2024/MapServer/8` (Census Tracts), queried as GeoJSON in EPSG:4326 with `maxAllowableOffset=0.0005` and coordinates rounded to 5 decimals | ACS 2024 tracts, which are the 2020 tract delineation, so the GEOIDs match the ACS rows exactly |
| `hudQct` | HUD Qualified Census Tracts, ArcGIS feature service `services.arcgis.com/VTyQ9soqVukalItT/.../QUALIFIED_CENSUS_TRACTS_2026/FeatureServer/0`, Hub page `hudgis-hud.opendata.arcgis.com/datasets/HUD::qualified-census-tracts-2026` | 2026 designations (see the caveat below) |
| `hudPit` | HUD PD&R, *Point-in-Time Counts by CoC, 2007-2025* (`huduser.gov/.../2007-2025-PIT-Counts-by-CoC.xlsb`), "Overall Homeless" column | 2025, or 2024 for SF |

## Field derivations (per tract)

| Field | ACS variable / formula |
|-------|------------------------|
| `population` | B01003_001E |
| `renterHouseholds` | B25003_003E |
| `avgRenterHouseholdSize` | B25010_003E |
| `medianHouseholdIncome` | B19013_001E (top-coded at 250,001, meaning "$250,000+") |
| `medianGrossRent` | B25064_001E (top-coded at 3,501, meaning "$3,500+") |
| `rentBurdenedPct` | (B25070_007 + 008 + 009 + 010) / (B25070_001 − B25070_011) × 100, rounded to 0.1. This is the same formula as the state data. |
| `severelyRentBurdenedPct` | B25070_010 / (B25070_001 − B25070_011) × 100 |
| `severelyBurdenedRenterHouseholds` | B25070_010E (count of renter households paying 50%+ of income) |
| `povertyRate` | B17001_002E / B17001_001E × 100 |
| `vacantUnits` | B25004_001E |
| `vacantForRent` | B25004_002E |
| `isQCT` | `true` if the GEOID is in HUD's QCT layer and `false` otherwise. It is `null` if the QCT query failed. |

The jurisdiction-level `population`, `renterHouseholds`, `severelyBurdenedRenterHouseholds` and `medianHouseholdIncome` come from the ACS **county** row (`0500000US<fips>`). They are not sums of tracts, because medians can't be aggregated.

Census annotation sentinels (−666666666, −999999999, −888888888, −222222222 and so on) and blanks become `null`. For example, tracts with too few sample households have a suppressed median. If a denominator is 0, the derived percentage is `null`.

## Adding a county

```sh
node scripts/build-cities.mjs 17031          # any 5-digit county FIPS
node scripts/build-cities.mjs                # rebuild the 10 default jurisdictions
CENSUS_API_KEY=... node scripts/build-cities.mjs 06075   # optional: use api.census.gov
```

The script merges into `index.json`, keeping Austin first. A county not in `DISPLAY_NAMES` uses its Census county name. A county not in the `PIT` table in the script gets `homelessPIT: null`. To add a PIT value, look up the CoC in HUD's xlsb file and add an entry that records its CoC number and year. Node can't read `.xlsb` without a dependency, which is why PIT values are recorded by hand there. Each county takes about 20 s, and the geometry adds about 70-260 KB per county.

## Caveats

- **ACS tract margins of error are large.** At tract level the 5-year MOE is often ±30-50% of the estimate for counts such as severely burdened renters. Treat tract values as indicative and compare neighborhoods, not individual tracts. MOEs are not shipped. They are available from the same tables (`_M` columns).
- **Tracts ≠ city limits for non-consolidated cities.** Travis County includes areas outside Austin's city limits, such as Pflugerville, Lakeway and unincorporated areas. Suffolk County includes Chelsea, Revere and Winthrop as well as Boston. The other eight jurisdictions are consolidated or independent cities, so their county boundary is the city boundary.
- **PIT coverage differs from the jurisdiction** for Denver (CO-503 covers 7 metro counties), New Orleans (LA-503 includes Jefferson Parish) and Boston (MA-500 covers the city only, not all of Suffolk County). The counts are shown as published and are not apportioned. `homelessPITSource` says what the count covers. PIT counts are point-in-time and undercount unsheltered homelessness.
- **QCT vintage labeling.** HUD's service is named `QUALIFIED_CENSUS_TRACTS_2026` and its snippet says "for 2026", but the ArcGIS item title says "2027" and the layer description mentions 2024. The data are cited as HUD's 2026 QCT designations (2020 tracts). Official LIHTC determinations should use HUD's QCT mapping tool and table generator (huduser.gov/portal/qct).
- Medians are top-coded (income $250,000+, rent $3,500+), so a value of 250001 or 3501 means "at least".
