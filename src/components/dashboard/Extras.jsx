import { Button, Card, CardHeader, PoweredBy } from '../ui.jsx'
import { fmtMoney, fmtNum } from './format.js'

/** Top-5 states under each stakeholder lens, side by side. `byLens` = { key: { label, result } }. */
export function LensCompare({ byLens, states, activeKey }) {
  const entries = Object.entries(byLens)
  if (!entries.length) return null
  const tops = entries.map(([k, { label, result }]) => ({
    key: k,
    label,
    units: result?.totalUnits,
    top: Object.entries(result?.byState ?? {})
      .filter(([, b]) => b.dollars > 0)
      .sort((a, b) => b[1].dollars - a[1].dollars)
      .slice(0, 5),
  }))
  const counts = {}
  tops.forEach((t) => t.top.forEach(([f]) => { counts[f] = (counts[f] ?? 0) + 1 }))
  return (
    <Card>
      <CardHeader title="How stakeholders disagree" subtitle="Top 5 states under each lens at the current budget. States every lens agrees on are highlighted." />
      <div className="grid gap-4 p-5 md:grid-cols-3">
        {tops.map((t) => (
          <div key={t.key} className={`rounded-lg p-4 ring-1 ring-inset ${t.key === activeKey ? 'bg-indigo-500/10 ring-indigo-500/40' : 'bg-zinc-950/40 ring-zinc-800'}`}>
            <div className="flex items-baseline justify-between">
              <div className="text-sm font-semibold text-zinc-100">{t.label}</div>
              <div className="tabular text-xs text-zinc-400">{fmtNum(t.units)} units</div>
            </div>
            <ol className="mt-3 space-y-1.5">
              {t.top.map(([f, b], i) => (
                <li key={f} className="tabular flex justify-between text-xs">
                  <span className={counts[f] === tops.length ? 'font-medium text-emerald-300' : 'text-zinc-300'}>{i + 1}. {states[f]?.name ?? f}</span>
                  <span className="text-zinc-400">{fmtMoney(b.dollars)}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </Card>
  )
}

export function SourcesModal({ open, onClose, sources, fieldSources, interventions, presets, explanation }) {
  if (!open) return null
  const usedBy = {}
  Object.entries(fieldSources ?? {}).forEach(([field, id]) => { (usedBy[id] ??= []).push(field) })
  interventions.forEach((iv) => (iv.sourceIds ?? []).forEach((id) => { (usedBy[id] ??= []).push(iv.short || iv.name) }))
  const list = Object.entries(sources ?? {})
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-10" onClick={onClose}>
      <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <Card className="bg-zinc-900">
          <CardHeader title="Sources & methodology" subtitle="Every number on this page comes from one of these public sources. Missing values stay missing." action={<Button variant="ghost" className="px-2 py-1 text-xs" onClick={onClose}>Close ✕</Button>} />
          <div className="space-y-6 p-5 text-sm">
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Methodology</h4>
              <ul className="list-disc space-y-1 pl-5 text-zinc-300">
                {(explanation?.length ? explanation : ['Need score blends ELI shortage, homelessness, severe rent burden and cost efficiency by the selected lens weights.']).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </section>
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Data sources ({list.length})</h4>
              {list.length === 0 && <p className="text-zinc-400">No sources yet: the data files are still placeholders.</p>}
              <ul className="space-y-2">
                {list.map(([id, s]) => (
                  <li key={id} className="rounded-lg border border-zinc-800 px-3 py-2">
                    <a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-indigo-300 hover:text-indigo-200">{s.title ?? id}</a>
                    <div className="text-xs text-zinc-400">{[s.publisher, s.year, s.accessed && `accessed ${s.accessed}`].filter(Boolean).join(' · ')}</div>
                    {usedBy[id] && <div className="mt-1 text-[11px] text-zinc-400">Used for: {[...new Set(usedBy[id])].join(', ')}</div>}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Budget presets</h4>
              <ul className="space-y-2">
                {presets.map((p) => (
                  <li key={p.label} className="rounded-lg border border-zinc-800 px-3 py-2">
                    <a href={p.source.url} target="_blank" rel="noreferrer" className="font-medium text-indigo-300 hover:text-indigo-200">{p.label}: {fmtMoney(p.amount)}</a>
                    <div className="text-xs text-zinc-400">{p.source.title} · {p.source.year}</div>
                  </li>
                ))}
              </ul>
            </section>
            <PoweredBy />
          </div>
        </Card>
      </div>
    </div>
  )
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function exportPlan({ result, states, interventions, params }) {
  const ivName = Object.fromEntries(interventions.map((i) => [i.id, i.name]))
  const rows = [['rank', 'fips', 'state', 'intervention', 'dollars', 'units', 'people_housed', 'need_score']]
  for (const a of result?.allocations ?? []) {
    if (!(a.dollars > 0)) continue
    rows.push([result.byState?.[a.fips]?.rank, a.fips, states[a.fips]?.name, ivName[a.interventionId] ?? a.interventionId, Math.round(a.dollars), a.units, Math.round(a.peopleHoused ?? 0), a.needScore?.toFixed?.(4)])
  }
  download('lepus-solutions-plan.csv', rows.map((r) => r.map(csvCell).join(',')).join('\n'), 'text/csv')
  const { allocations, byState, byIntervention, ...summary } = result ?? {}
  download('lepus-solutions-plan.json', JSON.stringify({ generatedBy: 'Lepus Solutions (powered by Lepus Analytics)', params, summary, byState, byIntervention, allocations }, null, 2), 'application/json')
}
