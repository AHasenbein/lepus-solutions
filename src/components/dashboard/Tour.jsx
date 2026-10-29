import { useCallback, useEffect, useRef, useState } from 'react'
import { fmtMoney, fmtNum } from './format.js'

// Guided demo tour: a step-by-step overlay that drives the real app state.
// Styling follows Lepus Analytics' ProductTour accents; every number in the copy
// is read live from the engine result or the data files.

const SEEN_KEY = 'lepus-solutions:tour-seen'
const MINUS = '−'

export function useTourSeen() {
  const [seen, setSeen] = useState(() => {
    try {
      return window.localStorage.getItem(SEEN_KEY) === '1'
    } catch {
      return false
    }
  })
  const markSeen = useCallback(() => {
    setSeen(true)
    try {
      window.localStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* storage unavailable: the flag only lives for this session */
    }
  }, [])
  return [seen, markSeen]
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Top-funded state that has not been rejected, from the live engine result. */
function topState(result, excluded = []) {
  const rows = Object.entries(result?.byState ?? {}).filter(([f, b]) => b.dollars > 0 && !excluded.includes(f))
  rows.sort((a, b) => b[1].dollars - a[1].dollars)
  return rows[0] ? { fips: rows[0][0], ...rows[0][1] } : null
}

const signed = (n) => (n >= 0 ? `+${fmtNum(n)}` : `${MINUS}${fmtNum(Math.abs(n))}`)

function buildSteps(ctx, mem) {
  const { result, states, presets, lenses, excluded, sources, interventions, act } = ctx
  const hud = presets.find((p) => /HUD HOME/i.test(p.label)) ?? presets[0]
  const community = lenses.community
  const top = topState(result, excluded)
  const nameOf = (f) => states[f]?.name ?? f
  const stateSourceIds = new Set(Object.values(ctx.fieldSources ?? {}).filter(Boolean))
  const publishers = [...new Set(Object.entries(sources).filter(([id]) => stateSourceIds.has(id)).map(([, s]) => s.publisher).filter(Boolean))]
  return [
    {
      target: 'presets',
      accent: 'indigo',
      title: 'Start from a real budget line',
      enter: () => { act.setView('states'); if (hud) act.setBudget(hud.amount) },
      body: hud ? (
        <>We clicked <b className="text-zinc-100">{hud.label}</b>: {fmtMoney(hud.amount)}, cited to {hud.source.title.split(':')[0]} ({hud.source.year}). It is also the default. Every preset links to its source.</>
      ) : 'Pick a cited budget preset or drag the slider.',
    },
    {
      target: 'lenses',
      accent: 'emerald',
      title: 'See it through a stakeholder’s eyes',
      enter: () => { act.setView('states'); act.pickLens('community') },
      body: community ? (
        <>Now viewing as <b className="text-zinc-100">{community.label}</b>: {community.description} Homelessness carries {Math.round((community.weights.homelessness ?? 0) * 100)}% of the weight, and the optimizer re-ran instantly.</>
      ) : 'Switch lenses to re-weight need.',
    },
    {
      target: 'map',
      accent: 'emerald',
      title: 'Watch the map change',
      enter: () => { act.setView('states'); act.setMetric('dollars') },
      body: top ? (
        <>Under this lens the most money goes to <b className="text-zinc-100">{nameOf(top.fips)}</b>: {fmtMoney(top.dollars)} for {fmtNum(top.units)} units. Circles show units funded; click any state for detail.</>
      ) : 'The map shows dollars allocated by state.',
    },
    {
      target: 'approvals',
      accent: 'amber',
      title: 'Nothing ships without approval',
      enter: () => act.setView('states'),
      body: (mem.rejected ? (
        <>{nameOf(mem.rejected)} was rejected; restore it from the chips at the bottom of this card any time.</>
      ) : top ? (
        <>Every state allocation waits for sign-off. Press Next and we will reject the top state, <b className="text-zinc-100">{nameOf(top.fips)}</b> ({fmtMoney(top.dollars)}), and the optimizer will move its money elsewhere.</>
      ) : 'Approve or reject each state allocation.'),
    },
    {
      target: 'hero-stats',
      accent: 'amber',
      title: 'The money moves',
      // Idempotent: Back then Next never rejects a second state.
      enter: () => {
        act.setView('states')
        if (mem.rejected) return null
        const t = topState(result, excluded)
        if (!t) return null
        act.reject(t.fips)
        return { rejected: t.fips, before: { units: result.totalUnits, people: result.peopleHoused } }
      },
      body: mem.rejected && mem.before && result ? (
        <>{nameOf(mem.rejected)} rejected. Its dollars were reallocated to the next-best states: units funded went from {fmtNum(mem.before.units)} to {fmtNum(result.totalUnits)} (<b className={result.totalUnits - mem.before.units >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{signed(result.totalUnits - mem.before.units)}</b>), people housed {signed(result.peopleHoused - mem.before.people)}. The hero stats flash every change like this.</>
      ) : 'The hero stats show the change whenever a control moves.',
    },
    {
      target: 'detail',
      accent: 'indigo',
      title: 'Every number has a source',
      enter: () => {
        act.setView('states')
        const t = topState(result, excluded)
        if (t) act.select(t.fips)
      },
      body: (
        <>The state panel lists every metric with a link to where it came from{publishers.length ? <> ({publishers.join('; ')})</> : null}. Missing values stay missing; the optimizer never estimates them.</>
      ),
    },
    {
      target: 'howto',
      accent: 'fuchsia',
      title: 'How to build',
      enter: () => act.setView('states'),
      body: <>Compare {interventions.length} building approaches by cited cost per unit and time to occupancy. Toggle one off and the optimizer re-plans across the rest.</>,
    },
    {
      target: 'geo-toggle',
      accent: 'indigo',
      title: 'Zoom in to a city or county',
      enter: () => act.setView('city'),
      body: 'The City / County tab runs the same idea at census-tract scale, with local policy levers and its own approval queue. Use the tab to switch back to the nationwide view.',
    },
  ]
}

const ACCENT = {
  indigo: { hex: '#818cf8', ring: 'ring-indigo-400', dot: 'bg-indigo-400', text: 'text-indigo-300' },
  emerald: { hex: '#34d399', ring: 'ring-emerald-400', dot: 'bg-emerald-400', text: 'text-emerald-300' },
  amber: { hex: '#fbbf24', ring: 'ring-amber-400', dot: 'bg-amber-400', text: 'text-amber-300' },
  fuchsia: { hex: '#e879f9', ring: 'ring-fuchsia-400', dot: 'bg-fuchsia-400', text: 'text-fuchsia-300' },
}

const PAD = 8
const CARD_W = 380

/** Mount only while the tour is running (state resets on every launch). */
export function Tour({ onClose, ctx }) {
  const open = true
  const [i, setI] = useState(0)
  const [rect, setRect] = useState(null)
  const [vp, setVp] = useState({ w: 0, h: 0 })
  const [mem, setMem] = useState({})
  const cardRef = useRef(null)
  const ctxRef = useRef(ctx)
  const goRef = useRef(null)

  const steps = buildSteps(ctx, mem)
  const step = steps[i]

  // Run a step's action against the latest app state, then show it.
  const go = useCallback((n) => {
    const s = buildSteps(ctxRef.current, mem)[n]
    if (!s) return
    const patch = s.enter?.()
    if (patch) setMem((m) => ({ ...m, ...patch }))
    setI(n)
  }, [mem])
  useEffect(() => {
    ctxRef.current = ctx
    goRef.current = go
  })

  // Start: remember focus, enter step 0; on unmount hand focus back.
  useEffect(() => {
    const prev = document.activeElement
    const t = setTimeout(() => goRef.current?.(0), 0)
    return () => {
      clearTimeout(t)
      prev?.focus?.({ preventScroll: true })
    }
  }, [])

  // Scroll the target into view after the step's action has rendered.
  useEffect(() => {
    if (!open) return undefined
    const scroll = (behavior) => {
      const el = document.querySelector(`[data-tour="${step?.target}"]`)
      if (!el) return
      const r = el.getBoundingClientRect()
      const tall = r.height > window.innerHeight * 0.55 || window.innerWidth < 640
      el.scrollIntoView({ block: tall ? 'start' : 'center', behavior })
    }
    const t = setTimeout(() => {
      scroll(reducedMotion() ? 'instant' : 'smooth')
      cardRef.current?.focus({ preventScroll: true })
    }, 60)
    // A re-render mid-scroll (the optimizer re-running) can cancel smooth scrolling: settle it.
    const t2 = setTimeout(() => {
      const r = document.querySelector(`[data-tour="${step?.target}"]`)?.getBoundingClientRect()
      if (r && (r.bottom < 0 || r.top > window.innerHeight)) scroll('instant')
    }, 700)
    return () => { clearTimeout(t); clearTimeout(t2) }
  }, [open, i, step?.target])

  // Track the target's position (smooth scroll, resize, layout shifts): every frame, plus
  // scroll/resize events and a slow interval for when frames are throttled.
  useEffect(() => {
    if (!open) return undefined
    let raf
    let last = ''
    const measure = () => {
      const el = document.querySelector(`[data-tour="${step?.target}"]`)
      const r = el?.getBoundingClientRect()
      const key = r ? `${Math.round(r.top)},${Math.round(r.left)},${Math.round(r.width)},${Math.round(r.height)},${window.innerWidth},${window.innerHeight}` : 'none'
      if (key !== last) {
        last = key
        setRect(r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null)
        setVp({ w: window.innerWidth, h: window.innerHeight })
      }
    }
    const tick = () => {
      measure()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const iv = setInterval(measure, 150)
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(iv)
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [open, step?.target])

  const finish = useCallback(() => onClose(), [onClose])

  // Keyboard: Escape closes, arrows step, Tab stays inside the card.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish() }
      else if (e.key === 'ArrowRight' && i < steps.length - 1) go(i + 1)
      else if (e.key === 'ArrowLeft' && i > 0) go(i - 1)
      else if (e.key === 'Tab' && cardRef.current) {
        const f = [...cardRef.current.querySelectorAll('button, a[href]')]
        if (!f.length) return
        const first = f[0]
        const lastEl = f[f.length - 1]
        if (e.shiftKey && (document.activeElement === first || document.activeElement === cardRef.current)) { e.preventDefault(); lastEl.focus() }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, i, steps.length, go, finish])

  if (!step) return null
  const a = ACCENT[step.accent] ?? ACCENT.indigo
  const last = i === steps.length - 1
  const mobile = vp.w > 0 && vp.w < 640

  // Card placement: bottom sheet on phones; otherwise below the target, above it, or pinned bottom-right.
  let cardStyle = { left: 16, right: 16, bottom: 16 }
  if (!mobile && rect && vp.w) {
    const left = Math.min(Math.max(rect.left, 16), vp.w - CARD_W - 16)
    if (rect.top + rect.height + PAD + 300 < vp.h) cardStyle = { left, top: rect.top + rect.height + PAD + 12, width: CARD_W }
    else if (rect.top - PAD - 300 > 0) cardStyle = { left, bottom: vp.h - rect.top + PAD + 12, width: CARD_W }
    else cardStyle = { right: 24, bottom: 24, width: CARD_W }
  }

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Click-catcher: the page underneath is inert while the tour runs (Skip or Esc to leave). */}
      <div className="absolute inset-0" aria-hidden="true" style={rect ? undefined : { background: 'rgba(9,9,11,0.7)' }} />
      {rect && (
        <div
          aria-hidden="true"
          className="tour-spot pointer-events-none fixed rounded-xl"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            outline: `2px solid ${a.hex}`,
            boxShadow: `0 0 24px 2px ${a.hex}55, 0 0 0 9999px rgba(9, 9, 11, 0.72)`,
          }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        className="fixed rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl shadow-black/60 outline-none"
        style={cardStyle}
      >
        <div className="flex items-center justify-between gap-3">
          <span className={`inline-flex items-center gap-2 text-xs font-medium ${a.text}`}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${a.dot}`} />
            Step {i + 1} of {steps.length}
          </span>
          <button type="button" onClick={finish} className="rounded-md px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
            Skip tour
          </button>
        </div>
        <h2 id="tour-title" className="mt-2 text-base font-semibold text-zinc-50">{step.title}</h2>
        <p id="tour-body" aria-live="polite" className="mt-1.5 text-sm leading-relaxed text-zinc-300">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex gap-1" aria-hidden="true">
            {steps.map((_, k) => (
              <span key={k} className={`h-1 w-4 rounded-full ${k <= i ? a.dot : 'bg-zinc-700'}`} />
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => go(i - 1)} disabled={i === 0} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-100 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-700 disabled:opacity-40">
              Back
            </button>
            <button type="button" onClick={() => (last ? finish() : go(i + 1))} className="rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-400">
              {last ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
        <p className="mt-3 hidden text-[11px] text-zinc-400 sm:block">Esc to close · ← → to step</p>
      </div>
    </div>
  )
}
