// Shared building blocks, carried over from the Lepus Solutions design language.

export function Button({ children, onClick, variant = 'primary', className = '', ...rest }) {
  const baseStyle = 'font-bold py-3 px-6 rounded-lg transition-transform duration-200 ease-in-out hover:scale-105 disabled:opacity-50 disabled:hover:scale-100'
  const styles = {
    primary: 'bg-teal-600 hover:bg-teal-700 text-white shadow-lg',
    secondary: 'bg-slate-200 hover:bg-slate-300 text-teal-800',
    ghost: 'text-teal-600 hover:bg-teal-50',
  }
  return (
    <button onClick={onClick} className={`${baseStyle} ${styles[variant]} ${className}`} {...rest}>
      {children}
    </button>
  )
}

export function Card({ children, className = '' }) {
  return <div className={`bg-white shadow-lg rounded-2xl p-6 ${className}`}>{children}</div>
}

export function Badge({ children, tone = 'teal' }) {
  const tones = {
    teal: 'bg-teal-600 text-white',
    yellow: 'bg-yellow-500 text-white',
    slate: 'bg-slate-200 text-slate-700',
    red: 'bg-red-600 text-white',
  }
  return <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${tones[tone]}`}>{children}</span>
}

export function Stat({ label, value, sub }) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="text-3xl font-bold text-slate-800 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

/** Required on every screen: small "Powered by Lepus Solutions" credit. */
export function PoweredBy({ className = '' }) {
  return (
    <p className={`text-xs text-slate-400 ${className}`}>
      Powered by <span className="font-semibold text-teal-600">Lepus Solutions</span>
    </p>
  )
}

export function PlaceholderBanner({ show }) {
  if (!show) return null
  return (
    <div className="bg-yellow-500 text-white text-center text-sm font-bold py-2">
      PLACEHOLDER DATA: numbers on this page are not real yet.
    </div>
  )
}
