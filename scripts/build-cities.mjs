#!/usr/bin/env node
// Builds city-scale (census tract) data for local governments.
//
// Usage:  node scripts/build-cities.mjs                 (rebuild every jurisdiction in DEFAULT_IDS)
//         node scripts/build-cities.mjs 06075 48453     (add or refresh specific counties by 5-digit FIPS)
//
// Any US county (or county-equivalent) can be added by FIPS. Writes:
//   public/cities/<fips>.json   tract metrics + tract geometry + sources
//   public/cities/index.json    list of available jurisdictions (merged, Austin first)
//
// Sources (see docs/CITY_DATA.md):
//   - ACS 5-year detailed tables, tract + county level. If CENSUS_API_KEY is set, api.census.gov is
//     used; otherwise the keyless data.census.gov table API (api.census.gov rejects keyless requests).
//   - Tract geometry: Census TIGERweb, tigerWMS_ACS<year> MapServer layer 8 (Census Tracts), so tract
//     boundaries match the ACS vintage.
//   - HUD Qualified Census Tracts: HUD's QUALIFIED_CENSUS_TRACTS_2026 ArcGIS feature service.
//   - HUD PIT counts by CoC: values extracted from HUD's 2007-2025-PIT-Counts-by-CoC.xlsb (table below).
//   - HUD LIHTC Database: HUD's LIHTC ArcGIS feature service (project points). Its tract field is 2010-vintage,
//     so projects are assigned to 2020 tracts by ray-casting point-in-polygon on unsimplified TIGERweb tracts.
// No dependencies: uses Node's global fetch.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ACS_YEAR = Number(process.env.ACS_YEAR || 2024);
const KEY = process.env.CENSUS_API_KEY;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public/cities');
const TODAY = new Date().toISOString().slice(0, 10);

// Priority order; Austin (Lepus Analytics' home market) first = default.
const DEFAULT_IDS = [
  '48453', '06075', '42101', '11001', '08031', '24510', '22071', '47037', '25025', '29510',
  '53033', '41051', '27053', '13121', '12086', '39049', '37119', '06073', '32003', '49035',
  '26163', '39035', '29095', '55079', '06067', '15003',
];

const DISPLAY_NAMES = {
  '48453': 'Austin (Travis County)',
  '06075': 'San Francisco',
  '42101': 'Philadelphia',
  '11001': 'Washington, DC',
  '08031': 'Denver',
  '24510': 'Baltimore',
  '22071': 'New Orleans (Orleans Parish)',
  '47037': 'Nashville-Davidson',
  '25025': 'Boston (Suffolk County)',
  '29510': 'St. Louis',
  '53033': 'Seattle (King County)',
  '41051': 'Portland (Multnomah County)',
  '27053': 'Minneapolis (Hennepin County)',
  '13121': 'Atlanta (Fulton County)',
  '12086': 'Miami-Dade County',
  '39049': 'Columbus (Franklin County)',
  '37119': 'Charlotte (Mecklenburg County)',
  '06073': 'San Diego County',
  '32003': 'Las Vegas (Clark County)',
  '49035': 'Salt Lake County',
  '26163': 'Detroit (Wayne County)',
  '39035': 'Cleveland (Cuyahoga County)',
  '29095': 'Kansas City (Jackson County, MO)',
  '55079': 'Milwaukee County',
  '06067': 'Sacramento County',
  '15003': 'Honolulu (City and County)',
};

const ABBR = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC',
  '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY',
  '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT',
  '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH',
  '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY', '72': 'PR',
};

