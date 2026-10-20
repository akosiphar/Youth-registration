import { useState } from 'react'
import { clearAll, deleteRegistration } from './db'
import { loadSettings, saveSettings, syncNow } from './sync'
import ThemeSettings from './ThemeSettings'

const NO_FILTERS = { type: '', place: '', firstTimer: '', sync: '', ageMin: '', ageMax: '' }

export default function SyncPage({ records, online, onChanged, onEdit }) {
  const [settings, setSettings] = useState(loadSettings)
  const [status, setStatus] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState(NO_FILTERS)
  const [showFilters, setShowFilters] = useState(false)
  const [showSync, setShowSync] = useState(false)

  const pending = records.filter((r) => r.dirty).length
  const configured = !!settings.scriptUrl

  const sync = async () => {
    setSyncing(true)
    try {
      const { pushed, pulled } = await syncNow()
      setStatus(`Synced: ${pushed} sent, ${pulled} on server.`)
      await onChanged()
    } catch (e) {
      setStatus(`Sync failed: ${e.message}`)
    } finally {
      setSyncing(false)
    }
  }

  const remove = async (r) => {
    if (!confirm(`Delete ${r.fullName}?`)) return
    await deleteRegistration(r.id)
    await onChanged()
  }

  const clear = async () => {
    const warn = pending ? `\n\n${pending} registration(s) have NOT been synced and will be lost.` : ''
    if (!confirm(`Clear all data stored on this device?${warn}`)) return
    await clearAll()
    await onChanged()
    setStatus('All data cleared from this device.')
  }

  const exportCsv = () => {
    const cols = ['fullName', 'facebookName', 'age', 'phone', 'affiliationType', 'schoolWork', 'firstTimer', 'invitedBy', 'createdAt']
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [cols.join(','), ...records.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `registrations-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const q = query.trim().toLowerCase()
  const { type, place, firstTimer, sync: syncFilter, ageMin, ageMax } = filters
  const setFilter = (patch) => setFilters((f) => ({ ...f, ...patch }))
  const activeCount = Object.values(filters).filter(Boolean).length
  const places = [...new Set(
    records.filter((r) => !type || r.affiliationType === type).map((r) => r.schoolWork).filter(Boolean),
  )].sort((x, y) => x.localeCompare(y))
  const shown = records
    .filter((r) => !type || r.affiliationType === type)
    .filter((r) => !place || r.schoolWork === place)
    .filter((r) => !firstTimer || (firstTimer === 'yes') === !!r.firstTimer)
    .filter((r) => !syncFilter || (syncFilter === 'pending') === !!r.dirty)
    .filter((r) => ageMin === '' || Number(r.age) >= Number(ageMin))
    .filter((r) => ageMax === '' || Number(r.age) <= Number(ageMax))
    .filter((r) => !q || [r.fullName, r.facebookName, r.phone, r.schoolWork, r.invitedBy].some((v) => v?.toLowerCase().includes(q)))
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt))

  return (
    <>
      <section className="card">
        <div className="row between">
          <h2>Attendees</h2>
          <div className="row">
            <input className="search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="ghost filter-btn" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
              Filter{activeCount ? ` (${activeCount})` : ''}
            </button>
          </div>
        </div>
        {showFilters && (
          <div className="filters">
            <label>Affiliation
              <select value={type} onChange={(e) => setFilter({ type: e.target.value, place: '' })}>
                <option value="">School &amp; Work</option>
                <option>School</option>
                <option>Work</option>
              </select>
            </label>
            <label>School / Workplace
              <select value={place} onChange={(e) => setFilter({ place: e.target.value })}>
                <option value="">All schools/workplaces</option>
                {places.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <label>First timer
              <select value={firstTimer} onChange={(e) => setFilter({ firstTimer: e.target.value })}>
                <option value="">All</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
            <label>Sync status
              <select value={syncFilter} onChange={(e) => setFilter({ sync: e.target.value })}>
                <option value="">All</option>
                <option value="pending">Waiting to sync</option>
                <option value="synced">Synced</option>
              </select>
            </label>
            <label>Min age
              <input type="number" min="0" inputMode="numeric" value={ageMin} onChange={(e) => setFilter({ ageMin: e.target.value })} />
            </label>
            <label>Max age
              <input type="number" min="0" inputMode="numeric" value={ageMax} onChange={(e) => setFilter({ ageMax: e.target.value })} />
            </label>
            <button className="ghost" onClick={() => setFilters(NO_FILTERS)} disabled={!activeCount}>Clear filters</button>
          </div>
        )}
        <p className="muted">Showing <strong>{shown.length}</strong> of <strong>{records.length}</strong> on this device · Waiting to sync: <strong>{pending}</strong></p>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>No.</th><th>Name</th><th>Facebook Name</th><th>Age</th><th>Phone</th>
                <th>School/Work</th><th>First Timer</th><th>Invited By</th><th></th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={9} className="muted">No registrations found.</td></tr>
              )}
              {shown.map((r, i) => (
                <tr key={r.id}>
                  <td>{i + 1}</td>
                  <td>{r.fullName}<span className={`dot ${r.dirty ? 'pending' : 'synced'}`} title={r.dirty ? 'Not synced' : 'Synced'} /></td>
                  <td>{r.facebookName}</td>
                  <td>{r.age}</td>
                  <td>{r.phone}</td>
                  <td>{r.schoolWork}</td>
                  <td>{r.firstTimer ? 'Yes' : 'No'}</td>
                  <td>{r.invitedBy}</td>
                  <td className="nowrap">
                    <button className="mini" onClick={() => onEdit(r)}>Edit</button>{' '}
                    <button className="mini danger" onClick={() => remove(r)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="row actions">
          <button className="ghost" onClick={exportCsv} disabled={!records.length}>Export CSV</button>
          <button className="ghost danger" onClick={clear} disabled={!records.length}>Clear all data</button>
        </div>
        <a className="submit-link" href="#/register">Back to Form</a>
      </section>

      <p className="link-center">
        <button className="text-link" onClick={() => setShowSync((v) => !v)}>
          {showSync ? 'Hide settings' : `Sync & theme settings${pending ? ` (${pending} pending)` : ''}`}
        </button>
      </p>

      {showSync && <ThemeSettings />}

      {showSync && (
      <section className="card">
        <h2>Sync to Google</h2>
        <p className="muted">{online ? 'Connected to the internet.' : 'No internet connection.'}</p>
        <label>Google Script Web App URL
          <input value={settings.scriptUrl} placeholder="https://script.google.com/macros/s/…/exec"
            onChange={(e) => setSettings({ ...settings, scriptUrl: e.target.value.trim() })} />
        </label>
        <label>Access token
          <input value={settings.token} onChange={(e) => setSettings({ ...settings, token: e.target.value })} />
        </label>
        <div className="row">
          <button className="ghost" onClick={() => { saveSettings(settings); setStatus('Settings saved.') }}>Save settings</button>
          <button onClick={sync} disabled={syncing || !online || !configured}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
        {!configured && <p className="muted">Enter the Google Script URL to enable syncing.</p>}
        {status && <p className="status" onClick={() => setStatus('')}>{status}</p>}
      </section>
      )}
    </>
  )
}
