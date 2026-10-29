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
| 53033 | Seattle (King County) | King County, WA | WA-500 Seattle/King County CoC, 2024 (the 2025 row is sheltered-only) |
| 41051 | Portland (Multnomah County) | Multnomah County, OR | OR-501 Portland, Gresham/Multnomah County CoC, 2025 |
| 27053 | Minneapolis (Hennepin County) | Hennepin County, MN | MN-500 Minneapolis/Hennepin County CoC, 2025 |
| 13121 | Atlanta (Fulton County) | Fulton County, GA | GA-500 Atlanta CoC, 2025 (**City of Atlanta only**; the rest of Fulton is GA-502) |
| 12086 | Miami-Dade County | Miami-Dade County, FL | FL-600 Miami-Dade County CoC, 2025 |
| 39049 | Columbus (Franklin County) | Franklin County, OH | OH-503 Columbus/Franklin County CoC, 2025 |
| 37119 | Charlotte (Mecklenburg County) | Mecklenburg County, NC | NC-505 Charlotte/Mecklenberg CoC, 2025 |
| 06073 | San Diego County | San Diego County, CA | CA-601 San Diego City and County CoC, 2025 |
| 32003 | Las Vegas (Clark County) | Clark County, NV | NV-500 Las Vegas/Clark County CoC, 2024 (the 2025 row is sheltered-only) |
| 49035 | Salt Lake County | Salt Lake County, UT | UT-500 Salt Lake City & County CoC, 2025 |
| 26163 | Detroit (Wayne County) | Wayne County, MI | MI-501 Detroit CoC, 2024 (**City of Detroit only**; the rest of Wayne is MI-502; the 2025 row is sheltered-only) |
| 39035 | Cleveland (Cuyahoga County) | Cuyahoga County, OH | OH-502 Cleveland/Cuyahoga County CoC, 2025 |
| 29095 | Kansas City (Jackson County, MO) | Jackson County, MO | MO-604a Kansas City, Independence, Lee's Summit/Jackson, Wyandotte Counties, MO & KS, 2025 (**includes Wyandotte County, KS**) |
| 55079 | Milwaukee County | Milwaukee County, WI | WI-501 Milwaukee City & County CoC, 2025 |
| 06067 | Sacramento County | Sacramento County, CA | CA-503 Sacramento City & County CoC, 2024 (the 2025 row is sheltered-only) |
| 15003 | Honolulu (City and County) | consolidated city-county | HI-501 Honolulu City and County CoC, 2024 (the 2025 row is sheltered-only) |

## Files

