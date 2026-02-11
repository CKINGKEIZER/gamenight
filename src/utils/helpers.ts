import { v4 as uuidv4 } from 'uuid';

export function genId(): string {
  return uuidv4();
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function formatMoney(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
  return `$${Math.floor(amount)}`;
}

export function formatNumber(n: number, decimals = 1): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(decimals)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(decimals)}K`;
  return n.toFixed(decimals);
}

export function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function parseTileKey(key: string): [number, number] {
  const [x, y] = key.split(',').map(Number);
  return [x, y];
}

export function manhattanDist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

export function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// Seeded random for deterministic daily contracts
export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export function daysSinceEpoch(): number {
  return Math.floor(Date.now() / 86400000);
}

// Direction helpers
export type Direction = 'up' | 'down' | 'left' | 'right';
export const DIRECTION_OFFSETS: Record<Direction, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export function rotateDirection(dir: Direction): Direction {
  const order: Direction[] = ['up', 'right', 'down', 'left'];
  return order[(order.indexOf(dir) + 1) % 4];
}

export function oppositeDirection(dir: Direction): Direction {
  const map: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };
  return map[dir];
}
