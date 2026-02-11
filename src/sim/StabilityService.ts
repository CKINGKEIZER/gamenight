import type { GameState } from './types';
import { BUILDINGS } from '../content/buildings';
import { tileKey, clamp } from '../utils/helpers';
import { STABILITY_DANGER, CAVEIN_THRESHOLD, BASE_STABILITY } from '../utils/constants';

/**
 * Cave stability simulation:
 * - Mining reduces stability
 * - Support pillars and rock bolters add stability
 * - Low stability -> cave-in chance
 * - Cave-ins destroy buildings and block passages
 * - Gas pockets can explode if near heat
 * - Water seepage floods areas
 * - Water pumps and gas vents mitigate hazards
 */

export function updateStability(state: GameState): void {
  const seismicDampener = state.research.completed.includes('seismic_dampener');
  const stabilityMult = seismicDampener ? 1.5 : 1;

  // Apply support structure bonuses
  for (const [id, entity] of state.entities) {
    const def = BUILDINGS[entity.type];
    if (!def.stabilityBonus || !entity.enabled || entity.durability <= 0) continue;

    const radius = def.stabilityRadius ?? 3;
    const bonus = def.stabilityBonus * stabilityMult;

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const dist = Math.abs(dx) + Math.abs(dy);
        if (dist > radius) continue;
        const tile = state.tiles.get(tileKey(entity.x + dx, entity.y + dy));
        if (tile && tile.revealed) {
          const factor = 1 - dist / (radius + 1);
          // Stability recovery (slow)
          tile.stability = Math.min(BASE_STABILITY, tile.stability + bonus * factor * 0.01);
        }
      }
    }
  }

  // Natural stability decay in mined areas
  for (const tile of state.tiles.values()) {
    if (!tile.revealed) continue;
    if (tile.type === 'empty' || tile.entityId) {
      tile.stability = Math.max(0, tile.stability - 0.005);
    }
  }

  // Process water pumps
  for (const [id, entity] of state.entities) {
    if (entity.type !== 'water_pump') continue;
    if (!entity.enabled || !entity.powered || entity.durability <= 0) continue;

    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        const tile = state.tiles.get(tileKey(entity.x + dx, entity.y + dy));
        if (tile) {
          tile.waterLevel = Math.max(0, tile.waterLevel - 0.02);
        }
      }
    }
  }

  // Process gas vents
  for (const [id, entity] of state.entities) {
    if (entity.type !== 'gas_vent') continue;
    if (!entity.enabled || !entity.powered || entity.durability <= 0) continue;

    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        const tile = state.tiles.get(tileKey(entity.x + dx, entity.y + dy));
        if (tile) {
          tile.gasLevel = Math.max(0, tile.gasLevel - 0.02);
        }
      }
    }
  }

  // Check for cave-ins (every 10 ticks to save performance)
  if (state.tick % 10 === 0) {
    checkCaveIns(state);
    checkGasExplosions(state);
    checkFlooding(state);
  }
}

function checkCaveIns(state: GameState): void {
  for (const tile of state.tiles.values()) {
    if (!tile.revealed || tile.type === 'bedrock' || tile.type === 'surface') continue;
    if (tile.stability > CAVEIN_THRESHOLD) continue;

    // Cave-in probability based on stability
    const chance = (CAVEIN_THRESHOLD - tile.stability) / CAVEIN_THRESHOLD * 0.01;
    if (Math.random() > chance) continue;

    // Cave-in happens!
    tile.type = 'rock'; // Collapsed
    tile.stability = BASE_STABILITY * 0.5;

    // Destroy entity if present
    if (tile.entityId) {
      const entity = state.entities.get(tile.entityId);
      if (entity) {
        // Clear all tiles of this entity
        for (let tx = entity.x; tx < entity.x + entity.width; tx++) {
          for (let ty = entity.y; ty < entity.y + entity.height; ty++) {
            const t = state.tiles.get(tileKey(tx, ty));
            if (t) {
              t.entityId = null;
              t.stability = Math.max(0, t.stability - 20);
            }
          }
        }
        state.entities.delete(tile.entityId);
        state.logistics.conveyorItems.delete(tile.entityId);
        state.logistics.storageContents.delete(tile.entityId);
      }
    }

    state.alerts.push({
      id: `cavein_${state.tick}_${tile.x}_${tile.y}`, type: 'danger',
      message: `Cave-in at (${tile.x}, ${tile.y})! Area collapsed!`,
      x: tile.x, y: tile.y, tick: state.tick, dismissed: false,
    });
  }
}

function checkGasExplosions(state: GameState): void {
  for (const tile of state.tiles.values()) {
    if (!tile.revealed || tile.gasLevel < 0.5) continue;

    // Gas explodes near hot buildings
    if (tile.entityId) {
      const entity = state.entities.get(tile.entityId);
      if (entity && entity.temperature > 100) {
        // Gas explosion!
        tile.gasLevel = 0;
        tile.stability = Math.max(0, tile.stability - 40);

        // Damage nearby buildings
        for (const [oid, other] of state.entities) {
          const dx = Math.abs(other.x - tile.x);
          const dy = Math.abs(other.y - tile.y);
          if (dx + dy < 4) {
            other.durability = Math.max(0, other.durability - 0.4);
          }
        }

        state.alerts.push({
          id: `gasexp_${state.tick}`, type: 'danger',
          message: `Gas explosion at (${tile.x}, ${tile.y})!`,
          x: tile.x, y: tile.y, tick: state.tick, dismissed: false,
        });
      }
    }
  }
}

function checkFlooding(state: GameState): void {
  // Water spreads slowly to adjacent empty tiles
  const waterUpdates: Array<[string, number]> = [];

  for (const tile of state.tiles.values()) {
    if (!tile.revealed || tile.waterLevel < 0.1) continue;
    if (tile.type === 'bedrock') continue;

    // Spread to neighbors
    for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
      const nkey = tileKey(tile.x + dx, tile.y + dy);
      const neighbor = state.tiles.get(nkey);
      if (neighbor && neighbor.revealed && neighbor.type !== 'bedrock') {
        if (neighbor.waterLevel < tile.waterLevel - 0.1) {
          const flow = (tile.waterLevel - neighbor.waterLevel) * 0.01;
          waterUpdates.push([nkey, flow]);
        }
      }
    }

    // Water damages buildings
    if (tile.entityId && tile.waterLevel > 0.3) {
      const entity = state.entities.get(tile.entityId);
      if (entity) {
        entity.durability = Math.max(0, entity.durability - tile.waterLevel * 0.001);
      }
    }
  }

  for (const [key, amount] of waterUpdates) {
    const tile = state.tiles.get(key);
    if (tile) {
      tile.waterLevel = Math.min(1, tile.waterLevel + amount);
    }
  }
}