- `public/cities/index.json` lists `{ id, name, state, stateFips, population, tractCount, file }`. Austin is first and is the default.
- `public/cities/<fips>.json` holds `meta`, `sources`, `fieldSources`, `jurisdiction`, `tracts` (keyed by 11-digit GEOID) and `geometry` (a GeoJSON FeatureCollection whose `properties.GEOID` is the tract's GEOID).

## Sources

| id | Source | Vintage |
|----|--------|---------|
| `acs5` | U.S. Census Bureau, American Community Survey 5-Year Estimates, Detailed Tables. The script uses `api.census.gov` when `CENSUS_API_KEY` is set, and otherwise the keyless `data.census.gov/api/access/data/table` endpoint, because `api.census.gov` now rejects requests without a key. | 2020-2024 (ACS 2024 5-year, the latest release) |
| `tiger` | Census TIGERweb `tigerWMS_ACS2024/MapServer/8` (Census Tracts), queried as GeoJSON in EPSG:4326 with `maxAllowableOffset=0.0005` and coordinates rounded to 5 decimals | ACS 2024 tracts, which are the 2020 tract delineation, so the GEOIDs match the ACS rows exactly |
| `hudQct` | HUD Qualified Census Tracts, ArcGIS feature service `services.arcgis.com/VTyQ9soqVukalItT/.../QUALIFIED_CENSUS_TRACTS_2026/FeatureServer/0`, Hub page `hudgis-hud.opendata.arcgis.com/datasets/HUD::qualified-census-tracts-2026` | 2026 designations (see the caveat below) |
| `hudLihtc` | HUD National LIHTC Database, ArcGIS feature service `services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/LIHTC/FeatureServer/0` (item `810ccb34dd464ec4ad4697d35fff21a5`, last modified 2026-04-20), Hub page `hudgis-hud.opendata.arcgis.com/datasets/HUD::low-income-housing-tax-credit-properties` | Projects placed in service 1987-2022 (only 48 records for 2021 and 7 for 2022, so effectively complete through about 2020). HUD's tract field is **2010-vintage**, so the join uses point coordinates. |
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
| `existingLihtcProjects` | Count of HUD LIHTC projects whose point falls inside the tract (see the LIHTC join below). 0 means none. |
| `existingLihtcUnits` | Sum of `LI_UNITS` (low-income units) over those projects. **`null` if any of the tract's projects has no reported `LI_UNITS`.** It is never filled with 0 or with total units. |
| `existingLihtcUnitsReported` | Sum of `LI_UNITS` over the projects that report it, which is a floor when units are unreported. |
| `existingLihtcProjectsUnitsUnreported` | Number of the tract's projects with `LI_UNITS` blank. |
| `isQCT` | `true` if the GEOID is in HUD's QCT layer and `false` otherwise. It is `null` if the QCT query failed. |

The jurisdiction-level `population`, `renterHouseholds`, `severelyBurdenedRenterHouseholds` and `medianHouseholdIncome` come from the ACS **county** row (`0500000US<fips>`). They are not sums of tracts, because medians can't be aggregated.

The jurisdiction-level `existingLihtcUnits`, `existingLihtcProjects`, `existingLihtcUnitsReported` and `existingLihtcProjectsUnitsUnreported` follow the same rules over **every** LIHTC project in the county (`COUNTY_LEVEL`). That includes projects that could not be placed in a tract, so the county total can exceed the sum of the tracts. `meta.lihtcProjectsNotInATract` gives the difference. Because almost every county has at least one project with a blank `LI_UNITS`, the county `existingLihtcUnits` is usually `null`. Use `existingLihtcUnitsReported` with `existingLihtcProjectsUnitsUnreported` instead.

### LIHTC join

1. The script queries the LIHTC service with `COUNTY_LEVEL='<fips>'`. HUD drops the leading zero for states below 10, so it also matches `'6075'` for `06075`. It then drops records named `TEST PROPERTY`, which are placeholder rows in HUD's service.
2. HUD's `TRACT_LEVEL`/`TRACT2KX` use 2010 tract IDs. In Travis County only 94 of 195 projects have an ID that is also a 2020 GEOID. The script therefore assigns each project by ray-casting point-in-polygon on its `LAT`/`LON`, against an **unsimplified** copy of the TIGERweb 2020 tract polygons that is held in memory and never shipped.
3. Only projects geocoded at HUD's `LVL2KX` levels `R` (rooftop), `4` (ZIP+4) or `B` (block group) are placed by point. HUD warns that centroids of coarser geographies don't map reliably to tracts. A `T` (tract-centroid) project is placed only when its 2010 tract ID is unchanged in 2020. All other projects (`T` in a split tract, ZIP centroids, or ungeocoded records, which number 2,367 nationally) count only in the county totals.
4. `YR_PIS` values 8888 and 9999 (year unknown) are kept. Every record is a project in HUD's placed-in-service database. `LI_UNITR`/`N_UNITSR` are not used, because HUD fills them from total units when low-income units are missing.

Spot check (2026-10-29): a server-side spatial query of the LIHTC service against the full TIGERweb polygon for tract 48453002111 returns 8 projects with LI_UNITS 97 + 182 + 6×2 = 291, for 48453000803 it returns 6 projects × 1 unit = 6, and for 06075012503 (Tenderloin) it returns 11 projects totalling 1,255 units. All three match the file.

Census annotation sentinels (−666666666, −999999999, −888888888, −222222222 and so on) and blanks become `null`. For example, tracts with too few sample households have a suppressed median. If a denominator is 0, the derived percentage is `null`.

## Adding a county

```sh
node scripts/build-cities.mjs 17031          # any 5-digit county FIPS
node scripts/build-cities.mjs                # rebuild all 26 default jurisdictions
CENSUS_API_KEY=... node scripts/build-cities.mjs 06075   # optional: use api.census.gov
```

The script merges into `index.json`, keeping Austin first. A county not in `DISPLAY_NAMES` uses its Census county name. A county not in the `PIT` table in the script gets `homelessPIT: null`. To add a PIT value, look up the CoC in HUD's xlsb file and add an entry that records its CoC number and year. Node can't read `.xlsb` without a dependency, which is why PIT values are recorded by hand there. Each county takes about 5-20 s, and the geometry adds about 70-700 KB per county.

## Caveats

- **ACS tract margins of error are large.** At tract level the 5-year MOE is often ±30-50% of the estimate for counts such as severely burdened renters. Treat tract values as indicative and compare neighborhoods, not individual tracts. MOEs are not shipped. They are available from the same tables (`_M` columns).
- **Tracts ≠ city limits for non-consolidated cities.** Travis County includes areas outside Austin's city limits, such as Pflugerville, Lakeway and unincorporated areas. Suffolk County includes Chelsea, Revere and Winthrop as well as Boston. The same is true of every county added in this expansion (King, Multnomah, Hennepin, Fulton, Miami-Dade, Franklin, Mecklenburg, San Diego, Clark, Salt Lake, Wayne, Cuyahoga, Jackson, Milwaukee and Sacramento) except Honolulu. San Francisco, Philadelphia, DC, Denver, Baltimore, New Orleans, Nashville, St. Louis and Honolulu are consolidated or independent, so their county boundary is the city boundary.
- **PIT coverage differs from the jurisdiction** for Denver (CO-503 covers 7 metro counties), New Orleans (LA-503 includes Jefferson Parish), Boston (MA-500 covers the city only, not all of Suffolk County), Atlanta (GA-500 covers the City of Atlanta, including its DeKalb portion, not all of Fulton), Detroit (MI-501 covers the city only, not all of Wayne) and Kansas City (MO-604a also covers Wyandotte County, KS). The counts are shown as published and are not apportioned. `homelessPITSource` says what the count covers. PIT counts are point-in-time and undercount unsheltered homelessness.
- **QCT vintage labeling.** HUD's service is named `QUALIFIED_CENSUS_TRACTS_2026` and its snippet says "for 2026", but the ArcGIS item title says "2027" and the layer description mentions 2024. The data are cited as HUD's 2026 QCT designations (2020 tracts). Official LIHTC determinations should use HUD's QCT mapping tool and table generator (huduser.gov/portal/qct).
- **LIHTC is one program.** The LIHTC database does not include public housing, project-based Section 8 or local inclusionary units. Its vintage ends around 2020-2022, and points mark the building with the most units, not every building.
- Medians are top-coded (income $250,000+, rent $3,500+), so a value of 250001 or 3501 means "at least".
