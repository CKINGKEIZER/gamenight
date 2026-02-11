import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../src/sim/WorldGen';
import { simTick, serializeState, deserializeState } from '../src/sim/SimLoop';
import { updatePowerGrid } from '../src/sim/PowerService';
import { updateHeat } from '../src/sim/HeatService';
import { updateLogistics } from '../src/sim/LogisticsService';
import { updateMining } from '../src/sim/MiningService';
import { updateProcessing } from '../src/sim/ProcessingService';
import { updateEconomy } from '../src/sim/EconomyService';
import { updateStability } from '../src/sim/StabilityService';
import { updateMaintenance } from '../src/sim/MaintenanceService';
import { canStartResearch, startResearch } from '../src/sim/ResearchService';
import { takeLoan, repayLoan } from '../src/sim/EconomyService';
import type { GameState, Entity } from '../src/sim/types';
import { BUILDINGS } from '../src/content/buildings';
import { tileKey, genId } from '../src/utils/helpers';
import { STARTING_MONEY } from '../src/utils/constants';

function placeEntity(state: GameState, type: string, x: number, y: number, direction = 'right' as const): Entity {
  const def = BUILDINGS[type as keyof typeof BUILDINGS];
  const id = genId();
  const entity: Entity = {
    id, type: type as any, x, y,
    width: def.width, height: def.height,
    direction,
    durability: def.maxDurability,
    maxDurability: def.maxDurability,
    enabled: true, powered: true,
    temperature: 20,
    data: {},
  };

  // Set tile references
  for (let tx = x; tx < x + def.width; tx++) {
    for (let ty = y; ty < y + def.height; ty++) {
      const key = tileKey(tx, ty);
      let tile = state.tiles.get(key);
      if (!tile) {
        tile = {
          type: 'empty', x: tx, y: ty, stability: 100,
          revealed: true, entityId: null, resourceAmount: 0,
          temperature: 20, gasLevel: 0, waterLevel: 0,
        };
        state.tiles.set(key, tile);
      }
      tile.entityId = id;
      tile.type = 'empty';
    }
  }

  state.entities.set(id, entity);
  return entity;
}

describe('World Generation', () => {
  it('creates a valid game state', () => {
    const state = createInitialGameState(12345);
    expect(state).toBeDefined();
    expect(state.tiles.size).toBeGreaterThan(0);
    expect(state.money).toBe(STARTING_MONEY);
    expect(state.tick).toBe(0);
    expect(state.seed).toBe(12345);
  });

  it('generates deterministic worlds with same seed', () => {
    const state1 = createInitialGameState(42);
    const state2 = createInitialGameState(42);

    // Check a sample of tiles
    const key = tileKey(100, 10);
    const tile1 = state1.tiles.get(key);
    const tile2 = state2.tiles.get(key);
    expect(tile1?.type).toBe(tile2?.type);
    expect(tile1?.stability).toBe(tile2?.stability);
  });

  it('contains ore veins', () => {
    const state = createInitialGameState(12345);
    let oreCount = 0;
    for (const tile of state.tiles.values()) {
      if (tile.type.includes('vein')) oreCount++;
    }
    expect(oreCount).toBeGreaterThan(50);
  });

  it('has starting cavern', () => {
    const state = createInitialGameState(12345);
    const tile = state.tiles.get(tileKey(100, 5));
    expect(tile?.type).toBe('empty');
    expect(tile?.revealed).toBe(true);
  });
});

describe('Simulation Tick', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialGameState(12345);
  });

  it('advances tick counter', () => {
    simTick(state);
    expect(state.tick).toBe(1);
    simTick(state);
    expect(state.tick).toBe(2);
  });

  it('advances sim time', () => {
    simTick(state);
    expect(state.simTimeMs).toBe(100); // SIM_TICK_MS = 100
  });
});

describe('Economy', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialGameState(12345);
  });

  it('initializes with market prices', () => {
    expect(state.market.length).toBeGreaterThan(0);
    for (const price of state.market) {
      expect(price.currentPrice).toBeGreaterThan(0);
      expect(price.basePrice).toBeGreaterThan(0);
    }
  });

  it('allows taking loans', () => {
    const initialMoney = state.money;
    const success = takeLoan(state, 5000);
    expect(success).toBe(true);
    expect(state.money).toBe(initialMoney + 5000);
    expect(state.loans.length).toBe(1);
    expect(state.loans[0].remaining).toBe(5000);
  });

  it('prevents excessive loans', () => {
    takeLoan(state, 50000);
    const success = takeLoan(state, 1000);
    expect(success).toBe(false);
  });

  it('allows loan repayment', () => {
    takeLoan(state, 5000);
    const loanId = state.loans[0].id;
    const moneyBefore = state.money;
    repayLoan(state, loanId, 1000);
    expect(state.money).toBe(moneyBefore - 1000);
    expect(state.loans[0].remaining).toBe(4000);
  });

  it('market prices fluctuate', () => {
    const initialPrices = state.market.map(m => m.currentPrice);
    // Run many ticks to trigger market updates
    for (let i = 0; i < 200; i++) {
      updateEconomy(state);
      state.tick++;
    }
    const changed = state.market.some((m, i) => m.currentPrice !== initialPrices[i]);
    expect(changed).toBe(true);
  });
});

