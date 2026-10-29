// APP SHELL STUB. The dashboard PR owns this file and builds the full experience.
import { useMemo, useState } from 'react'
import statesData from './data/states.json'
import interventionsData from './data/interventions.json'
import { allocateBudget, LENSES } from './engine/allocate.js'
import USMap from './components/USMap.jsx'
import { Card, PoweredBy, PlaceholderBanner, Stat } from './components/ui.jsx'

const fmt$ = (n) => (n == null ? 'no data' : `$${(n / 1e6).toFixed(1)}M`)

export default function App() {
  const [budget] = useState(1_000_000_000)
  const [selected, setSelected] = useState(null)
  const result = useMemo(
    () => allocateBudget({ budget, states: statesData.states, interventions: interventionsData.interventions, weights: LENSES.balanced.weights }),
    [budget],
  )
  const values = Object.fromEntries(Object.entries(result.byState).map(([f, s]) => [f, s.dollars]))
  const names = Object.fromEntries(Object.values(statesData.states).map((s) => [s.fips, s.abbr]))

  return (
    <div className="min-h-screen flex flex-col">
      <PlaceholderBanner show={statesData.meta.placeholder || interventionsData.meta.placeholder} />
      <header className="bg-white shadow-md sticky top-0 z-50">
        <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <div className="text-3xl font-bold text-teal-600">Housing Atlas</div>
            <PoweredBy />
          </div>
        </nav>
      </header>
      <main className="flex-grow container mx-auto px-6 py-12 space-y-8">
        <Card className="grid sm:grid-cols-3 gap-6">
          <Stat label="Budget" value={fmt$(result.totalBudget)} />
          <Stat label="Units funded" value={result.totalUnits.toLocaleString()} />
          <Stat label="People housed" value={Math.round(result.peopleHoused).toLocaleString()} />
        </Card>
        <Card>
          <USMap values={values} names={names} selectedFips={selected} onSelect={setSelected} formatValue={fmt$} legendLabel="Dollars allocated" />
        </Card>
      </main>
      <footer className="bg-slate-800 text-slate-400 mt-24 py-10">
        <div className="container mx-auto px-6 text-center space-y-2">
          <p>Housing Atlas: open-source decision support for affordable housing investment.</p>
          <PoweredBy className="text-slate-500" />
        </div>
      </footer>
    </div>
  )
}
