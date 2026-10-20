import { useState } from 'react'
import { analyseImage, loadTheme, saveTheme, buildPalette } from './theme'

export default function ThemeSettings() {
  const [accents, setAccents] = useState(() => {
    const t = loadTheme()
    return t ? [{ hue: t.hue, sat: t.sat }] : []
  })
  const [current, setCurrent] = useState(loadTheme)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); setError('')
    try {
      const { accents: found, banner } = await analyseImage(file)
      const theme = { ...found[0], banner }
      setAccents(found); setCurrent(theme); saveTheme(theme)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const pick = (a) => {
    const theme = { ...a, banner: current?.banner }
    setCurrent(theme); saveTheme(theme)
  }

  const reset = () => {
    setAccents([]); setCurrent(null); saveTheme(null)
  }

  return (
    <section className="card">
      <h2>Theme</h2>
      <p className="muted">Upload the service's picture. It becomes the header and the app colors are matched to it.</p>
      <label>Picture
        <input type="file" accept="image/*" onChange={onFile} disabled={busy} />
      </label>
      {busy && <p className="muted">Reading image…</p>}
      {error && <p className="status" onClick={() => setError('')}>{error}</p>}
      {accents.length > 1 && (
        <>
          <p className="muted">Other colors found in the picture:</p>
          <div className="row swatches">
            {accents.map((a) => (
              <button key={a.hue} type="button" className="swatch" aria-label={`Use color ${a.hue}`}
                style={{ background: buildPalette(a)['--gold'] }}
                data-active={current?.hue === a.hue} onClick={() => pick(a)} />
            ))}
          </div>
        </>
      )}
      {current && <div className="row actions"><button className="ghost" onClick={reset}>Reset to default</button></div>}
    </section>
  )
}
