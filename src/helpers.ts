import type { VoteChoice } from './data';

export function initials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('');
}

const COMBINING_MARKS_RE = new RegExp('[\\u0300-\\u036f]', 'g');

/** Lowercase and strip diacritics (ü→u, ß→ss, é→e, …) so "Wurzburg" lines up with "Würzburg". */
function foldDiacritics(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(COMBINING_MARKS_RE, '');
}

function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[b.length];
}

/**
 * Search-box matching: diacritic-insensitive substring match first (handles missing umlauts,
 * case), falling back to a small per-word edit-distance check so a typo like "Whitaker" still
 * finds "Whittaker". Skips the edit-distance fallback for very short queries (<4 chars) since
 * a 1-edit tolerance there would match almost anything.
 */
export function fuzzyIncludes(text: string, query: string): boolean {
  const q = foldDiacritics(query.trim());
  if (!q) return false;
  const t = foldDiacritics(text);
  if (t.includes(q)) return true;
  if (q.length < 4) return false;
  const maxDist = q.length <= 7 ? 1 : 2;
  for (const word of t.split(/[^\p{L}\p{N}]+/u)) {
    if (!word || Math.abs(word.length - q.length) > maxDist) continue;
    if (levenshtein(word, q) <= maxDist) return true;
  }
  return false;
}

export function trendPoints(seed: number): string {
  const pts: string[] = [];
  let v = 50 + seed * 3;
  for (let i = 0; i < 8; i++) {
    v += Math.sin(i + seed) * 10;
    pts.push(`${i * 57},${Math.max(5, Math.min(95, 100 - v))}`);
  }
  return pts.join(' ');
}

export function sparkline(seed: number): string {
  const pts: string[] = [];
  let v = 14 + seed;
  for (let i = 0; i < 5; i++) {
    v += Math.sin(i + seed) * 8;
    pts.push(`${i * 24},${Math.max(2, Math.min(26, 26 - v))}`);
  }
  return pts.join(' ');
}

export function majorityVote(dist: [number, number, number]): VoteChoice {
  const [y, n, a] = dist;
  if (y >= n && y >= a) return 'yes';
  if (n >= y && n >= a) return 'no';
  return 'abstain';
}

export interface HemicycleSeat {
  x: number;
  y: number;
  party: string;
  color: string;
}

/**
 * Conventional left-to-right ordering for a German parliament seating chart. Fraktionslos
 * members have no bloc position of their own — placed between the two major blocs rather
 * than at either edge, which is the least presumptuous spot for a residual category.
 */
const HEMICYCLE_PARTY_ORDER = ['Linke', 'Grüne', 'SPD', 'Fraktionslos', 'CDU/CSU', 'AfD'];

/**
 * Classic parliament seating-chart layout: seats sit in concentric semicircle rows, with
 * outer rows holding more seats so spacing stays roughly even (arc length grows with
 * radius). Seats are then handed out to parties in bloc order along the combined left-to-
 * right sequence, so each party forms one contiguous wedge instead of being scattered.
 */
export function computeHemicycleSeats(
  parties: { name: string; seats: number; color: string }[],
  opts: { rows?: number; rMin?: number; rMax?: number; cx?: number; cy?: number } = {},
): HemicycleSeat[] {
  const rows = opts.rows ?? 9;
  const rMin = opts.rMin ?? 55;
  const rMax = opts.rMax ?? 200;
  const cx = opts.cx ?? 260;
  const cy = opts.cy ?? 220;
  const total = parties.reduce((sum, p) => sum + p.seats, 0);
  if (total === 0) return [];

  const radii = Array.from({ length: rows }, (_, i) => rMin + (i * (rMax - rMin)) / Math.max(1, rows - 1));
  const weightSum = radii.reduce((a, b) => a + b, 0);
  const seatsPerRow = radii.map((r) => Math.round((total * r) / weightSum));
  // Rounding can drift the total off by a seat or two — true it up on the outermost row,
  // which has room to spare without visibly changing its density.
  seatsPerRow[seatsPerRow.length - 1] += total - seatsPerRow.reduce((a, b) => a + b, 0);

  const positions: { x: number; y: number; angle: number }[] = [];
  seatsPerRow.forEach((count, i) => {
    if (count <= 0) return;
    const r = radii[i];
    for (let j = 0; j < count; j++) {
      const angle = count === 1 ? Math.PI / 2 : Math.PI - (j * Math.PI) / (count - 1);
      positions.push({ x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle), angle });
    }
  });
  positions.sort((a, b) => b.angle - a.angle); // left (angle≈π) to right (angle≈0)

  const order = [
    ...HEMICYCLE_PARTY_ORDER.filter((name) => parties.some((p) => p.name === name)),
    ...parties.map((p) => p.name).filter((name) => !HEMICYCLE_PARTY_ORDER.includes(name)),
  ];
  const byName = new Map(parties.map((p) => [p.name, p]));

  const seats: HemicycleSeat[] = [];
  let cursor = 0;
  for (const name of order) {
    const p = byName.get(name);
    if (!p) continue;
    for (let k = 0; k < p.seats && cursor < positions.length; k++, cursor++) {
      const pos = positions[cursor];
      seats.push({ x: pos.x, y: pos.y, party: p.name, color: p.color });
    }
  }
  return seats;
}
