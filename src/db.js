import { openDB } from 'idb'

const STORE = 'registrations'

const dbPromise = openDB('offline-registration', 1, {
  upgrade(db) {
    const store = db.createObjectStore(STORE, { keyPath: 'id' })
    store.createIndex('dirty', 'dirty')
  },
})

export const FIELDS = ['fullName', 'facebookName', 'age', 'phone', 'affiliationType', 'schoolWork', 'firstTimer', 'invitedBy']

export async function listRegistrations() {
  const all = await (await dbPromise).getAll(STORE)
  return all
    .filter((r) => !r.deleted)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function saveRegistration(data, existing) {
  const now = new Date().toISOString()
  const record = {
    ...existing,
    ...data,
    id: existing?.id ?? crypto.randomUUID(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deleted: false,
    dirty: 1,
  }
  await (await dbPromise).put(STORE, record)
  return record
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
  await (await dbPromise).clear(STORE)
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
