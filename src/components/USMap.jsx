// Interactive US choropleth (50 states + DC) built on d3-geo + us-atlas.
// Props (stable contract, see CONTRACTS.md):
//   values:       { [fips]: number }      value used for fill color (null/undefined = no data)
//   selectedFips: string | null
//   onSelect:     (fips | null) => void
//   formatValue:  (n) => string           tooltip + legend formatting
//   legendLabel:  string
//   markers:      { [fips]: number }      optional, proportional circles at state centroids
//   names:        { [fips]: string }      optional, state names/abbrs for tooltip
// Optional extras:
//   colorScheme:  'indigo' | 'teal' | 'amber' | 'diverging'   (default 'indigo', the dark Lepus look)
//   buckets:      number of color classes (default 7)
//   markerLabel:  string label for marker value in tooltip (default 'Units')
//   formatMarker: (n) => string (default toLocaleString)
//   secondaryLabel: string shown under the legend (e.g. data source note)
//   height:       CSS max-height for the map (default none; width is always 100%)
import { useId, useMemo, useRef, useState } from 'react'
import { geoAlbersUsa, geoPath } from 'd3-geo'
import { scaleLinear, scaleQuantile, scaleSqrt } from 'd3-scale'
import { extent, max } from 'd3-array'
import { feature, mesh } from 'topojson-client'
import us from 'us-atlas/states-10m.json'

const W = 975
const H = 610

// ---- Static geometry, computed once at module load ----
const ALL = feature(us, us.objects.states).features.filter((f) => Number(f.id) <= 56)
const projection = geoAlbersUsa().fitSize([W, H - 10], { type: 'FeatureCollection', features: ALL })
const pathGen = geoPath(projection)
const STATES = ALL.map((f) => {
  const fips = String(f.id).padStart(2, '0')
  return { fips, atlasName: f.properties.name, d: pathGen(f), centroid: pathGen.centroid(f) }
})
  .filter((s) => s.d)
  .sort((a, b) => a.fips.localeCompare(b.fips))
const BORDERS = pathGen(mesh(us, us.objects.states, (a, b) => a !== b))
const NATION = pathGen(mesh(us, us.objects.states, (a, b) => a === b))

const SCHEMES = {
  // Dark Lepus Analytics look: zinc-800 -> indigo-900 -> indigo-400 -> indigo-200
  indigo: ['#27272a', '#312e81', '#818cf8', '#c7d2fe'],
  // slate-100 -> teal-100 -> teal-800
  teal: ['#f1f5f9', '#ccfbf1', '#5eead4', '#14b8a6', '#0d9488', '#115e59'],
  // slate-100 -> amber-100 -> amber-800
  amber: ['#f1f5f9', '#fef3c7', '#fcd34d', '#f59e0b', '#d97706', '#92400e'],
  // amber-700 -> slate-100 -> teal-700
  diverging: ['#b45309', '#fcd34d', '#f1f5f9', '#5eead4', '#0f766e'],
}

