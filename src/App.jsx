import { useEffect, useRef, useState } from 'react';
import { PHASES, scheduleBoat, bayConflicts, bayList, parseISO, fmt, fmtISO, todayISO } from './schedule';
import { DEFAULT_STATE, makeBoat, estimatesFor, newId } from './defaults';
import { loadData, saveData } from './storage';
import Timeline from './Timeline';

const TABS = [
  ['schedule', 'Schedule'],
  ['bays', 'Bays'],
  ['hours', 'Log Hours'],
  ['archive', 'Archive'],
  ['settings', 'Settings'],
];

const clock = () => new Date().toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' });

export default function App() {
  const [state, setState] = useState(null);
  const [status, setStatus] = useState('Loading…');
  const [tab, setTab] = useState('schedule');
  const [editing, setEditing] = useState(null); // boat object being edited
  const dirty = useRef(false);
  const stateRef = useRef(null); // latest state, read by the saver
  const baseRef = useRef(null); // version of the plan last loaded from / saved to the server
  const saving = useRef(false);
  const pending = useRef(false);
  stateRef.current = state;

  const load = async () => {
    const { data, remote } = await loadData();
    dirty.current = false;
    baseRef.current = data?.savedAt ?? null;
    setState(data || DEFAULT_STATE);
    setStatus(remote ? `Up to date · ${clock()}` : 'Offline – changes saved on this device only');
  };
  useEffect(() => { load(); }, []);

  // One save at a time; changes made while a save is in progress are sent straight after it.
  const flush = async () => {
    if (saving.current) { pending.current = true; return; }
    saving.current = true;
    pending.current = false;
    setStatus('Saving…');
    const r = await saveData(stateRef.current, baseRef.current);
    saving.current = false;
    if (r.conflict) {
      pending.current = false;
      dirty.current = false;
      baseRef.current = r.current?.savedAt ?? null;
      alert('This plan was changed from another computer since you opened it. Loading the latest version — please re-enter your last change.');
      setState(r.current);
      setStatus(`Reloaded latest · ${clock()}`);
      return;
    }
    if (r.ok) {
      baseRef.current = r.savedAt;
      setStatus(`Saved · ${clock()}`);
    } else {
      setStatus('Offline – changes saved on this device only');
    }
    if (pending.current) flush();
  };

  // Autosave shortly after any change
  useEffect(() => {
    if (!state || !dirty.current) return;
    setStatus('Saving…');
    const t = setTimeout(() => {
      dirty.current = false;
      flush();
    }, 800);
    return () => clearTimeout(t);
  }, [state]);

  const update = (fn) => {
    dirty.current = true;
    setState((s) => {
      const next = structuredClone(s);
      fn(next);
      return next;
    });
  };

  if (!state) return <div className="loading">Loading planner…</div>;

  const active = state.boats
    .filter((b) => !b.archived)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const scheds = Object.fromEntries(active.map((b) => [b.id, scheduleBoat(b, state.settings)]));
  const conflicts = bayConflicts(active, scheds);
  const lateCount = active.filter((b) => scheds[b.id].late).length;

  const saveBoat = (boat) => {
    update((s) => {
      const i = s.boats.findIndex((b) => b.id === boat.id);
      if (i >= 0) s.boats[i] = boat;
      else s.boats.push(boat);
    });
    setEditing(null);
  };

  return (
    <div className="app">
      <header>
        <div className="brand">
          <div className="logo">KK</div>
          <div>
            <h1>Kiwi Kraft Boats</h1>
            <div className="subtitle">Production Planner</div>
          </div>
        </div>
        <div className="header-actions">
          <span className="status">{status}</span>
          <button className="ghost" onClick={load} title="Load the latest saved version">Refresh</button>
          <button className="gold" onClick={() => setEditing(makeBoat(state))}>+ Add boat</button>
        </div>
      </header>

      <nav>
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {label}
            {k === 'archive' && ` (${state.boats.length - active.length})`}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'schedule' && (
          <>
            <div className="cards">
              <Stat label="Boats in build / on order" value={active.length} />
              <Stat label="Projected late" value={lateCount} warn={lateCount > 0} />
              <Stat label="Bay clashes" value={conflicts.size ? new Set([...conflicts].map((c) => c.split(':')[0])).size : 0} warn={conflicts.size > 0} />
              <Stat
                label="Hours remaining (est.)"
                value={Math.round(active.reduce((t, b) => t + PHASES.reduce((u, p) => u + (b.phases[p.key].done ? 0 : Math.max(0, b.phases[p.key].est - b.phases[p.key].actual)), 0), 0))}
              />
            </div>
            <Legend />
            <Timeline
              empty="No boats yet — use “+ Add boat” to start."
              rows={active.map((b) => {
                const s = scheds[b.id];
                return {
                  key: b.id,
                  label: b.model,
                  sub: `${b.customer || '—'} · due ${fmtISO(b.targetDate)}`,
                  badge: s.late ? <span className="badge late">Late</span> : null,
                  marker: b.targetDate ? parseISO(b.targetDate) : null,
                  onClick: () => setEditing(structuredClone(b)),
                  bars: PHASES.map((ph) => barFor(b, ph, s, conflicts, state.settings, () => setEditing(structuredClone(b)))),
                };
              })}
            />
            <BoatTable boats={active} scheds={scheds} onEdit={(b) => setEditing(structuredClone(b))} />
          </>
        )}

        {tab === 'bays' && (
          <>
            <p className="hint">Who is in each bay and when. Red outline = two boats booked into the same bay at the same time — change a bay or a start date to clear it.</p>
            <Timeline
              rows={bayList(state.settings).map(({ phase, bay, label }) => ({
                key: `${phase.key}-${bay}`,
                label,
                bars: active
                  .filter((b) => (b.phases[phase.key].bay || 1) === bay)
                  .map((b) => ({
                    ...barFor(b, phase, scheds[b.id], conflicts, state.settings, () => setEditing(structuredClone(b))),
                    text: `${b.model} · ${b.customer || ''}`,
                  })),
              }))}
            />
          </>
        )}

        {tab === 'hours' && <HoursView boats={active} scheds={scheds} settings={state.settings} update={update} />}

        {tab === 'archive' && (
          <ArchiveView
            boats={state.boats.filter((b) => b.archived)}
            onRestore={(id) => update((s) => { const b = s.boats.find((x) => x.id === id); b.archived = false; b.completedDate = null; })}
            onDelete={(id) => confirm('Delete this boat permanently?') && update((s) => { s.boats = s.boats.filter((x) => x.id !== id); })}
          />
        )}

        {tab === 'settings' && <SettingsView state={state} update={update} />}
      </main>

      {editing && (
        <BoatEditor
          boat={editing}
          state={state}
          isNew={!state.boats.some((b) => b.id === editing.id)}
          onSave={saveBoat}
          onCancel={() => setEditing(null)}
          onArchive={(b) => saveBoat({ ...b, archived: true, completedDate: todayISO() })}
          onDelete={(id) => {
            if (!confirm('Delete this boat permanently?')) return;
            update((s) => { s.boats = s.boats.filter((x) => x.id !== id); });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function barFor(b, ph, s, conflicts, settings, onClick) {
  const p = b.phases[ph.key];
  const sp = s.phases[ph.key];
  const multi = (settings.bays[ph.key] || 1) > 1;
  return {
    key: `${b.id}-${ph.key}`,
    start: sp.start,
    end: sp.end,
    color: ph.color,
    text: multi ? `${ph.short} B${p.bay || 1}` : ph.short,
    progress: p.est ? p.actual / p.est : 0,
    done: p.done,
    conflict: conflicts.has(`${b.id}:${ph.key}`),
    title: `${b.model} – ${ph.label}${multi ? ` (Bay ${p.bay || 1})` : ''}\n${fmt(sp.start)} → ${fmt(sp.end)} · ${sp.days} working days\n${p.actual || 0} of ${p.est} hrs${p.done ? ' · complete' : ''}`,
    onClick,
  };
}

function Stat({ label, value, warn }) {
  return (
    <div className={`card${warn ? ' warn' : ''}`}>
      <div className="card-value">{value}</div>
      <div className="card-label">{label}</div>
    </div>
  );
}

function Legend() {
  return (
    <div className="legend">
      {PHASES.map((p) => (
        <span key={p.key}><i style={{ background: p.color }} />{p.label}</span>
      ))}
      <span><i className="lg-marker" />Target delivery</span>
      <span><i className="lg-today" />Today</span>
    </div>
  );
}

function BoatTable({ boats, scheds, onEdit }) {
  if (!boats.length) return null;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Model</th><th>Customer / Dealer</th><th>Start</th><th>Current phase</th>
            <th className="num">Hours (act / est)</th><th>Projected finish</th><th>Target</th><th />
          </tr>
        </thead>
        <tbody>
          {boats.map((b) => {
            const s = scheds[b.id];
            return (
              <tr key={b.id}>
                <td><strong>{b.model}</strong></td>
                <td>{b.customer || '—'}</td>
                <td>{fmtISO(b.startDate)}</td>
                <td>{s.current ? s.current.short : 'Ready to archive'}</td>
                <td className="num">{Math.round(s.actual)} / {s.est}</td>
                <td className={s.late ? 'late-text' : ''}>{fmt(s.finish)}</td>
                <td>{fmtISO(b.targetDate)}</td>
                <td><button className="small" onClick={() => onEdit(b)}>Edit</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HoursView({ boats, settings, update }) {
  if (!boats.length) return <p className="hint">No boats in build.</p>;
  const setPhase = (id, key, patch) =>
    update((s) => { Object.assign(s.boats.find((b) => b.id === id).phases[key], patch); });

  return (
    <>
      <p className="hint">Enter actual hours spent against each phase. Tick “Done” when a phase is finished — the schedule then uses actual hours and moves the next phase up.</p>
      <div className="hours-grid">
        {boats.map((b) => (
          <div className="hours-card" key={b.id}>
            <div className="hours-head">
              <strong>{b.model}</strong>
              <span>{b.customer || '—'}</span>
            </div>
            <table>
              <thead>
                <tr><th>Phase</th><th>Bay</th><th className="num">Est</th><th className="num">Actual</th><th>Add hrs</th><th>Done</th></tr>
              </thead>
              <tbody>
                {PHASES.map((ph) => {
                  const p = b.phases[ph.key];
                  const over = p.actual > p.est;
                  return (
                    <tr key={ph.key} className={p.done ? 'row-done' : ''}>
                      <td><i className="dot" style={{ background: ph.color }} />{ph.short}</td>
                      <td>{(settings.bays[ph.key] || 1) > 1 ? p.bay || 1 : '–'}</td>
                      <td className="num">{p.est}</td>
                      <td className="num">
                        <input
                          type="number" min="0" step="0.5" value={p.actual}
                          className={over ? 'over' : ''}
                          onChange={(e) => setPhase(b.id, ph.key, { actual: Math.max(0, Number(e.target.value) || 0) })}
                        />
                      </td>
                      <td><AddHours onAdd={(h) => setPhase(b.id, ph.key, { actual: Math.round((Number(p.actual) + h) * 10) / 10 })} /></td>
                      <td><input type="checkbox" checked={p.done} onChange={(e) => setPhase(b.id, ph.key, { done: e.target.checked })} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </>
  );
}

function AddHours({ onAdd }) {
  const [v, setV] = useState('');
  const go = () => { const h = Number(v); if (h) onAdd(h); setV(''); };
  return (
    <span className="add-hours">
      <input type="number" step="0.5" placeholder="+" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
      <button className="small" onClick={go}>Add</button>
    </span>
  );
}

function ArchiveView({ boats, onRestore, onDelete }) {
  if (!boats.length) return <p className="hint">No completed boats yet. Use “Mark complete & archive” on a boat when it leaves the workshop.</p>;
  const sorted = [...boats].sort((a, b) => (b.completedDate || '').localeCompare(a.completedDate || ''));
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Model</th><th>Customer / Dealer</th><th>Started</th><th>Completed</th><th>Target</th><th className="num">Est hrs</th><th className="num">Actual hrs</th><th className="num">Variance</th><th /></tr>
        </thead>
        <tbody>
          {sorted.map((b) => {
            const est = PHASES.reduce((t, p) => t + (Number(b.phases[p.key].est) || 0), 0);
            const act = PHASES.reduce((t, p) => t + (Number(b.phases[p.key].actual) || 0), 0);
            const v = act - est;
            return (
              <tr key={b.id}>
                <td><strong>{b.model}</strong></td>
                <td>{b.customer || '—'}</td>
                <td>{fmtISO(b.startDate)}</td>
                <td>{fmtISO(b.completedDate)}</td>
                <td>{fmtISO(b.targetDate)}</td>
                <td className="num">{est}</td>
                <td className="num">{Math.round(act * 10) / 10}</td>
                <td className={`num ${v > 0 ? 'late-text' : 'good-text'}`}>{v > 0 ? '+' : ''}{Math.round(v * 10) / 10}</td>
                <td className="actions">
                  <button className="small" onClick={() => onRestore(b.id)}>Restore</button>
                  <button className="small danger" onClick={() => onDelete(b.id)}>Delete</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SettingsView({ state, update }) {
  const { settings, models } = state;
  const splitTotal = PHASES.reduce((t, p) => t + (Number(settings.split[p.key]) || 0), 0);
  return (
    <div className="settings">
      <section>
        <h2>Workshop</h2>
        <label className="field">
          <span>Productive hours per bay per working day</span>
          <input type="number" min="1" step="0.5" value={settings.hoursPerDay}
            onChange={(e) => update((s) => { s.settings.hoursPerDay = Math.max(1, Number(e.target.value) || 1); })} />
          <small>e.g. 8 for one person per bay, 16 for two. Drives how long each phase takes on the Gantt.</small>
        </label>
        <table>
          <thead><tr><th>Phase</th><th className="num">Bays</th><th className="num">% of model hours</th></tr></thead>
          <tbody>
            {PHASES.map((p) => (
              <tr key={p.key}>
                <td><i className="dot" style={{ background: p.color }} />{p.label}</td>
                <td className="num"><input type="number" min="1" max="6" value={settings.bays[p.key]}
                  onChange={(e) => update((s) => { s.settings.bays[p.key] = Math.min(6, Math.max(1, Number(e.target.value) || 1)); })} /></td>
                <td className="num"><input type="number" min="0" max="100" value={settings.split[p.key]}
                  onChange={(e) => update((s) => { s.settings.split[p.key] = Math.max(0, Number(e.target.value) || 0); })} /></td>
              </tr>
            ))}
            <tr><td /><td /><td className={`num ${splitTotal !== 100 ? 'late-text' : ''}`}><strong>{splitTotal}%</strong>{splitTotal !== 100 && ' (should be 100)'}</td></tr>
          </tbody>
        </table>
        <small>The phase split sets estimates for new boats. Existing boats keep their estimates unless you press “Reset estimates from model” on the boat.</small>
      </section>

      <section>
        <h2>Models &amp; build hours</h2>
        <table>
          <thead><tr><th>Model</th><th className="num">Total hours</th><th /></tr></thead>
          <tbody>
            {models.map((m, i) => (
              <tr key={i}>
                <td><input value={m.name} onChange={(e) => update((s) => { s.models[i].name = e.target.value; })} /></td>
                <td className="num"><input type="number" min="0" value={m.hours} onChange={(e) => update((s) => { s.models[i].hours = Math.max(0, Number(e.target.value) || 0); })} /></td>
                <td><button className="small danger" disabled={models.length < 2} onClick={() => update((s) => { s.models.splice(i, 1); })}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="small" onClick={() => update((s) => { s.models.push({ name: 'New model', hours: 100 }); })}>+ Add model</button>
      </section>

      <section>
        <h2>Data</h2>
        <p className="hint">Download a backup copy of the whole plan, or remove the example boats.</p>
        <div className="row-buttons">
          <button className="small" onClick={() => {
            const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `kk-planner-backup-${todayISO()}.json`;
            a.click();
          }}>Download backup</button>
          <button className="small danger" onClick={() => confirm('Remove all example boats?') && update((s) => { s.boats = s.boats.filter((b) => !b.customer.startsWith('Example')); })}>Remove example boats</button>
        </div>
      </section>
    </div>
  );
}

function BoatEditor({ boat, state, isNew, onSave, onCancel, onArchive, onDelete }) {
  const [b, setB] = useState(boat);
  const set = (patch) => setB((x) => ({ ...x, ...patch }));
  const setPhase = (key, patch) => setB((x) => ({ ...x, phases: { ...x.phases, [key]: { ...x.phases[key], ...patch } } }));
  const model = state.models.find((m) => m.name === b.model);
  const totalEst = PHASES.reduce((t, p) => t + (Number(b.phases[p.key].est) || 0), 0);
  const preview = scheduleBoat(b, state.settings);
  const valid = b.startDate && b.model;

  const changeModel = (name) => {
    const m = state.models.find((x) => x.name === name);
    setB((x) => ({ ...x, model: name, phases: estimatesFor(m.hours, state.settings.split, x.phases) }));
  };

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal">
        <h2>{isNew ? 'Add boat' : `${b.model} — ${b.customer || 'Edit boat'}`}</h2>
        <div className="form-grid">
          <label className="field"><span>Customer / dealer</span>
            <input value={b.customer} autoFocus={isNew} onChange={(e) => set({ customer: e.target.value })} placeholder="e.g. Smith / Geelong Boating Centre" /></label>
          <label className="field"><span>Model</span>
            <select value={b.model} onChange={(e) => changeModel(e.target.value)}>
              {!model && <option value={b.model}>{b.model} (removed)</option>}
              {state.models.map((m) => <option key={m.name} value={m.name}>{m.name} — {m.hours} hrs</option>)}
            </select></label>
          <label className="field"><span>Start date (Pre-CNC)</span>
            <input type="date" value={b.startDate} onChange={(e) => set({ startDate: e.target.value })} /></label>
          <label className="field"><span>Target delivery</span>
            <input type="date" value={b.targetDate} onChange={(e) => set({ targetDate: e.target.value })} /></label>
        </div>

        <table className="phase-table">
          <thead><tr><th>Phase</th><th>Bay</th><th className="num">Est hrs</th><th className="num">Actual hrs</th><th>Done</th><th>Scheduled</th></tr></thead>
          <tbody>
            {PHASES.map((ph) => {
              const p = b.phases[ph.key];
              const n = state.settings.bays[ph.key] || 1;
              const sp = preview.phases[ph.key];
              return (
                <tr key={ph.key}>
                  <td><i className="dot" style={{ background: ph.color }} />{ph.label}</td>
                  <td>{n > 1 ? (
                    <select value={p.bay || 1} onChange={(e) => setPhase(ph.key, { bay: Number(e.target.value) })}>
                      {Array.from({ length: n }, (_, i) => <option key={i} value={i + 1}>Bay {i + 1}</option>)}
                    </select>) : '–'}</td>
                  <td className="num"><input type="number" min="0" value={p.est} onChange={(e) => setPhase(ph.key, { est: Math.max(0, Number(e.target.value) || 0) })} /></td>
                  <td className="num"><input type="number" min="0" step="0.5" value={p.actual} onChange={(e) => setPhase(ph.key, { actual: Math.max(0, Number(e.target.value) || 0) })} /></td>
                  <td><input type="checkbox" checked={p.done} onChange={(e) => setPhase(ph.key, { done: e.target.checked })} /></td>
                  <td className="muted">{fmt(sp.start)} → {fmt(sp.end)}</td>
                </tr>
              );
            })}
            <tr><td><strong>Total</strong></td><td /><td className="num"><strong>{totalEst}</strong></td><td /><td /><td className={preview.late ? 'late-text' : 'muted'}>Finish {fmt(preview.finish)}{preview.late && ' — after target'}</td></tr>
          </tbody>
        </table>
        {model && (
          <button className="link" onClick={() => setB((x) => ({ ...x, phases: estimatesFor(model.hours, state.settings.split, x.phases) }))}>
            Reset estimates from model ({model.hours} hrs)
          </button>
        )}

        <label className="field"><span>Notes</span>
          <textarea rows={2} value={b.notes} onChange={(e) => set({ notes: e.target.value })} /></label>

        <div className="modal-actions">
          {!isNew && <button className="danger" onClick={() => onDelete(b.id)}>Delete</button>}
          {!isNew && <button onClick={() => onArchive(b)}>Mark complete &amp; archive</button>}
          <span className="spacer" />
          <button className="ghost-dark" onClick={onCancel}>Cancel</button>
          <button className="primary" disabled={!valid} onClick={() => onSave(isNew ? { ...b, id: b.id || newId() } : b)}>Save</button>
        </div>
      </div>
    </div>
  );
}
