import type { GameState, SerializedGameState } from './types';
import { SIM_TICK_MS, TICKS_PER_DAY } from '../utils/constants';
import { updatePowerGrid } from './PowerService';
import { updateHeat } from './HeatService';
import { updateLogistics } from './LogisticsService';
import { updateMining } from './MiningService';
import { updateProcessing } from './ProcessingService';
import { updateEconomy } from './EconomyService';
import { updateStability } from './StabilityService';
import { updateMaintenance } from './MaintenanceService';
import { updateResearch } from './ResearchService';
import { updateEvents, resetEvents } from './EventService';

/**
 * Deterministic fixed-timestep simulation loop.
 * Separated from rendering for consistent behavior.
 */

let accumulator = 0;
let lastTime = 0;

export function initSimLoop(state: GameState): void {
  lastTime = performance.now();
  accumulator = 0;
  resetEvents();
}

export function stepSimLoop(state: GameState, dt: number): number {
  if (state.speed === 0) return 0;

  accumulator += dt * state.speed;
  let ticksProcessed = 0;
  const maxTicksPerFrame = 20; // Prevent spiral of death

  while (accumulator >= SIM_TICK_MS && ticksProcessed < maxTicksPerFrame) {
    simTick(state);
    accumulator -= SIM_TICK_MS;
    ticksProcessed++;
  }

  // If still too much accumulated, clamp
  if (accumulator > SIM_TICK_MS * maxTicksPerFrame) {
    accumulator = SIM_TICK_MS * maxTicksPerFrame;
  }

  return ticksProcessed;
}

export function simTick(state: GameState): void {
  state.tick++;
  state.simTimeMs += SIM_TICK_MS;
  state.totalPlayTimeMs += SIM_TICK_MS;

  // Update day
  state.day = Math.floor(state.tick / TICKS_PER_DAY) + 1;

  // Order matters: power first, then systems that depend on it
  updatePowerGrid(state);
  updateMining(state);
  updateProcessing(state);
  updateLogistics(state);
  updateHeat(state);
  updateMaintenance(state);
  updateStability(state);
  updateResearch(state);
  updateEconomy(state);
  updateEvents(state);
}

// ── Serialization ──

export function serializeState(state: GameState): SerializedGameState {
  return {
    tick: state.tick,
    simTimeMs: state.simTimeMs,
    speed: state.speed,
    day: state.day,
    playerX: state.playerX,
    playerY: state.playerY,
    money: state.money,
    reputation: state.reputation,
    tiles: Array.from(state.tiles.entries()),
    entities: Array.from(state.entities.entries()),
    revealedChunks: Array.from(state.revealedChunks),
    powerGrid: state.powerGrid,
    logistics: {
      conveyorItems: Array.from(state.logistics.conveyorItems.entries()),
      storageContents: Array.from(state.logistics.storageContents.entries()),
    },
    research: state.research,
    market: state.market,
    contracts: state.contracts,
    loans: state.loans,
    alerts: state.alerts.filter(a => !a.dismissed).slice(-20),
    achievements: Array.from(state.achievements.entries()),
    seed: state.seed,
    version: state.version,
    createdAt: state.createdAt,
    totalPlayTimeMs: state.totalPlayTimeMs,
  };
}

export function deserializeState(data: SerializedGameState): GameState {
  return {
    tick: data.tick,
    simTimeMs: data.simTimeMs,
    speed: data.speed ?? 1,
    day: data.day,
    playerX: data.playerX,
    playerY: data.playerY,
    money: data.money,
    reputation: data.reputation,
    tiles: new Map(data.tiles),
    entities: new Map(data.entities),
    revealedChunks: new Set(data.revealedChunks),
    powerGrid: data.powerGrid,
    logistics: {
      conveyorItems: new Map(data.logistics.conveyorItems),
      storageContents: new Map(data.logistics.storageContents),
    },
    research: data.research,
    market: data.market,
    contracts: data.contracts,
    loans: data.loans,
    alerts: data.alerts,
    achievements: new Map(data.achievements),
    seed: data.seed,
    version: data.version,
    createdAt: data.createdAt,
    totalPlayTimeMs: data.totalPlayTimeMs,
  };
}