// HUD Point-in-Time counts, "Overall Homeless", from HUD's 2007-2025-PIT-Counts-by-CoC.xlsb
// (https://www.huduser.gov/portal/sites/default/files/xls/2007-2025-PIT-Counts-by-CoC.xlsb).
// Each entry uses the latest year with a full "Sheltered and Unsheltered Count".
// Node cannot read .xlsb without a dependency, so the values are recorded here; re-extract on refresh.
// Counties not listed here get homelessPIT: null.
const PIT = {
  '48453': { count: 3240, year: 2025, coc: 'TX-503 Austin/Travis County CoC' },
  '06075': { count: 8323, year: 2024, coc: 'CA-501 San Francisco CoC', note: '2025 row is a sheltered-only count, so the 2024 full count is used' },
  '42101': { count: 5516, year: 2025, coc: 'PA-500 Philadelphia CoC' },
  '11001': { count: 5138, year: 2025, coc: 'DC-500 District of Columbia CoC' },
  '08031': { count: 10774, year: 2025, coc: 'CO-503 Metropolitan Denver CoC', note: 'CoC covers the 7-county Denver metro, not Denver County alone' },
  '24510': { count: 2024, year: 2025, coc: 'MD-501 Baltimore CoC' },
  '22071': { count: 1563, year: 2025, coc: 'LA-503 New Orleans/Jefferson Parish CoC', note: 'CoC covers Orleans and Jefferson Parishes' },
  '47037': { count: 2179, year: 2025, coc: 'TN-504 Nashville/Davidson County CoC' },
  '25025': { count: 5540, year: 2025, coc: 'MA-500 Boston CoC', note: 'CoC covers the City of Boston, not all of Suffolk County' },
  '29510': { count: 1637, year: 2025, coc: 'MO-501 St. Louis City CoC' },
  '53033': { count: 16868, year: 2024, coc: 'WA-500 Seattle/King County CoC', note: '2025 row is a sheltered-only count, so the 2024 full count is used' },
  '41051': { count: 10526, year: 2025, coc: 'OR-501 Portland, Gresham/Multnomah County CoC' },
  '27053': { count: 3078, year: 2025, coc: 'MN-500 Minneapolis/Hennepin County CoC' },
  '13121': { count: 2894, year: 2025, coc: 'GA-500 Atlanta CoC', note: 'CoC covers the City of Atlanta (including its DeKalb County portion), not all of Fulton County; the rest of Fulton is GA-502 Fulton County CoC' },
  '12086': { count: 3615, year: 2025, coc: 'FL-600 Miami-Dade County CoC' },
  '39049': { count: 2556, year: 2025, coc: 'OH-503 Columbus/Franklin County CoC' },
  '37119': { count: 2117, year: 2025, coc: 'NC-505 Charlotte/Mecklenberg CoC' },
  '06073': { count: 9905, year: 2025, coc: 'CA-601 San Diego City and County CoC' },
  '32003': { count: 7906, year: 2024, coc: 'NV-500 Las Vegas/Clark County CoC', note: '2025 row is a sheltered-only count, so the 2024 full count is used' },
  '49035': { count: 2863, year: 2025, coc: 'UT-500 Salt Lake City & County CoC' },
  '26163': { count: 1725, year: 2024, coc: 'MI-501 Detroit CoC', note: 'CoC covers the City of Detroit, not all of Wayne County (the rest is MI-502); the 2025 row is sheltered-only, so the 2024 full count is used' },
  '39035': { count: 1655, year: 2025, coc: 'OH-502 Cleveland/Cuyahoga County CoC' },
  '29095': { count: 2654, year: 2025, coc: 'MO-604a Kansas City, Independence, Lee\u2019s Summit/Jackson, Wyandotte Counties, MO & KS CoC', note: 'CoC also covers Wyandotte County, KS, not Jackson County alone' },
  '55079': { count: 968, year: 2025, coc: 'WI-501 Milwaukee City & County CoC' },
  '06067': { count: 6615, year: 2024, coc: 'CA-503 Sacramento City & County CoC', note: '2025 row is a sheltered-only count, so the 2024 full count is used' },
  '15003': { count: 4497, year: 2024, coc: 'HI-501 Honolulu City and County CoC', note: '2025 row is a sheltered-only count, so the 2024 full count is used' },
};

// table -> variables (API names)
const TABLES = {
  B01003: ['B01003_001E'],
  B25003: ['B25003_003E'],
  B25010: ['B25010_003E'],
  B19013: ['B19013_001E'],
  B25064: ['B25064_001E'],
  B25070: ['B25070_001E', 'B25070_007E', 'B25070_008E', 'B25070_009E', 'B25070_010E', 'B25070_011E'],
  B17001: ['B17001_001E', 'B17001_002E'],
  B25004: ['B25004_001E', 'B25004_002E'],
};

const UA = { 'User-Agent': 'Mozilla/5.0 (lepus-solutions build-cities.mjs)' };

async function getJson(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (!res.ok) throw new Error(`${res.status}`);
      return await res.json();
    } catch (e) {
      if (i >= tries) throw new Error(`${url} -> ${e.message}`, { cause: e });
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
}

