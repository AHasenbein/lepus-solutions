import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import statesData from './data/states.json'
import interventionsData from './data/interventions.json'
import budgetPresets from './data/budgetPresets.json'
import * as engine from './engine/allocate.js'
import { Button, Logo, PoweredBy, PlaceholderBanner } from './components/ui.jsx'
import { BudgetControl, Hero, LensPicker, RangeField } from './components/dashboard/Controls.jsx'
import { Approvals, RankTable } from './components/dashboard/Tables.jsx'
import { MapPanel, StateDetail } from './components/dashboard/MapPanel.jsx'
import { HowToBuild } from './components/dashboard/HowToBuild.jsx'
import { LensCompare, SourcesModal, exportPlan } from './components/dashboard/Extras.jsx'
import { fmtMoney, fmtNum } from './components/dashboard/format.js'

const REPO = 'https://github.com/AHasenbein/lepus-solutions'
const { LENSES, allocateBudget } = engine
// Optional engine exports, looked up by string so the stub engine still builds.
const opt = (name) => (typeof engine[name] === 'function' ? engine[name] : null)

const STATES = statesData.states
const INTERVENTIONS = interventionsData.interventions
const SOURCES = { ...(statesData.sources ?? {}), ...(interventionsData.sources ?? {}) }
const FIELD_SOURCES = statesData.fieldSources ?? {}
const ALL_IV = INTERVENTIONS.map((i) => i.id)
const LENS_KEYS = Object.keys(LENSES)
const WEIGHT_KEYS = ['shortage', 'homelessness', 'rentBurden', 'costEfficiency']
const DEFAULT_SPREAD = 200
const DEFAULT_BUDGET = budgetPresets.find((p) => p.amount === 1250000000)?.amount ?? 1e9

function readHash() {
  try {
    const p = new URLSearchParams(window.location.hash.slice(1))
    const list = (k) => (p.get(k) ? p.get(k).split(',').filter(Boolean) : null)
    const w = list('w')?.map(Number)
    const b = Number(p.get('b'))
    return {
      budget: Number.isFinite(b) && b > 0 ? b : null,
      lens: LENS_KEYS.includes(p.get('l')) ? p.get('l') : null,
      weights: w && w.length === 4 && w.every(Number.isFinite) ? Object.fromEntries(WEIGHT_KEYS.map((k, i) => [k, w[i]])) : null,
      excluded: list('x')?.filter((f) => STATES[f]) ?? null,
      enabled: list('e')?.filter((id) => ALL_IV.includes(id)) ?? null,
      spread: Number.isFinite(Number(p.get('s'))) && p.get('s') !== null ? Number(p.get('s')) : null,
    }
  } catch {
    return {}
  }
}

function safeAllocate(params) {
  try {
    return allocateBudget(params)
  } catch (err) {
    console.warn('allocateBudget failed', err)
    return null
  }
}

function computeGain(result, params) {
  const naive = opt('naiveBaseline')
  if (!naive || !result) return null
  try {
    const base = naive(params)
    const eg = opt('efficiencyGain')
    if (eg) return eg(result, base)
    if (!base?.totalUnits) return null
    const extraUnits = result.totalUnits - base.totalUnits
    return { extraUnits, extraPeopleHoused: result.peopleHoused - base.peopleHoused, pct: (extraUnits / base.totalUnits) * 100 }
  } catch {
    return null
  }
}

