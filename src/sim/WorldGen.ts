import type { Tile, TileType, GameState } from './types';
import { WORLD_WIDTH, WORLD_HEIGHT, BASE_STABILITY, AMBIENT_TEMP, TEMP_PER_DEPTH, STARTING_MONEY } from '../utils/constants';
import { seededRandom, tileKey } from '../utils/helpers';
import { RESOURCES } from '../content/resources';

const VEIN_TYPES: Array<{ tile: TileType; resource: string; minDepth: number; rarity: number; clusterSize: number }> = [
  { tile: 'coal_vein', resource: 'coal', minDepth: 3, rarity: 0.06, clusterSize: 8 },
  { tile: 'iron_vein', resource: 'iron_ore', minDepth: 5, rarity: 0.05, clusterSize: 6 },
  { tile: 'copper_vein', resource: 'copper_ore', minDepth: 8, rarity: 0.04, clusterSize: 5 },
  { tile: 'gold_vein', resource: 'gold_ore', minDepth: 20, rarity: 0.02, clusterSize: 4 },
  { tile: 'crystal_vein', resource: 'crystal_ore', minDepth: 35, rarity: 0.015, clusterSize: 3 },
  { tile: 'uranium_vein', resource: 'uranium_ore', minDepth: 50, rarity: 0.008, clusterSize: 3 },
];

export function generateWorld(seed: number): Map<string, Tile> {
  const rng = seededRandom(seed);
  const tiles = new Map<string, Tile>();

  // Pass 1: Base terrain
  for (let x = 0; x < WORLD_WIDTH; x++) {
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      const depth = y;
      let type: TileType = 'rock';

      // Surface layer (y=0..2)
      if (y < 3) {
        type = 'surface';
      }
      // Starting cavern (clear space near spawn)
      else if (x >= 95 && x <= 105 && y >= 3 && y <= 12) {
        type = 'empty';
      }
      // Bedrock at bottom
      else if (y >= WORLD_HEIGHT - 3) {
        type = 'bedrock';
      }
      // Natural caves
      else {
        const caveNoise = simplex2D(x * 0.08, y * 0.08, rng) + simplex2D(x * 0.15, y * 0.12, rng) * 0.5;
        if (caveNoise > 0.55) {
          type = 'empty';
        }
      }

      const stability = type === 'bedrock' ? 200 : type === 'surface' ? 150 : BASE_STABILITY - depth * 0.3;
      const temp = AMBIENT_TEMP + depth * TEMP_PER_DEPTH;

      tiles.set(tileKey(x, y), {
        type,
        x,
        y,
        stability: Math.max(0, stability),
        revealed: y < 3 || (x >= 93 && x <= 107 && y < 15),
        entityId: null,
        resourceAmount: 0,
        temperature: temp,
        gasLevel: 0,
        waterLevel: 0,
      });
    }
  }

  // Pass 2: Ore veins
  for (const vein of VEIN_TYPES) {
    const count = Math.floor(WORLD_WIDTH * WORLD_HEIGHT * vein.rarity * 0.01);
    for (let i = 0; i < count; i++) {
      const cx = Math.floor(rng() * WORLD_WIDTH);
      const cy = Math.floor(rng() * (WORLD_HEIGHT - vein.minDepth)) + vein.minDepth;

      for (let j = 0; j < vein.clusterSize; j++) {
        const ox = cx + Math.floor((rng() - 0.5) * 4);
        const oy = cy + Math.floor((rng() - 0.5) * 4);
        if (ox < 0 || ox >= WORLD_WIDTH || oy < 0 || oy >= WORLD_HEIGHT) continue;
        const tile = tiles.get(tileKey(ox, oy));
        if (tile && tile.type === 'rock') {
          tile.type = vein.tile;
          tile.resourceAmount = 50 + Math.floor(rng() * 100);
        }
      }
    }
  }

  // Pass 3: Gas and water pockets
  for (let i = 0; i < 30; i++) {
    const cx = Math.floor(rng() * WORLD_WIDTH);
    const cy = 15 + Math.floor(rng() * (WORLD_HEIGHT - 30));
    const radius = 2 + Math.floor(rng() * 3);
    const isGas = rng() > 0.5;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const tile = tiles.get(tileKey(cx + dx, cy + dy));
        if (tile && tile.type === 'rock') {
          if (isGas) {
            tile.type = 'gas_pocket';
            tile.gasLevel = 0.5 + rng() * 0.5;
          } else {
            tile.type = 'water_pocket';
            tile.waterLevel = 0.5 + rng() * 0.5;
          }
        }
      }
    }
  }

  return tiles;
}

// Simple 2D noise approximation using seeded RNG
function simplex2D(x: number, y: number, rng: () => number): number {
  // Hash-based noise approximation
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  const n00 = hash2D(ix, iy, rng);
  const n10 = hash2D(ix + 1, iy, rng);
  const n01 = hash2D(ix, iy + 1, rng);
  const n11 = hash2D(ix + 1, iy + 1, rng);

  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
}

function hash2D(x: number, y: number, _rng: () => number): number {
  let n = x * 374761393 + y * 668265263;
  n = (n ^ (n >> 13)) * 1274126177;
  n = n ^ (n >> 16);
  return (n & 0x7fffffff) / 0x7fffffff;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function createInitialGameState(seed?: number): GameState {
  const s = seed ?? Math.floor(Math.random() * 2147483647);
  const tiles = generateWorld(s);

  const marketPrices = Object.values(RESOURCES).map(r => ({
    resource: r.type,
    basePrice: r.baseValue,
    currentPrice: r.baseValue,
    demand: 0,
    volatility: 0.1 + r.tier * 0.05,
  }));

  return {
    tick: 0,
    simTimeMs: 0,
    speed: 1,
    day: 1,
    playerX: 100,
    playerY: 5,
    money: STARTING_MONEY,
    reputation: 0,
    tiles,
    entities: new Map(),
    revealedChunks: new Set(),
    powerGrid: {
      totalGeneration: 0,
      totalConsumption: 0,
      totalBatteryStored: 0,
      totalBatteryCapacity: 0,
      networks: [],
    },
    logistics: {
      conveyorItems: new Map(),
      storageContents: new Map(),
    },
    research: {
      completed: [],
      current: null,
      progress: 0,
      inputConsumed: {},
    },
    market: marketPrices,
    contracts: [],
    loans: [],
    alerts: [],
    achievements: new Map(),
    seed: s,
    version: 1,
    createdAt: Date.now(),
    totalPlayTimeMs: 0,
  };
}
