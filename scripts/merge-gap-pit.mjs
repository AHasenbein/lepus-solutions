#!/usr/bin/env node
// Merges NLIHC "The Gap" and HUD AHAR PIT state values into src/data/states.json.
//
// Usage: node scripts/merge-gap-pit.mjs <nlihc.json> <pit.json>
//   nlihc.json: { "CA": { eli, aa, surplus, per100, year }, ... }  parsed from https://nlihc.org/gap/state/<xx>
//               (rows "Extremely Low Income Renter Households", "Surplus (Deficit) ... At or below EXTREMELY LOW
//               INCOME", "Affordable and Available Rental Units per 100 ... At or below Extremely Low Income")
//   pit.json:   { "California": { total, sheltered, unsheltered }, ... }  parsed from the state profile pages
//               (Appendix A) of HUD's 2025 AHAR Part 1 PDF ("Total Homeless, 2025", "Unsheltered (n)").
// See docs/DATA_SOURCES.md for the refresh procedure.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/data/states.json');
const [gapPath, pitPath] = process.argv.slice(2);
if (!gapPath || !pitPath) throw new Error('usage: merge-gap-pit.mjs <nlihc.json> <pit.json>');

const gap = JSON.parse(await readFile(gapPath, 'utf8'));
const pit = JSON.parse(await readFile(pitPath, 'utf8'));
const file = JSON.parse(await readFile(OUT, 'utf8'));

const missing = [];
for (const s of Object.values(file.states)) {
  const g = gap[s.abbr];
  const p = pit[s.name];
  if (!g) missing.push(`gap:${s.abbr}`);
  if (!p) missing.push(`pit:${s.name}`);
  s.eliRenterHouseholds = g ? g.eli : null;
  s.affordableUnitsPer100Eli = g ? g.per100 : null;
  s.eliUnitShortage = g ? Math.max(0, -g.surplus) : null;
  s.homelessPIT = p ? p.total : null;
  s.unshelteredPIT = p ? p.unsheltered : null;
  s.constructionCostIndex = null; // no sourced per-state index yet; see docs/DATA_SOURCES.md
}
if (missing.length) console.warn('missing:', missing.join(', '));
await writeFile(OUT, JSON.stringify(file, null, 2) + '\n');
console.log('merged', Object.keys(file.states).length, 'states');