describe('Power Grid', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialGameState(12345);
  });

  it('tracks generation and consumption', () => {
    // Place a coal generator
    const gen = placeEntity(state, 'coal_generator', 100, 5);
    gen.data['hasInput'] = true;

    // Place a mining rig
    const rig = placeEntity(state, 'mining_rig', 97, 5);

    // Place power line between them
    for (let x = 99; x >= 98; x--) {
      placeEntity(state, 'power_line', x, 5);
    }
    // Also adjacent power line
    placeEntity(state, 'power_line', 97 + 2, 5);

    updatePowerGrid(state);

    expect(state.powerGrid.totalGeneration).toBeGreaterThan(0);
  });

  it('unpowers disconnected buildings', () => {
    const rig = placeEntity(state, 'mining_rig', 50, 50);
    updatePowerGrid(state);
    expect(rig.powered).toBe(false);
  });
});

describe('Heat System', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialGameState(12345);
  });

  it('buildings generate heat when operating', () => {
    const smelter = placeEntity(state, 'smelter', 100, 5);
    smelter.powered = true;
    const initialTemp = smelter.temperature;

    updateHeat(state);

    expect(smelter.temperature).toBeGreaterThan(initialTemp);
  });

  it('cooling towers reduce temperature', () => {
    const smelter = placeEntity(state, 'smelter', 100, 5);
    smelter.temperature = 100;
    smelter.powered = true;

    const cooler = placeEntity(state, 'cooling_tower', 102, 5);
    cooler.powered = true;

    updateHeat(state);

    // Smelter should have been cooled somewhat
    // (Still may increase due to heat generation, but less than without cooling)
    expect(smelter.temperature).toBeLessThan(105); // Would be higher without cooling
  });

  it('overheat damages buildings', () => {
    const entity = placeEntity(state, 'smelter', 100, 5);
    entity.temperature = 200; // Above OVERHEAT_THRESHOLD (150)
    entity.powered = true;

    updateHeat(state);

    expect(entity.durability).toBeLessThan(1);
  });
});

describe('Logistics', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialGameState(12345);
  });

  it('conveyors move items', () => {
    const conv = placeEntity(state, 'conveyor', 100, 5, 'right');
    conv.powered = true;

    state.logistics.conveyorItems.set(conv.id, [
      { resource: 'iron_ore', progress: 0 },
    ]);

    updateLogistics(state);

    const items = state.logistics.conveyorItems.get(conv.id)!;
    expect(items[0].progress).toBeGreaterThan(0);
  });

  it('items transfer between conveyors', () => {
    // Place two conveyors in sequence
    const conv1 = placeEntity(state, 'conveyor', 100, 5, 'right');
    conv1.powered = true;
    const conv2 = placeEntity(state, 'conveyor', 101, 5, 'right');
    conv2.powered = true;

    state.logistics.conveyorItems.set(conv1.id, [
      { resource: 'iron_ore', progress: 0.95 },
    ]);
    state.logistics.conveyorItems.set(conv2.id, []);

    updateLogistics(state);

    const items2 = state.logistics.conveyorItems.get(conv2.id)!;
    expect(items2.length).toBe(1);
  });

  it('storage accepts items', () => {
    const storage = placeEntity(state, 'storage', 101, 5, 'right');
    state.logistics.storageContents.set(storage.id, []);

    const conv = placeEntity(state, 'conveyor', 100, 5, 'right');
    conv.powered = true;
    state.logistics.conveyorItems.set(conv.id, [
      { resource: 'iron_ore', progress: 0.95 },
    ]);

    updateLogistics(state);

    const contents = state.logistics.storageContents.get(storage.id)!;
    expect(contents.length).toBe(1);
    expect(contents[0].resource).toBe('iron_ore');
  });
});