// Census sentinel values (-666666666, -999999999, -888888888, -222222222 ...) and blanks -> null.
// None of the variables used here can legitimately be negative.
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Number(v));
const round1 = (v) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
const round5 = (c) => (typeof c[0] === 'number' ? [Math.round(c[0] * 1e5) / 1e5, Math.round(c[1] * 1e5) / 1e5] : c.map(round5));

// Returns { geoid: { NAME, VAR: number|null } } for one table at one geography.
// level: 'tract' (all tracts in county) | 'county'
async function fetchAcs(table, vars, fips, level) {
  const st = fips.slice(0, 2);
  const co = fips.slice(2);
  if (KEY) {
    const geo = level === 'tract' ? `for=tract:*&in=state:${st}&in=county:${co}` : `for=county:${co}&in=state:${st}`;
    const rows = await getJson(`https://api.census.gov/data/${ACS_YEAR}/acs/acs5?get=NAME,${vars.join(',')}&${geo}&key=${KEY}`);
    const [head, ...body] = rows;
    const out = {};
    for (const r of body) {
      const rec = Object.fromEntries(head.map((h, i) => [h, r[i]]));
      const id = level === 'tract' ? rec.state + rec.county + rec.tract : rec.state + rec.county;
      out[id] = rec;
    }
    return out;
  }
  const g = level === 'tract' ? `0500000US${fips}$1400000` : `0500000US${fips}`;
  const json = await getJson(`https://data.census.gov/api/access/data/table?id=ACSDT5Y${ACS_YEAR}.${table}&g=${g}`);
  const [head, ...body] = json.response.data;
  const out = {};
  for (const r of body) {
    const rec = Object.fromEntries(head.map((h, i) => [h, r[i]]));
    out[rec.GEO_ID.split('US')[1]] = rec;
  }
  return out;
}

// ArcGIS REST query with pagination (resultOffset) for any county size.
async function arcgisQuery(base, where, outFields, extra = '', geojson = false) {
  const features = [];
  for (let offset = 0; ; ) {
    const url = `${base}/query?where=${encodeURIComponent(where)}&outFields=${outFields}&f=${geojson ? 'geojson' : 'json'}` +
      `&resultOffset=${offset}&resultRecordCount=1000${extra}`;
    const json = await getJson(url);
    if (json.error) throw new Error(`${base}: ${JSON.stringify(json.error)}`);
    const page = json.features || [];
    features.push(...page);
    const more = json.exceededTransferLimit || json.properties?.exceededTransferLimit;
    if (!more || page.length === 0) break;
    offset += page.length;
  }
  return features;
}

