import { useCallback, useEffect, useRef, useState } from 'react';
import { cachedConfig, loadConfig, type Config } from './lib/data';
import { MeshDriftBackground } from './components/MeshDriftBackground';
import { cellsBetween, generatePuzzle, snapToLine, type Placement, type Puzzle } from './lib/generator';

type Cell = [number, number];
type Status = 'playing' | 'wrong' | 'success';

const RECENT_MAX = 6;
const IDLE_MS = 90_000;
const HINT_AFTER_MS = 40_000;

const same = (a: Cell | null, b: Cell | null) => !!a && !!b && a[0] === b[0] && a[1] === b[1];

export default function Kiosk() {
  const configRef = useRef<Config>(cachedConfig());
  const recentRef = useRef<string[]>([]);
  const [settings, setSettings] = useState(configRef.current.settings);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [target, setTarget] = useState<Placement | null>(null);
  const [status, setStatus] = useState<Status>('playing');
  const [error, setError] = useState<string | null>(null);

  // pemilihan
  const [anchor, setAnchor] = useState<Cell | null>(null);   // mod klik-klik
  const [sel, setSel] = useState<{ a: Cell; b: Cell } | null>(null);
  const [found, setFound] = useState<{ a: Cell; b: Cell } | null>(null);
  const downRef = useRef<{ cell: Cell; dragging: boolean; id: number } | null>(null);

  const [countdown, setCountdown] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [hintAvailable, setHintAvailable] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [round, setRound] = useState(0);
  const lastActivity = useRef(Date.now());

  const gridRef = useRef<HTMLDivElement>(null);

  const newRound = useCallback(() => {
    const cfg = configRef.current;
    setSettings(cfg.settings);
    const { grid_size, words_on_grid, difficulty } = cfg.settings;
    const pool = cfg.words.filter((w) => w.active).map((w) => w.word).filter((w) => w.length <= grid_size);
    if (pool.length === 0) {
      setError('No active words. Please add words in the admin page.');
      setPuzzle(null);
      return;
    }
    const fresh = pool.filter((w) => !recentRef.current.includes(w));
    const choices = fresh.length ? fresh : pool;
    const word = choices[Math.floor(Math.random() * choices.length)];
    recentRef.current = [word, ...recentRef.current].slice(0, Math.min(RECENT_MAX, pool.length - 1));
    try {
      const p = generatePuzzle(pool, grid_size, words_on_grid, difficulty, word);
      setPuzzle(p);
      setTarget(p.placements.find((x) => x.word === word) ?? null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setStatus('playing');
    setAnchor(null);
    setSel(null);
    setFound(null);
    setShowHint(false);
    setHintAvailable(false);
    setRound((r) => r + 1);
    lastActivity.current = Date.now();
  }, []);

  // muat config, mula pusingan pertama, segarkan config setiap 60s
  useEffect(() => {
    newRound();
    let alive = true;
    let first = true;
    const refresh = async () => {
      const cfg = await loadConfig();
      if (!alive) return;
      const prev = configRef.current;
      configRef.current = cfg;
      // kali pertama: jika cache lama berbeza dari data terkini, jana semula terus.
      // selepas itu perubahan hanya digunakan pada pusingan seterusnya.
      if (first && JSON.stringify(prev) !== JSON.stringify(cfg)) newRound();
      first = false;
    };
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [newRound]);

  // butang petunjuk selepas beberapa saat
  useEffect(() => {
    if (status !== 'playing') return;
    const t = setTimeout(() => setHintAvailable(true), HINT_AFTER_MS);
    return () => clearTimeout(t);
  }, [round, status]);

  // reset jika tiada aktiviti (pengunjung tinggalkan booth)
  useEffect(() => {
    const t = setInterval(() => {
      if (status === 'playing' && (anchor || sel || showHint) && Date.now() - lastActivity.current > IDLE_MS) newRound();
    }, 5000);
    return () => clearInterval(t);
  }, [status, anchor, sel, showHint, newRound]);

  // kira detik selepas berjaya
  useEffect(() => {
    if (status !== 'success') return;
    setCountdown(settings.reset_seconds);
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(t); newRound(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [status, settings.reset_seconds, newRound]);

  // pintasan papan kekunci untuk staf
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') { if (status === 'success') { e.preventDefault(); newRound(); } }
      else if (e.key === 'n' || e.key === 'N') newRound();
      else if (e.key === 'h' || e.key === 'H') setShowHint(true);
      else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      else if (e.key === 'Escape') { setAnchor(null); setSel(null); setStaffOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, newRound]);

  const cellFromEvent = (e: React.PointerEvent): Cell | null => {
    const el = gridRef.current;
    if (!el || !puzzle) return null;
    const rect = el.getBoundingClientRect();
    const n = puzzle.size;
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * n);
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * n);
    return [Math.max(0, Math.min(n - 1, r)), Math.max(0, Math.min(n - 1, c))];
  };

  const evaluate = (a: Cell, b: Cell) => {
    if (!puzzle || !target) return;
    const cells = cellsBetween(a, b);
    const str = cells.map(([r, c]) => puzzle.grid[r][c]).join('');
    const reversed = [...str].reverse().join('');
    if (str === target.word || reversed === target.word) {
      setFound({ a, b });
      setSel(null);
      setAnchor(null);
      setStatus('success');
    } else {
      setSel({ a, b });
      setAnchor(null);
      setStatus('wrong');
      setTimeout(() => { setSel(null); setStatus((s) => (s === 'wrong' ? 'playing' : s)); }, 700);
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (status !== 'playing' || !puzzle) return;
    const cell = cellFromEvent(e);
    if (!cell) return;
    lastActivity.current = Date.now();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    downRef.current = { cell, dragging: false, id: e.pointerId };
    if (!anchor) setSel({ a: cell, b: cell });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!puzzle || status !== 'playing') return;
    const cell = cellFromEvent(e);
    if (!cell) return;
    const d = downRef.current;
    if (d && d.id === e.pointerId) {
      if (!d.dragging && !same(cell, d.cell)) {
        d.dragging = true;
        setAnchor(null);
      }
      if (d.dragging) setSel({ a: d.cell, b: snapToLine(d.cell, cell, puzzle.size) });
    } else if (anchor && e.pointerType === 'mouse') {
      // pratonton garisan semasa tetikus bergerak selepas klik pertama
      setSel({ a: anchor, b: snapToLine(anchor, cell, puzzle.size) });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = downRef.current;
    downRef.current = null;
    if (!d || !puzzle || status !== 'playing') return;
    const cell = cellFromEvent(e) ?? d.cell;
    lastActivity.current = Date.now();
    if (d.dragging) {
      const end = snapToLine(d.cell, cell, puzzle.size);
      if (!same(end, d.cell)) evaluate(d.cell, end);
      else setSel(null);
      return;
    }
    // ketik / klik
    if (!anchor) {
      setAnchor(cell);
      setSel({ a: cell, b: cell });
    } else if (same(anchor, cell)) {
      setAnchor(null);
      setSel(null);
    } else {
      evaluate(anchor, snapToLine(anchor, cell, puzzle.size));
    }
  };

  const n = puzzle?.size ?? settings.grid_size;
  const hintCell: Cell | null = showHint && target ? [target.r, target.c] : null;
  const selCells = sel ? cellsBetween(sel.a, sel.b) : [];
  const foundCells = found ? cellsBetween(found.a, found.b) : [];
  const inList = (list: Cell[], r: number, c: number) => list.some(([a, b]) => a === r && b === c);

  const line = (s: { a: Cell; b: Cell }, cls: string) => (
    <line
      className={cls}
      x1={s.a[1] + 0.5} y1={s.a[0] + 0.5}
      x2={s.b[1] + 0.5} y2={s.b[0] + 0.5}
    />
  );

  return (
    <div className="kiosk">
      {/* latar hitam ialah fallback jika WebGL gagal */}
      <div className="k-bg">
        <MeshDriftBackground />
      </div>
      <div className="k-content">
      <header className="k-header">
        <div className="k-brand">
          <img className="k-brand-icon" src="/logo/TurbineIcon.svg" alt="" />
          <div>
            <h1>{settings.title}</h1>
            <p>{settings.subtitle}</p>
          </div>
        </div>
        <div className="k-logos">
          <img src="/logo/OFLogo.png" alt="Global Turbine Asia" className="lg-gta" />
          <span className="k-logos-sep" />
          <img src="/logo/gtaholding.jpeg" alt="GTA Holding" className="lg-holding" />
          <span className="k-logos-sep" />
          <img src="/logo/gtasympo.jpeg" alt="GTA Customer Symposium 2026" className="lg-sympo" />
        </div>
      </header>

      <main className="k-main">
        <section className="k-panel">
          <div className="k-label">Find this word</div>
          <div className="k-target" key={round}>{target?.word ?? '—'}</div>
          <div className="k-letters">{target ? `${target.word.length} letters` : ''}</div>

          <ol className="k-steps">
            <li><b>Click / tap</b> the first letter</li>
            <li><b>Click / tap</b> the last letter</li>
            <li>Or <b>drag</b> from start to end</li>
          </ol>

          <div className="k-status" aria-live="polite">
            {status === 'wrong' && <span className="bad">Not quite. Try again!</span>}
            {status === 'playing' && anchor && <span className="info">Now pick the last letter</span>}
          </div>

          {hintAvailable && !showHint && status === 'playing' && (
            <button className="k-hint" onClick={() => setShowHint(true)}>💡 Hint</button>
          )}
          {showHint && <div className="k-hint-text">The first letter is blinking ✨</div>}
        </section>

        <section className="k-board">
          {error ? (
            <div className="k-error">{error}<br /><a href="#/admin">Open admin</a></div>
          ) : (
            <div
              ref={gridRef}
              className={`k-grid ${status === 'wrong' ? 'shake' : ''}`}
              style={{ gridTemplateColumns: `repeat(${n}, 1fr)`, ['--n' as string]: n }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => { downRef.current = null; }}
              onPointerLeave={() => { if (anchor && !downRef.current) setSel({ a: anchor, b: anchor }); }}
            >
              <svg className="k-lines" viewBox={`0 0 ${n} ${n}`} preserveAspectRatio="none">
                {found && line(found, 'ln found')}
                {sel && !same(sel.a, sel.b) && line(sel, status === 'wrong' ? 'ln wrong' : 'ln sel')}
              </svg>
              {puzzle?.grid.map((row, r) =>
                row.map((ch, c) => {
                  const cls = [
                    'cell',
                    inList(foundCells, r, c) && 'is-found',
                    inList(selCells, r, c) && (status === 'wrong' ? 'is-wrong' : 'is-sel'),
                    same(anchor, [r, c]) && 'is-anchor',
                    same(hintCell, [r, c]) && 'is-hint',
                  ].filter(Boolean).join(' ');
                  return <div key={`${r}-${c}`} className={cls}>{ch}</div>;
                }),
              )}
            </div>
          )}
        </section>
      </main>
      </div>

      {status === 'success' && target && (
        <div className="k-success" onClick={newRound}>
          <div className="k-success-card" onClick={(e) => e.stopPropagation()}>
            <div className="k-check">✓</div>
            <h2>Congratulations!</h2>
            <p>You found <b>{target.word}</b></p>
            <p className="stamp">✈ Show this screen to our staff to get your passport stamped</p>
            <button onClick={newRound}>Next player ({countdown})</button>
          </div>
        </div>
      )}

      <button className="k-gear" aria-label="Staff menu" onClick={() => setStaffOpen((o) => !o)}>⚙</button>
      {staffOpen && (
        <div className="k-staff">
          <button onClick={() => { newRound(); setStaffOpen(false); }}>New word <kbd>N</kbd></button>
          <button onClick={() => { setShowHint(true); setStaffOpen(false); }}>Show hint <kbd>H</kbd></button>
          <button onClick={() => { toggleFullscreen(); setStaffOpen(false); }}>Fullscreen <kbd>F</kbd></button>
          <a href="#/admin">Admin</a>
        </div>
      )}
    </div>
  );
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