export default function App() {
  const [initial] = useState(readHash)
  const [budget, setBudget] = useState(initial.budget ?? DEFAULT_BUDGET)
  const [lensKey, setLensKey] = useState(initial.lens ?? LENS_KEYS[0])
  const [customWeights, setCustomWeights] = useState(initial.weights)
  const [excluded, setExcluded] = useState(initial.excluded ?? [])
  const [enabled, setEnabled] = useState(initial.enabled?.length ? initial.enabled : ALL_IV)
  const [approved, setApproved] = useState([])
  const [selected, setSelected] = useState(null)
  const [metric, setMetric] = useState('dollars')
  const [showSources, setShowSources] = useState(false)
  const [copied, setCopied] = useState(false)
  const [view, setView] = useState('states') // 'states' | 'city'
  // Diminishing-returns exponent. A tunable model assumption (not data): higher means each
  // state's next unit is worth less sooner, standing in for local absorption capacity.
  const [spread, setSpread] = useState(initial.spread ?? DEFAULT_SPREAD)
  const dSpread = useDeferredValue(spread)

  const weights = customWeights ?? LENSES[lensKey].weights
  const dBudget = useDeferredValue(budget)
  const dWeights = useDeferredValue(weights)

  const params = useMemo(
    () => ({ budget: dBudget, states: STATES, interventions: INTERVENTIONS, weights: dWeights, enabledInterventions: enabled, excludedFips: excluded, alpha: dSpread }),
    [dBudget, dWeights, enabled, excluded, dSpread],
  )
  const result = useMemo(() => safeAllocate(params), [params])
  const gain = useMemo(() => computeGain(result, params), [result, params])
  const byLens = useMemo(
    () => Object.fromEntries(LENS_KEYS.map((k) => [k, { label: LENSES[k].label, result: safeAllocate({ ...params, weights: LENSES[k].weights }) }])),
    [params],
  )

  // Keep the URL hash in sync so any scenario can be shared.
  useEffect(() => {
    const p = new URLSearchParams()
    p.set('b', String(Math.round(budget)))
    p.set('l', lensKey)
    if (customWeights) p.set('w', WEIGHT_KEYS.map((k) => customWeights[k] ?? 0).join(','))
    if (excluded.length) p.set('x', excluded.join(','))
    if (enabled.length !== ALL_IV.length) p.set('e', enabled.join(','))
    if (spread !== DEFAULT_SPREAD) p.set('s', String(spread))
    window.history.replaceState(null, '', `#${p.toString()}`)
  }, [budget, lensKey, customWeights, excluded, enabled, spread])

  const approvalRows = Object.entries(result?.byState ?? {})
    .filter(([, b]) => b.dollars > 0)
    .sort((a, b) => b[1].dollars - a[1].dollars)
    .slice(0, 8)
    .map(([fips, b]) => ({ fips, ...b }))

  const reject = (f) => {
    setExcluded((x) => (x.includes(f) ? x : [...x, f]))
    setApproved((a) => a.filter((y) => y !== f))
  }
  const restore = (f) => setExcluded((x) => x.filter((y) => y !== f))
  const toggleIv = (id) => setEnabled((e) => (e.includes(id) ? (e.length > 1 ? e.filter((x) => x !== id) : e) : [...e, id]))
  const pickLens = (k) => { setLensKey(k); setCustomWeights(null) }

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this scenario link', window.location.href)
    }
  }
  const doExport = () => exportPlan({ result, states: STATES, interventions: INTERVENTIONS, params: { budget, lens: lensKey, weights, excludedFips: excluded, enabledInterventions: enabled } })
  const lensLabel = customWeights ? 'Custom weights' : LENSES[lensKey].label

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-200">
      <PlaceholderBanner show={statesData.meta?.placeholder || interventionsData.meta?.placeholder} />
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/70 backdrop-blur-md">
        <nav className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div>
            <Logo />
            <PoweredBy className="mt-0.5 pl-8" />
          </div>
          <div role="tablist" aria-label="Geography" className="inline-flex rounded-lg bg-zinc-900 p-1 ring-1 ring-inset ring-zinc-800">
            {[['states', 'Nationwide (states)'], ['city', 'City / County']].map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${view === k ? 'bg-indigo-500 text-white' : 'text-zinc-400 hover:text-zinc-100'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="ghost" onClick={() => setShowSources(true)}>Sources & methodology</Button>
            <Button variant="secondary" onClick={share}>{copied ? 'Link copied' : 'Share scenario'}</Button>
            <Button variant="secondary" onClick={doExport} disabled={!result}>Export plan</Button>
            <a href={REPO} target="_blank" rel="noreferrer" className="rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200">Contribute on GitHub</a>
          </div>
        </nav>
      </header>

      {view === 'city' ? (
        // CITY BRANCH: mount <CityView /> here at merge time.
        <main className="mx-auto w-full max-w-7xl flex-grow px-4 py-8 sm:px-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-10 text-center text-sm text-zinc-400">City / County planner coming soon.</div>
        </main>
      ) : (
      <main className="mx-auto w-full max-w-7xl flex-grow space-y-6 px-4 py-8 sm:px-6">
        <Hero result={result} gain={gain} lensLabel={lensLabel} />

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <BudgetControl budget={budget} onChange={setBudget} presets={budgetPresets} />
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-4">
              <RangeField
                id="spread"
                label="Diminishing returns (absorption capacity)"
                value={spread}
                min={0}
                max={500}
                step={10}
                onChange={setSpread}
                hint="Model assumption, not data. Higher values spread money across more states as each state's capacity to build fills; 0 puts money purely where need per dollar is highest."
              />
            </div>
          </div>
          <LensPicker lenses={LENSES} lensKey={lensKey} onLens={pickLens} weights={weights} onWeights={setCustomWeights} custom={!!customWeights} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <MapPanel states={STATES} result={result} metric={metric} onMetric={setMetric} selected={selected} onSelect={setSelected} />
          </div>
          <StateDetail
            fips={selected}
            states={STATES}
            result={result}
            interventions={INTERVENTIONS}
            sources={SOURCES}
            fieldSources={FIELD_SOURCES}
            excluded={excluded}
            onExclude={reject}
            onRestore={restore}
            onClose={() => setSelected(null)}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <HowToBuild interventions={INTERVENTIONS} enabled={enabled} onToggle={toggleIv} result={result} sources={SOURCES} />
          </div>
          <Approvals
            rows={approvalRows}
            states={STATES}
            approved={approved}
            onApprove={(f) => setApproved((a) => [...a, f])}
            onReject={reject}
            rejected={excluded}
            onRestore={restore}
            onSelect={setSelected}
          />
        </div>

        <LensCompare byLens={byLens} states={STATES} activeKey={customWeights ? null : lensKey} />
        <RankTable result={result} states={STATES} excluded={excluded} selected={selected} onSelect={setSelected} />

        {/* Sticky live readout (phones): result stays visible while you drag sliders. */}
        <div aria-hidden="true" className="pointer-events-none sticky bottom-3 z-10 lg:hidden">
          <div className="tabular flex items-center justify-between gap-3 rounded-full border border-zinc-700 bg-zinc-900/95 px-4 py-2 text-sm shadow-lg shadow-black/50 backdrop-blur">
            <span className="text-zinc-400">{fmtMoney(budget)}</span>
            <span className="font-semibold text-zinc-50">{fmtNum(result?.totalUnits)} units</span>
            <span className="text-emerald-300">{fmtNum(result?.peopleHoused)} people</span>
          </div>
        </div>
      </main>
      )}

      <footer className="mt-12 border-t border-zinc-900">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Logo />
            <p className="mt-2 max-w-md text-sm text-zinc-500">Open-source decision support for where and how to build affordable housing with a fixed public budget.</p>
            <PoweredBy className="mt-2" />
          </div>
          <div className="flex gap-4 text-sm text-zinc-500">
            <button type="button" className="hover:text-zinc-200" onClick={() => setShowSources(true)}>Sources</button>
            <a href={REPO} target="_blank" rel="noreferrer" className="hover:text-zinc-200">GitHub</a>
          </div>
        </div>
      </footer>

      <SourcesModal
        open={showSources}
        onClose={() => setShowSources(false)}
        sources={SOURCES}
        fieldSources={FIELD_SOURCES}
        interventions={INTERVENTIONS}
        presets={budgetPresets}
        explanation={result?.explanation}
      />
    </div>
  )
}
