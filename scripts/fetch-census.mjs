#!/usr/bin/env node
// Pulls state-level ACS 5-year fields and merges them into src/data/states.json.
//
// Usage:  node scripts/fetch-census.mjs [year]        (default year: 2024)
//
// Source: U.S. Census Bureau, American Community Survey 5-year detailed tables.
// If CENSUS_API_KEY is set, api.census.gov is used. Otherwise the script falls back to
// the keyless data.census.gov table API (api.census.gov now rejects keyless requests).
// No dependencies: uses Node's global fetch.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const YEAR = Number(process.argv[2] || 2024);
const KEY = process.env.CENSUS_API_KEY;
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/data/states.json');

const TABLES = {
  B01003: ['B01003_001E'],
  B25003: ['B25003_003E'],
  B25010: ['B25010_003E'],
  B19013: ['B19013_001E'],
  B25064: ['B25064_001E'],
  B25070: ['B25070_001E', 'B25070_007E', 'B25070_008E', 'B25070_009E', 'B25070_010E', 'B25070_011E'],
};

const ABBR = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC',
  '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY',
  '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT',
  '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH',
  '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY',
};

// Returns { fips: { NAME, VAR: number } } for one table.
async function fetchTable(table, vars) {
  let rows;
  if (KEY) {
    const url = `https://api.census.gov/data/${YEAR}/acs/acs5?get=NAME,${vars.join(',')}&for=state:*&key=${KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    rows = await res.json();
    const [head, ...body] = rows;
    return Object.fromEntries(body.map((r) => [r[head.indexOf('state')], Object.fromEntries(head.map((h, i) => [h, r[i]]))]));
  }
  const url = `https://data.census.gov/api/access/data/table?id=ACSDT5Y${YEAR}.${table}&g=010XX00US$0400000`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const json = await res.json();
  const [head, ...body] = json.response.data;
  const out = {};
  for (const r of body) {
    const rec = Object.fromEntries(head.map((h, i) => [h, r[i]]));
    out[rec.GEO_ID.slice(-2)] = rec;
  }
  return out;
}

const num = (v) => (v === null || v === undefined || v === '' || Number(v) < 0 ? null : Number(v));
const round1 = (v) => (v === null ? null : Math.round(v * 10) / 10);

const merged = {};
for (const [table, vars] of Object.entries(TABLES)) {
  const data = await fetchTable(table, vars);
  for (const [fips, rec] of Object.entries(data)) {
    if (!ABBR[fips]) continue; // drops Puerto Rico (72)
    merged[fips] ??= { NAME: rec.NAME };
    for (const v of vars) merged[fips][v] = num(rec[v]);
  }
  console.log(`fetched ${table}`);
}

const file = JSON.parse(await readFile(OUT, 'utf8'));
file.states ??= {};
for (const [fips, m] of Object.entries(merged)) {
  const computed = m.B25070_001E - m.B25070_011E;
  const burdened = m.B25070_007E + m.B25070_008E + m.B25070_009E + m.B25070_010E;
  const s = (file.states[fips] ??= {});
  Object.assign(s, {
    fips,
    abbr: ABBR[fips],
    name: m.NAME,
    population: m.B01003_001E,
    renterHouseholds: m.B25003_003E,
    avgRenterHouseholdSize: m.B25010_003E,
    medianHouseholdIncome: m.B19013_001E,
    medianGrossRent: m.B25064_001E,
    rentBurdenedPct: computed > 0 ? round1((burdened / computed) * 100) : null,
    severelyRentBurdenedPct: computed > 0 ? round1((m.B25070_010E / computed) * 100) : null,
  });
}
file.states = Object.fromEntries(Object.entries(file.states).filter(([f]) => ABBR[f]).sort(([a], [b]) => a.localeCompare(b)));
file.sources ??= {};
file.sources[`acs5-${YEAR}`] = {
  title: `American Community Survey ${YEAR - 4}-${YEAR} 5-Year Estimates, Detailed Tables B01003, B25003, B25010, B19013, B25064, B25070`,
  publisher: 'U.S. Census Bureau',
  url: `https://data.census.gov/table/ACSDT5Y${YEAR}.B25070`,
  year: YEAR,
  accessed: new Date().toISOString().slice(0, 10),
};
file.fieldSources ??= {};
for (const f of ['population', 'renterHouseholds', 'avgRenterHouseholdSize', 'medianHouseholdIncome', 'medianGrossRent', 'rentBurdenedPct', 'severelyRentBurdenedPct']) {
  file.fieldSources[f] = `acs5-${YEAR}`;
}
await writeFile(OUT, JSON.stringify(file, null, 2) + '\n');
console.log(`wrote ${Object.keys(merged).length} states to ${OUT}`);
