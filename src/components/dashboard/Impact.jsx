import { Card } from '../ui.jsx'
import { fmtMoney, fmtNum, isNum, sourceFor, WEIGHT_LABELS } from './format.js'

// "Impact in context" and "How it works". Every figure is either an engine output
// or a plain sum/ratio of values already in src/data (states.json, budgetPresets.json).

const pct = (n) => (n < 1 ? n.toFixed(2) : n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString())
const sumField = (states, key) => {
  const vals = Object.values(states).map((s) => s[key]).filter(isNum)
  return { total: vals.reduce((a, b) => a + Number(b), 0), n: vals.length }
}

/** Source chip: a real link (keyboard reachable) with a hover/focus citation card. */
function Cite({ src, note }) {
  if (!src?.url) return null
  return (
    <span className="group relative ml-1 inline-block align-baseline">
      <a
        href={src.url}
        target="_blank"
        rel="noreferrer"
        aria-label={`Source: ${src.title}${src.year ? ` (${src.year})` : ''}, opens in new tab`}
        className="rounded text-[11px] font-medium text-indigo-300 underline decoration-indigo-500/40 underline-offset-2 hover:text-indigo-200"
      >
        source
      </a>
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-72 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-left text-[11px] leading-snug text-zinc-300 shadow-xl group-focus-within:block group-hover:block">
        <span className="block font-medium text-zinc-100">{src.title}</span>
        {(src.publisher || src.year) && <span className="mt-1 block text-zinc-400">{[src.publisher, src.year].filter(Boolean).join(', ')}</span>}
        {note && <span className="mt-1 block text-zinc-400">{note}</span>}
      </span>
    </span>
  )
}

export function ImpactStrip({ result, states, sources, fieldSources, presets, budget }) {
  if (!result) return null
  const items = []
  const shortage = sumField(states, 'eliUnitShortage')
  if (isNum(result.totalUnits) && shortage.total > 0) {
    items.push({
      key: 'shortage',
      text: <>This plan&rsquo;s <b className="text-zinc-50">{fmtNum(result.totalUnits)}</b> units = <b className="text-emerald-300">{pct((result.totalUnits / shortage.total) * 100)}%</b> of the national ELI rental shortage ({fmtNum(shortage.total)} units, summed over {shortage.n} states).</>,
      src: sourceFor(sources, fieldSources.eliUnitShortage),
      note: 'Denominator: sum of eliUnitShortage in src/data/states.json.',
    })
  }
  const top = Object.entries(result.byState ?? {}).find(([, b]) => b.rank === 1 && b.dollars > 0)
  const ts = top && states[top[0]]
  if (ts && isNum(ts.unshelteredPIT) && ts.unshelteredPIT > 0 && isNum(top[1].peopleHoused)) {
    const p = (top[1].peopleHoused / ts.unshelteredPIT) * 100
    items.push({
      key: 'unsheltered',
      text: <>Homes funded in <b className="text-zinc-50">{ts.name}</b> (the top-funded state) house {fmtNum(top[1].peopleHoused)} people: enough for <b className="text-emerald-300">{pct(p)}%</b> of the {fmtNum(ts.unshelteredPIT)} people counted unsheltered there (HUD PIT 2025).</>,
      src: sourceFor(sources, fieldSources.unshelteredPIT),
      note: 'People housed = units x renter household size (engine). Unsheltered count: HUD AHAR 2025 state profiles.',
    })
  }
  const homeless = sumField(states, 'homelessPIT')
  if (isNum(result.peopleHoused) && homeless.total > 0) {
    items.push({
      key: 'homeless',
      text: <>People housed nationwide ({fmtNum(result.peopleHoused)}) equal <b className="text-emerald-300">{pct((result.peopleHoused / homeless.total) * 100)}%</b> of the {fmtNum(homeless.total)} people counted homeless in the 2025 point-in-time count.</>,
      src: sourceFor(sources, fieldSources.homelessPIT),
      note: `Denominator: sum of homelessPIT over ${homeless.n} states.`,
    })
  }
  const htf = presets.find((x) => /Housing Trust Fund/i.test(x.label))
  if (htf && isNum(budget) && budget !== htf.amount) {
    items.push({
      key: 'htf',
      text: <>This {fmtMoney(budget)} budget is <b className="text-zinc-50">{(budget / htf.amount).toFixed(budget / htf.amount < 10 ? 1 : 0)}&times;</b> the {fmtMoney(htf.amount)} national Housing Trust Fund deposit for 2024.</>,
      src: { ...htf.source, publisher: null },
      note: 'From src/data/budgetPresets.json.',
    })
  }
  if (!items.length) return null
  return (
    <section aria-labelledby="impact-title" className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-4">
      <h2 id="impact-title" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Impact in context</h2>
      <ul className="mt-3 grid gap-3 text-sm text-zinc-300 md:grid-cols-2">
        {items.map((it) => (
          <li key={it.key} className="flex gap-2.5">
            <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-indigo-400" />
            <span>{it.text}<Cite src={it.src} note={it.note} /></span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function HowItWorks({ sources }) {
  const data = Object.values(sources)
    .filter((s) => s.publisher && /Census|Low Income|Housing and Urban/i.test(s.publisher))
    .map((s) => `${s.publisher} (${s.year})`)
  const uniq = [...new Set(data)]
  const steps = [
    { n: '1', title: 'Data', body: `State metrics from ${uniq.length ? uniq.join(', ') : 'cited public sources'}. Unknown values stay null; nothing is estimated.` },
    { n: '2', title: 'Need scoring', body: `${Object.values(WEIGHT_LABELS).join(', ')} are normalized across states and weighted by the stakeholder lens you pick.` },
    { n: '3', title: 'Optimizer', body: 'Each budget chunk goes to the state and building approach with the highest need x diminishing returns per dollar, within shortage and share limits.' },
  ]
  return (
    <section aria-labelledby="how-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="how-title" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">How it works</h2>
        <p className="text-xs text-zinc-400">
          Built on <span className="font-semibold text-indigo-300">Lepus Analytics</span>: its design system, subsidy-gap underwriting math and approval workflow.
        </p>
      </div>
      <ol className="mt-3 grid gap-3 md:grid-cols-3">
        {steps.map((s, k) => (
          <li key={s.n} className="relative">
            <Card className="h-full p-4">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="tabular flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/15 text-xs font-semibold text-indigo-300 ring-1 ring-inset ring-indigo-500/30">{s.n}</span>
                <h3 className="text-sm font-semibold text-zinc-100">{s.title}</h3>
                {k < steps.length - 1 && <span aria-hidden="true" className="ml-auto hidden text-zinc-400 md:inline">→</span>}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">{s.body}</p>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  )
}
