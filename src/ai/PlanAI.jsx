import { useState } from 'react'
import { Card, CardHeader } from '../components/ui.jsx'
import { AIButton, AIResultBox, useAI } from './ui.jsx'
import { askAIJson, askAIText } from './client.js'

const WEIGHT_KEYS = ['shortage', 'homelessness', 'rentBurden', 'costEfficiency']
const WEIGHT_LABELS = { shortage: 'Unit shortage', homelessness: 'Homelessness', rentBurden: 'Rent burden', costEfficiency: 'Cost efficiency' }
const PLAIN = 'Write plain text with short paragraphs or "-" bullets. No markdown headers, bold, or tables.'

const ctx = (context) => `Current plan context (JSON):\n${JSON.stringify(context)}`

// Plain-text AI output that keeps its line breaks.
function AIText({ text }) {
  return <div className="whitespace-pre-wrap leading-relaxed">{text}</div>
}

// --- Plan brief: explain, stress-test, or announce the current allocation ---

const BRIEF_PROMPTS = {
  explain: {
    label: 'Explain this plan',
    system: `Explain this housing budget allocation to a policymaker in under 220 words: where the money goes, why those places rank highest under the chosen lens, and what it buys (units, people housed). ${PLAIN}`,
  },
  stress: {
    label: 'Stress-test it',
    system: `Stress-test this allocation in under 220 words: risks, blind spots, and what the model does not capture (local capacity, land, politics, timelines, displacement, operating costs). Do not introduce any new numbers. ${PLAIN}`,
  },
  press: {
    label: 'Draft a press release',
    system: `Draft a short press release (under 250 words) announcing this housing investment plan. Use only figures from the context, and note that the allocation came from an open-source model using public data. ${PLAIN}`,
  },
}

export function AIPlanBrief({ context }) {
  const { result, loading, error, run } = useAI()
  const [active, setActive] = useState(null)

  const go = (key) => {
    setActive(key)
    run(() => askAIText(BRIEF_PROMPTS[key].system, ctx(context)))
  }

  return (
    <Card>
      <CardHeader title="AI plan brief" subtitle="Plain-language readouts of the current scenario, built only from the figures on this page." />
      <div className="px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {Object.entries(BRIEF_PROMPTS).map(([key, p]) => (
            <AIButton key={key} onClick={() => go(key)} loading={loading && active === key} disabled={loading && active !== key}>
              {p.label}
            </AIButton>
          ))}
        </div>
        <AIResultBox error={error}>{result && <AIText text={result} />}</AIResultBox>
      </div>
    </Card>
  )
}

// --- Natural-language goal → lens / weights / budget ---

const clamp01 = (v) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : null)

function normalizePlan(raw, lenses) {
  const lensKey = raw?.lensKey && lenses[raw.lensKey] ? raw.lensKey : null
  let weights = null
  if (raw?.weights && typeof raw.weights === 'object') {
    const w = Object.fromEntries(WEIGHT_KEYS.map((k) => [k, clamp01(raw.weights[k]) ?? 0]))
    if (WEIGHT_KEYS.some((k) => w[k] > 0)) weights = w
  }
  const b = Number(raw?.budget)
  return { lensKey, weights, budget: Number.isFinite(b) && b > 0 ? b : null, rationale: String(raw?.rationale ?? '') }
}

function WeightBars({ weights }) {
  return (
    <div className="mt-3 space-y-1.5">
      {WEIGHT_KEYS.map((k) => (
        <div key={k} className="flex items-center gap-2 text-xs">
          <span className="w-28 shrink-0 text-zinc-400">{WEIGHT_LABELS[k]}</span>
          <div className="h-1.5 flex-1 rounded-full bg-zinc-800">
            <div className="h-1.5 rounded-full bg-violet-400" style={{ width: `${(weights[k] ?? 0) * 100}%` }} />
          </div>
          <span className="tabular w-8 text-right text-zinc-300">{(weights[k] ?? 0).toFixed(2)}</span>
        </div>
      ))}
    </div>
  )
}

