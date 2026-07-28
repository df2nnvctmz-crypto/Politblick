import type { VoteChoice } from './data';

export function initials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('');
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