const TIGER_TRACTS = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS${ACS_YEAR}/MapServer/8`;
const QCT_SERVICE = 'https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/QUALIFIED_CENSUS_TRACTS_2026/FeatureServer/0';
const LIHTC_SERVICE = 'https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/LIHTC/FeatureServer/0';
// LVL2KX geocode levels HUD says are accurate enough for point-in-polygon (R = rooftop, 4 = ZIP+4, B = block group).
// 'T' (tract centroid) is used only when the record's tract (2010 vintage) is itself a 2020 GEOID; others are county-only.
const LIHTC_PIP_LEVELS = new Set(['R', '4', 'B']);

// Ray-casting point-in-polygon on GeoJSON [lon, lat] rings.
function inRing(x, y, ring) {
  let c = false;
  for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
    const [xi, yi] = ring[i];
    const [xk, yk] = ring[k];
    if (yi > y !== yk > y && x < ((xk - xi) * (y - yi)) / (yk - yi) + xi) c = !c;
  }
  return c;
}
const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
const inGeom = (x, y, g) => polys(g).some((p) => inRing(x, y, p[0]) && !p.slice(1).some((h) => inRing(x, y, h)));

// HUD LIHTC Database projects in the county, assigned to 2020 tracts by their point coordinates.
// HUD's tract field (TRACT_LEVEL) uses 2010 tract IDs, so it is not used for the join (except as noted above).
async function fetchLihtc(fips, fullGeom, tractIds) {
  const rows = (await arcgisQuery(
    LIHTC_SERVICE,
    // HUD stores FIPS codes as numbers-in-text, so states below 10 lose their leading zero ('6075', not '06075').
    `COUNTY_LEVEL IN ('${fips}', '${String(Number(fips))}')`,
    'HUD_ID,PROJECT,LI_UNITS,N_UNITS,YR_PIS,LVL2KX,LAT,LON,TRACT_LEVEL',
    '&returnGeometry=false',
  )).map((f) => f.attributes).filter((r) => !/^TEST PROPERTY/i.test(r.PROJECT || ''));
  const byTract = {};
  let unassigned = 0;
  for (const r of rows) {
    let geoid = null;
    const lvl = r.LVL2KX;
    const tract2010 = r.TRACT_LEVEL ? String(r.TRACT_LEVEL).padStart(11, '0') : null;
    if (r.LAT != null && r.LON != null && (LIHTC_PIP_LEVELS.has(lvl) || (lvl === 'T' && tractIds.has(tract2010)))) {
      geoid = fullGeom.find((f) => inGeom(r.LON, r.LAT, f.geometry))?.properties.GEOID || null;
      if (!tractIds.has(geoid)) geoid = null;
    }
    if (!geoid) { unassigned++; continue; }
    (byTract[geoid] ??= []).push(r);
  }
  return { rows, byTract, unassigned };
}

// Sum LI_UNITS; null if any project's LI_UNITS is unreported (never filled with 0 or total units).
function lihtcSummary(list) {
  const known = list.filter((r) => r.LI_UNITS != null);
  const reported = known.reduce((a, r) => a + r.LI_UNITS, 0);
  return {
    existingLihtcProjects: list.length,
    existingLihtcUnits: known.length === list.length ? reported : null,
    existingLihtcUnitsReported: reported,
    existingLihtcProjectsUnitsUnreported: list.length - known.length,
  };
}

function sources(fips) {
  const st = fips.slice(0, 2);
  const co = fips.slice(2);
  const pit = PIT[fips];
  const s = {
    acs5: {
      title: `American Community Survey ${ACS_YEAR - 4}-${ACS_YEAR} 5-Year Estimates, Detailed Tables (B01003, B25003, B25010, B19013, B25064, B25070, B17001, B25004), census tracts`,
      publisher: 'U.S. Census Bureau',
      url: `https://data.census.gov/table/ACSDT5Y${ACS_YEAR}.B25070?g=050XX00US${fips}$1400000`,
      year: ACS_YEAR,
      accessed: TODAY,
    },
    tiger: {
      title: `TIGERweb ACS ${ACS_YEAR} Census Tracts (tigerWMS_ACS${ACS_YEAR} MapServer layer 8)`,
      publisher: 'U.S. Census Bureau',
      url: `${TIGER_TRACTS}/query?where=STATE%3D%27${st}%27+AND+COUNTY%3D%27${co}%27&outFields=GEOID&f=geojson`,
      year: ACS_YEAR,
      accessed: TODAY,
    },
    hudQct: {
      title: 'Qualified Census Tracts 2026 (LIHTC), HUD ArcGIS feature service QUALIFIED_CENSUS_TRACTS_2026',
      publisher: 'U.S. Department of Housing and Urban Development (HUD)',
      url: 'https://hudgis-hud.opendata.arcgis.com/datasets/HUD::qualified-census-tracts-2026/about',
      year: 2026,
      accessed: TODAY,
    },
    hudLihtc: {
      title: 'Low-Income Housing Tax Credit Properties (HUD National LIHTC Database), HUD ArcGIS feature service LIHTC, low-income units (LI_UNITS) by project, placed in service 1987-2022, joined to 2020 tracts by point location',
      publisher: 'U.S. Department of Housing and Urban Development (HUD), Office of Policy Development and Research',
      url: 'https://hudgis-hud.opendata.arcgis.com/datasets/HUD::low-income-housing-tax-credit-properties',
      service: `${LIHTC_SERVICE}/query?where=${encodeURIComponent(`COUNTY_LEVEL IN ('${fips}', '${String(Number(fips))}')`)}&outFields=*&f=json`,
      year: 2022,
      accessed: TODAY,
    },
  };
  if (pit) {
    s.hudPit = {
      title: `Point-in-Time Counts by CoC, 2007-2025 (${pit.coc}, ${pit.year}, Overall Homeless)`,
      publisher: 'U.S. Department of Housing and Urban Development (HUD), Office of Policy Development and Research',
      url: 'https://www.huduser.gov/portal/sites/default/files/xls/2007-2025-PIT-Counts-by-CoC.xlsb',
      year: pit.year,
      accessed: TODAY,
    };
  }
  return s;
}