const MONO = { fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace', fontVariantNumeric: 'tabular-nums' }

// Piecewise-linear color interpolation through the stops (d3-scale interpolates colors).
const interpolateStops = (stops) => {
  const s = scaleLinear().domain(stops.map((_, i) => i / (stops.length - 1))).range(stops)
  return (t) => s(t)
}

const EMPTY = {}
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const defaultFormatMarker = (n) => Math.round(n).toLocaleString()

export default function USMap({
  values = {},
  selectedFips = null,
  onSelect,
  formatValue = String,
  legendLabel = '',
  markers,
  names = {},
  colorScheme = 'indigo',
  buckets = 7,
  markerLabel = 'Units',
  formatMarker = defaultFormatMarker,
  secondaryLabel,
  height,
}) {
  const rawId = useId()
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '')
  const hatchId = `hatch-${uid}`
  const shadowId = `shadow-${uid}`
  const wrapRef = useRef(null)
  const [hover, setHover] = useState(null) // { fips, x, y }

  const safeValues = values ?? EMPTY
  const safeNames = names ?? EMPTY

  // Color scale + legend buckets
  const { colorOf, legend } = useMemo(() => {
    const nums = STATES.map((s) => safeValues[s.fips]).filter(isNum)
    if (!nums.length) return { colorOf: () => null, legend: null }
    const stops = SCHEMES[colorScheme] ?? SCHEMES.indigo
    const interp = interpolateStops(stops)
    const n = Math.max(2, Math.min(9, buckets | 0))
    const range = Array.from({ length: n }, (_, i) => interp(i / (n - 1)))
    const [lo, hi] = extent(nums)
    if (lo === hi) {
      const c = range[Math.floor((n - 1) / 2)]
      return { colorOf: () => c, legend: { colors: [c], lo, hi } }
    }
    const q = scaleQuantile().domain(nums).range(range)
    // Dedupe classes that collapse (e.g. many zeros) so the legend stays honest.
    const used = [...new Set(nums.map((v) => q(v)))]
    const colors = range.filter((c) => used.includes(c))
    return { colorOf: (v) => q(v), legend: { colors, lo, hi } }
  }, [safeValues, colorScheme, buckets])

  const markerScale = useMemo(() => {
    if (!markers) return null
    const m = max(STATES, (s) => (isNum(markers[s.fips]) ? markers[s.fips] : 0))
    if (!m || m <= 0) return null
    return scaleSqrt().domain([0, m]).range([0, 22]).clamp(true)
  }, [markers])

  const nameOf = (s) => {
    const given = safeNames[s.fips]
    if (!given) return s.atlasName
    if (given !== s.atlasName && given.length <= 3) return `${s.atlasName} (${given})`
    return given
  }
  const valueText = (v) => (isNum(v) ? formatValue(v) : 'no data')

  const select = (fips) => onSelect?.(fips)

  const moveTip = (e, fips) => {
    const box = wrapRef.current?.getBoundingClientRect()
    if (!box) return
    setHover({ fips, x: e.clientX - box.left, y: e.clientY - box.top, w: box.width })
  }
  const focusTip = (e, fips) => {
    const box = wrapRef.current?.getBoundingClientRect()
    const r = e.currentTarget.getBoundingClientRect()
    if (!box) return
    setHover({ fips, x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top, w: box.width })
  }

  const hovered = hover ? STATES.find((s) => s.fips === hover.fips) : null
  const selected = selectedFips ? STATES.find((s) => s.fips === selectedFips) : null
  const tipLeft = hover && hover.x > hover.w * 0.6

  return (
    <div className="w-full">
      <div ref={wrapRef} className="relative w-full select-none">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto block"
          style={height ? { maxHeight: height } : undefined}
          role="group"
          aria-label={legendLabel ? `US map: ${legendLabel}` : 'US map'}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="#18181b" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#3f3f46" strokeWidth="2" />
            </pattern>
            <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000000" floodOpacity="0.6" />
            </filter>
          </defs>

          <rect width={W} height={H} fill="transparent" onClick={() => select(null)} />

          <g>
            {STATES.map((s) => {
              const v = safeValues[s.fips]
              const fill = isNum(v) ? colorOf(v) ?? `url(#${hatchId})` : `url(#${hatchId})`
              const mv = markers?.[s.fips]
              const label = `${nameOf(s)}: ${valueText(v)}${isNum(mv) ? `, ${markerLabel} ${formatMarker(mv)}` : ''}`
              return (
                <path
                  key={s.fips}
                  d={s.d}
                  tabIndex={0}
                  role="button"
                  aria-label={label}
                  aria-pressed={selectedFips === s.fips}
                  className="cursor-pointer outline-none"
                  style={{
                    fill,
                    transition: 'fill 450ms ease, opacity 200ms ease',
                    opacity: hover && hover.fips !== s.fips ? 0.8 : 1,
                  }}
                  onMouseMove={(e) => moveTip(e, s.fips)}
                  onFocus={(e) => focusTip(e, s.fips)}
                  onBlur={() => setHover(null)}
                  onClick={(e) => {
                    e.stopPropagation()
                    select(s.fips)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                      e.preventDefault()
                      select(s.fips)
                    } else if (e.key === 'Escape') {
                      select(null)
                    }
                  }}
                />
              )
            })}
          </g>

          <path d={BORDERS} fill="none" stroke="#09090b" strokeWidth="0.9" strokeLinejoin="round" pointerEvents="none" />
          <path d={NATION} fill="none" stroke="#3f3f46" strokeWidth="0.8" strokeLinejoin="round" pointerEvents="none" />

          {hovered && hovered.fips !== selectedFips && (
            <path
              d={hovered.d}
              fill="none"
              stroke="#a5b4fc"
              strokeWidth="1.75"
              strokeLinejoin="round"
              filter={`url(#${shadowId})`}
              pointerEvents="none"
            />
          )}
          {selected && (
            <path d={selected.d} fill="none" stroke="#fafafa" strokeWidth="2.75" strokeLinejoin="round" pointerEvents="none" />
          )}

          {markerScale && (
            <g pointerEvents="none">
              {STATES.map((s) => {
                const mv = markers?.[s.fips]
                const r = isNum(mv) && mv > 0 ? markerScale(mv) : 0
                const [cx, cy] = s.centroid
                if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null
                return (
                  <circle
                    key={s.fips}
                    cx={cx}
                    cy={cy}
                    fill="#34d399"
                    fillOpacity="0.18"
                    stroke="#34d399"
                    strokeWidth="1.25"
                    style={{ r, transition: 'r 600ms cubic-bezier(.2,.8,.2,1)' }}
                  />
                )
              })}
            </g>
          )}
        </svg>

        {hovered && (
          <div
            className="pointer-events-none absolute z-20 min-w-48 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs text-zinc-100 shadow-xl"
            style={{
              left: hover.x,
              top: hover.y,
              transform: `translate(${tipLeft ? 'calc(-100% - 14px)' : '14px'}, -50%)`,
            }}
          >
            <div className="text-sm font-semibold text-zinc-100">{nameOf(hovered)}</div>
            <div className="mt-1 flex items-baseline justify-between gap-4">
              <span className="text-zinc-400">{legendLabel || 'Value'}</span>
              <span style={MONO} className={`font-medium ${isNum(safeValues[hovered.fips]) ? 'text-indigo-300' : 'text-zinc-500 italic'}`}>
                {valueText(safeValues[hovered.fips])}
              </span>
            </div>
            {markers && (
              <div className="mt-0.5 flex items-baseline justify-between gap-4">
                <span className="text-zinc-400">{markerLabel}</span>
                <span style={MONO} className="font-medium text-emerald-400">
                  {isNum(markers[hovered.fips]) ? formatMarker(markers[hovered.fips]) : '—'}
                </span>
              </div>
            )}
            {selectedFips === hovered.fips && <div className="mt-1 text-[11px] text-zinc-400">Selected</div>}
          </div>
        )}
      </div>

      <Legend legend={legend} label={legendLabel} formatValue={formatValue} secondaryLabel={secondaryLabel} markers={markerScale ? markerLabel : null} />
    </div>
  )
}

