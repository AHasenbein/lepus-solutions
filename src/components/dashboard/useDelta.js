import { useEffect, useState } from 'react'
import { fmtNum, isNum } from './format.js'

const MINUS = '−'
const HOLD_MS = 4000

const pick = (r) => ({
  totalUnits: r?.totalUnits ?? null,
  peopleHoused: r?.peopleHoused ?? null,
  shortageClosedPct: r?.shortageClosedPct ?? null,
  avgCostPerUnit: r?.avgCostPerUnit ?? null,
})
const same = (a, b) => Object.keys(a).every((k) => a[k] === b[k])
const signed = (n, text) => `${n >= 0 ? '+' : MINUS}${text}`

/** Engine-to-engine differences only: every delta is (new result) minus (previous result). */
function diff(prev, next) {
  const out = {}
  const d = (k) => (isNum(prev[k]) && isNum(next[k]) ? next[k] - prev[k] : null)
  const units = d('totalUnits')
  if (units) out.totalUnits = { text: `${signed(units, fmtNum(Math.abs(units)))} units`, good: units > 0 }
  const people = d('peopleHoused')
  if (people) out.peopleHoused = { text: `${signed(people, fmtNum(Math.abs(people)))} people`, good: people > 0 }
  const pts = d('shortageClosedPct')
  if (pts && Math.abs(pts) >= 0.005) out.shortageClosedPct = { text: `${signed(pts, Math.abs(pts).toFixed(2))} pts`, good: pts > 0 }
  const cost = d('avgCostPerUnit')
  if (cost && prev.avgCostPerUnit) {
    const pct = (cost / prev.avgCostPerUnit) * 100
    if (Math.abs(pct) >= 0.05) out.avgCostPerUnit = { text: `${signed(pct, Math.abs(pct).toFixed(Math.abs(pct) < 1 ? 1 : 0))}%`, good: pct < 0 }
  }
  return Object.keys(out).length ? out : null
}

/**
 * Live delta readout, after Lepus Analytics' StickyReadout: when the engine result
 * changes, return the per-stat change for a few seconds, then null.
 */
export function useResultDelta(result) {
  const now = pick(result)
  const [prev, setPrev] = useState(now)
  const [delta, setDelta] = useState(null)
  if (!same(prev, now)) {
    // Derive-from-props during render (no effect round trip).
    setPrev(now)
    const d = diff(prev, now)
    if (d) setDelta({ ...d, id: (delta?.id ?? 0) + 1 })
  }
  useEffect(() => {
    if (!delta) return undefined
    const t = setTimeout(() => setDelta(null), HOLD_MS)
    return () => clearTimeout(t)
  }, [delta])
  return delta
}
