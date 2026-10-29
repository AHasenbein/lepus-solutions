import { useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Card, CardHeader, Field } from '../ui.jsx'
import { fmtMoney, fmtNum, fmtUSD, isNum, sourceFor } from './format.js'
import statesData from '../../data/states.json'

// Optional engine module: subsidy-gap math ported from Lepus underwriting. Absent -> {}.
const financeMods = import.meta.glob('../../engine/finance.js', { eager: true })
const finance = Object.values(financeMods)[0] ?? null
const FIN_FN_NAMES = ['subsidyGapPerUnit', 'subsidyGap', 'subsidyNeededPerUnit', 'subsidyPerUnit', 'computeSubsidyGap', 'perUnitFinancing']
const financeFn = finance ? FIN_FN_NAMES.map((n) => finance[n]).find((f) => typeof f === 'function') ?? null : null
const financeDefaults = finance ? finance.financeDefaultValues?.() ?? finance.DEFAULT_ASSUMPTIONS ?? finance.DEFAULTS ?? null : null
const financeMeta = finance?.FINANCE_DEFAULTS ?? {}

// Rent the unit can charge: affordable to a household at amiPct of the
// population-weighted mean of state median household incomes (ACS). A proxy, not HUD AMI.
const incomeStates = Object.values(statesData.states).filter((s) => isNum(s.medianHouseholdIncome) && isNum(s.population))
const popTotal = incomeStates.reduce((a, s) => a + s.population, 0)
const REFERENCE_INCOME = popTotal ? incomeStates.reduce((a, s) => a + s.medianHouseholdIncome * s.population, 0) / popTotal : null

function subsidyFor(iv, assumptions) {
  if (!financeFn || !isNum(iv.costPerUnit)) return null
  try {
    const monthlyRent = finance.affordableRent && REFERENCE_INCOME != null
      ? finance.affordableRent(REFERENCE_INCOME, assumptions.amiPct, assumptions.rentToIncomePct)
      : undefined
    const out = financeFn({ ...assumptions, monthlyRent, costPerUnit: iv.costPerUnit, totalDevelopmentCost: iv.costPerUnit, intervention: iv })
    if (isNum(out)) return Number(out)
    const v = out?.subsidyPerUnit ?? out?.subsidyNeededPerUnit ?? out?.gap ?? out?.subsidyGap ?? out?.gapPerUnit
    return isNum(v) ? Number(v) : null
  } catch {
    return null
  }
}

const AXIS = { stroke: '#52525b', fontSize: 11, tickLine: false }
const TIP = { contentStyle: { background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }, labelStyle: { color: '#e4e4e7' } }

/** Cumulative units by month: engine timeline if present, else derived from months-to-occupancy. */
function buildTimeline(result, interventions) {
  const t = result?.timeline
  if (Array.isArray(t) && t.length) {
    const mono = t.every((p, i) => i === 0 || p.units >= t[i - 1].units)
    let acc = 0
    return { data: t.map((p) => ({ month: p.month, units: mono ? p.units : (acc += p.units) })), derived: false }
  }
  const months = Object.fromEntries(interventions.map((i) => [i.id, i.monthsToOccupancy]))
  const steps = Object.entries(result?.byIntervention ?? {}).filter(([id, b]) => b.units > 0 && isNum(months[id]))
  if (!steps.length) return { data: [], derived: true }
  const maxM = Math.max(...steps.map(([id]) => months[id])) + 6
  const data = []
  for (let m = 0; m <= maxM; m += 3) data.push({ month: m, units: steps.reduce((a, [id, b]) => a + (months[id] <= m ? b.units : 0), 0) })
  return { data, derived: true }
}

