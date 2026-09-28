import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  LIMITS, addWords, deleteWord, isDemo, loadConfig, resetDemo, saveSettings, setWordActive, supabase,
  type Config, type Settings,
} from './lib/data';
import { isValidWord, normalizeWord } from './lib/generator';

export default function Admin() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(!isDemo);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setChecking(false); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (checking) return <div className="admin"><p>Loading…</p></div>;
  if (!isDemo && !session) return <Login />;
  return <Dashboard />;
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) setErr('Incorrect email or password');
    setBusy(false);
  };

  return (
    <div className="admin">
      <form className="card login" onSubmit={submit}>
        <h1>Admin Word Hunt</h1>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {err && <p className="err">{err}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <a href="#/" className="muted">← Back to game</a>
      </form>
    </div>
  );
}

function Dashboard() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [bulk, setBulk] = useState('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [filter, setFilter] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const refresh = async () => {
    const c = await loadConfig();
    setCfg(c);
    setDraft((d) => d ?? c.settings);
  };
  useEffect(() => { refresh(); }, []);

  const flash = (type: 'ok' | 'err', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const gridSize = draft?.grid_size ?? 12;

  // semak senarai yang ditampal
  const parsed = useMemo(() => {
    const existing = new Set(cfg?.words.map((w) => w.word) ?? []);
    const seen = new Set<string>();
    const ok: string[] = [];
    const bad: { raw: string; reason: string }[] = [];
    for (const raw of bulk.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)) {
      const w = normalizeWord(raw);
      const reason = isValidWord(w, gridSize)
        ?? (existing.has(w) ? 'Already in the list' : null)
        ?? (seen.has(w) ? 'Duplicate' : null);
      if (reason) bad.push({ raw, reason });
      else { ok.push(w); seen.add(w); }
    }
    return { ok, bad };
  }, [bulk, cfg, gridSize]);

  if (!cfg || !draft) return <div className="admin"><p>Loading…</p></div>;

  const total = cfg.words.length;
  const active = cfg.words.filter((w) => w.active);
  const tooLong = cfg.words.filter((w) => w.active && w.word.length > draft.grid_size);
  const room = LIMITS.poolMax - total;

  const onAdd = async () => {
    if (!parsed.ok.length) return;
    if (parsed.ok.length > room) return flash('err', `You can only add ${room} more (limit ${LIMITS.poolMax})`);
    try {
      await addWords(parsed.ok);
      setBulk('');
      flash('ok', `${parsed.ok.length} word(s) added`);
      refresh();
    } catch (e) { flash('err', (e as Error).message); }
  };

  const onSave = async () => {
    try {
      await saveSettings(draft);
      flash('ok', 'Settings saved. The TV screen will use them within 1 minute.');
      refresh();
    } catch (e) { flash('err', (e as Error).message); }
  };

  const toggle = async (id: string, v: boolean) => {
    setCfg({ ...cfg, words: cfg.words.map((w) => (w.id === id ? { ...w, active: v } : w)) });
    try { await setWordActive(id, v); } catch (e) { flash('err', (e as Error).message); refresh(); }
  };

  // klik pertama minta pengesahan, klik kedua padam
  const remove = async (id: string) => {
    if (confirmId !== id) {
      setConfirmId(id);
      setTimeout(() => setConfirmId((c) => (c === id ? null : c)), 3000);
      return;
    }
    setConfirmId(null);
    try { await deleteWord(id); refresh(); } catch (e) { flash('err', (e as Error).message); }
  };

  const num = (k: keyof Settings, min: number, max: number) => (
    <input
      type="number" min={min} max={max} value={draft[k] as number}
      onChange={(e) => setDraft({ ...draft, [k]: Math.max(min, Math.min(max, Number(e.target.value) || min)) })}
    />
  );

  const shown = cfg.words
    .filter((w) => w.word.includes(normalizeWord(filter)))
    .sort((a, b) => a.word.localeCompare(b.word));

  return (
    <div className="admin">
      <header className="a-head">
        <h1>Admin Word Hunt</h1>
        <div className="a-actions">
          <a className="btn" href="#/">▶ Open game screen</a>
          {supabase && <button onClick={() => supabase!.auth.signOut()}>Sign out</button>}
        </div>
      </header>

      {isDemo && (
        <div className="banner">
          <b>Demo mode:</b> Supabase is not connected, so changes are saved in this browser only.{' '}
          <button className="link" onClick={async () => { await resetDemo(); location.reload(); }}>Reset demo data</button>
        </div>
      )}
      {msg && <div className={`toast ${msg.type}`}>{msg.text}</div>}

      <div className="a-grid">
        <section className="card">
          <h2>Display settings</h2>
          <label>Title<input value={draft.title} maxLength={40} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
          <label>Subtitle<input value={draft.subtitle} maxLength={80} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} /></label>
          <div className="row">
            <label>Grid size ({LIMITS.gridMin}–{LIMITS.gridMax}){num('grid_size', LIMITS.gridMin, LIMITS.gridMax)}</label>
            <label>Words in grid ({LIMITS.onGridMin}–{LIMITS.onGridMax}){num('words_on_grid', LIMITS.onGridMin, LIMITS.onGridMax)}</label>
          </div>
          <div className="row">
            <label>Difficulty
              <select value={draft.difficulty} onChange={(e) => setDraft({ ...draft, difficulty: e.target.value as Settings['difficulty'] })}>
                <option value="mudah">Easy: across & down</option>
                <option value="sederhana">Medium: + diagonal</option>
                <option value="sukar">Hard: + backwards</option>
              </select>
            </label>
            <label>Reset after success (seconds){num('reset_seconds', LIMITS.resetMin, LIMITS.resetMax)}</label>
          </div>
          <p className="hint">Recommended for the booth: grid 10–12, 8–10 words, Medium difficulty. Each visitor gets one target word; the other words in the grid are just distractors.</p>
          <button className="primary" onClick={onSave}>Save settings</button>
        </section>

        <section className="card">
          <h2>Add words</h2>
          <textarea
            rows={6}
            placeholder={'One word per line, or separate with commas\ne.g. TURBINE, RUDDER, LANDING GEAR'}
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
          />
          <p className="hint">Letters A–Z only, 3–{gridSize} letters. Spaces and hyphens are removed automatically (LANDING GEAR → LANDINGGEAR).</p>
          {parsed.ok.length > 0 && <p className="ok-list">✓ Will be added: {parsed.ok.join(', ')}</p>}
          {parsed.bad.length > 0 && (
            <ul className="bad-list">{parsed.bad.map((b, i) => <li key={i}>✗ {b.raw}: {b.reason}</li>)}</ul>
          )}
          <button className="primary" disabled={!parsed.ok.length} onClick={onAdd}>
            Add {parsed.ok.length || ''} word{parsed.ok.length === 1 ? '' : 's'}
          </button>
        </section>
      </div>

      <section className="card">
        <div className="list-head">
          <h2>Word list</h2>
          <span className="pill">{active.length} active · {total}/{LIMITS.poolMax}</span>
          <input className="search" placeholder="Search…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        {active.length < draft.words_on_grid && (
          <p className="warn">Only {active.length} active words. The grid will have fewer than {draft.words_on_grid} words.</p>
        )}
        {tooLong.length > 0 && (
          <p className="warn">Too long for a {draft.grid_size}×{draft.grid_size} grid (won't appear): {tooLong.map((w) => w.word).join(', ')}</p>
        )}
        <ul className="words">
          {shown.map((w) => (
            <li key={w.id} className={w.active ? '' : 'off'}>
              <label className="toggle">
                <input type="checkbox" checked={w.active} onChange={(e) => toggle(w.id, e.target.checked)} />
                <span>{w.word}</span>
                <small>{w.word.length}</small>
              </label>
              <button className={`del ${confirmId === w.id ? 'confirm' : ''}`} aria-label={`Delete ${w.word}`} onClick={() => remove(w.id)}>
                {confirmId === w.id ? 'Delete?' : '✕'}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}