// "Council brief": a one-page, print-optimized summary of the current city plan. Rendered in a portal
// over the app; city.css hides #root under @media print so only the brief prints.
import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { geoMercator, geoPath } from 'd3-geo'
import { scaleLinear } from 'd3-scale'
import { AFFH_REPEAL_URL, AFFH_RULE_URL } from './scenario.js'

const W = 640
const H = 420
const isNum = (n) => n != null && Number.isFinite(Number(n))
const ND = 'no data'
const fmtInt = (n) => (isNum(n) ? Math.round(n).toLocaleString() : ND)
const fmtPct = (n, d = 1) => (isNum(n) ? `${Number(n).toFixed(d)}%` : ND)
function fmtMoney(n) {
  if (!isNum(n)) return ND
  const a = Math.abs(n)
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `$${(n / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`
  if (a >= 1e3) return `$${Math.round(n / 1e3)}K`
  return `$${Math.round(n)}`
}

function BriefMap({ geometry, dollars, qct }) {
  const shapes = useMemo(() => {
    if (!geometry?.features?.length) return []
    const path = geoPath(geoMercator().fitSize([W, H], geometry))
    return geometry.features.map((f) => ({ id: String(f.properties?.GEOID ?? f.id ?? ''), d: path(f) ?? '' }))
  }, [geometry])
  const max = Math.max(1, ...Object.values(dollars))
  const color = scaleLinear().domain([0, max]).range(['#eef2ff', '#3730a3']).clamp(true)
  if (!shapes.length) return <p className="text-xs text-zinc-500">No tract geometry in this file.</p>
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Map of dollars allocated by census tract">
        <defs>
          <pattern id="brief-qct-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="#b45309" strokeWidth="0.8" strokeOpacity="0.7" />
          </pattern>
        </defs>
        {shapes.map((s) => (
          <path key={s.id} d={s.d} fill={dollars[s.id] ? color(dollars[s.id]) : '#f4f4f5'} stroke="#a1a1aa" strokeWidth={0.4} />
        ))}
        {shapes.filter((s) => qct[s.id]).map((s) => (
          <path key={`q${s.id}`} d={s.d} fill="url(#brief-qct-hatch)" stroke="#b45309" strokeWidth={0.6} />
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap items-center gap-4 text-[10px] text-zinc-600">
        <span className="flex items-center gap-1.5">
          $0 <span className="inline-block h-2 w-24 rounded-full" style={{ background: 'linear-gradient(to right,#eef2ff,#3730a3)' }} /> {fmtMoney(max)} per tract
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 border border-amber-700" style={{ background: 'repeating-linear-gradient(45deg,transparent 0 2px,rgba(180,83,9,.6) 2px 3px)' }} /> HUD Qualified Census Tract
        </span>
        <span>Grey: no dollars allocated</span>
      </figcaption>
    </figure>
  )
}

function Src({ s }) {
  if (!s) return null
  if (typeof s === 'string') return <span>{s}</span>
  return (
    <span>
      {[s.publisher, s.title].filter(Boolean).join(', ')}
      {s.year ? ` (${s.year})` : ''}
      {s.accessed ? `, accessed ${s.accessed}` : ''}
      {s.url && <>. <span className="break-all text-indigo-700">{s.url}</span></>}
    </span>
  )
}

/**
 * Props: juris, meta, sources, ivSources, interventions, geometry, areas, result, metrics, top (rows),
 * byTractType, params { budget, lensLabel, cap, opp, qctOnly, vacancyCap, avoidLihtc, enabled, excludedCount },
 * headline { reachedPct, gain, baselineUnits }, explanation[], link, onClose.
 */
export default function CouncilBrief({ juris, meta, sources, ivSources, interventions, geometry, areas, result, metrics, top, byTractType, params, headline, explanation, link, lihtc, povPct = (v) => v, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.classList.add('lepus-brief-open')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('lepus-brief-open')
    }
  }, [onClose])

  const today = new Date().toISOString().slice(0, 10)
  const qct = Object.fromEntries(Object.values(areas).filter((a) => a.isQCT).map((a) => [a.fips, true]))
  const ivs = interventions.filter((iv) => params.enabled.includes(iv.id))
  const oppPct = Math.round(params.opp * 100)
  const levers = [
    ['Budget', fmtMoney(params.budget)],
    ['Priority lens', params.lensLabel],
    ['Need ↔ opportunity (policy choice)', oppPct ? `${100 - oppPct}% need / ${oppPct}% opportunity` : '100% need (no opportunity weighting)'],
    ['Max share per tract', `${Math.round(params.cap * 100)}%`],
    ['QCT-only spending', params.qctOnly ? 'On' : 'Off'],
    ...(interventions.some((iv) => iv.id === 'acquisition-rehab') ? [['Rehab capped by vacant units', params.vacancyCap ? 'On' : 'Off']] : []),
    ...(lihtc ? [['Avoid LIHTC concentration', params.avoidLihtc ? 'On' : 'Off']] : []),
    ['Building types', ivs.map((iv) => `${iv.short ?? iv.name} (${fmtMoney(iv.costPerUnit)}/unit)`).join(', ') || 'none'],
    ['Tracts excluded by planner', fmtInt(params.excludedCount)],
  ]
  const kpis = [
    ['Units funded', fmtInt(metrics?.units)],
    ['People housed', fmtInt(metrics?.people)],
    ['Tracts funded', fmtInt(metrics?.funded)],
    ['Dollars allocated', fmtMoney(metrics?.spent)],
    ['Avg cost per unit', fmtMoney(result?.avgCostPerUnit)],
    ['Severely burdened reached', fmtPct(headline.reachedPct)],
    ['Dollars to QCTs', fmtPct(metrics?.qctPct, 0)],
    ['Dollars to high-opportunity tracts', fmtPct(metrics?.highOppPct, 0)],
  ]

  return createPortal(
    <div className="lepus-brief lepus-city fixed inset-0 z-[200] overflow-auto bg-zinc-200/90 print:static print:overflow-visible print:bg-white" role="dialog" aria-modal="true" aria-label="Council brief">
      <div className="lepus-brief-bar sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-300 bg-white/95 px-6 py-3 backdrop-blur print:hidden">
        <span className="text-sm font-medium text-zinc-700">Council brief preview. Use your browser's print dialog to save as PDF.</span>
        <div className="flex gap-2">
          <button type="button" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500" onClick={() => window.print()}>Print</button>
          <button type="button" className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-100" onClick={onClose}>Close</button>
        </div>
      </div>

      <article className="lepus-brief-page mx-auto my-6 max-w-[8.5in] bg-white px-10 py-8 text-zinc-900 shadow-xl print:my-0 print:max-w-none print:px-0 print:py-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-zinc-900 pb-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-indigo-700">Council brief · Affordable housing allocation plan</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{juris.name ?? 'Jurisdiction'}{juris.state ? `, ${juris.state}` : ''}</h1>
            <p className="text-xs text-zinc-600">{fmtMoney(params.budget)} across {fmtInt(Object.keys(areas).length)} census tracts · generated {today}</p>
          </div>
          <div className="tabular text-right text-xs text-zinc-600">
            <div className="text-3xl font-semibold text-zinc-900">{fmtInt(metrics?.units)}</div>
            units funded
          </div>
        </header>

        <section className="mt-4 grid grid-cols-4 gap-x-6 gap-y-2.5 text-xs">
          {kpis.map(([k, v]) => (
            <div key={k} className="border-l-2 border-indigo-600 pl-2">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">{k}</div>
              <div className="tabular text-base font-semibold">{v}</div>
            </div>
          ))}
        </section>

        <section className="mt-5 grid grid-cols-[1.25fr_1fr] gap-6">
          <BriefMap geometry={geometry} dollars={metrics?.dollars ?? {}} qct={qct} />
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-700">Plan settings</h2>
            <dl className="mt-1.5 space-y-1 text-xs">
              {levers.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[1fr_1.2fr] gap-2 border-b border-zinc-100 pb-1">
                  <dt className="text-zinc-500">{k}</dt>
                  <dd className="tabular text-zinc-900">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mt-5 break-inside-avoid">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-700">Top 10 tracts</h2>
          <table className="tabular mt-1.5 w-full text-[11px]">
            <thead>
              <tr className="border-b border-zinc-400 text-left text-zinc-500">
                <th className="py-1 pr-2 font-medium">#</th>
                <th className="py-1 pr-2 font-medium">Tract (GEOID)</th>
                <th className="py-1 pr-2 font-medium">QCT</th>
                <th className="py-1 pr-2 text-right font-medium">Poverty</th>
                <th className="py-1 pr-2 text-right font-medium">Score</th>
                <th className="py-1 pr-2 text-right font-medium">Dollars</th>
                {ivs.map((iv) => <th key={iv.id} className="py-1 pr-2 text-right font-medium">{iv.short ?? iv.name}</th>)}
                <th className="py-1 text-right font-medium">Units</th>
              </tr>
            </thead>
            <tbody>
              {top.map((r) => (
                <tr key={r.geoid} className="border-b border-zinc-100">
                  <td className="py-1 pr-2 text-zinc-500">{r.rank}</td>
                  <td className="py-1 pr-2">{areas[r.geoid]?.abbr} <span className="text-zinc-400">({r.geoid})</span></td>
                  <td className="py-1 pr-2">{areas[r.geoid]?.isQCT ? <span className="font-semibold text-amber-700">QCT</span> : ''}</td>
                  <td className="py-1 pr-2 text-right">{fmtPct(povPct(areas[r.geoid]?.povertyRate))}</td>
                  <td className="py-1 pr-2 text-right">{isNum(r.needScore) ? r.needScore.toFixed(2) : ND}</td>
                  <td className="py-1 pr-2 text-right font-medium">{fmtMoney(r.dollars)}</td>
                  {ivs.map((iv) => <td key={iv.id} className="py-1 pr-2 text-right">{fmtInt(byTractType[r.geoid]?.[iv.id] ?? 0)}</td>)}
                  <td className="py-1 text-right font-semibold">{fmtInt(r.units)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-5 break-inside-avoid">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-700">Why this plan</h2>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-zinc-800">
            <li>The optimizer spends the budget in small increments, each going to the tract and building type with the most need-weighted units per dollar, with diminishing returns as a tract's severely burdened renter households are served.</li>
            {oppPct > 0 && (
              <li>
                {oppPct}% of each tract's score is an opportunity component (lower poverty rate scores higher), so that subsidized housing is not concentrated only in high-poverty areas, the concern behind HUD's 2015 Affirmatively Furthering Fair Housing rule. The weight is a local policy choice.
              </li>
            )}
            {explanation.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-6 break-inside-avoid text-[10px] leading-snug text-zinc-700">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-700">Data sources</h2>
            <ul className="mt-1.5 space-y-1">
              {Object.entries(sources).map(([id, s]) => <li key={id}><Src s={s} /></li>)}
              {Object.entries(ivSources ?? {}).map(([id, s]) => <li key={id}><Src s={s} /></li>)}
              {oppPct > 0 && <li>Opportunity framing: HUD, Affirmatively Furthering Fair Housing final rule, 80 FR 42272 (2015). <span className="break-all text-indigo-700">{AFFH_RULE_URL}</span> (HUD terminated the AFFH rule in 2025: <span className="break-all text-indigo-700">{AFFH_REPEAL_URL}</span>).</li>}
            </ul>
            <p className="mt-1.5 text-zinc-500">
              Vintages: ACS 5-year {meta?.acsVintage ?? ND}, tract boundaries {meta?.tractVintage ?? ND}, HUD QCTs {meta?.qctYear ?? ND}. Data file updated {meta?.updated ?? ND}.
            </p>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-700">Limitations and assumptions</h2>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-3.5">
              <li>Tract need uses ACS severely cost-burdened renter households (50%+ of income on rent) as a proxy for the extremely-low-income unit shortage, which NLIHC publishes only for states and metros. It is also the tract's unit cap.</li>
              <li>No tract-level homelessness or construction-cost data exist; those weights drop out.</li>
              <li>Per-unit costs are national figures from the cited studies, not local bids. ACS estimates carry margins of error.</li>
              <li>"High-opportunity" here means a tract poverty rate below this jurisdiction's median tract. That is a definition used by this tool, not a HUD designation.</li>
              {oppPct > 0 && <li>The need ↔ opportunity blend and its weight are a policy choice, not an empirical finding.</li>}
              {params.avoidLihtc && <li>The LIHTC concentration penalty (opportunity × (1 − normalized existing LIHTC units per renter household)) is a model assumption.</li>}
              <li>This is decision support for a planning discussion, not a site-level feasibility analysis.</li>
            </ul>
          </div>
        </section>

        <footer className="mt-5 flex items-end justify-between gap-6 border-t border-zinc-300 pt-2 text-[10px] text-zinc-500">
          <div className="min-w-0">
            <div className="font-medium text-zinc-700">Reproduce this scenario</div>
            <div className="mono break-all text-indigo-700">{link}</div>
          </div>
          <div className="shrink-0 text-right">
            Generated {today}
            <div>Powered by <span className="font-semibold text-indigo-700">Lepus Analytics</span></div>
          </div>
        </footer>
      </article>
    </div>,
    document.body,
  )
}
