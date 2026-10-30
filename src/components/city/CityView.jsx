// City-scale planner: a local government picks its jurisdiction, sees its census tracts, sets a budget,
// and the shared engine allocates dollars across tracts and building types. Self-contained, no required props.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import * as engine from '../../engine/allocate.js'
import interventionsData from '../../data/interventions.json'
import TractMap from './TractMap.jsx'
import { applyVacancyCap, populationBaselineUnits, toCSV, tractsToAreas } from './adapter.js'
import { rewindCollection } from './geo.js'
import CouncilBrief from './CouncilBrief.jsx'
import { AICityPanel } from '../../ai/CityAI.jsx'
import {
  AFFH_REPEAL_URL, AFFH_RULE_URL, LIHTC_DB_URL, blendInputs, cleanExplanation, hasLihtc, highOpportunitySet, lihtcLabel, lihtcUnits, opportunityScores,
  readCityHash, scenarioMetrics, stripCityHash, topDiffs, writeCityHash,
} from './scenario.js'
import './city.css'

const BASE = import.meta.env.BASE_URL
const QCT_URL = 'https://www.huduser.gov/portal/datasets/qct.html'
const ISSUE_URL = 'https://github.com/AHasenbein/lepus-solutions/issues/new'
const IV_COLORS = ['#818cf8', '#34d399', '#fbbf24', '#f472b6', '#38bdf8', '#a78bfa']
const MIN_B = 1e6
const MAX_B = 2e9
const STEPS = 1000

// ---------- formatting (null-safe) ----------
const ND = 'no data'
const isNum = (n) => n != null && Number.isFinite(Number(n))
const fmtInt = (n) => (isNum(n) ? Math.round(n).toLocaleString() : ND)
function fmtMoney(n) {
  if (!isNum(n)) return ND
  const a = Math.abs(n)
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `$${(n / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`
  if (a >= 1e3) return `$${Math.round(n / 1e3)}K`
  return `$${Math.round(n)}`
}
const fmtPct = (n, digits = 1) => (isNum(n) ? `${Number(n).toFixed(digits)}%` : ND)

const budgetFromSlider = (v) => MIN_B * Math.pow(MAX_B / MIN_B, v / STEPS)
const sliderFromBudget = (b) => Math.round((STEPS * Math.log(b / MIN_B)) / Math.log(MAX_B / MIN_B))

