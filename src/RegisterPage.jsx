import { useEffect, useState } from 'react'
import { saveRegistration } from './db'
import { OTHERS, optionsFor, rememberCustom } from './options'

const EMPTY = { fullName: '', facebookName: '', age: '', phone: '', affiliationType: '', schoolWork: '', otherName: '', firstTimer: '', invitedBy: '' }

function formFromRecord(r) {
  const known = !r.schoolWork || optionsFor(r.affiliationType).includes(r.schoolWork)
  return {
    fullName: r.fullName,
    facebookName: r.facebookName,
    age: r.age || '',
    phone: r.phone || '',
    affiliationType: r.affiliationType || '',
    schoolWork: known ? r.schoolWork : OTHERS,
    otherName: known ? '' : r.schoolWork,
    firstTimer: r.firstTimer ? 'yes' : 'no',
    invitedBy: r.invitedBy || '',
  }
}

export default function RegisterPage({ editing, onDone, onSaved }) {
  const [form, setForm] = useState(EMPTY)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setForm(editing ? formFromRecord(editing) : EMPTY)
  }, [editing])

  const reset = () => { setForm(EMPTY); onDone() }

  const onSubmit = async (e) => {
    e.preventDefault()
    const schoolWork = form.schoolWork === OTHERS ? form.otherName.trim() : form.schoolWork
    rememberCustom(form.affiliationType, schoolWork)
    const { otherName, ...rest } = form
    const firstTimer = form.firstTimer === 'yes'
    await saveRegistration({ ...rest, schoolWork, firstTimer, invitedBy: firstTimer ? form.invitedBy : '' }, editing)
    setMessage(`${form.fullName} ${editing ? 'updated' : 'registered'}.`)
    setForm(EMPTY)
    onDone()
    onSaved()
    window.scrollTo({ top: 0 })
  }

  return (
    <>
      {message && <p className="status" onClick={() => setMessage('')}>{message}</p>}

      <form className="card" onSubmit={onSubmit}>
        <div className="card-head">
          <p className="eyebrow">{editing ? 'Editing' : 'Welcome'}</p>
          <h1>{editing ? 'Update registration' : 'Register'}</h1>
          <p className="lede">{editing ? 'Change the details below and save.' : 'Fill in your details to check in.'}</p>
        </div>
        <label>Name
          <input required placeholder="First Name Last Name" value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        </label>
        <label>Facebook Name
          <input placeholder="Your name in Facebook" value={form.facebookName}
            onChange={(e) => setForm({ ...form, facebookName: e.target.value })} />
        </label>
        <label>Age
          <input type="number" inputMode="numeric" min="1" max="120" placeholder="Your age" value={form.age}
            onChange={(e) => setForm({ ...form, age: e.target.value })} />
        </label>
        <label>Phone Number
          <input type="tel" inputMode="tel" placeholder="Your phone number" value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </label>
        <label>School/Work
          <select value={form.affiliationType}
            onChange={(e) => setForm({ ...form, affiliationType: e.target.value, schoolWork: '', otherName: '' })}>
            <option value="">Select one</option>
            <option>School</option>
            <option>Work</option>
          </select>
        </label>
        {form.affiliationType && (
          <label>{form.affiliationType === 'School' ? 'Which school?' : 'Where do you work?'}
            <input list="affiliation-options" value={form.schoolWork} autoComplete="off"
              placeholder="Start typing or choose Others…" required
              onChange={(e) => setForm({ ...form, schoolWork: e.target.value, otherName: '' })}
              onBlur={() => {
                // Anything typed that isn't on the list becomes "Others" + the typed text.
                const v = form.schoolWork.trim()
                if (v && v !== OTHERS && !optionsFor(form.affiliationType).includes(v)) {
                  setForm({ ...form, schoolWork: OTHERS, otherName: v })
                }
              }} />
            <datalist id="affiliation-options">
              {[...optionsFor(form.affiliationType), OTHERS].map((o) => <option key={o} value={o} />)}
            </datalist>
          </label>
        )}
        {form.schoolWork === OTHERS && (
          <label>{form.affiliationType === 'School' ? 'Please specify your school' : 'Please specify your workplace'}
            <input required value={form.otherName} autoFocus
              onChange={(e) => setForm({ ...form, otherName: e.target.value })} />
          </label>
        )}
        <label>First Timer?
          <select required value={form.firstTimer} onChange={(e) => setForm({ ...form, firstTimer: e.target.value })}>
            <option value="">Select one</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        {form.firstTimer === 'yes' && (
          <label>Who invited you?
            <input value={form.invitedBy} onChange={(e) => setForm({ ...form, invitedBy: e.target.value })} />
          </label>
        )}
        <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <button type="submit" className="submit">{editing ? 'Update' : 'Submit'}</button>
          {editing && <button type="button" className="ghost" onClick={reset}>Cancel</button>}
        </div>
      </form>
    </>
  )
}
