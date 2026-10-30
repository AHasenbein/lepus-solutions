// AI client. In dev/preview, calls go through the Vite proxy (key in .env, server-side).
// On the static GitHub Pages build there is no server, so a visitor can paste their own
// OpenRouter key; it stays in their browser's localStorage and is sent only to OpenRouter.

const KEY_STORAGE = 'lepus.openrouterKey'
const MODEL = 'anthropic/claude-sonnet-5.5'

export const getUserKey = () => { try { return localStorage.getItem(KEY_STORAGE) || '' } catch { return '' } }
export const setUserKey = (k) => { try { k ? localStorage.setItem(KEY_STORAGE, k) : localStorage.removeItem(KEY_STORAGE) } catch { /* private mode */ } }
export const aiAvailable = () => import.meta.env.DEV || !!getUserKey()

// Every prompt carries the project's data rule (CONTRACTS.md): no invented numbers.
export const DATA_RULES =
  'You are the AI analyst inside Lepus Solutions, an open-source tool for allocating a fixed public budget to affordable housing. ' +
  'Use ONLY numbers present in the provided context; they come from cited public sources (ACS, HUD, NLIHC) or the allocation engine. ' +
  'Never estimate, invent, or round into new figures. If a number is not in the context, say it is not available. ' +
  'Be concise and plain-spoken, suitable for policymakers.'

export async function askAI(messages, { json = false } = {}) {
  const userKey = getUserKey()
  let content
  if (userKey) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userKey}`, 'Content-Type': 'application/json', 'X-Title': 'Lepus Solutions' },
      body: JSON.stringify({ model: MODEL, messages, ...(json && { response_format: { type: 'json_object' } }) }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error?.message || `AI request failed (${res.status})`)
    content = data.choices?.[0]?.message?.content ?? ''
  } else if (import.meta.env.DEV) {
    const res = await fetch(`${import.meta.env.BASE_URL}api/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, json }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `AI request failed (${res.status})`)
    content = data.content
  } else {
    throw new Error('Add an OpenRouter key in AI settings (the assistant panel) to use AI features.')
  }
  return content
}

export const askAIText = (system, user) =>
  askAI([{ role: 'system', content: `${DATA_RULES}\n${system}` }, { role: 'user', content: user }])

export async function askAIJson(system, user) {
  const content = await askAI(
    [
      { role: 'system', content: `${DATA_RULES}\n${system}\nRespond with a single valid JSON object only, no prose or code fences.` },
      { role: 'user', content: user },
    ],
    { json: true },
  )
  const match = content.match(/\{[\s\S]*\}/)
  return JSON.parse(match ? match[0] : content)
}