async function buildCounty(fips) {
  const st = fips.slice(0, 2);
  const co = fips.slice(2);

  // --- ACS ---
  const tractRaw = {};
  const countyRaw = {};
  for (const [table, vars] of Object.entries(TABLES)) {
    const [t, c] = await Promise.all([fetchAcs(table, vars, fips, 'tract'), fetchAcs(table, vars, fips, 'county')]);
    for (const [id, rec] of Object.entries(t)) {
      tractRaw[id] ??= { NAME: rec.NAME };
      for (const v of vars) tractRaw[id][v] = num(rec[v]);
    }
    const crec = c[fips];
    if (!crec) throw new Error(`no county row for ${fips} in ${table}`);
    countyRaw.NAME ??= crec.NAME;
    for (const v of vars) countyRaw[v] = num(crec[v]);
  }

  // --- Geometry ---
  const geoFeatures = await arcgisQuery(
    TIGER_TRACTS,
    `STATE='${st}' AND COUNTY='${co}'`,
    'GEOID,NAME',
    '&outSR=4326&maxAllowableOffset=0.0005&returnGeometry=true',
    true,
  );
  const geomById = {};
  for (const f of geoFeatures) geomById[f.properties.GEOID] = f;

  // --- LIHTC (point-in-polygon against unsimplified tract geometry, used in memory only) ---
  let lihtc = null;
  try {
    const fullGeom = await arcgisQuery(TIGER_TRACTS, `STATE='${st}' AND COUNTY='${co}'`, 'GEOID', '&outSR=4326&returnGeometry=true', true);
    lihtc = await fetchLihtc(fips, fullGeom, new Set(Object.keys(tractRaw)));
  } catch (e) {
    console.warn(`  warn: LIHTC lookup failed (${e.message}); LIHTC fields = null`);
  }

  // --- QCT ---
  let qct = null;
  try {
    const q = await arcgisQuery(QCT_SERVICE, `STATE='${st}' AND COUNTY='${co}'`, 'GEOID', '&returnGeometry=false');
    qct = new Set(q.map((f) => f.attributes.GEOID));
    for (const g of qct) if (!tractRaw[g]) console.warn(`  warn: QCT ${g} not among ACS tracts`);
  } catch (e) {
    console.warn(`  warn: QCT lookup failed (${e.message}); isQCT = null`);
  }

  // --- Tracts ---
  const tracts = {};
  for (const geoid of Object.keys(tractRaw).sort()) {
    const r = tractRaw[geoid];
    const denom = r.B25070_001E !== null && r.B25070_011E !== null ? r.B25070_001E - r.B25070_011E : null;
    const burdened = [r.B25070_007E, r.B25070_008E, r.B25070_009E, r.B25070_010E];
    tracts[geoid] = {
      geoid,
      name: geomById[geoid]?.properties.NAME || r.NAME.split(/[;,]/)[0].trim(),
      population: r.B01003_001E,
      renterHouseholds: r.B25003_003E,
      avgRenterHouseholdSize: r.B25010_003E,
      medianHouseholdIncome: r.B19013_001E,
      medianGrossRent: r.B25064_001E,
      rentBurdenedPct: denom > 0 && burdened.every((x) => x !== null) ? round1((burdened.reduce((a, b) => a + b, 0) / denom) * 100) : null,
      severelyRentBurdenedPct: denom > 0 && r.B25070_010E !== null ? round1((r.B25070_010E / denom) * 100) : null,
      severelyBurdenedRenterHouseholds: r.B25070_010E,
      povertyRate: r.B17001_001E > 0 && r.B17001_002E !== null ? round1((r.B17001_002E / r.B17001_001E) * 100) : null,
      vacantUnits: r.B25004_001E,
      vacantForRent: r.B25004_002E,
      isQCT: qct ? qct.has(geoid) : null,
      ...(lihtc
        ? lihtcSummary(lihtc.byTract[geoid] || [])
        : { existingLihtcProjects: null, existingLihtcUnits: null, existingLihtcUnitsReported: null, existingLihtcProjectsUnitsUnreported: null }),
    };
  }

  const features = [];
  for (const geoid of Object.keys(tracts)) {
    const f = geomById[geoid];
    if (!f) { console.warn(`  warn: no geometry for ${geoid}`); continue; }
    features.push({ type: 'Feature', properties: { GEOID: geoid }, geometry: { type: f.geometry.type, coordinates: round5(f.geometry.coordinates) } });
  }
  for (const g of Object.keys(geomById)) if (!tracts[g]) console.warn(`  warn: geometry ${g} has no ACS row`);

  const countyName = countyRaw.NAME.split(/[;,]/)[0].trim();
  const pit = PIT[fips];
  const lihtcCounty = lihtc ? lihtcSummary(lihtc.rows) : null;
  const out = {
    meta: {
      placeholder: false, geography: 'tract', acsVintage: ACS_YEAR, tractVintage: 2020, qctYear: 2026, lihtcPlacedInServiceThrough: 2022, updated: TODAY,
      // County projects that could not be placed in a 2020 tract (no coordinates, or a low-precision geocode).
      // They count in the jurisdiction totals but in no tract.
      lihtcProjectsNotInATract: lihtc ? lihtc.unassigned : null,
    },
    sources: sources(fips),
    fieldSources: {
      population: 'acs5', renterHouseholds: 'acs5', avgRenterHouseholdSize: 'acs5', medianHouseholdIncome: 'acs5',
      medianGrossRent: 'acs5', rentBurdenedPct: 'acs5', severelyRentBurdenedPct: 'acs5',
      severelyBurdenedRenterHouseholds: 'acs5', povertyRate: 'acs5', vacantUnits: 'acs5', vacantForRent: 'acs5',
      isQCT: 'hudQct', existingLihtcUnits: 'hudLihtc', existingLihtcProjects: 'hudLihtc',
      existingLihtcUnitsReported: 'hudLihtc', existingLihtcProjectsUnitsUnreported: 'hudLihtc', geometry: 'tiger', ...(pit ? { homelessPIT: 'hudPit' } : {}),
    },
    jurisdiction: {
      id: fips,
      name: DISPLAY_NAMES[fips] || countyName,
      countyName,
      state: ABBR[st] || null,
      stateFips: st,
      population: countyRaw.B01003_001E,
      renterHouseholds: countyRaw.B25003_003E,
      severelyBurdenedRenterHouseholds: countyRaw.B25070_010E,
      medianHouseholdIncome: countyRaw.B19013_001E,
      homelessPIT: pit ? pit.count : null,
      existingLihtcUnits: lihtcCounty ? lihtcCounty.existingLihtcUnits : null,
      existingLihtcProjects: lihtcCounty ? lihtcCounty.existingLihtcProjects : null,
      existingLihtcUnitsReported: lihtcCounty ? lihtcCounty.existingLihtcUnitsReported : null,
      existingLihtcProjectsUnitsUnreported: lihtcCounty ? lihtcCounty.existingLihtcProjectsUnitsUnreported : null,
      homelessPITSource: pit ? `${pit.coc}, ${pit.year} PIT count${pit.note ? ` (${pit.note})` : ''}` : null,
    },
    tracts,
    geometry: { type: 'FeatureCollection', features },
  };
  return out;
}

