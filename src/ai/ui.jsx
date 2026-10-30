import { useState } from 'react'

// Shared AI UI pieces (dark zinc theme, violet accent so AI output is easy to tell apart).

export const SparkleIcon = ({ className = 'h-4 w-4' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
  </svg>
)

// Runs an async AI call and tracks loading / error / result.
export function useAI() {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const run = async (fn) => {
    setLoading(true)
    setError(null)
    try {
      const value = await fn()
      setResult(value)
      return value
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  return { result, loading, error, run, reset: () => setResult(null) }
}

export function AIButton({ children, onClick, loading = false, disabled = false, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg bg-violet-500/15 px-3 py-1.5 text-sm font-medium text-violet-200 ring-1 ring-inset ring-violet-400/30 transition hover:bg-violet-500/25 disabled:opacity-50 ${className}`}
    >
      <SparkleIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Thinking…' : children}
    </button>
  )
}

export function AIResultBox({ error, children, className = '' }) {
  if (error) return <div className={`mt-3 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-200 ring-1 ring-inset ring-rose-400/30 ${className}`}>AI error: {error}</div>
  if (!children) return null
  return (
    <div className={`mt-3 rounded-lg bg-violet-500/5 p-4 text-sm text-zinc-300 ring-1 ring-inset ring-violet-400/20 ${className}`}>
      {children}
      <p className="mt-3 text-[11px] text-zinc-500">AI-generated from the figures shown in this tool. Check against the cited sources before relying on it.</p>
    </div>
  )
}
