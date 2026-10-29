import { useMemo, useState } from 'react'
import { geoMercator, geoPath } from 'd3-geo'
import { scaleLinear } from 'd3-scale'

const W = 800
const H = 560
const LO = '#27272a' // zinc-800
const HI = '#818cf8' // indigo-400

/**
 * Tract choropleth. Props: geometry (rewound FeatureCollection), values {geoid: number|null},
 * units {geoid: number}, qct {geoid: bool}, excluded Set, selected, onSelect, formatValue, label, names.
 */
export default function TractMap({ geometry, values, units, qct, excluded, selected, onSelect, formatValue, label, names }) {
  const [hover, setHover] = useState(null)

  const shapes = useMemo(() => {
    if (!geometry?.features?.length) return []
    const projection = geoMercator().fitSize([W, H], geometry)
    const path = geoPath(projection)
    return geometry.features.map((f) => {
      const id = String(f.properties?.GEOID ?? f.id ?? '')
      return { id, d: path(f) ?? '', c: path.centroid(f) }
    })
  }, [geometry])

  const [min, max] = useMemo(() => {
    const v = Object.values(values ?? {}).filter((x) => x != null && Number.isFinite(x))
    return v.length ? [Math.min(...v), Math.max(...v)] : [0, 1]
  }, [values])
  const color = useMemo(() => scaleLinear().domain([min, max === min ? min + 1 : max]).range([LO, HI]).clamp(true), [min, max])
  const maxUnits = useMemo(() => Math.max(1, ...Object.values(units ?? {})), [units])

  if (!shapes.length) return <div className="flex h-64 items-center justify-center text-sm text-zinc-500">No tract geometry in this file.</div>

  const hv = hover ? shapes.find((s) => s.id === hover.id) : null

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full select-none" role="img" aria-label={`Census tract map: ${label}`}>
        <defs>
          <pattern id="qct-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#f59e0b" strokeWidth="1" strokeOpacity="0.45" />
          </pattern>
        </defs>
        <g>
          {shapes.map((s) => {
            const v = values?.[s.id]
            const isEx = excluded?.has(s.id)
            return (
              <path
                key={s.id}
                d={s.d}
                fill={isEx ? '#18181b' : v == null ? '#1f1f23' : color(v)}
                stroke="#09090b"
                strokeWidth={0.5}
                opacity={isEx ? 0.5 : 1}
                className="cursor-pointer transition-opacity hover:opacity-80"
                onMouseMove={(e) => {
                  const r = e.currentTarget.ownerSVGElement.getBoundingClientRect()
                  setHover({ id: s.id, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width })
                }}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelect?.(s.id)}
              />
            )
          })}
        </g>
        <g pointerEvents="none">
          {shapes.filter((s) => qct?.[s.id]).map((s) => (
            <path key={`q${s.id}`} d={s.d} fill="url(#qct-hatch)" stroke="#f59e0b" strokeWidth={0.9} strokeOpacity={0.8} />
          ))}
          {shapes.filter((s) => s.id === selected).map((s) => (
            <path key="sel" d={s.d} fill="none" stroke="#fafafa" strokeWidth={2} />
          ))}
          {shapes.map((s) => {
            const u = units?.[s.id]
            if (!u || !Number.isFinite(s.c[0])) return null
            return <circle key={`c${s.id}`} cx={s.c[0]} cy={s.c[1]} r={2 + 12 * Math.sqrt(u / maxUnits)} fill="#34d399" fillOpacity={0.35} stroke="#34d399" strokeWidth={1} />
          })}
        </g>
      </svg>
      {hv && (
        <div
          className="pointer-events-none absolute z-10 w-56 rounded-lg border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-xs shadow-xl"
          style={{ left: Math.max(0, Math.min(hover.x + 12, hover.w - 230)), top: hover.y + 12 }}
        >
          <div className="font-semibold text-zinc-100">
            Tract {names?.[hv.id] ?? hv.id}
            {qct?.[hv.id] && <span className="ml-1.5 text-amber-300">QCT</span>}
          </div>
          <div className="mt-0.5 text-zinc-400">{label}: <span className="tabular text-zinc-100">{formatValue(values?.[hv.id])}</span></div>
          <div className="text-zinc-400">Units funded: <span className="tabular text-emerald-300">{(units?.[hv.id] ?? 0).toLocaleString()}</span></div>
          {excluded?.has(hv.id) && <div className="text-rose-300">Excluded by planner</div>}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-zinc-500">
        <div className="flex items-center gap-2">
          <span className="tabular">{formatValue(min)}</span>
          <span className="h-2 w-28 rounded-full" style={{ background: `linear-gradient(to right,${LO},${HI})` }} />
          <span className="tabular">{formatValue(max)}</span>
          <span>{label}</span>
        </div>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-amber-500" style={{ background: 'repeating-linear-gradient(45deg,transparent 0 2px,rgba(245,158,11,.5) 2px 3px)' }} /> HUD QCT
        </span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border border-emerald-400 bg-emerald-400/30" /> Units funded</span>
        <span>Click a tract for detail</span>
      </div>
    </div>
  )
}