export function HowToBuild({ interventions, enabled, onToggle, result, sources }) {
  const [assumptions, setAssumptions] = useState(() => (financeDefaults ? { ...financeDefaults } : {}))
  const mix = interventions
    .map((iv) => ({ id: iv.id, name: iv.short || iv.name, dollars: result?.byIntervention?.[iv.id]?.dollars ?? 0, units: result?.byIntervention?.[iv.id]?.units ?? 0 }))
    .filter((d) => d.dollars > 0 || d.units > 0)
  const timeline = buildTimeline(result, interventions)
  const numericAssumptions = Object.entries(assumptions).filter(([, v]) => typeof v === 'number')

  return (
    <Card>
      <CardHeader title="How to build" subtitle="Toggle building approaches. The optimizer reallocates across what is enabled." />
      <div className="grid gap-6 p-5 lg:grid-cols-2">
        <div className="space-y-2">
          {interventions.map((iv) => {
            const on = enabled.includes(iv.id)
            const last = on && enabled.length === 1
            const src = (iv.sourceIds ?? []).map((id) => sourceFor(sources, id)).filter(Boolean)
            const subsidy = subsidyFor(iv, assumptions)
            return (
              <label key={iv.id} className={`flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 ring-1 ring-inset transition-colors ${on ? 'bg-indigo-500/10 ring-indigo-500/30' : 'bg-zinc-950/40 ring-zinc-800'}`}>
                <input type="checkbox" className="mt-1 accent-indigo-500" checked={on} disabled={last} title={last ? 'At least one approach must stay enabled' : ''} onChange={() => onToggle(iv.id)} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-zinc-100">{iv.name}</span>
                    <span className="tabular text-sm font-semibold text-zinc-50">{fmtUSD(iv.costPerUnit)}<span className="text-xs font-normal text-zinc-500"> /unit</span></span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                    <span>{isNum(iv.monthsToOccupancy) ? `${iv.monthsToOccupancy} mo to occupancy` : 'timeline: no data'}</span>
                    {iv.useCostIndex && <span>adjusted by state cost index</span>}
                    {subsidy != null && <Badge tone="warn">subsidy needed {fmtUSD(subsidy)}/unit</Badge>}
                    {src.map((s, i) => (
                      <a key={i} href={s.url} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300" title={s.title}>source{src.length > 1 ? ` ${i + 1}` : ''}</a>
                    ))}
                    {!src.length && <span className="text-zinc-600">source pending</span>}
                  </div>
                </div>
              </label>
            )
          })}
          {financeFn && numericAssumptions.length > 0 && (
            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="mb-2 text-xs font-medium text-zinc-400">Financing assumptions (subsidy gap, ported from Lepus Analytics underwriting)</div>
              <p className="mb-2 text-[11px] text-zinc-500">Rent is set affordable to a household at the target % of the population-weighted mean state median income ({REFERENCE_INCOME != null ? fmtUSD(REFERENCE_INCOME) : 'no data'}, ACS). Fields marked (assumption) have no single authoritative value; edit them.</p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {numericAssumptions.map(([k, v]) => (
                  <Field key={k} label={`${financeMeta[k]?.label ?? k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}${financeMeta[k]?.assumption ? ' (assumption)' : ''}`}>
                    <input
                      type="number"
                      step="any"
                      value={v}
                      onChange={(e) => setAssumptions((a) => ({ ...a, [k]: e.target.value === '' ? 0 : Number(e.target.value) }))}
                      className="tabular w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </Field>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="space-y-5">
          <div>
            <div className="mb-2 text-xs font-medium text-zinc-400">Mix: units funded by approach</div>
            <div className="h-48">
              {mix.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mix} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#27272a" vertical={false} />
                    <XAxis dataKey="name" {...AXIS} />
                    <YAxis {...AXIS} tickFormatter={(v) => fmtNum(v)} width={56} />
                    <Tooltip {...TIP} cursor={{ fill: 'rgba(129,140,248,0.08)' }} formatter={(v, n, p) => [`${fmtNum(v)} units · ${fmtMoney(p.payload.dollars)}`, 'Funded']} />
                    <Bar dataKey="units" fill="#818cf8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-zinc-500">No units funded</div>
              )}
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-400">
              Delivery timeline: cumulative units ready
              {timeline.derived && <Badge>estimated from months to occupancy</Badge>}
            </div>
            <div className="h-48">
              {timeline.data.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeline.data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="tl" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#27272a" vertical={false} />
                    <XAxis dataKey="month" {...AXIS} tickFormatter={(m) => `${m}mo`} />
                    <YAxis {...AXIS} tickFormatter={(v) => fmtNum(v)} width={56} />
                    <Tooltip {...TIP} labelFormatter={(m) => `Month ${m}`} formatter={(v) => [fmtNum(v), 'Units ready']} />
                    <Area type="stepAfter" dataKey="units" stroke="#34d399" strokeWidth={2} fill="url(#tl)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-zinc-500">No timeline data</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
