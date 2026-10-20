import { useCallback, useEffect, useState } from 'react'
import { listRegistrations } from './db'
import RegisterPage from './RegisterPage'
import SyncPage from './SyncPage'
import { loadTheme, onThemeChange } from './theme'

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

// Hash routing (#/register, #/sync) works on any static host and offline.
function usePage() {
  const read = () => (location.hash === '#/sync' ? 'sync' : 'register')
  const [page, setPage] = useState(read)
  useEffect(() => {
    const onHash = () => setPage(read())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return page
}

export default function App() {
  const online = useOnline()
  const page = usePage()
  const [records, setRecords] = useState([])
  const [editing, setEditing] = useState(null)

  const refresh = useCallback(async () => setRecords(await listRegistrations()), [])
  useEffect(() => { refresh() }, [refresh, page])

  const [banner, setBanner] = useState(() => loadTheme()?.banner)
  useEffect(() => onThemeChange(() => setBanner(loadTheme()?.banner)), [])

  const pending = records.filter((r) => r.dirty).length

  const edit = (r) => {
    setEditing(r)
    location.hash = '#/register'
  }

  return (
    <div className={`app ${page === 'sync' ? 'wide' : ''}`}>
      {banner && <img className="banner" src={banner} alt="" />}
      {page === 'sync' && (
        <header>
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1>Registrations</h1>
          </div>
          <div className="header-right">
            <span className={`pill ${online ? 'on' : 'off'}`}>{online ? 'Online' : 'Offline'}</span>
            <span className="pill">{pending} pending</span>
          </div>
        </header>
      )}

      {page === 'sync'
        ? <SyncPage records={records} online={online} onChanged={refresh} onEdit={edit} />
        : <RegisterPage editing={editing} onDone={() => setEditing(null)} onSaved={refresh} />}

      {page === 'register' && (
        <p className="link-center"><a href="#/sync">View Registrations</a></p>
      )}
    </div>
  )
}
