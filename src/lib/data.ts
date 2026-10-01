import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Difficulty } from './generator';

export interface Settings {
  title: string;
  subtitle: string;
  grid_size: number;        // 8 – 15
  words_on_grid: number;    // 5 – 15
  difficulty: Difficulty;
  reset_seconds: number;    // 3 – 60
}

export interface WordRow {
  id: string;
  word: string;
  active: boolean;
}

export interface Config {
  settings: Settings;
  words: WordRow[];
}

export const LIMITS = {
  gridMin: 8,
  gridMax: 15,
  onGridMin: 5,
  onGridMax: 15,
  poolMax: 100,
  resetMin: 3,
  resetMax: 60,
};

export const DEFAULT_SETTINGS: Settings = {
  title: 'Engineered By Trust',
  subtitle: 'Find the word & get your passport stamped!',
  grid_size: 12,
  words_on_grid: 10,
  difficulty: 'sederhana',
  reset_seconds: 8,
};

const DEFAULT_WORDS = [
  'TURBINE', 'RUDDER', 'AILERON', 'FUSELAGE', 'COCKPIT', 'PROPELLER', 'HANGAR',
  'RUNWAY', 'ALTITUDE', 'AIRFOIL', 'NACELLE', 'ELEVATOR', 'FLAPS', 'THRUST',
  'COMPRESSOR', 'NOZZLE', 'BLADE', 'ROTOR', 'AVIONICS', 'ENGINE', 'COMBUSTOR',
  'BORESCOPE', 'PILOT', 'RADAR', 'TAXIWAY', 'SATELLITE', 'ROCKET', 'ORBIT',
  'GLIDER', 'HELICOPTER', 'WINGLET', 'CARGO',
];

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
export const isDemo = !supabase;

const CACHE_KEY = 'aero-ws-config';
const DEMO_KEY = 'aero-ws-demo';

function safeGet<T>(k: string): T | null {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function safeSet(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* abaikan */ }
}

function defaultConfig(): Config {
  return {
    settings: { ...DEFAULT_SETTINGS },
    words: DEFAULT_WORDS.map((w, i) => ({ id: `d${i}`, word: w, active: true })),
  };
}

/** Config yang di-cache (untuk mula pantas / offline). */
export function cachedConfig(): Config {
  if (isDemo) return safeGet<Config>(DEMO_KEY) ?? defaultConfig();
  return safeGet<Config>(CACHE_KEY) ?? defaultConfig();
}

/** Ambil config terkini. Jika gagal (tiada internet), guna cache. */
export async function loadConfig(): Promise<Config> {
  if (!supabase) return cachedConfig();
  try {
    const [s, w] = await Promise.all([
      supabase.from('settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('words').select('id, word, active').order('word'),
    ]);
    if (s.error) throw s.error;
    if (w.error) throw w.error;
    const cfg: Config = {
      settings: { ...DEFAULT_SETTINGS, ...(s.data ?? {}) },
      words: w.data ?? [],
    };
    safeSet(CACHE_KEY, cfg);
    return cfg;
  } catch (e) {
    console.warn('Gagal sambung ke Supabase, guna cache', e);
    return cachedConfig();
  }
}

// ---------- Tulis (admin sahaja) ----------

function demoSave(mut: (c: Config) => void) {
  const c = cachedConfig();
  mut(c);
  safeSet(DEMO_KEY, c);
}

export async function saveSettings(s: Settings) {
  if (!supabase) return demoSave((c) => { c.settings = s; });
  const { error } = await supabase.from('settings').upsert({ id: 1, ...s });
  if (error) throw error;
}

export async function addWords(words: string[]) {
  if (!supabase) {
    return demoSave((c) => {
      for (const w of words) c.words.push({ id: crypto.randomUUID(), word: w, active: true });
    });
  }
  const { error } = await supabase.from('words').insert(words.map((word) => ({ word })));
  if (error) throw error;
}

export async function setWordActive(id: string, active: boolean) {
  if (!supabase) return demoSave((c) => { const w = c.words.find((x) => x.id === id); if (w) w.active = active; });
  const { error } = await supabase.from('words').update({ active }).eq('id', id);
  if (error) throw error;
}

export async function deleteWord(id: string) {
  if (!supabase) return demoSave((c) => { c.words = c.words.filter((x) => x.id !== id); });
  const { error } = await supabase.from('words').delete().eq('id', id);
  if (error) throw error;
}

export async function resetDemo() {
  safeSet(DEMO_KEY, defaultConfig());
}