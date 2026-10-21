import { FIELDS, dropRecords, getDirty, getDirtyAttendance, markAttendanceSynced, markSynced, mergeRemote } from './db'

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

const toWireAttendance = (a) => ({ memberId: a.memberId, date: a.date, checkedInAt: a.checkedInAt })

// text/plain keeps this a "simple" CORS request (Apps Script can't answer preflights).
async function call(url, init) {
  const res = await fetch(url, { redirect: 'follow', ...init })
  if (!res.ok) throw new Error(`Server responded ${res.status}`)
  const json = await res.json()
  if (json.error) throw new Error(json.error)
  return json
}

// Syncs run one at a time so a submit during a running sync is sent in the next pass.
let queue = Promise.resolve()

/** Push local changes, then pull remote rows. Returns { pushed, pulled }. */
export function syncNow() {
  const run = queue.then(doSync)
  queue = run.catch(() => {})
  return run
}

/** Fire-and-forget sync after a form submit. Does nothing if offline or not configured. */
export async function syncIfPossible() {
  if (!navigator.onLine || !loadSettings().scriptUrl) return false
  try {
    await syncNow()
    return true
  } catch {
    return false // records stay pending; "Sync now" or the next submit retries
  }
}

async function doSync() {
  const { scriptUrl, token } = loadSettings()
  if (!scriptUrl) throw new Error('Set the Google Script URL in Settings first.')
  if (!navigator.onLine) throw new Error('You are offline.')

  const dirty = await getDirty()
  const attendance = await getDirtyAttendance()
  if (dirty.length || attendance.length) {
    const { merged = {} } = await call(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token, action: 'upsert', records: dirty.map(toWire), attendance: attendance.map(toWireAttendance) }),
    })
    await markSynced(dirty.map((r) => r.id))
    await markAttendanceSynced(attendance.map((a) => a.key))
    await dropRecords(Object.keys(merged))
  }

  const qs = new URLSearchParams({ token })
  const { records } = await call(`${scriptUrl}?${qs}`)
  await mergeRemote(records)
  return { pushed: dirty.length, pulled: records.length }
}