function Legend({ legend, label, formatValue, secondaryLabel, markers }) {
  return (
    <div className="mt-3 flex flex-wrap items-end justify-between gap-4 text-xs text-zinc-400">
      <div className="min-w-56 flex-1 max-w-md">
        {label && <div className="mb-1 font-medium text-zinc-300">{label}</div>}
        {legend ? (
          <>
            <div className="flex h-2.5 overflow-hidden rounded-full ring-1 ring-zinc-800">
              {legend.colors.map((c) => (
                <div key={c} className="flex-1" style={{ background: c, transition: 'background 450ms ease' }} />
              ))}
            </div>
            <div className="mt-1 flex justify-between" style={MONO}>
              <span>{formatValue(legend.lo)}</span>
              <span>{formatValue(legend.hi)}</span>
            </div>
          </>
        ) : (
          <div className="text-zinc-500 italic">No data</div>
        )}
        {secondaryLabel && <div className="mt-1 text-zinc-500">{secondaryLabel}</div>}
      </div>
      <div className="flex items-center gap-4">
        {markers && (
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" aria-hidden="true">
              <circle cx="7" cy="7" r="6" fill="#34d399" fillOpacity="0.18" stroke="#34d399" strokeWidth="1.25" />
            </svg>
            {markers}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-sm ring-1 ring-zinc-700" style={{ background: 'repeating-linear-gradient(45deg,#18181b 0 3px,#3f3f46 3px 5px)' }} />
          No data
        </span>
      </div>
    </div>
  )
}