// ---------- tiny local primitives (ui.jsx is owned by another workstream) ----------
const Panel = ({ title, subtitle, action, children, className = '' }) => (
  <section className={`rounded-xl border border-zinc-800 bg-zinc-900/60 ${className}`}>
    {(title || action) && (
      <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-3.5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
        </div>
        {action}
      </div>
    )}
    <div className="p-5">{children}</div>
  </section>
)
const TONES = {
  neutral: 'bg-zinc-800 text-zinc-300 ring-zinc-700',
  good: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
  bad: 'bg-rose-500/10 text-rose-300 ring-rose-500/30',
  warn: 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  brand: 'bg-indigo-500/10 text-indigo-300 ring-indigo-500/30',
}
const Pill = ({ tone = 'neutral', children }) => (
  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>{children}</span>
)
const Kpi = ({ label, value, hint, valueClass = 'text-zinc-50' }) => (
  <div className="min-w-0">
    <div className="text-xs font-medium text-zinc-500">{label}</div>
    <div className={`tabular mt-1 truncate text-xl font-semibold tracking-tight ${valueClass}`}>{value}</div>
    {hint && <div className="mt-0.5 text-xs text-zinc-500">{hint}</div>}
  </div>
)
const Btn = ({ variant = 'secondary', className = '', children, ...p }) => {
  const s = {
    primary: 'bg-indigo-500 text-white hover:bg-indigo-400',
    secondary: 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700 ring-1 ring-inset ring-zinc-700',
    good: 'bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/20',
    bad: 'bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/20',
  }
  return (
    <button type="button" className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${s[variant]} ${className}`} {...p}>
      {children}
    </button>
  )
}
const Toggle = ({ checked, onChange, label, hint, disabled }) => (
  <label className={`flex items-start gap-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-indigo-500" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    <span>
      <span className="block text-sm text-zinc-200">{label}</span>
      {hint && <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">{hint}</span>}
    </span>
  </label>
)
const PoweredByLepus = () => (
  <p className="text-xs text-zinc-500">
    Powered by <span className="font-semibold text-indigo-300">Lepus Analytics</span>
  </p>
)

const METRICS = {
  dollars: { label: 'Dollars allocated', fmt: fmtMoney },
  need: { label: 'Need score', fmt: (v) => (isNum(v) ? Number(v).toFixed(2) : ND) },
  severe: { label: 'Severe rent burden', fmt: (v) => fmtPct(v) },
  poverty: { label: 'Poverty rate', fmt: (v) => fmtPct(v) },
  rent: { label: 'Median gross rent', fmt: fmtMoney },
  opportunity: { label: 'Opportunity (low poverty)', fmt: (v) => (isNum(v) ? Number(v).toFixed(2) : ND) },
  lihtc: { label: 'Existing LIHTC units (reported)', fmt: fmtInt, requires: 'lihtc' },
}

// Some ACS pipelines emit rates as 0..1 fractions; normalise to percent for display.
const asPct = (vals) => {
  const nums = vals.filter(isNum)
  const scale = nums.length && Math.max(...nums) <= 1 ? 100 : 1
  return (v) => (isNum(v) ? v * scale : null)
}

function useJson(url) {
  const [state, setState] = useState({ url: null, data: null, error: null })
  useEffect(() => {
    if (!url) return undefined
    let alive = true
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${url.replace(BASE, '/')}`)
        return r.json()
      })
      .then((data) => alive && setState({ url, data, error: null }))
      .catch((e) => alive && setState({ url, data: null, error: e.message || String(e) }))
    return () => {
      alive = false
    }
  }, [url])
  const loading = !!url && state.url !== url
  return { data: loading ? null : state.data, error: loading ? null : state.error, loading }
}

function SourceLink({ source, fallback }) {
  if (!source) return fallback ? <span>{fallback}</span> : null
  if (typeof source === 'string') {
    return /^https?:/.test(source) ? <a className="text-indigo-300 hover:underline" href={source} target="_blank" rel="noreferrer">{source}</a> : <span>{source}</span>
  }
  const label = [source.publisher, source.title, source.year].filter(Boolean).join(', ')
  return source.url ? (
    <a className="text-indigo-300 hover:underline" href={source.url} target="_blank" rel="noreferrer">{label || source.url}</a>
  ) : (
    <span>{label}</span>
  )
}

function EmptyState({ title, children }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 p-10 text-center">
      <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
      <div className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-zinc-400">{children}</div>
    </div>
  )
}

const BuildNote = () => (
  <span>
    Any U.S. county can be added with <code className="mono rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200">node scripts/build-cities.mjs &lt;countyFIPS&gt;</code>, or{' '}
    <a className="text-indigo-300 hover:underline" href={ISSUE_URL} target="_blank" rel="noreferrer">request your city</a>.
  </span>
)

export default function CityView({ interventions: ivProp, initialCityId = '48453' }) {
  const interventions = useMemo(() => {
    const src = ivProp ?? interventionsData
    return Array.isArray(src) ? src : src?.interventions ?? []
  }, [ivProp])
  const ivPlaceholder = !ivProp && interventionsData?.meta?.placeholder

  // ----- data -----
  const index = useJson(`${BASE}cities/index.json`)
  const cityList = useMemo(() => (Array.isArray(index.data) ? index.data : index.data?.cities ?? []), [index.data])
  const [h0] = useState(() => readCityHash())
  const [pickedId, setPickedId] = useState(h0.cityId ?? initialCityId)
  const cityMeta = cityList.find((c) => c.id === pickedId) ?? cityList.find((c) => c.id === initialCityId) ?? cityList[0] ?? null
  const cityId = cityMeta?.id ?? null
  const cityFile = cityMeta ? `${BASE}cities/${(cityMeta.file ?? `${cityMeta.id}.json`).replace(/^\/?cities\//, '')}`.replace(/(?<!:)\/\/+/g, '/') : null
  const city = useJson(cityFile)

  // ----- planner state (scoped per city so switching jurisdiction resets the queue) -----
  const [budget, setBudget] = useState(h0.budget ?? 100e6)
  const [lens, setLens] = useState(h0.lens && engine.LENSES?.[h0.lens] ? h0.lens : 'balanced')
  const [cap, setCap] = useState(h0.cap ?? 0.08)
  const [qctOnly, setQctOnly] = useState(h0.qctOnly ?? false)
  const [vacancyCap, setVacancyCap] = useState(h0.vacancyCap ?? true)
  const [disabledIv, setDisabledIv] = useState(h0.disabledIv ?? [])
  // Fair-housing balance, 0 = pure need score, 1 = pure opportunity (low poverty). A policy choice.
  const [opp, setOpp] = useState(h0.opp ?? 0)
  const [avoidLihtc, setAvoidLihtc] = useState(h0.avoidLihtc ?? false)
  const [metric, setMetric] = useState('dollars')
  const [clickMode, setClickMode] = useState('inspect')
  const [showBrief, setShowBrief] = useState(false)
  const [pinned, setPinned] = useState(null)
  const [review, setReview] = useState({ cityId: h0.cityId ?? initialCityId, rejected: h0.excluded ?? [], approved: [], selected: null })
  const rv = review.cityId === cityId ? review : { cityId, rejected: [], approved: [], selected: null }
  const patchReview = (fn) => setReview((r) => fn(r.cityId === cityId ? r : { cityId, rejected: [], approved: [], selected: null }))
  const rejectedSet = useMemo(() => new Set(rv.rejected), [rv.rejected])

  const data = city.data
  const areas = useMemo(() => tractsToAreas(data?.tracts ?? {}), [data])
  const geometry = useMemo(() => rewindCollection(data?.geometry), [data])
  const qctAvailable = useMemo(() => Object.values(areas).some((a) => a.isQCT === true), [areas])
  const qctMap = useMemo(() => Object.fromEntries(Object.values(areas).filter((a) => a.isQCT).map((a) => [a.fips, true])), [areas])
  const names = useMemo(() => Object.fromEntries(Object.values(areas).map((a) => [a.fips, a.abbr])), [areas])
  const enabledIv = useMemo(() => interventions.filter((i) => !disabledIv.includes(i.id)), [interventions, disabledIv])
  const weights = (engine.LENSES?.[lens] ?? Object.values(engine.LENSES ?? {})[0])?.weights
  const lensLabel = engine.LENSES?.[lens]?.label ?? lens
  const lihtc = useMemo(() => hasLihtc(data?.tracts), [data])
  const avoid = lihtc && avoidLihtc && opp > 0
  const oppScores = useMemo(() => opportunityScores(areas, { avoidLihtc: avoid, tracts: data?.tracts ?? {} }), [areas, avoid, data])
  const highOpp = useMemo(() => highOpportunitySet(areas), [areas])

  const plan = useMemo(() => {
    const ids = Object.keys(areas)
    if (!ids.length || !enabledIv.length) return null
    const qctExcluded = qctOnly && qctAvailable ? ids.filter((g) => !areas[g].isQCT) : []
    const excludedFips = [...new Set([...rv.rejected.filter((g) => areas[g]), ...qctExcluded])]
    const blend = (w) => blendInputs(areas, w, opp, oppScores)
    const args = { budget, ...blend(weights), interventions: enabledIv, enabledInterventions: enabledIv.map((i) => i.id), excludedFips, maxSharePerState: cap, areaNoun: 'tract', shortageLabel: 'severely burdened renter households (the tract unit cap)' }
    try {
      const raw = engine.allocateBudget(args)
      const result = vacancyCap ? applyVacancyCap(raw, areas) : raw
      let baselineUnits = null
      let gain = null
      if (typeof engine.naiveBaseline === 'function') {
        try {
          const nb = engine.naiveBaseline(args)
          baselineUnits = isNum(nb) ? nb : nb?.totalUnits ?? null
          if (typeof engine.efficiencyGain === 'function') {
            const g = engine.efficiencyGain(result, nb)
            gain = isNum(g) ? g : g?.pct ?? g?.gainPct ?? null
          }
        } catch {
          baselineUnits = null
        }
      }
      if (baselineUnits == null) baselineUnits = populationBaselineUnits(result.totalSpent, areas, enabledIv, excludedFips)
      if (gain == null && baselineUnits) gain = (100 * (result.totalUnits - baselineUnits)) / baselineUnits
      const lensCompare = Object.entries(engine.LENSES ?? {}).map(([key, l]) => {
        if (key === lens) return { key, label: l.label, units: result.totalUnits, people: result.peopleHoused }
        const r = engine.allocateBudget({ ...args, ...blend(l.weights) })
        const rr = vacancyCap ? applyVacancyCap(r, areas) : r
        return { key, label: l.label, units: rr.totalUnits, people: rr.peopleHoused }
      })
      return { result, baselineUnits, gain, excludedFips, qctExcluded: qctExcluded.length, lensCompare, error: null }
    } catch (e) {
      return { result: null, error: e.message || String(e) }
    }
  }, [areas, enabledIv, budget, weights, cap, qctOnly, qctAvailable, vacancyCap, rv.rejected, lens, opp, oppScores])

  const result = plan?.result
  const unitsByTract = useMemo(() => Object.fromEntries(Object.entries(result?.byState ?? {}).map(([g, s]) => [g, s.units])), [result])

  const mapValues = useMemo(() => {
    const list = Object.values(areas)
    if (metric === 'dollars') return Object.fromEntries(list.map((a) => [a.fips, result?.byState?.[a.fips]?.dollars ?? 0]))
    if (metric === 'need') return Object.fromEntries(list.map((a) => [a.fips, result?.needScores?.[a.fips] ?? null]))
    if (metric === 'rent') return Object.fromEntries(list.map((a) => [a.fips, a.medianGrossRent]))
    if (metric === 'opportunity') return oppScores
    if (metric === 'lihtc') return Object.fromEntries(list.map((a) => [a.fips, lihtcUnits(data?.tracts?.[a.fips])]))
    const field = metric === 'severe' ? 'severelyRentBurdenedPct' : 'povertyRate'
    const norm = asPct(list.map((a) => a[field]))
    return Object.fromEntries(list.map((a) => [a.fips, norm(a[field])]))
  }, [areas, metric, result, oppScores, data])

  const ranked = useMemo(
    () =>
      Object.entries(result?.byState ?? {})
        .filter(([, s]) => s.dollars > 0)
        .sort((a, b) => b[1].dollars - a[1].dollars)
        .map(([g, s]) => ({ geoid: g, ...s })),
    [result],
  )
  const byTractType = useMemo(() => {
    const m = {}
    for (const a of result?.allocations ?? []) {
      if (!a.units && !a.dollars) continue
      ;(m[a.fips] ??= {})[a.interventionId] = (m[a.fips]?.[a.interventionId] ?? 0) + a.units
    }
    return m
  }, [result])
  const mix = useMemo(
    () =>
      interventions
        .map((iv, i) => ({ id: iv.id, name: iv.short ?? iv.name, units: result?.byIntervention?.[iv.id]?.units ?? 0, dollars: result?.byIntervention?.[iv.id]?.dollars ?? 0, color: IV_COLORS[i % IV_COLORS.length] }))
        .filter((d) => d.units > 0 || d.dollars > 0),
    [interventions, result],
  )

  const juris = data?.jurisdiction ?? {}
  const sources = data?.sources ?? {}
  const severeTotal = juris.severelyBurdenedRenterHouseholds ?? Object.values(areas).reduce((s, a) => s + (a.severelyBurdenedRenterHouseholds ?? 0), 0)
  const reachedPct = result && severeTotal ? (100 * result.totalUnits) / severeTotal : null

  const selectTract = (g) => {
    if (clickMode === 'exclude') {
      patchReview((r) => ({ ...r, rejected: r.rejected.includes(g) ? r.rejected.filter((x) => x !== g) : [...r.rejected, g] }))
    } else patchReview((r) => ({ ...r, selected: r.selected === g ? null : g }))
  }
  const reject = (g) => patchReview((r) => ({ ...r, rejected: [...new Set([...r.rejected, g])], approved: r.approved.filter((x) => x !== g) }))
  const approve = (g) => patchReview((r) => ({ ...r, approved: [...new Set([...r.approved, g])] }))
  const restore = (g) => patchReview((r) => ({ ...r, rejected: r.rejected.filter((x) => x !== g) }))

  const downloadCSV = () => {
    if (!result) return
    const csv = toCSV(result, areas, interventions)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lepus-plan-${cityId}-${Math.round(budget / 1e6)}M.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const sliderVal = sliderFromBudget(budget)
  const queue = ranked.filter((r) => !rejectedSet.has(r.geoid)).slice(0, 8)
  const sel = rv.selected ? areas[rv.selected] : null
  const selPct = asPct(Object.values(areas).map((a) => a.povertyRate))
  const selSevere = asPct(Object.values(areas).map((a) => a.severelyRentBurdenedPct))
  const selBurden = asPct(Object.values(areas).map((a) => a.rentBurdenedPct))
  const pitSource = juris.homelessPITSource ? sources[juris.homelessPITSource] ?? juris.homelessPITSource : null

  // ----- shareable hash: merge c-keys into App's hash after App's own write (child effects run first) -----
  const hashState = useMemo(
    () => ({ cityId, budget, lens, cap, opp, qctOnly, vacancyCap, disabledIv, excluded: rv.rejected, avoidLihtc: lihtc && avoidLihtc }),
    [cityId, budget, lens, cap, opp, qctOnly, vacancyCap, disabledIv, rv.rejected, lihtc, avoidLihtc],
  )
  const ready = !!(cityId && data)
  useEffect(() => {
    if (!ready) return undefined
    const t = setTimeout(() => window.history.replaceState(null, '', writeCityHash(hashState, window.location.hash)), 0)
    return () => clearTimeout(t)
  }, [hashState, ready])
  useEffect(() => () => window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${stripCityHash(window.location.hash)}`), [])
  const shareLink = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}${writeCityHash(hashState, window.location.hash)}` : ''

  // ----- scenario metrics, compare, explanation -----
  const metrics = useMemo(() => scenarioMetrics(result, areas, highOpp), [result, areas, highOpp])
  const explanation = useMemo(() => cleanExplanation(result?.explanation ?? [], { t: opp, lensLabel }), [result, opp, lensLabel])
  const scenarioLabel = `${fmtMoney(budget)} · ${lensLabel} · ${Math.round(100 - opp * 100)}/${Math.round(opp * 100)} need/opp${qctOnly ? ' · QCT only' : ''}${rv.rejected.length ? ` · ${rv.rejected.length} excluded` : ''}`
  const pinA = () => metrics && setPinned({ cityId, label: scenarioLabel, ...metrics })
  const pin = pinned?.cityId === cityId ? pinned : null
  const diffs = useMemo(() => (pin && metrics ? topDiffs(pin.dollars, metrics.dollars, 8) : []), [pin, metrics])
  const closeBrief = useCallback(() => setShowBrief(false), [])
  const metricLabel = metric === 'need' && opp > 0 ? 'Priority score (need + opportunity)' : METRICS[metric].label
  // Compact snapshot of the plan for the AI panel (only sourced data and engine output).
  const aiContext = useMemo(() => {
    if (!result) return null
    const juris = data?.jurisdiction ?? {}
    const tract = (g) => {
      const a = areas[g] ?? {}
      return { tract: a.abbr, isQCT: a.isQCT ?? null, povertyRate: a.povertyRate ?? null, severelyRentBurdenedPct: a.severelyRentBurdenedPct ?? null, medianGrossRent: a.medianGrossRent ?? null }
    }
    return {
      jurisdiction: { name: juris.name ?? cityMeta?.name, state: juris.state ?? cityMeta?.state, population: juris.population ?? null, renterHouseholds: juris.renterHouseholds ?? null, homelessPIT: juris.homelessPIT ?? null },
      params: { budget, lens: lensLabel, perTractCap: cap, opportunityWeight: opp, qctOnly: qctOnly && qctAvailable, vacancyCap, excludedTracts: rv.rejected.length },
      totals: { spent: result.totalSpent, units: result.totalUnits, peopleHoused: result.peopleHoused, tractsFunded: metrics?.funded, qctPct: metrics?.qctPct, highOppPct: metrics?.highOppPct, severelyBurdenedReachedPct: reachedPct, gainVsPopulationSplitPct: plan?.gain ?? null },
      mix: mix.map((m) => ({ type: m.name, units: m.units, dollars: m.dollars })),
      topTracts: ranked.slice(0, 10).map((r) => ({ ...tract(r.geoid), dollars: r.dollars, units: r.units, needScore: r.needScore, byType: byTractType[r.geoid] })),
      selectedTract: sel ? { ...tract(sel.fips), dollars: result.byState?.[sel.fips]?.dollars ?? 0, units: result.byState?.[sel.fips]?.units ?? 0 } : null,
      explanation,
    }
  }, [result, areas, data, cityMeta, budget, lensLabel, cap, opp, qctOnly, qctAvailable, vacancyCap, rv.rejected.length, metrics, reachedPct, plan, mix, ranked, byTractType, sel, explanation])

  // ---------- render ----------
  return (
    <div className="lepus-city min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-indigo-300">City planner · census tracts</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">{juris.name ?? cityMeta?.name ?? 'Choose a jurisdiction'}</h1>
            <PoweredByLepus />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-zinc-500" htmlFor="city-pick">Jurisdiction</label>
            <select
              id="city-pick"
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-indigo-400 focus:outline-none"
              value={cityId ?? ''}
              disabled={!cityList.length}
              onChange={(e) => setPickedId(e.target.value)}
            >
              {!cityList.length && <option value="">{index.loading ? 'Loading…' : 'No jurisdictions'}</option>}
              {cityList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.state ? `, ${c.state}` : ''} ({fmtInt(c.tractCount)} tracts)
                </option>
              ))}
            </select>
            <a className="rounded-lg px-3 py-2 text-xs text-zinc-400 ring-1 ring-inset ring-zinc-800 hover:text-zinc-100" href={ISSUE_URL} target="_blank" rel="noreferrer">
              Request your city
            </a>
            <Btn variant="primary" className="py-2" disabled={!result} onClick={() => setShowBrief(true)}>Print council brief</Btn>
          </div>
        </header>

        {ivPlaceholder && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
            Intervention costs are placeholders until the sourced cost file lands. Tract data below is ACS / HUD.
          </div>
        )}

        {index.loading && <Skeleton label="Loading jurisdictions…" />}
        {index.error && (
          <EmptyState title="No city data published yet">
            <p>Could not load <code className="mono text-xs">cities/index.json</code> ({index.error}).</p>
            <p className="mt-2"><BuildNote /></p>
          </EmptyState>
        )}
        {!index.loading && !index.error && !cityList.length && <EmptyState title="No jurisdictions in the index"><BuildNote /></EmptyState>}
        {cityMeta && city.loading && <Skeleton label={`Loading ${cityMeta.name} tracts…`} />}
        {cityMeta && city.error && (
          <EmptyState title={`Could not load ${cityMeta.name}`}>
            <p>{city.error}</p>
            <p className="mt-2"><BuildNote /></p>
          </EmptyState>
        )}

        {data && (
          <>
            {/* Jurisdiction header */}
            <section className="grid grid-cols-2 gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 md:grid-cols-5">
              <Kpi label="Population" value={fmtInt(juris.population ?? cityMeta?.population)} />
              <Kpi label="Renter households" value={fmtInt(juris.renterHouseholds)} />
              <Kpi label="Severely burdened renters" value={fmtInt(severeTotal || null)} hint="paying 50%+ of income on rent" valueClass="text-rose-300" />
              <Kpi
                label="Homeless (PIT count)"
                value={fmtInt(juris.homelessPIT)}
                hint={pitSource ? <SourceLink source={pitSource} /> : 'CoC count not available'}
                valueClass="text-amber-300"
              />
              <Kpi label="Census tracts" value={fmtInt(Object.keys(areas).length)} hint={`${fmtInt(Object.keys(qctMap).length)} HUD QCTs`} />
            </section>

            <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
              {/* Controls */}
              <div className="space-y-5">
                <Panel title="Budget" subtitle="Local scale, log slider">
                  <div className="tabular text-3xl font-semibold tracking-tight text-zinc-50">{fmtMoney(budget)}</div>
                  <input
                    type="range"
                    className="lepus-range mt-3"
                    min={0}
                    max={STEPS}
                    value={sliderVal}
                    style={{ '--fill': `${(100 * sliderVal) / STEPS}%` }}
                    onChange={(e) => setBudget(Math.round(budgetFromSlider(Number(e.target.value)) / 1e5) * 1e5)}
                    aria-label="Budget"
                  />
                  <div className="tabular mt-1 flex justify-between text-[11px] text-zinc-500"><span>$1M</span><span>$2B</span></div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {[10e6, 50e6, 100e6, 250e6, 1e9].map((b) => (
                      <button key={b} type="button" onClick={() => setBudget(b)} className={`tabular rounded-md px-2 py-1 text-[11px] ring-1 ring-inset ${budget === b ? 'bg-indigo-500/15 text-indigo-200 ring-indigo-500/40' : 'text-zinc-400 ring-zinc-800 hover:text-zinc-100'}`}>
                        {fmtMoney(b)}
                      </button>
                    ))}
                  </div>
                </Panel>

                <Panel title="Priorities" subtitle="Stakeholder lens">
                  <div className="grid gap-1.5">
                    {Object.entries(engine.LENSES ?? {}).map(([k, l]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setLens(k)}
                        className={`rounded-lg px-3 py-2 text-left text-sm ring-1 ring-inset transition-colors ${lens === k ? 'bg-indigo-500/15 text-indigo-100 ring-indigo-500/40' : 'text-zinc-300 ring-zinc-800 hover:bg-zinc-800/60'}`}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-zinc-400">
                      <span>Max share of budget per tract</span>
                      <span className="tabular text-zinc-100">{Math.round(cap * 100)}%</span>
                    </div>
                    <input type="range" className="lepus-range mt-1" min={2} max={50} value={Math.round(cap * 100)} style={{ '--fill': `${((cap * 100 - 2) / 48) * 100}%` }} onChange={(e) => setCap(Number(e.target.value) / 100)} aria-label="Max share per tract" />
                  </div>
                </Panel>

                <Panel title="Fair-housing balance" subtitle="Need ↔ Opportunity" action={<Pill tone="warn">Policy choice</Pill>}>
                  <div className="flex justify-between text-xs">
                    <span className={opp < 1 ? 'text-zinc-100' : 'text-zinc-500'}>Need <span className="tabular">{Math.round(100 - opp * 100)}%</span></span>
                    <span className={opp > 0 ? 'text-zinc-100' : 'text-zinc-500'}>Opportunity <span className="tabular">{Math.round(opp * 100)}%</span></span>
                  </div>
                  <input type="range" className="lepus-range mt-1" min={0} max={100} step={5} value={Math.round(opp * 100)} style={{ '--fill': `${Math.round(opp * 100)}%` }} onChange={(e) => setOpp(Number(e.target.value) / 100)} aria-label="Need versus opportunity balance" />
                  <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                    Need is the engine's tract need score. Opportunity scores low-poverty tracts higher (ACS poverty rate, inverted), reflecting the fair-housing concern about
                    concentrating subsidized housing in high-poverty areas set out in HUD's{' '}
                    <a className="text-indigo-300 hover:underline" href={AFFH_RULE_URL} target="_blank" rel="noreferrer">2015 AFFH rule</a> (terminated by HUD in{' '}
                    <a className="text-indigo-300 hover:underline" href={AFFH_REPEAL_URL} target="_blank" rel="noreferrer">2025</a>). The weight is an assumption you choose, not data.
                  </p>
                  {lihtc && (
                    <div className="mt-3">
                      <Toggle
                        checked={avoidLihtc}
                        disabled={!(opp > 0)}
                        onChange={setAvoidLihtc}
                        label="Avoid concentrating: down-weight tracts with existing LIHTC units"
                        hint={
                          <>
                            Scales the opportunity component by 1 − (normalized existing LIHTC units per renter household). Where a project has no unit count, reported units are used (a lower bound). Model assumption; applies when Opportunity &gt; 0.{' '}
                            <a className="text-indigo-300 hover:underline" href={LIHTC_DB_URL} target="_blank" rel="noreferrer">HUD LIHTC database</a>
                          </>
                        }
                      />
                    </div>
                  )}
                </Panel>

                <Panel title="Local policy levers">
                  <div className="space-y-4">
                    <Toggle
                      checked={qctOnly && qctAvailable}
                      disabled={!qctAvailable}
                      onChange={setQctOnly}
                      label="Prioritize HUD Qualified Census Tracts"
                      hint={
                        qctAvailable ? (
                          <>
                            Restricts spending to QCTs, where LIHTC projects get a 130% eligible-basis boost (IRC §42(d)(5)(B)).{' '}
                            <a className="text-indigo-300 hover:underline" href={QCT_URL} target="_blank" rel="noreferrer">HUD QCT list</a>
                          </>
                        ) : (
                          'No QCT designations in this file, so the lever is off.'
                        )
                      }
                    />
                    <Toggle
                      checked={vacancyCap}
                      onChange={setVacancyCap}
                      label="Cap acquisition-rehab by vacant units"
                      hint={
                        vacancyCap && result?.vacancyCappedTracts
                          ? `Capped in ${result.vacancyCappedTracts} tracts; ${fmtMoney(result.vacancyCapReleased)} left unspent.`
                          : 'Rehab units in a tract cannot exceed its ACS vacant housing units.'
                      }
                    />
                    <div>
                      <div className="mb-2 text-xs font-medium text-zinc-500">Building types</div>
                      <div className="grid gap-1.5">
                        {interventions.map((iv, i) => (
                          <label key={iv.id} className="flex cursor-pointer items-center justify-between gap-2 text-sm text-zinc-300">
                            <span className="flex items-center gap-2">
                              <input type="checkbox" className="h-4 w-4 accent-indigo-500" checked={!disabledIv.includes(iv.id)} onChange={(e) => setDisabledIv((d) => (e.target.checked ? d.filter((x) => x !== iv.id) : [...d, iv.id]))} />
                              <span className="h-2 w-2 rounded-full" style={{ background: IV_COLORS[i % IV_COLORS.length] }} />
                              {iv.short ?? iv.name}
                            </span>
                            <span className="tabular text-xs text-zinc-500">{fmtMoney(iv.costPerUnit)}/unit</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </Panel>
              </div>

              {/* Map + KPIs */}
              <div className="space-y-5">
                <section className="grid grid-cols-2 gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 md:grid-cols-5">
                  <Kpi label="Units funded" value={fmtInt(result?.totalUnits)} valueClass="text-emerald-300" />
                  <Kpi label="People housed" value={fmtInt(result?.peopleHoused)} />
                  <Kpi label="Severely burdened reached" value={fmtPct(reachedPct)} hint="units / severely burdened renter HHs" />
                  <Kpi label="Avg cost per unit" value={fmtMoney(result?.avgCostPerUnit)} />
                  <Kpi
                    label="vs. population split"
                    value={isNum(plan?.gain) ? `${plan.gain >= 0 ? '+' : ''}${plan.gain.toFixed(1)}%` : ND}
                    hint={plan?.baselineUnits != null ? `naive: ${fmtInt(plan.baselineUnits)} units` : undefined}
                    valueClass={plan?.gain > 0 ? 'text-emerald-300' : 'text-zinc-50'}
                  />
                </section>
                {plan?.error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">Optimizer error: {plan.error}</div>}

                <Panel
                  title="Census tracts"
                  subtitle={plan?.qctExcluded ? `${plan.qctExcluded} non-QCT tracts excluded by policy` : 'Choropleth by metric; circles are units funded'}
                  action={
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <select className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200" value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Map metric">
                        {Object.entries(METRICS).filter(([, m]) => m.requires !== 'lihtc' || lihtc).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                      </select>
                      <div className="flex overflow-hidden rounded-md ring-1 ring-inset ring-zinc-700">
                        {['inspect', 'exclude'].map((m) => (
                          <button key={m} type="button" onClick={() => setClickMode(m)} className={`px-2 py-1 text-xs capitalize ${clickMode === m ? (m === 'exclude' ? 'bg-rose-500/15 text-rose-200' : 'bg-indigo-500/15 text-indigo-200') : 'text-zinc-400'}`}>
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  }
                >
                  <TractMap
                    geometry={geometry}
                    values={mapValues}
                    units={unitsByTract}
                    qct={qctMap}
                    excluded={rejectedSet}
                    selected={rv.selected}
                    onSelect={selectTract}
                    formatValue={METRICS[metric].fmt}
                    label={metricLabel}
                    names={names}
                  />
                </Panel>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              {/* Approval queue */}
              <Panel title="Approval queue" subtitle="Top recommended tracts. Reject re-runs the optimizer live.">
                {!queue.length && <p className="text-sm text-zinc-500">No funded tracts yet.</p>}
                <ul className="divide-y divide-zinc-800">
                  {queue.map((r) => {
                    const ok = rv.approved.includes(r.geoid)
                    return (
                      <li key={r.geoid} className="flex items-center justify-between gap-3 py-2">
                        <button type="button" className="min-w-0 text-left" onClick={() => patchReview((x) => ({ ...x, selected: r.geoid }))}>
                          <div className="flex items-center gap-2 text-sm text-zinc-100">
                            <span className="tabular text-zinc-500">#{r.rank}</span> Tract {names[r.geoid]}
                            {qctMap[r.geoid] && <Pill tone="warn">QCT</Pill>}
                            {ok && <Pill tone="good">Approved</Pill>}
                          </div>
                          <div className="tabular text-xs text-zinc-500">{fmtMoney(r.dollars)} · {fmtInt(r.units)} units · need {isNum(r.needScore) ? r.needScore.toFixed(2) : ND}</div>
                        </button>
                        <div className="flex shrink-0 gap-1.5">
                          <Btn variant="good" disabled={ok} onClick={() => approve(r.geoid)}>Approve</Btn>
                          <Btn variant="bad" onClick={() => reject(r.geoid)}>Reject</Btn>
                        </div>
                      </li>
                    )
                  })}
                </ul>
                {!!rv.rejected.length && (
                  <div className="mt-3 border-t border-zinc-800 pt-3">
                    <div className="mb-1.5 text-xs text-zinc-500">Rejected ({rv.rejected.length}), click to restore</div>
                    <div className="flex flex-wrap gap-1.5">
                      {rv.rejected.map((g) => (
                        <button key={g} type="button" onClick={() => restore(g)} className="tabular rounded-md bg-rose-500/10 px-2 py-0.5 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/20">
                          {names[g] ?? g} ×
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Panel>

              {/* Tract detail */}
              <Panel title={sel ? `Tract ${sel.abbr}` : 'Tract detail'} subtitle={sel ? sel.fips : 'Click a tract on the map or in a table'} action={sel?.isQCT ? <Pill tone="warn">HUD QCT</Pill> : null}>
                {!sel ? (
                  <p className="text-sm text-zinc-500">No tract selected.</p>
                ) : (
                  <div className="space-y-4">
                    <p className="text-xs text-zinc-500">{sel.name}</p>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                      {[
                        ['Population', fmtInt(sel.population)],
                        ['Renter households', fmtInt(sel.renterHouseholds)],
                        ['Avg renter HH size', isNum(sel.avgRenterHouseholdSize) ? Number(sel.avgRenterHouseholdSize).toFixed(2) : ND],
                        ['Median HH income', fmtMoney(sel.medianHouseholdIncome)],
                        ['Median gross rent', isNum(sel.medianGrossRent) ? `$${fmtInt(sel.medianGrossRent)}` : ND],
                        ['Rent burdened (30%+)', fmtPct(selBurden(sel.rentBurdenedPct))],
                        ['Severely burdened (50%+)', fmtPct(selSevere(sel.severelyRentBurdenedPct))],
                        ['Severely burdened HHs', fmtInt(sel.severelyBurdenedRenterHouseholds)],
                        ['Poverty rate', fmtPct(selPct(sel.povertyRate))],
                        ['Vacant units', fmtInt(sel.vacantUnits)],
                        ['Vacant for rent', fmtInt(sel.vacantForRent)],
                        [opp > 0 ? 'Priority score' : 'Need score', isNum(result?.needScores?.[sel.fips]) ? result.needScores[sel.fips].toFixed(3) : ND],
                        ['Opportunity (0–1)', isNum(oppScores[sel.fips]) ? oppScores[sel.fips].toFixed(2) : ND],
                        ...(lihtc ? [['Existing LIHTC units', lihtcLabel(data?.tracts?.[sel.fips]) ?? ND]] : []),
                      ].map(([k, v]) => (
                        <div key={k}>
                          <dt className="text-xs text-zinc-500">{k}</dt>
                          <dd className="tabular text-zinc-100">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <div>
                      <div className="mb-1.5 text-xs font-medium text-zinc-500">Allocation by building type</div>
                      {rejectedSet.has(sel.fips) ? (
                        <p className="text-sm text-rose-300">Excluded by planner.</p>
                      ) : !result?.byState?.[sel.fips]?.dollars ? (
                        <p className="text-sm text-zinc-500">No dollars allocated to this tract.</p>
                      ) : (
                        <ul className="space-y-1 text-sm">
                          {interventions.filter((iv) => byTractType[sel.fips]?.[iv.id]).map((iv) => (
                            <li key={iv.id} className="flex justify-between"><span className="text-zinc-300">{iv.name}</span><span className="tabular text-emerald-300">{fmtInt(byTractType[sel.fips][iv.id])} units</span></li>
                          ))}
                          <li className="flex justify-between border-t border-zinc-800 pt-1"><span className="text-zinc-400">Total</span><span className="tabular text-zinc-100">{fmtMoney(result.byState[sel.fips].dollars)}</span></li>
                        </ul>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {rejectedSet.has(sel.fips) ? <Btn onClick={() => restore(sel.fips)}>Restore tract</Btn> : <Btn variant="bad" onClick={() => reject(sel.fips)}>Exclude tract</Btn>}
                    </div>
                  </div>
                )}
              </Panel>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
              {/* Ranked table */}
              <Panel
                title="Ranked tracts"
                subtitle={`${fmtInt(ranked.length)} tracts funded`}
                action={<Btn variant="primary" onClick={downloadCSV} disabled={!result}>Export plan CSV</Btn>}
              >
                <div className="max-h-96 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-zinc-900 text-left text-xs text-zinc-500">
                      <tr>
                        <th className="py-1.5 pr-2 font-medium">#</th>
                        <th className="py-1.5 pr-2 font-medium">Tract</th>
                        <th className="py-1.5 pr-2 text-right font-medium">Need</th>
                        <th className="py-1.5 pr-2 text-right font-medium">Dollars</th>
                        <th className="py-1.5 pr-2 text-right font-medium">Units</th>
                        <th className="py-1.5 font-medium">Mix</th>
                      </tr>
                    </thead>
                    <tbody className="tabular divide-y divide-zinc-800/70">
                      {ranked.slice(0, 50).map((r) => (
                        <tr key={r.geoid} className={`cursor-pointer hover:bg-zinc-800/40 ${rv.selected === r.geoid ? 'bg-indigo-500/10' : ''}`} onClick={() => patchReview((x) => ({ ...x, selected: r.geoid }))}>
                          <td className="py-1.5 pr-2 text-zinc-500">{r.rank}</td>
                          <td className="py-1.5 pr-2 text-zinc-100">{names[r.geoid]} {qctMap[r.geoid] && <span className="text-[10px] text-amber-300">QCT</span>}</td>
                          <td className="py-1.5 pr-2 text-right text-zinc-300">{isNum(r.needScore) ? r.needScore.toFixed(2) : ND}</td>
                          <td className="py-1.5 pr-2 text-right text-zinc-100">{fmtMoney(r.dollars)}</td>
                          <td className="py-1.5 pr-2 text-right text-emerald-300">{fmtInt(r.units)}</td>
                          <td className="py-1.5">
                            <div className="flex h-1.5 w-20 overflow-hidden rounded-full bg-zinc-800">
                              {interventions.map((iv, i) => {
                                const u = byTractType[r.geoid]?.[iv.id] ?? 0
                                return u ? <span key={iv.id} style={{ width: `${(100 * u) / (r.units || 1)}%`, background: IV_COLORS[i % IV_COLORS.length] }} /> : null
                              })}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <div className="space-y-5">
                <Panel title="Intervention mix" subtitle="Units funded by building type">
                  {!mix.length ? (
                    <p className="text-sm text-zinc-500">Nothing funded.</p>
                  ) : (
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={mix} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                          <CartesianGrid horizontal={false} stroke="#27272a" />
                          <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="name" width={80} tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                          <Tooltip
                            cursor={{ fill: 'rgba(129,140,248,0.08)' }}
                            contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
                            labelStyle={{ color: '#fafafa' }}
                            formatter={(v, _n, p) => [`${fmtInt(v)} units · ${fmtMoney(p?.payload?.dollars)}`, 'Funded']}
                          />
                          <Bar dataKey="units" radius={[0, 4, 4, 0]}>
                            {mix.map((d) => <Cell key={d.id} fill={d.color} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </Panel>
                {plan?.lensCompare?.length > 1 && (
                  <Panel title="Lens comparison" subtitle="Same budget and levers, different priorities">
                    <ul className="space-y-1.5 text-sm">
                      {plan.lensCompare.map((l) => (
                        <li key={l.key} className={`flex justify-between ${l.key === lens ? 'text-indigo-200' : 'text-zinc-300'}`}>
                          <span>{l.label}</span>
                          <span className="tabular">{fmtInt(l.units)} units · {fmtInt(l.people)} people</span>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                )}
              </div>
            </div>

            <ComparePanel pin={pin} cur={metrics} curLabel={scenarioLabel} diffs={diffs} names={names} onPin={pinA} onClear={() => setPinned(null)} />

            {explanation.length > 0 && (
              <Panel title="Why this plan">
                <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-400">
                  {explanation.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </Panel>
            )}

            {aiContext && <AICityPanel context={aiContext} />}

            {/* Sources and outlets */}
            <Panel title="Sources and method">
              <div className="space-y-3 text-xs leading-relaxed text-zinc-400">
                <ul className="space-y-1">
                  {Object.entries(sources).map(([id, s]) => (
                    <li key={id}><span className="mono text-zinc-500">{id}</span>: <SourceLink source={s} /></li>
                  ))}
                  <li><span className="mono text-zinc-500">hud-qct</span>: <a className="text-indigo-300 hover:underline" href={QCT_URL} target="_blank" rel="noreferrer">HUD Qualified Census Tracts</a></li>
                </ul>
                <p>
                  The engine's unit cap per tract uses ACS severely cost-burdened renter households (50%+ of income on rent) as a proxy for the
                  NLIHC extremely-low-income unit shortage, which is not published below the state level. Tract-level PIT homelessness and
                  construction cost indices do not exist, so those weights are renormalized away. Unknown values show as “no data”.
                </p>
                <p><BuildNote /></p>
              </div>
            </Panel>
          </>
        )}

        {showBrief && data && result && (
          <CouncilBrief
            juris={{ ...juris, name: juris.name ?? cityMeta?.name, state: juris.state ?? cityMeta?.state }}
            meta={data.meta}
            sources={sources}
            ivSources={interventionsData?.sources}
            interventions={interventions}
            geometry={geometry}
            areas={areas}
            result={result}
            metrics={metrics}
            top={ranked.slice(0, 10)}
            byTractType={byTractType}
            params={{ budget, lensLabel, cap, opp, qctOnly: qctOnly && qctAvailable, vacancyCap, avoidLihtc: avoid, enabled: enabledIv.map((i) => i.id), excludedCount: rv.rejected.length }}
            headline={{ reachedPct, gain: plan?.gain }}
            explanation={explanation}
            link={shareLink}
            lihtc={lihtc}
            povPct={selPct}
            onClose={closeBrief}
          />
        )}

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-4">
          <PoweredByLepus />
          <a className="text-xs text-zinc-500 hover:text-zinc-300" href={ISSUE_URL} target="_blank" rel="noreferrer">Request your city →</a>
        </footer>
      </div>
    </div>
  )
}

function Skeleton({ label }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/40">
      <div className="flex items-center gap-3 text-sm text-zinc-400">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-indigo-400" />
        {label}
      </div>
    </div>
  )
}


function ComparePanel({ pin, cur, curLabel, diffs, names, onPin, onClear }) {
  const rows = [
    ['Units funded', (m) => fmtInt(m?.units), (m) => m?.units, fmtInt],
    ['People housed', (m) => fmtInt(m?.people), (m) => m?.people, fmtInt],
    ['Tracts funded', (m) => fmtInt(m?.funded), (m) => m?.funded, fmtInt],
    ['Dollars allocated', (m) => fmtMoney(m?.spent), (m) => m?.spent, fmtMoney],
    ['% of dollars to QCTs', (m) => fmtPct(m?.qctPct, 0), (m) => m?.qctPct, (d) => `${d.toFixed(0)} pts`],
    ['% of dollars to high-opportunity tracts', (m) => fmtPct(m?.highOppPct, 0), (m) => m?.highOppPct, (d) => `${d.toFixed(0)} pts`],
  ]
  return (
    <Panel
      title="Scenario compare"
      subtitle={pin ? 'A is pinned; B is the live plan. Change any lever to compare.' : 'Pin the current plan as A, then change levers to compare B against it.'}
      action={
        <div className="flex gap-1.5">
          {pin && <Btn onClick={onClear}>Clear A</Btn>}
          <Btn variant="primary" disabled={!cur} onClick={onPin}>{pin ? 'Re-pin A' : 'Pin scenario A'}</Btn>
        </div>
      }
    >
      {!pin ? (
        <p className="text-sm text-zinc-500">No scenario pinned.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-zinc-500">
                <tr>
                  <th className="py-1.5 pr-2 font-medium"><span className="sr-only">Metric</span></th>
                  <th className="py-1.5 pr-2 text-right font-medium"><Pill tone="neutral">A</Pill></th>
                  <th className="py-1.5 pr-2 text-right font-medium"><Pill tone="brand">B</Pill></th>
                  <th className="py-1.5 text-right font-medium">B − A</th>
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-zinc-800/70">
                {rows.map(([k, fmt, raw, fmtD]) => {
                  const d = isNum(raw(cur)) && isNum(raw(pin)) ? raw(cur) - raw(pin) : null
                  return (
                    <tr key={k}>
                      <td className="py-1.5 pr-2 text-zinc-400">{k}</td>
                      <td className="py-1.5 pr-2 text-right text-zinc-300">{fmt(pin)}</td>
                      <td className="py-1.5 pr-2 text-right text-zinc-100">{fmt(cur)}</td>
                      <td className={`py-1.5 text-right ${d > 0.5 ? 'text-emerald-300' : d < -0.5 ? 'text-rose-300' : 'text-zinc-500'}`}>
                        {d == null ? ND : `${d > 0 ? '+' : d < 0 ? '−' : ''}${fmtD(Math.abs(d))}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="mt-3 space-y-0.5 text-[11px] text-zinc-500">
              <div><span className="text-zinc-400">A:</span> {pin.label}</div>
              <div><span className="text-indigo-300">B:</span> {curLabel}</div>
              <div>High-opportunity = tract poverty rate below the jurisdiction's median tract (a definition used here, not a HUD designation).</div>
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-zinc-500">Tracts that differ most</div>
            {!diffs.length ? (
              <p className="text-sm text-zinc-500">A and B fund the same tracts with the same dollars.</p>
            ) : (
              <ul className="tabular divide-y divide-zinc-800/70 text-sm">
                {diffs.map((r) => (
                  <li key={r.geoid} className="grid grid-cols-[1fr_auto_5rem] gap-3 py-1.5">
                    <span className="text-zinc-200">Tract {names[r.geoid] ?? r.geoid}</span>
                    <span className="text-zinc-500">{fmtMoney(r.a)} → {fmtMoney(r.b)}</span>
                    <span className={`text-right ${r.delta > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{r.delta > 0 ? '+' : '−'}{fmtMoney(Math.abs(r.delta))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Panel>
  )
}
