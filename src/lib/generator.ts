export type Difficulty = 'mudah' | 'sederhana' | 'sukar';

export interface Placement {
  word: string;
  r: number;
  c: number;
  dr: number;
  dc: number;
}

export interface Puzzle {
  size: number;
  grid: string[][];
  placements: Placement[];
}

const DIRS: Record<Difficulty, [number, number][]> = {
  // kanan, bawah
  mudah: [[0, 1], [1, 0]],
  // + pepenjuru ke bawah-kanan dan atas-kanan
  sederhana: [[0, 1], [1, 0], [1, 1], [-1, 1]],
  // semua 8 arah termasuk terbalik
  sukar: [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]],
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function normalizeWord(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-_'.]/g, '');
}

export function isValidWord(word: string, maxLen: number): string | null {
  if (!/^[A-Z]+$/.test(word)) return 'Letters A–Z only';
  if (word.length < 3) return 'Minimum 3 letters';
  if (word.length > maxLen) return `Maximum ${maxLen} letters (based on grid size)`;
  return null;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function tryPlace(grid: string[][], word: string, dirs: [number, number][]): Placement | null {
  const size = grid.length;
  const candidates: Placement[] = [];
  for (const [dr, dc] of dirs) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const er = r + dr * (word.length - 1);
        const ec = c + dc * (word.length - 1);
        if (er < 0 || er >= size || ec < 0 || ec >= size) continue;
        let ok = true;
        let overlap = 0;
        for (let i = 0; i < word.length; i++) {
          const cell = grid[r + dr * i][c + dc * i];
          if (cell && cell !== word[i]) { ok = false; break; }
          if (cell) overlap++;
        }
        // elak perkataan bertindih sepenuhnya dengan perkataan lain
        if (ok && overlap < word.length) candidates.push({ word, r, c, dr, dc });
      }
    }
  }
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Jana grid word search. `mustInclude` dijamin berada dalam grid (perkataan sasaran).
 */
export function generatePuzzle(
  pool: string[],
  size: number,
  count: number,
  difficulty: Difficulty,
  mustInclude?: string,
): Puzzle {
  const dirs = DIRS[difficulty];
  const fits = pool.filter((w) => w.length <= size);

  for (let attempt = 0; attempt < 30; attempt++) {
    const grid: string[][] = Array.from({ length: size }, () => Array(size).fill(''));
    const placements: Placement[] = [];
    const others = shuffle(fits.filter((w) => w !== mustInclude));
    // perkataan panjang dahulu supaya lebih mudah muat
    const chosen = [...(mustInclude ? [mustInclude] : []), ...others]
      .slice(0, Math.max(count * 2, count + 5));
    const ordered = mustInclude
      ? [mustInclude, ...chosen.slice(1).sort((a, b) => b.length - a.length)]
      : chosen.sort((a, b) => b.length - a.length);

    let failedMust = false;
    for (const word of ordered) {
      if (placements.length >= count) break;
      const p = tryPlace(grid, word, dirs);
      if (!p) {
        if (word === mustInclude) { failedMust = true; break; }
        continue;
      }
      for (let i = 0; i < word.length; i++) grid[p.r + p.dr * i][p.c + p.dc * i] = word[i];
      placements.push(p);
    }
    if (failedMust) continue;

    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (!grid[r][c]) grid[r][c] = ALPHABET[Math.floor(Math.random() * 26)];

    return { size, grid, placements };
  }
  throw new Error('Could not generate the grid. Use shorter words or a larger grid.');
}

export function cellsBetween(a: [number, number], b: [number, number]): [number, number][] {
  const dr = Math.sign(b[0] - a[0]);
  const dc = Math.sign(b[1] - a[1]);
  const len = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  return Array.from({ length: len + 1 }, (_, i) => [a[0] + dr * i, a[1] + dc * i] as [number, number]);
}

/** Paksa titik akhir supaya berada pada garisan lurus (8 arah) dari titik mula. */
export function snapToLine(start: [number, number], raw: [number, number], size: number): [number, number] {
  const dr = raw[0] - start[0];
  const dc = raw[1] - start[1];
  if (dr === 0 && dc === 0) return start;
  const angle = Math.atan2(dr, dc);
  const oct = Math.round(angle / (Math.PI / 4));
  const sdr = Math.round(Math.sin(oct * (Math.PI / 4)));
  const sdc = Math.round(Math.cos(oct * (Math.PI / 4)));
  let len = Math.max(Math.abs(dr), Math.abs(dc));
  // pastikan tidak keluar dari grid
  while (len > 0) {
    const r = start[0] + sdr * len;
    const c = start[1] + sdc * len;
    if (r >= 0 && r < size && c >= 0 && c < size) return [r, c];
    len--;
  }
  return start;
}