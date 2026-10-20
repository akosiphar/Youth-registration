import { FIELDS, getDirty, markSynced, mergeRemote } from './db'

const KEY = 'settings'

export function loadSettings() {
  try {
    return {
      scriptUrl: import.meta.env.VITE_SCRIPT_URL || '',
      token: '',
      ...JSON.parse(localStorage.getItem(KEY) || '{}'),
    }
  } catch {
    return { scriptUrl: import.meta.env.VITE_SCRIPT_URL || '', token: '' }
  }
}

export function saveSettings(s) {
  localStorage.setItem(KEY, JSON.stringify(s))
}

const toWire = (r) => ({
  id: r.id,
  ...Object.fromEntries(FIELDS.map((f) => [f, r[f] ?? (f === 'firstTimer' ? false : '')])),
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  deleted: !!r.deleted,
})

// text/plain keeps this a "simple" CORS request (Apps Script can't answer preflights).
async function call(url, init) {
  const res = await fetch(url, { redirect: 'follow', ...init })
  if (!res.ok) throw new Error(`Server responded ${res.status}`)
  const json = await res.json()
  if (json.error) throw new Error(json.error)
  return json
}

/** Push local changes, then pull remote rows. Returns { pushed, pulled }. */
export async function syncNow() {
  const { scriptUrl, token } = loadSettings()
  if (!scriptUrl) throw new Error('Set the Google Script URL in Settings first.')
  if (!navigator.onLine) throw new Error('You are offline.')

  const dirty = await getDirty()
  if (dirty.length) {
    await call(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token, action: 'upsert', records: dirty.map(toWire) }),
    })
    await markSynced(dirty.map((r) => r.id))
  }

  const qs = new URLSearchParams({ token })
  const { records } = await call(`${scriptUrl}?${qs}`)
  await mergeRemote(records)
  return { pushed: dirty.length, pulled: records.length }
}