const ids = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_IDS;
for (const id of ids) if (!/^\d{5}$/.test(id)) throw new Error(`bad FIPS "${id}" (need 5 digits, e.g. 48453)`);

await mkdir(OUT_DIR, { recursive: true });
let index = [];
try { index = JSON.parse(await readFile(path.join(OUT_DIR, 'index.json'), 'utf8')); } catch { /* new */ }

for (const fips of ids) {
  console.log(`building ${fips} ...`);
  const data = await buildCounty(fips);
  await writeFile(path.join(OUT_DIR, `${fips}.json`), JSON.stringify(data));
  const entry = {
    id: fips,
    name: data.jurisdiction.name,
    state: data.jurisdiction.state,
    stateFips: data.jurisdiction.stateFips,
    population: data.jurisdiction.population,
    tractCount: Object.keys(data.tracts).length,
    file: `cities/${fips}.json`,
  };
  index = index.filter((e) => e.id !== fips).concat(entry);
  console.log(`  ${entry.tractCount} tracts, ${data.geometry.features.length} shapes, QCTs: ${Object.values(data.tracts).filter((t) => t.isQCT).length}, ` +
    `LIHTC projects: ${data.jurisdiction.existingLihtcProjects} (${data.meta.lihtcProjectsNotInATract} not in a tract, ` +
    `${data.jurisdiction.existingLihtcProjectsUnitsUnreported} with unreported LI_UNITS), size ${(JSON.stringify(data).length / 1024).toFixed(0)} KB`);
}

// Order: DEFAULT_IDS priority order first (Austin = default), then any added counties by name.
const rank = (e) => (DEFAULT_IDS.includes(e.id) ? DEFAULT_IDS.indexOf(e.id) : 1000);
index.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
await writeFile(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`wrote ${index.length} jurisdictions to public/cities/index.json`);