describe('Mining', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialGameState(12345);
  });

  it('mining rigs extract ore from veins', () => {
    // Place an iron vein adjacent to (but not under) the rig
    // Rig is 2x2 at (100,6), occupying (100,6)(101,6)(100,7)(101,7)
    // Place vein at (102,6) which is distance 2 from rig origin and outside footprint
    const veinTile = state.tiles.get(tileKey(102, 6))!;
    veinTile.type = 'iron_vein';
    veinTile.resourceAmount = 100;
    veinTile.revealed = true;

    const rig = placeEntity(state, 'mining_rig', 100, 6);
    rig.powered = true;

    updateMining(state);

    expect(veinTile.resourceAmount).toBeLessThan(100);
  });
});

describe('Maintenance', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialGameState(12345);
  });

  it('buildings wear over time', () => {
    const conv = placeEntity(state, 'conveyor', 100, 5);
    conv.powered = true;
    const initialDur = conv.durability;

    updateMaintenance(state);

    expect(conv.durability).toBeLessThan(initialDur);
  });

  it('broken buildings are disabled', () => {
    const conv = placeEntity(state, 'conveyor', 100, 5);
    conv.durability = 0;

    updateMaintenance(state);

    expect(conv.enabled).toBe(false);
  });
});

describe('Stability', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialGameState(12345);
  });

  it('support pillars increase stability', () => {
    const tile = state.tiles.get(tileKey(101, 6));
    if (tile) {
      tile.stability = 50;
      tile.revealed = true;
      tile.type = 'empty';
    }

    const pillar = placeEntity(state, 'support_pillar', 100, 6);

    updateStability(state);

    expect(tile!.stability).toBeGreaterThan(50);
  });

  it('water pumps reduce water level', () => {
    const tile = state.tiles.get(tileKey(101, 6));
    if (tile) {
      tile.waterLevel = 0.8;
      tile.revealed = true;
      tile.type = 'empty';
    }

    const pump = placeEntity(state, 'water_pump', 100, 6);
    pump.powered = true;

    updateStability(state);

    expect(tile!.waterLevel).toBeLessThan(0.8);
  });
});

describe('Research', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialGameState(12345);
  });

  it('can start research when prerequisites met', () => {
    expect(canStartResearch(state, 'basic_smelting')).toBe(true);
    expect(canStartResearch(state, 'advanced_mining')).toBe(false); // needs basic_smelting
  });

  it('starts research correctly', () => {
    const success = startResearch(state, 'basic_smelting');
    expect(success).toBe(true);
    expect(state.research.current).toBe('basic_smelting');
    expect(state.research.progress).toBe(0);
  });

  it('cannot start second research while one is active', () => {
    startResearch(state, 'basic_smelting');
    const success = startResearch(state, 'logistics_1');
    expect(success).toBe(false);
  });

  it('prerequisites unlock correctly', () => {
    state.research.completed.push('basic_smelting');
    expect(canStartResearch(state, 'advanced_mining')).toBe(true);
  });
});

describe('Serialization', () => {
  it('round-trips game state', () => {
    const state = createInitialGameState(12345);
    state.money = 9999;
    state.tick = 500;

    placeEntity(state, 'conveyor', 100, 5, 'right');

    const serialized = serializeState(state);
    const deserialized = deserializeState(serialized);

    expect(deserialized.money).toBe(9999);
    expect(deserialized.tick).toBe(500);
    expect(deserialized.seed).toBe(12345);
    expect(deserialized.entities.size).toBe(1);
    expect(deserialized.tiles.size).toBe(state.tiles.size);
  });

  it('serializes to JSON-compatible format', () => {
    const state = createInitialGameState(42);
    const serialized = serializeState(state);
    const json = JSON.stringify(serialized);
    expect(json).toBeDefined();
    const parsed = JSON.parse(json);
    expect(parsed.seed).toBe(42);
  });
});

describe('Processing', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialGameState(12345);
  });

  it('smelter consumes input and produces output', () => {
    const smelter = placeEntity(state, 'smelter', 100, 5);
    smelter.powered = true;
    smelter.data['inputBuffer'] = [{ resource: 'iron_ore', amount: 10 }];
    smelter.data['outputBuffer'] = [];
    smelter.data['cycleProgress'] = 0;
    smelter.data['recipe'] = 'smelt_iron';

    // Run enough ticks to complete a cycle (30 ticks)
    for (let i = 0; i < 35; i++) {
      updateProcessing(state);
      state.tick++;
    }

    const output = smelter.data['outputBuffer'] as any[];
    expect(output.length).toBeGreaterThan(0);
    expect(output[0].resource).toBe('iron_ingot');
  });
});
