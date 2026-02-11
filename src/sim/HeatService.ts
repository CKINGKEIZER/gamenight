import type { GameState } from './types';
import { BUILDINGS } from '../content/buildings';
import { tileKey, clamp } from '../utils/helpers';
import { AMBIENT_TEMP, TEMP_PER_DEPTH, OVERHEAT_THRESHOLD, MELTDOWN_THRESHOLD, HEAT_DISSIPATION_RATE } from '../utils/constants';

/**
 * Heat simulation:
 * - Buildings generate heat when operating
 * - Heat spreads to neighboring tiles
 * - Cooling buildings remove heat
 * - Overheating damages buildings
 * - Meltdown at extreme temps (nuclear reactor)
 */

export function updateHeat(state: GameState): void {
  const researchMult = state.research.completed.includes('thermal_mastery') ? 0.7 : 1;

  // Building heat generation
  for (const [id, entity] of state.entities) {
    if (!entity.enabled || entity.durability <= 0) continue;
    const def = BUILDINGS[entity.type];

    let heatGen = def.heatGeneration * researchMult;

    // Overclock doubles heat
    if (state.research.completed.includes('overclock') && def.category === 'processing') {
      heatGen *= 1.5;
    }

    // Only generate heat if powered (or if it's a generator)
    if (entity.powered || def.powerGeneration) {
      entity.temperature += heatGen * 0.1; // per tick
    }

    // Cooling effect
    if (def.coolingPower && entity.powered) {
      const radius = def.coolingRadius ?? 4;
      for (const [oid, other] of state.entities) {
        if (oid === id) continue;
        const dx = Math.abs(other.x - entity.x);
        const dy = Math.abs(other.y - entity.y);
        if (dx + dy <= radius) {
          const factor = 1 - (dx + dy) / (radius + 1);
          other.temperature -= def.coolingPower * factor * 0.1;
        }
      }
      // Also cool tiles
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          const tile = state.tiles.get(tileKey(entity.x + dx, entity.y + dy));
          if (tile) {
            const dist = Math.abs(dx) + Math.abs(dy);
            if (dist <= radius) {
              const factor = 1 - dist / (radius + 1);
              tile.temperature -= def.coolingPower * factor * 0.05;
            }
          }
        }
      }
    }
  }

  // Ambient dissipation for entities
  for (const entity of state.entities.values()) {
    const ambientTemp = AMBIENT_TEMP + entity.y * TEMP_PER_DEPTH;
    entity.temperature += (ambientTemp - entity.temperature) * HEAT_DISSIPATION_RATE;
    entity.temperature = Math.max(ambientTemp - 10, entity.temperature);

    // Overheat damage
    if (entity.temperature > OVERHEAT_THRESHOLD) {
      const overFactor = (entity.temperature - OVERHEAT_THRESHOLD) / (MELTDOWN_THRESHOLD - OVERHEAT_THRESHOLD);
      entity.durability = Math.max(0, entity.durability - overFactor * 0.005);
    }
  }

  // Tile heat dissipation (simplified - just trend toward ambient)
  // Only process revealed tiles for performance
  for (const tile of state.tiles.values()) {
    if (!tile.revealed) continue;
    const ambient = AMBIENT_TEMP + tile.y * TEMP_PER_DEPTH;
    tile.temperature += (ambient - tile.temperature) * HEAT_DISSIPATION_RATE;
  }
}
