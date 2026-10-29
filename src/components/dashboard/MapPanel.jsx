import USMap from '../USMap.jsx'
import { Badge, Button, Card, CardHeader } from '../ui.jsx'
import { NeedBars } from './Controls.jsx'
import { fmtMoney, fmtNum, fmtPct, STATE_FIELDS, sourceFor } from './format.js'

export const METRICS = [
  { key: 'dollars', label: 'Dollars allocated', fmt: fmtMoney, get: (s, r) => r?.byState?.[s.fips]?.dollars ?? null },
  { key: 'need', label: 'Need score', fmt: (n) => (n == null ? 'no data' : `${Math.round(n * 100)}/100`), get: (s, r) => r?.needScores?.[s.fips] ?? null },
  { key: 'shortage', label: 'ELI shortage', fmt: fmtNum, get: (s) => s.eliUnitShortage ?? null },
  { key: 'homeless', label: 'Homeless count', fmt: fmtNum, get: (s) => s.homelessPIT ?? null },
  { key: 'burden', label: 'Severe rent burden %', fmt: (n) => fmtPct(n), get: (s) => s.severelyRentBurdenedPct ?? null },
]

export function MapPanel({ states, result, metric, onMetric, selected, onSelect }) {
  const m = METRICS.find((x) => x.key === metric) ?? METRICS[0]
  const values = {}
  for (const s of Object.values(states)) {
    const v = m.get(s, result)
    if (v != null) values[s.fips] = v
  }
  const markers = Object.fromEntries(Object.entries(result?.byState ?? {}).filter(([, b]) => b.units > 0).map(([f, b]) => [f, b.units]))
  const names = Object.fromEntries(Object.values(states).map((s) => [s.fips, s.name]))
  return (
    <Card className="overflow-clip">
      <CardHeader title="Where the money goes" subtitle="Circles show units funded. Click a state for its detail." />
      <div className="flex flex-wrap gap-1.5 border-b border-zinc-800 px-5 py-3">
        {METRICS.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => onMetric(x.key)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${x.key === m.key ? 'bg-indigo-500/15 text-indigo-200 ring-indigo-500/40' : 'text-zinc-400 ring-zinc-800 hover:text-zinc-200'}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div className="p-4">
        <USMap values={values} selectedFips={selected} onSelect={onSelect} formatValue={m.fmt} legendLabel={m.label} markers={markers} names={names} />
      </div>
    </Card>
  )
}

function SourceLink({ src }) {
  if (!src?.url) return null
  return (
    <a href={src.url} target="_blank" rel="noreferrer" title={`${src.title ?? ''}${src.year ? ` (${src.year})` : ''}`} className="text-[11px] text-indigo-400 hover:text-indigo-300">
      source
    </a>
  )
}

export function StateDetail({ fips, states, result, interventions, sources, fieldSources, excluded, onExclude, onRestore, onClose }) {
  const s = fips ? states[fips] : null
  if (!s) {
    return (
      <Card className="flex h-full min-h-60 items-center justify-center p-6 text-center text-sm text-zinc-500">
        Select a state on the map or in the ranking to see every metric, its allocation by building approach, and the source behind each number.
      </Card>
    )
  }
  const b = result?.byState?.[fips]
  const ivName = Object.fromEntries(interventions.map((i) => [i.id, i.name]))
  const allocs = (result?.allocations ?? []).filter((a) => a.fips === fips && a.dollars > 0)
  const missing = result?.missingData?.[fips] ?? STATE_FIELDS.filter((f) => s[f.key] == null).map((f) => f.label)
  const isExcluded = excluded.includes(fips)
  return (
    <Card>
      <CardHeader
        title={`${s.name} (${s.abbr})`}
        subtitle={b ? `Rank #${b.rank} of ${Object.keys(result.byState).length} · ${fmtMoney(b.dollars)} · ${fmtNum(b.units)} units` : isExcluded ? 'Rejected: no allocation' : 'No allocation'}
        action={<Button variant="ghost" className="px-2 py-1 text-xs" onClick={onClose} aria-label="Close">✕</Button>}
      />
      <div className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-zinc-400">Need <NeedBars score={b?.needScore ?? result?.needScores?.[fips]} /></div>
          {isExcluded ? (
            <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => onRestore(fips)}>Restore state</Button>
          ) : (
            <Button variant="danger" className="px-2.5 py-1 text-xs" onClick={() => onExclude(fips)}>Reject state</Button>
          )}
        </div>
        {allocs.length > 0 && (
          <div>
            <div className="mb-1.5 text-xs font-medium text-zinc-400">Allocation by building approach</div>
            <ul className="space-y-1">
              {allocs.map((a) => (
                <li key={a.interventionId} className="tabular flex justify-between text-xs text-zinc-300">
                  <span>{ivName[a.interventionId] ?? a.interventionId}</span>
                  <span>{fmtMoney(a.dollars)} · {fmtNum(a.units)} units</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {STATE_FIELDS.map((f) => (
            <div key={f.key} className="flex items-baseline justify-between gap-2 border-b border-zinc-800/60 pb-1">
              <dt className="text-zinc-500">{f.label}</dt>
              <dd className="tabular flex items-baseline gap-1.5 text-zinc-100">
                <span className={s[f.key] == null ? 'text-zinc-600' : ''}>{f.fmt(s[f.key])}</span>
                <SourceLink src={sourceFor(sources, fieldSources?.[f.key])} />
              </dd>
            </div>
          ))}
        </dl>
        {missing.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <Badge tone="warn">Missing data</Badge> <span className="ml-1">{missing.join(', ')}. Treated conservatively by the optimizer, never estimated.</span>
          </div>
        )}
      </div>
    </Card>
  )
}
