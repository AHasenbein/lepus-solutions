import { useState } from 'react'
import { Badge, Card, CardHeader, Stat } from '../ui.jsx'
import { fmtMoney, fmtNum, fmtPct, needRating, WEIGHT_LABELS, isNum } from './format.js'

export const BUDGET_MIN = 1e7
export const BUDGET_MAX = 5e10
const LMIN = Math.log10(BUDGET_MIN)
const LMAX = Math.log10(BUDGET_MAX)
const toSlider = (b) => Math.round(((Math.log10(Math.min(Math.max(b, BUDGET_MIN), BUDGET_MAX)) - LMIN) / (LMAX - LMIN)) * 1000)
const fromSlider = (v) => {
  const raw = 10 ** (LMIN + (v / 1000) * (LMAX - LMIN))
  const mag = 10 ** Math.floor(Math.log10(raw) - 1)
  return Math.round(raw / mag) * mag
}

/** Labeled native range slider, Lepus Analytics style. */
export function RangeField({ id, label, value, min, max, step = 1, onChange, format = String, hint }) {
  const fill = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-xs font-medium text-zinc-400">{label}</label>
        <output htmlFor={id} className="tabular text-sm font-semibold text-zinc-50">{format(value)}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="lepus-range mt-2.5 w-full"
        style={{ '--fill': `${fill}%` }}
      />
      {hint && <p className="mt-1 text-[11px] text-zinc-500">{hint}</p>}
    </div>
  )
}

/** Five small bars, filled by need score (rating-style indicator). */
export function NeedBars({ score }) {
  const r = needRating(score)
  if (r == null) return <span className="text-xs text-zinc-500">no data</span>
  return (
    <span className="inline-flex items-end gap-0.5" title={`Need score ${(score * 100).toFixed(0)}/100`} aria-label={`Need rating ${r} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`w-1.5 rounded-sm ${i <= r ? 'bg-indigo-400' : 'bg-zinc-700'}`} style={{ height: 4 + i * 2.5 }} />
      ))}
    </span>
  )
}

export function Hero({ result, gain, lensLabel }) {
  const shortagePct = result?.shortageClosedPct
  return (
    <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900/80 to-indigo-950/40 p-6 shadow-2xl shadow-black/40 ring-1 ring-white/5 sm:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-emerald-400" />
        <span className="text-xs font-medium text-zinc-400">Live optimizer · viewing as <span className="text-indigo-300">{lensLabel}</span></span>
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
        Where should the next dollar of <span className="gradient-text">housing money</span> go?
      </h1>
      <p className="mt-3 max-w-3xl text-sm text-zinc-400 sm:text-base">
        Set a budget, pick whose priorities you are weighing, and Lepus Solutions allocates it across states and building approaches to house the most low-income households, using only cited public data.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
        <Stat size="lg" label="Units funded" value={fmtNum(result?.totalUnits)} hint={`of ${fmtMoney(result?.totalSpent)} spent`} />
        <Stat size="lg" label="People housed" value={fmtNum(result?.peopleHoused)} hint="units x renter household size" />
        <Stat size="lg" label="ELI shortage closed" value={isNum(shortagePct) ? fmtPct(shortagePct, shortagePct < 1 ? 2 : 1) : 'no data'} hint="of the national ELI unit gap" />
        <Stat size="lg" label="Avg cost per unit" value={fmtMoney(result?.avgCostPerUnit)} hint="blended across approaches" />
        <Stat
          size="lg"
          label="vs. population split"
          valueClass={gain && gain.extraUnits >= 0 ? 'text-emerald-300' : 'text-zinc-50'}
          value={gain ? `${gain.extraUnits >= 0 ? '+' : ''}${fmtNum(gain.extraUnits)}` : 'n/a'}
          hint={gain ? `extra units (${gain.pct >= 0 ? '+' : ''}${fmtPct(gain.pct)})` : 'needs engine baseline'}
        />
      </div>
    </section>
  )
}

export function BudgetControl({ budget, onChange, presets }) {
  return (
    <Card>
      <CardHeader title="Budget" subtitle="Log scale, $10M to $50B. Presets are real, cited budget lines." action={<span className="tabular text-2xl font-semibold text-zinc-50">{fmtMoney(budget)}</span>} />
      <div className="space-y-4 p-5">
        <RangeField id="budget" label="Total budget" value={toSlider(budget)} min={0} max={1000} onChange={(v) => onChange(fromSlider(v))} format={() => `$${Math.round(budget).toLocaleString()}`} />
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <span key={p.label} className="inline-flex items-stretch overflow-hidden rounded-lg ring-1 ring-inset ring-zinc-700">
              <button
                type="button"
                onClick={() => onChange(p.amount)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${budget === p.amount ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'}`}
              >
                {p.label} · {fmtMoney(p.amount)}
              </button>
              <a href={p.source.url} target="_blank" rel="noreferrer" title={`${p.source.title} (${p.source.year})`} className="bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-400 hover:text-indigo-300">src</a>
            </span>
          ))}
        </div>
      </div>
    </Card>
  )
}

/** "View as" stakeholder picker, styled after the Lepus sign-in role picker. */
export function LensPicker({ lenses, lensKey, onLens, weights, onWeights, custom }) {
  const [open, setOpen] = useState(false)
  const keys = Object.keys(lenses)
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1
  return (
    <Card>
      <CardHeader title="View as" subtitle="Each stakeholder weighs need differently. Switching re-runs the optimizer." action={custom ? <Badge tone="warn">Custom weights</Badge> : null} />
      <div className="space-y-3 p-5">
        <div className="grid gap-2 sm:grid-cols-3">
          {keys.map((k) => {
            const active = !custom && lensKey === k
            return (
              <button
                key={k}
                type="button"
                onClick={() => onLens(k)}
                className={`rounded-lg px-3 py-3 text-left text-sm font-medium transition-colors ring-1 ring-inset ${active ? 'bg-indigo-500 text-white ring-indigo-400' : 'bg-zinc-900 text-zinc-200 ring-zinc-700 hover:bg-zinc-800'}`}
              >
                <div className="text-[11px] font-normal opacity-70">Sign in as</div>
                {lenses[k].label}
              </button>
            )
          })}
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs font-medium text-zinc-400 hover:text-zinc-200">
          {open ? 'Hide advanced weights' : 'Advanced: custom weights'} {open ? '▴' : '▾'}
        </button>
        {open && (
          <div className="grid gap-4 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 sm:grid-cols-2">
            {Object.keys(WEIGHT_LABELS).map((w) => (
              <RangeField
                key={w}
                id={`w-${w}`}
                label={WEIGHT_LABELS[w]}
                value={weights[w] ?? 0}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => onWeights({ ...weights, [w]: v })}
                format={(v) => `${Math.round((v / total) * 100)}%`}
              />
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}
