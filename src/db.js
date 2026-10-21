import { openDB } from 'idb'

const STORE = 'registrations'
const ATTENDANCE = 'attendance'

const dbPromise = openDB('offline-registration', 2, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      const store = db.createObjectStore(STORE, { keyPath: 'id' })
      store.createIndex('dirty', 'dirty')
    }
    // One row per member per day, keyed `${date}|${memberId}`.
    if (oldVersion < 2) db.createObjectStore(ATTENDANCE, { keyPath: 'key' })
  },
})

export const FIELDS = ['fullName', 'facebookName', 'age', 'phone', 'affiliationType', 'schoolWork', 'firstTimer', 'invitedBy']

export async function listRegistrations() {
  const all = await (await dbPromise).getAll(STORE)
  return all
    .filter((r) => !r.deleted)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// Sheet cells can come back as numbers (e.g. a phone), so coerce before cleaning.
const normName = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
const normPhone = (s) => String(s ?? '').replace(/\D/g, '')

// Same person = same name, and the same phone when both sides have one.
function sameWho(a, b) {
  const name = normName(a.fullName)
  if (!name || name !== normName(b.fullName)) return false
  const pa = normPhone(a.phone)
  const pb = normPhone(b.phone)
  return !pa || !pb || pa === pb
}

export async function findMember(fullName, phone) {
  const all = await (await dbPromise).getAll(STORE)
  return all.find((r) => !r.deleted && sameWho(r, { fullName, phone })) ?? null
}

// Autocomplete: members whose name contains the typed text (or whose phone starts with the typed digits).
export async function searchMembers(text, limit = 5) {
  const q = normName(text)
  const digits = normPhone(text)
  if (q.length < 2) return []
  const all = await (await dbPromise).getAll(STORE)
  return all
    .filter((r) => !r.deleted && (normName(r.fullName).includes(q) || (digits.length >= 4 && normPhone(r.phone).startsWith(digits))))
    .sort((a, b) => normName(a.fullName).localeCompare(normName(b.fullName)))
    .slice(0, limit)
}

// Local date, so a late-evening check-in lands on the right day's sheet.
export function todayStr() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Returns false if this member is already checked in today.
async function logAttendance(memberId) {
  const db = await dbPromise
  const date = todayStr()
  const key = `${date}|${memberId}`
  if (await db.get(ATTENDANCE, key)) return false
  await db.put(ATTENDANCE, { key, date, memberId, checkedInAt: new Date().toISOString(), dirty: 1 })
  return true
}

/**
 * Saves a member. A new registration that matches someone already known updates that
 * person instead of creating a duplicate, and checks them in for today.
 * Editing from the dashboard (`existing`) changes details only, without a check-in.
 */
export async function saveRegistration(data, existing) {
  const match = existing ?? (await findMember(data.fullName, data.phone))
  const fields = match && !existing
    ? Object.fromEntries(Object.entries(data).filter(([, v]) => v !== '')) // blanks don't erase known details
    : data
  const now = new Date().toISOString()
  const record = {
    ...match,
    ...fields,
    id: match?.id ?? crypto.randomUUID(),
    createdAt: match?.createdAt ?? now,
    updatedAt: now,
    deleted: false,
    dirty: 1,
  }
  await (await dbPromise).put(STORE, record)
  const checkedIn = existing ? null : await logAttendance(record.id)
  return { record, existed: !!match, checkedIn }
}

// Soft delete so the deletion can be synced to the sheet.
export async function deleteRegistration(id) {
  const db = await dbPromise
  const rec = await db.get(STORE, id)
  if (!rec) return
  await db.put(STORE, { ...rec, deleted: true, dirty: 1, updatedAt: new Date().toISOString() })
}

// Wipes the local copy only; rows already synced stay in the Google Sheet.
export async function clearAll() {
  const db = await dbPromise
  await db.clear(STORE)
  await db.clear(ATTENDANCE)
}

export async function getDirty() {
  return (await (await dbPromise).getAll(STORE)).filter((r) => r.dirty)
}

export async function markSynced(ids) {
  const db = await dbPromise
  const tx = db.transaction(STORE, 'readwrite')
  for (const id of ids) {
    const rec = await tx.store.get(id)
    if (!rec) continue
    if (rec.deleted) await tx.store.delete(id)
    else await tx.store.put({ ...rec, dirty: 0 })
  }
  await tx.done
}

export async function getDirtyAttendance() {
  return (await (await dbPromise).getAll(ATTENDANCE)).filter((a) => a.dirty)
}

export async function markAttendanceSynced(keys) {
  const db = await dbPromise
  const tx = db.transaction(ATTENDANCE, 'readwrite')
  for (const key of keys) {
    const rec = await tx.store.get(key)
    if (rec) await tx.store.put({ ...rec, dirty: 0 })
  }
  await tx.done
}

// The server folded these local records into an existing member; the pull brings back the real one.
export async function dropRecords(ids) {
  const db = await dbPromise
  const tx = db.transaction(STORE, 'readwrite')
  for (const id of ids) await tx.store.delete(id)
  await tx.done
}

// Merge server rows into local DB. Local unsynced edits win.
export async function mergeRemote(rows) {
  const db = await dbPromise
  const tx = db.transaction(STORE, 'readwrite')
  for (const row of rows) {
    const local = await tx.store.get(row.id)
    if (local?.dirty) continue
    if (local && local.updatedAt >= row.updatedAt) continue
    if (row.deleted) {
      if (local) await tx.store.delete(row.id)
      continue
    }
    await tx.store.put({ ...row, deleted: false, dirty: 0 })
  }
  await tx.done
}
