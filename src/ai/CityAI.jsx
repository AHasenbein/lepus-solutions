import { useState } from 'react'
import { AIButton, AIResultBox, useAI } from './ui.jsx'
import { askAIText } from './client.js'

// AI helpers for the City / County view. Every prompt gets only the compact `context`
// built in CityView, and client.js prepends the no-invented-numbers rule.

const TASKS = {
  talking: {
    label: 'Council talking points',
    prompt: 'Write 5-7 short bullet talking points a council member could use to present this plan. Plain text bullets starting with "- ", no headers.',
  },
  equity: {
    label: 'Equity & fair-housing check',
    prompt:
      'Assess where the funds land relative to high-poverty tracts, HUD Qualified Census Tracts (qctPct) and high-opportunity tracts (highOppPct), using only the given data. ' +
      'Note any concentration or fair-housing concerns and one or two lever changes in the tool (QCT-only, opportunity weight, per-tract cap) that would shift it. Plain text, under 180 words.',
  },
  faq: {
    label: 'Community FAQ',
    prompt: 'Write 4-5 questions residents are likely to ask about this plan, each followed by a short plain answer grounded in the data. Format "Q: ..." then "A: ...". No headers.',
  },
}

export function AICityPanel({ context }) {
  const ai = useAI()
  const [active, setActive] = useState(null)
  const [question, setQuestion] = useState('')
  const data = JSON.stringify(context)

  const runTask = (key) => {
    setActive(key)
    ai.run(() => askAIText(`${TASKS[key].prompt}\nCurrent jurisdiction plan (JSON):`, data))
  }
  const ask = (e) => {
    e.preventDefault()
    if (!question.trim()) return
    setActive('ask')
    ai.run(() => askAIText(`Answer the user's question about this jurisdiction's plan in under 150 words. Plan (JSON):\n${data}`, question))
  }

  return (
    <section className="rounded-xl border border-violet-400/20 bg-zinc-900/60 p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-violet-200">AI for this jurisdiction</h3>
      <p className="mt-1 text-xs text-zinc-500">Drafts based only on the tract data and plan shown above.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {Object.entries(TASKS).map(([key, t]) => (
          <AIButton key={key} onClick={() => runTask(key)} loading={ai.loading && active === key} disabled={ai.loading || !context}>
            {t.label}
          </AIButton>
        ))}
      </div>
      <form onSubmit={ask} className="mt-3 flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about this city…"
          aria-label="Ask about this city"
          className="min-w-0 flex-1 rounded-lg bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200 ring-1 ring-inset ring-zinc-800 placeholder:text-zinc-600 focus:outline-none focus:ring-violet-400/50"
        />
        <button type="submit" disabled={ai.loading || !question.trim()} className="rounded-lg bg-violet-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-violet-400 disabled:opacity-50">
          {ai.loading && active === 'ask' ? '…' : 'Ask'}
        </button>
      </form>
      <AIResultBox error={ai.error}>
        {ai.result && !ai.loading && <div className="whitespace-pre-wrap leading-relaxed">{ai.result}</div>}
      </AIResultBox>
    </section>
  )
}

export default AICityPanel
