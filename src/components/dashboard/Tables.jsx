import { useState } from 'react'
import { Badge, Button, Card, CardHeader } from '../ui.jsx'
import { NeedBars } from './Controls.jsx'
import { fmtMoney, fmtNum } from './format.js'

/** "Recommended allocations: pending approval", like the Lepus Pending Approvals list. */
export function Approvals({ rows, states, approved, onApprove, onReject, rejected, onRestore, onSelect }) {
  return (
    <Card data-tour="approvals">
      <CardHeader
        title="Recommended allocations: pending approval"
        subtitle="Reject a state and the optimizer reallocates its money live."
        action={<Badge tone="brand">{rows.filter((r) => !approved.includes(r.fips)).length} pending</Badge>}
      />
      <ul className="divide-y divide-zinc-800">
        {rows.map((r) => {
          const s = states[r.fips]
          const ok = approved.includes(r.fips)
          return (
            <li key={r.fips} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <button type="button" onClick={() => onSelect(r.fips)} className="min-w-0 flex-1 text-left">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                  <span className="tabular text-xs text-zinc-400">#{r.rank}</span>
                  {s?.name ?? r.fips}
                  <NeedBars score={r.needScore} />
                </div>
                <div className="tabular text-xs text-zinc-400">{fmtMoney(r.dollars)} · {fmtNum(r.units)} units · {fmtNum(r.peopleHoused)} people</div>
              </button>
              {ok ? (
                <Badge tone="good">Approved</Badge>
              ) : (
                <div className="flex gap-2">
                  <Button variant="success" className="px-2.5 py-1 text-xs" onClick={() => onApprove(r.fips)} aria-label={`Approve ${s?.name ?? r.fips}`}>Approve</Button>
                  <Button variant="danger" className="px-2.5 py-1 text-xs" onClick={() => onReject(r.fips)} aria-label={`Reject ${s?.name ?? r.fips}`}>Reject</Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {rejected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 px-5 py-3 text-xs text-zinc-400">
          Rejected:
          {rejected.map((f) => (
            <button key={f} type="button" onClick={() => onRestore(f)} className="rounded-md bg-rose-500/10 px-2 py-0.5 text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/20" title="Restore" aria-label={`Restore ${states[f]?.name ?? f}`}>
              {states[f]?.abbr ?? f} ×
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}

const COLS = [
  { key: 'rank', label: 'Rank', num: true },
  { key: 'name', label: 'State' },
  { key: 'needScore', label: 'Need', num: true },
  { key: 'dollars', label: 'Dollars', num: true, fmt: fmtMoney },
  { key: 'units', label: 'Units', num: true, fmt: fmtNum },
  { key: 'peopleHoused', label: 'People housed', num: true, fmt: fmtNum },
]

export function RankTable({ result, states, excluded, selected, onSelect }) {
  const [sort, setSort] = useState({ key: 'rank', dir: 1 })
  const rows = Object.values(states).map((s) => {
    const b = result?.byState?.[s.fips]
    return {
      fips: s.fips,
      name: s.name,
      rank: b?.rank ?? null,
      needScore: b?.needScore ?? result?.needScores?.[s.fips] ?? null,
      dollars: b?.dollars ?? null,
      units: b?.units ?? null,
      peopleHoused: b?.peopleHoused ?? null,
      excluded: excluded.includes(s.fips),
    }
  })
  const sorted = [...rows].sort((a, b) => {
    const x = a[sort.key]
    const y = b[sort.key]
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sort.dir
  })
  const click = (k) => setSort((s) => (s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: k === 'rank' || k === 'name' ? 1 : -1 }))
  return (
    <Card>
      <CardHeader title="State ranking" subtitle="Click a column to sort, a row to open the state." />
      <div className="max-h-[520px] overflow-auto" tabIndex={0} role="region" aria-label="State ranking table (scrolls)">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="sticky top-0 bg-zinc-900 text-xs text-zinc-400">
            <tr>
              {COLS.map((c) => (
                <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'} className={`px-4 py-2 font-medium ${c.num ? 'text-right' : 'text-left'}`}>
                  <button type="button" onClick={() => click(c.key)} className="cursor-pointer select-none rounded hover:text-zinc-200">
                    {c.label}{sort.key === c.key ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {sorted.map((r) => (
              <tr key={r.fips} onClick={() => onSelect(r.fips)} className={`cursor-pointer transition-colors hover:bg-zinc-800/50 ${selected === r.fips ? 'bg-indigo-500/10' : ''} ${r.excluded ? 'opacity-50' : ''}`}>
                <td className="tabular px-4 py-2 text-right text-zinc-400">{r.rank ?? 'n/a'}</td>
                <td className="px-4 py-2 text-zinc-100"><button type="button" onClick={(e) => { e.stopPropagation(); onSelect(r.fips) }} className="rounded text-left hover:text-indigo-200">{r.name}</button>{r.excluded && <span className="ml-2"><Badge tone="bad">rejected</Badge></span>}</td>
                <td className="px-4 py-2 text-right"><NeedBars score={r.needScore} /></td>
                <td className="tabular px-4 py-2 text-right text-zinc-200">{fmtMoney(r.dollars)}</td>
                <td className="tabular px-4 py-2 text-right text-zinc-200">{fmtNum(r.units)}</td>
                <td className="tabular px-4 py-2 text-right text-zinc-200">{fmtNum(r.peopleHoused)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
