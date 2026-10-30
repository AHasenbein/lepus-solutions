import { useEffect, useRef, useState } from 'react'
import { askAI, DATA_RULES, getUserKey, setUserKey, aiAvailable } from './client.js'
import { SparkleIcon } from './ui.jsx'

const SUGGESTIONS = [
  'Summarize this plan for a council member',
  'Why is the top state ranked first?',
  'What tradeoffs does this lens make?',
  'How could we house more people with the same budget?',
]

const TOOL_GUIDE =
  'How the tool works: a fixed public budget is allocated across states (or, in the City / County view, across census tracts) by need. ' +
  'Need is scored with a lens that weights four factors: shortage (ELI affordable-unit shortage), homelessness (HUD Point-in-Time counts), ' +
  'rentBurden (share of renters paying 30%+/50%+ of income) and costEfficiency (homes per dollar given local construction costs). ' +
  'The budget buys units through interventions such as new construction, rehab and conversion, each with a cited cost per unit; ' +
  'a diminishing-returns setting spreads money as each place fills its capacity, and a policy floor can reserve a share for new construction.'

const GearIcon = ({ className = 'h-4 w-4' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

// Paste-your-own-key panel for the static GitHub Pages build (dev uses the .env proxy).
function KeySettings({ onChange }) {
  const [draft, setDraft] = useState('')
  const [hasKey, setHasKey] = useState(() => !!getUserKey())
  const save = () => {
    if (!draft.trim()) return
    setUserKey(draft.trim())
    setDraft('')
    setHasKey(true)
    onChange()
  }
  const remove = () => {
    setUserKey('')
    setHasKey(false)
    onChange()
  }
  return (
    <div className="space-y-2 border-b border-zinc-800 bg-zinc-950/60 px-4 py-3 text-xs text-zinc-400">
      {import.meta.env.DEV ? (
        <p>Dev mode: AI calls go through the local proxy using <code className="text-zinc-300">OPEN_ROUTER_KEY</code> from .env.</p>
      ) : (
        <>
          <p>Paste an OpenRouter API key. It is stored only in this browser and sent only to openrouter.ai.</p>
          <div className="flex gap-2">
            <input
              type="password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder={hasKey ? 'Key saved. Paste to replace' : 'sk-or-v1-…'}
              aria-label="OpenRouter API key"
              className="min-w-0 flex-1 rounded-md bg-zinc-900 px-2 py-1.5 text-zinc-100 ring-1 ring-inset ring-zinc-700 placeholder:text-zinc-500 focus:outline-none focus:ring-violet-400/60"
            />
            <button type="button" onClick={save} className="rounded-md bg-violet-500 px-2.5 py-1.5 font-medium text-white hover:bg-violet-400">Save</button>
            {hasKey && <button type="button" onClick={remove} className="rounded-md px-2.5 py-1.5 text-zinc-300 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-800">Remove</button>}
          </div>
        </>
      )}
    </div>
  )
}

export default function Assistant({ context, view }) {
  const [open, setOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [available, setAvailable] = useState(aiAvailable)
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, open])

  const send = async (text) => {
    const content = (text ?? input).trim()
    if (!content || loading) return
    const history = [...messages, { role: 'user', content }]
    setMessages(history)
    setInput('')
    setError(null)
    setLoading(true)
    try {
      const system = `${DATA_RULES}\n${TOOL_GUIDE}\nCurrent view: ${view}\nCurrent plan data (JSON): ${JSON.stringify(context)}`
      const reply = await askAI([{ role: 'system', content: system }, ...history])
      setMessages((m) => [...m, { role: 'assistant', content: reply }])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col items-end gap-3 sm:right-6 lg:bottom-6">
      {open && (
        <div role="dialog" aria-label="Lepus AI Analyst" className="flex h-[min(560px,70vh)] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/95 shadow-2xl shadow-black/60 backdrop-blur">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-violet-500/20 p-1 text-violet-300"><SparkleIcon /></span>
              <div>
                <p className="text-sm font-semibold text-zinc-50">Lepus AI Analyst</p>
                <p className="text-[11px] text-zinc-500">Answers from this plan's sourced figures</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button type="button" onClick={() => { setMessages([]); setError(null) }} className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">Clear</button>
              )}
              <button type="button" onClick={() => setShowSettings((s) => !s)} aria-label="AI settings" aria-expanded={showSettings} className={`rounded-md p-1.5 hover:bg-zinc-800 ${showSettings ? 'text-violet-300' : 'text-zinc-400 hover:text-zinc-100'}`}>
                <GearIcon />
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant" className="rounded-md px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">✕</button>
            </div>
          </div>

          {showSettings && <KeySettings onChange={() => setAvailable(aiAvailable())} />}

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
            {!available && (
              <div className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-200 ring-1 ring-inset ring-amber-400/30">
                AI needs an OpenRouter key. <button type="button" onClick={() => setShowSettings(true)} className="font-medium underline">Add one in AI settings</button>.
              </div>
            )}
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-zinc-400">Ask about the current plan: where the money goes, why, and what changing a lever would do.</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} disabled={loading} className="rounded-full bg-violet-500/10 px-3 py-1 text-left text-xs text-violet-200 ring-1 ring-inset ring-violet-400/25 hover:bg-violet-500/20 disabled:opacity-50">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 ${m.role === 'user' ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-200'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start" aria-live="polite">
                <div className="flex gap-1 rounded-xl bg-zinc-800 px-3 py-3" aria-label="Assistant is typing">
                  {[0, 150, 300].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-300" style={{ animationDelay: `${d}ms` }} />)}
                </div>
              </div>
            )}
            {error && <div className="rounded-lg bg-rose-500/10 p-3 text-xs text-rose-200 ring-1 ring-inset ring-rose-400/30">AI error: {error}</div>}
            <div ref={endRef} />
          </div>

          <div className="border-t border-zinc-800 p-3">
            <div className="flex gap-2">
              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
                placeholder="Ask about this plan…"
                aria-label="Message the AI analyst"
                className="min-w-0 flex-1 resize-none rounded-lg bg-zinc-950 px-3 py-2 text-sm text-zinc-100 ring-1 ring-inset ring-zinc-700 placeholder:text-zinc-500 focus:outline-none focus:ring-violet-400/60"
              />
              <button type="button" onClick={() => send()} disabled={loading || !input.trim()} className="rounded-lg bg-violet-500 px-3 py-2 text-sm font-medium text-white hover:bg-violet-400 disabled:opacity-50">
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close AI analyst' : 'Open AI analyst'}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full bg-violet-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:bg-violet-400"
      >
        <SparkleIcon className="h-5 w-5" />
        <span className="hidden sm:inline">{open ? 'Close' : 'Ask AI'}</span>
      </button>
    </div>
  )
}
