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
import CityView from './components/city/CityView.jsx'
import { LensCompare, SourcesModal, exportPlan } from './components/dashboard/Extras.jsx'
import { fmtMoney, fmtNum } from './components/dashboard/format.js'
import { Tour, useTourSeen } from './components/dashboard/Tour.jsx'
import { useResultDelta } from './components/dashboard/useDelta.js'
import { HowItWorks, ImpactStrip } from './components/dashboard/Impact.jsx'
import Assistant from './ai/Assistant.jsx'
import { AIGoalToPlan, AILensInsight, AIPlanBrief, AIStateInsight } from './ai/PlanAI.jsx'

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
const NEW_BUILD_ID = 'new-construction'
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
      newBuild: Number.isFinite(Number(p.get('n'))) && p.get('n') !== null ? Number(p.get('n')) : null,
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
  const [view, setView] = useState(() => (new URLSearchParams(window.location.hash.slice(1)).get('view') === 'city' ? 'city' : 'states')) // 'states' | 'city'
  // Diminishing-returns exponent. A tunable model assumption (not data): higher means each
  // state's next unit is worth less sooner, standing in for local absorption capacity.
  const [spread, setSpread] = useState(initial.spread ?? DEFAULT_SPREAD)
  const dSpread = useDeferredValue(spread)
  // Policy floor (percent of budget) for new construction, which adds supply; cheaper rehab/conversion otherwise win every dollar.
  const [newBuild, setNewBuild] = useState(initial.newBuild ?? 0)
  const dNewBuild = useDeferredValue(newBuild)

  const weights = customWeights ?? LENSES[lensKey].weights
  const dBudget = useDeferredValue(budget)
  const dWeights = useDeferredValue(weights)

  const params = useMemo(
    () => ({ budget: dBudget, states: STATES, interventions: INTERVENTIONS, weights: dWeights, enabledInterventions: enabled, excludedFips: excluded, alpha: dSpread, minSharePerIntervention: { [NEW_BUILD_ID]: dNewBuild / 100 } }),
    [dBudget, dWeights, enabled, excluded, dSpread, dNewBuild],
  )
  const result = useMemo(() => safeAllocate(params), [params])
  const gain = useMemo(() => computeGain(result, params), [result, params])
  const delta = useResultDelta(result)
  const [tourOpen, setTourOpen] = useState(false)
  const [tourSeen, markTourSeen] = useTourSeen()
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
    if (newBuild) p.set('n', String(newBuild))
    window.history.replaceState(null, '', `#${p.toString()}`)
  }, [budget, lensKey, customWeights, excluded, enabled, spread, newBuild])

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
  // Compact snapshot of the current plan for the AI features: only engine output and sourced data.
  const aiContext = useMemo(() => {
    const name = (f) => STATES[f]?.name ?? f
    const ivName = Object.fromEntries(INTERVENTIONS.map((i) => [i.id, i.name]))
    return {
      budget, lens: lensLabel, weights,
      totals: result && { totalSpent: result.totalSpent, totalUnits: result.totalUnits, peopleHoused: result.peopleHoused, avgCostPerUnit: result.avgCostPerUnit, shortageClosedPct: result.shortageClosedPct },
      topStates: Object.entries(result?.byState ?? {}).filter(([, b]) => b.dollars > 0).sort((a, b) => b[1].dollars - a[1].dollars).slice(0, 10)
        .map(([f, b]) => ({ name: name(f), abbr: STATES[f]?.abbr, dollars: Math.round(b.dollars), units: Math.round(b.units), peopleHoused: Math.round(b.peopleHoused), needScore: Number(b.needScore?.toFixed(3)), rank: b.rank })),
      byIntervention: Object.entries(result?.byIntervention ?? {}).map(([id, v]) => ({ name: ivName[id] ?? id, dollars: Math.round(v.dollars), units: Math.round(v.units) })),
      excludedStates: excluded.map(name),
      explanation: result?.explanation ?? [],
      selectedState: selected && STATES[selected] ? { name: name(selected), data: STATES[selected], allocation: result?.byState?.[selected] ?? null } : null,
      lensComparison: Object.values(byLens).map((l) => ({ label: l.label, totalUnits: Math.round(l.result?.totalUnits ?? 0), peopleHoused: Math.round(l.result?.peopleHoused ?? 0) })),
    }
  }, [budget, lensLabel, weights, result, excluded, selected, byLens])
  const applyGoal = ({ lensKey: k, weights: w, budget: b }) => {
    if (w) setCustomWeights(w)
    else if (k && LENSES[k]) pickLens(k)
    if (Number.isFinite(b) && b > 0) setBudget(b)
  }

  const tourCtx = {
    result, states: STATES, presets: budgetPresets, lenses: LENSES, excluded, sources: SOURCES, fieldSources: FIELD_SOURCES, interventions: INTERVENTIONS,
    act: { setBudget, pickLens, reject, select: setSelected, setView, setMetric },
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-200">
      <PlaceholderBanner show={statesData.meta?.placeholder || interventionsData.meta?.placeholder} />
      <header className="relative z-50 sm:sticky sm:top-0 border-b border-zinc-800 bg-zinc-950/70 backdrop-blur-md">
        <nav className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div>
            <Logo />
            <PoweredBy className="mt-0.5 pl-8" />
          </div>
          <div data-tour="geo-toggle" role="tablist" aria-label="Geography" className="inline-flex rounded-lg bg-zinc-900 p-1 ring-1 ring-inset ring-zinc-800">
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
        <main className="w-full flex-grow">
          <CityView interventions={INTERVENTIONS} />
        </main>
      ) : (
      <main className="mx-auto w-full max-w-7xl flex-grow space-y-6 px-4 py-8 sm:px-6">
        <Hero result={result} gain={gain} lensLabel={lensLabel} delta={delta} onTour={() => setTourOpen(true)} tourSeen={tourSeen} />
        <ImpactStrip result={result} states={STATES} sources={SOURCES} fieldSources={FIELD_SOURCES} presets={budgetPresets} budget={budget} />
        <HowItWorks sources={SOURCES} />

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
              {enabled.includes(NEW_BUILD_ID) && (
                <div className="mt-4">
                  <RangeField
                    id="new-build-floor"
                    label="Minimum share for new construction (new supply)"
                    value={newBuild}
                    min={0}
                    max={60}
                    step={5}
                    onChange={setNewBuild}
                    format={(v) => `${v}%`}
                    hint="Policy choice, not data. Rehab and conversion cost less per unit, so with no floor the optimizer funds no new construction, even though only new construction adds homes to the supply."
                  />
                </div>
              )}
            </div>
          </div>
          <LensPicker lenses={LENSES} lensKey={lensKey} onLens={pickLens} weights={weights} onWeights={setCustomWeights} custom={!!customWeights} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <AIGoalToPlan lenses={LENSES} onApply={applyGoal} />
          <AIPlanBrief context={aiContext} />
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
        {selected && <AIStateInsight context={aiContext} />}

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
        <AILensInsight context={aiContext} />
        <RankTable result={result} states={STATES} excluded={excluded} selected={selected} onSelect={setSelected} />

        {/* Sticky live readout (phones): result stays visible while you drag sliders. */}
        <div aria-hidden="true" className="pointer-events-none sticky bottom-3 z-10 lg:hidden">
          <div className="tabular flex items-center justify-between gap-3 rounded-full border border-zinc-700 bg-zinc-900/95 px-4 py-2 text-sm shadow-lg shadow-black/50 backdrop-blur">
            <span className="text-zinc-400">{fmtMoney(budget)}</span>
            <span className="font-semibold text-zinc-50">{fmtNum(result?.totalUnits)} units{delta?.totalUnits && <span key={delta.id} className={`delta-pop ml-1.5 text-xs ${delta.totalUnits.good ? 'text-emerald-300' : 'text-rose-300'}`}>{delta.totalUnits.text.replace(' units', '')}</span>}</span>
            <span className="text-emerald-300">{fmtNum(result?.peopleHoused)} people</span>
          </div>
        </div>
      </main>
      )}

      <footer className="mt-12 border-t border-zinc-900">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Logo />
            <p className="mt-2 max-w-md text-sm text-zinc-400">Open-source decision support for where and how to build affordable housing with a fixed public budget.</p>
            <PoweredBy className="mt-2" />
          </div>
          <div className="flex gap-4 text-sm text-zinc-400">
            <button type="button" className="hover:text-zinc-200" onClick={() => setShowSources(true)}>Sources</button>
            <a href={REPO} target="_blank" rel="noreferrer" className="hover:text-zinc-200">GitHub</a>
          </div>
        </div>
      </footer>

      {/* Screen readers hear the same change the hero flashes. */}
      <div className="sr-only" aria-live="polite">{delta ? Object.values(delta).filter((d) => d?.text).map((d) => d.text).join(', ') : ''}</div>
      <Assistant context={view === 'city' ? { view: 'City / County planner — open the AI panel inside the city view for tract-level detail' } : aiContext} view={view} />
      {tourOpen && <Tour onClose={() => { setTourOpen(false); markTourSeen() }} ctx={tourCtx} />}

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
