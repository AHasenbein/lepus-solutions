// Shared building blocks, carried over from the Lepus Analytics design language.

export function Button({ children, variant = 'primary', className = '', ...rest }) {
  const styles = {
    primary: 'bg-indigo-500 text-white hover:bg-indigo-400 disabled:bg-indigo-500/40',
    secondary: 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700 ring-1 ring-inset ring-zinc-700',
    ghost: 'text-zinc-300 hover:bg-zinc-800 hover:text-white',
    danger: 'bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 ring-1 ring-inset ring-rose-500/30',
    success: 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 ring-1 ring-inset ring-emerald-500/30',
  }
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant] ?? styles.primary} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Card({ children, className = '', ...rest }) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/60 ${className}`} {...rest}>
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-zinc-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

const BADGE_TONES = {
  neutral: 'bg-zinc-800 text-zinc-300 ring-zinc-700',
  good: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
  bad: 'bg-rose-500/10 text-rose-300 ring-rose-500/30',
  warn: 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  brand: 'bg-indigo-500/10 text-indigo-300 ring-indigo-500/30',
}
// Legacy tone names from the first scaffold map onto the Lepus Analytics tones.
const TONE_ALIASES = { teal: 'brand', yellow: 'warn', slate: 'neutral', red: 'bad' }

export function Badge({ children, tone = 'neutral', className = '' }) {
  const t = BADGE_TONES[TONE_ALIASES[tone] ?? tone] ?? BADGE_TONES.neutral
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${t} ${className}`}>
      {children}
    </span>
  )
}

/** delta: optional { text, good, id } from useResultDelta, shown briefly beside the value. */
export function Stat({ label, value, sub, hint, valueClass = 'text-zinc-50', size = 'md', delta }) {
  const h = hint ?? sub
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium text-zinc-400">{label}</div>
      <div className={`tabular mt-1 font-semibold tracking-tight ${size === 'lg' ? 'text-3xl' : 'text-xl'} ${valueClass}`}>{value}</div>
      {delta && (
        <div key={delta.id} className={`delta-pop tabular mt-1 inline-flex rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${delta.good ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30' : 'bg-rose-500/10 text-rose-300 ring-rose-500/30'}`}>
          {delta.text}
        </div>
      )}
      {h && <div className="mt-0.5 text-xs text-zinc-400">{h}</div>}
    </div>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[11px] text-zinc-400">{hint}</span>}
    </label>
  )
}

/** Rising-bars mark plus wordmark. */
export function Logo({ className = '', label = 'Lepus Solutions' }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight text-white ${className}`}>
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <rect width="24" height="24" rx="6" fill="#6366f1" />
        <rect x="6" y="12" width="3" height="6" rx="1" fill="white" opacity="0.7" />
        <rect x="10.5" y="9" width="3" height="9" rx="1" fill="white" opacity="0.85" />
        <rect x="15" y="6" width="3" height="12" rx="1" fill="white" />
      </svg>
      {label}
    </span>
  )
}

/** Required on every screen: small "Powered by Lepus Analytics" credit. */
export function PoweredBy({ className = '' }) {
  return (
    <p className={`text-[11px] text-zinc-400 ${className}`}>
      Powered by <span className="font-semibold text-indigo-400">Lepus Analytics</span>
    </p>
  )
}

export function PlaceholderBanner({ show }) {
  if (!show) return null
  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 py-2 text-center text-xs font-semibold text-amber-300">
      PLACEHOLDER DATA: numbers on this page are not real yet.
    </div>
  )
}
