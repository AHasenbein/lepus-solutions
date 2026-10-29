// CONTRACT STUB. The map PR replaces this with a d3-geo + us-atlas choropleth.
// Props (keep stable):
//   values:       { [fips]: number }      value used for fill color
//   selectedFips: string | null
//   onSelect:     (fips) => void
//   formatValue:  (n) => string           tooltip formatting
//   legendLabel:  string
//   markers:      { [fips]: number }      optional, e.g. units funded; drawn as proportional circles
//   names:        { [fips]: string }      optional, state names for tooltip
export default function USMap({ values = {}, selectedFips, onSelect, formatValue = String, legendLabel = '', names = {} }) {
  return (
    <div className="grid grid-cols-6 gap-1 text-xs">
      <div className="col-span-6 text-slate-500 mb-2">{legendLabel} (map stub)</div>
      {Object.entries(values).map(([fips, v]) => (
        <button
          key={fips}
          onClick={() => onSelect?.(fips)}
          className={`rounded p-1 ${selectedFips === fips ? 'bg-teal-600 text-white' : 'bg-teal-50 text-teal-800'}`}
        >
          {names[fips] ?? fips}: {formatValue(v)}
        </button>
      ))}
    </div>
  )
}