export function AIGoalToPlan({ lenses, onApply }) {
  const [goal, setGoal] = useState('')
  const [applied, setApplied] = useState(false)
  const { result, loading, error, run } = useAI()

  const lensList = Object.entries(lenses).map(([key, l]) => ({ key, label: l.label, weights: l.weights }))

  const propose = () => {
    setApplied(false)
    run(async () =>
      normalizePlan(
        await askAIJson(
          'Translate the user\'s housing-policy goal into settings for the allocation engine. ' +
            `Available lenses (JSON): ${JSON.stringify(lensList)}. ` +
            'Return { "lensKey": one of the lens keys if one fits well, else null, ' +
            '"weights": { "shortage", "homelessness", "rentBurden", "costEfficiency" } each 0..1 (or null to use the lens weights), ' +
            '"budget": a number in US dollars ONLY if the user stated an amount, else null, ' +
            '"rationale": one or two sentences explaining the mapping }.',
          goal,
        ),
        lenses,
      ),
    )
  }

  const shownWeights = result?.weights ?? (result?.lensKey ? lenses[result.lensKey].weights : null)

  return (
    <Card>
      <CardHeader title="Describe your goal" subtitle="AI turns a policy goal into lens weights (and a budget, if you name one). You review before applying." />
      <div className="px-5 py-4">
        <textarea
          rows={3}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="E.g. Prioritize unsheltered homelessness but keep costs efficient, $2 billion"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-violet-400 focus:outline-none"
        />
        <AIButton className="mt-2" onClick={propose} loading={loading} disabled={!goal.trim()}>
          Propose settings
        </AIButton>
        <AIResultBox error={error}>
          {result && (
            <>
              <p>{result.rationale}</p>
              <p className="mt-2 text-xs text-zinc-400">
                {result.lensKey ? `Lens: ${lenses[result.lensKey].label}` : 'Custom weights'}
                {result.budget ? ` · Budget: $${result.budget.toLocaleString()}` : ''}
              </p>
              {shownWeights && <WeightBars weights={shownWeights} />}
              <button
                type="button"
                onClick={() => { onApply?.({ lensKey: result.lensKey, weights: result.weights, budget: result.budget }); setApplied(true) }}
                className="mt-3 rounded-lg bg-violet-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-violet-400"
              >
                {applied ? 'Applied ✓' : 'Apply to plan'}
              </button>
            </>
          )}
        </AIResultBox>
      </div>
    </Card>
  )
}

// --- Selected state: why it got what it got ---

function StateInsightInner({ context }) {
  const { result, loading, error, run } = useAI()
  const go = () =>
    run(() =>
      askAIText(
        `Explain in under 150 words why ${context.selectedState.name} received its need score and allocation under the current lens, ` +
          `pointing to the specific sourced metrics that drive it, and what the money buys there. ${PLAIN}`,
        ctx({ budget: context.budget, lens: context.lens, weights: context.weights, selectedState: context.selectedState, totals: context.totals }),
      ),
    )
  return (
    <div className="mt-3">
      <AIButton onClick={go} loading={loading}>Why this state?</AIButton>
      <AIResultBox error={error}>{result && <AIText text={result} />}</AIResultBox>
    </div>
  )
}

export function AIStateInsight({ context }) {
  if (!context?.selectedState) return null
  // Keyed by state so the answer resets when a different state is picked.
  return <StateInsightInner key={context.selectedState.name} context={context} />
}

// --- Lens comparison tradeoffs ---

export function AILensInsight({ context }) {
  const { result, loading, error, run } = useAI()
  const go = () =>
    run(() =>
      askAIText(
        `Compare the priority lenses in under 180 words: what each one optimizes for, the tradeoff in units built vs. people housed shown in lensComparison, ` +
          `and which kind of policymaker goal each suits. ${PLAIN}`,
        ctx({ budget: context.budget, activeLens: context.lens, lensComparison: context.lensComparison }),
      ),
    )
  return (
    <div className="mt-3">
      <AIButton onClick={go} loading={loading} disabled={!context?.lensComparison?.length}>Compare lenses with AI</AIButton>
      <AIResultBox error={error}>{result && <AIText text={result} />}</AIResultBox>
    </div>
  )
}
