import type { GameState, ItemStack } from './types';
import { BUILDINGS } from '../content/buildings';
import { tileKey } from '../utils/helpers';
import { BASE_WEAR_RATE } from '../utils/constants';

/**
 * Maintenance simulation:
 * - All buildings wear over time
 * - Repair bays auto-repair nearby buildings using spare parts
 * - Maintenance hubs reduce wear rate in radius
 * - Buildings at 0 durability are disabled (not destroyed, just broken)
 * - Cascading failures: broken power -> broken cooling -> overheating -> more breaks
 */

export function updateMaintenance(state: GameState): void {
  const nanoRepair = state.research.completed.includes('nanorepair');
  const fullAuto = state.research.completed.includes('endgame_automation');
  const wearReduction = nanoRepair ? 0.5 : 1;

  // Calculate maintenance hub coverage
  const hubCoverage = new Map<string, number>(); // entityId -> wear reduction factor
  for (const [id, entity] of state.entities) {
    if (entity.type !== 'maintenance_hub') continue;
    if (!entity.enabled || !entity.powered || entity.durability <= 0) continue;

    const radius = 8;
    for (const [oid, other] of state.entities) {
      if (oid === id) continue;
      const dx = Math.abs(other.x - entity.x);
      const dy = Math.abs(other.y - entity.y);
      if (dx + dy <= radius) {
        const current = hubCoverage.get(oid) ?? 1;
        hubCoverage.set(oid, Math.min(current, 0.5)); // 50% wear reduction
      }
    }
  }

  // Apply wear to all buildings
  for (const [id, entity] of state.entities) {
    if (entity.durability <= 0) {
      entity.enabled = false;
      continue;
    }

    const def = BUILDINGS[entity.type];
    if (!def.wearRate) continue;

    const hubFactor = hubCoverage.get(id) ?? 1;
    const wear = def.wearRate * wearReduction * hubFactor;

    // Only wear if building is active
    if (entity.enabled && (entity.powered || def.powerConsumption === 0)) {
      entity.durability = Math.max(0, entity.durability - wear);
    }

    // Check if just broke
    if (entity.durability <= 0) {
      entity.enabled = false;
      state.alerts.push({
        id: `broken_${id}`, type: 'warning',
        message: `${def.name} at (${entity.x}, ${entity.y}) has broken down!`,
        entityId: id, x: entity.x, y: entity.y, tick: state.tick, dismissed: false,
      });
    }
  }

  // Repair bays
  for (const [id, entity] of state.entities) {
    if (entity.type !== 'repair_bay') continue;
    if (!entity.enabled || !entity.powered || entity.durability <= 0) continue;

    const repairSpeed = fullAuto ? 0.03 : 0.01;
    const radius = 6;

    // Check if repair bay has spare parts
    const inputBuffer = (entity.data['inputBuffer'] as ItemStack[]) ?? [];
    const hasParts = inputBuffer.some(s => s.resource === 'spare_parts' && s.amount > 0);

    if (!hasParts) continue;

    // Find damaged building in radius
    let repaired = false;
    for (const [oid, other] of state.entities) {
      if (oid === id) continue;
      if (other.durability >= other.maxDurability) continue;

      const dx = Math.abs(other.x - entity.x);
      const dy = Math.abs(other.y - entity.y);
      if (dx + dy <= radius) {
        other.durability = Math.min(other.maxDurability, other.durability + repairSpeed);
        if (!other.enabled && other.durability > 0.1) {
          other.enabled = true;
        }
        repaired = true;
        break; // One repair per tick
      }
    }

    // Consume spare parts periodically
    if (repaired && state.tick % 50 === 0) {
      const parts = inputBuffer.find(s => s.resource === 'spare_parts');
      if (parts) {
        parts.amount--;
        if (parts.amount <= 0) {
          entity.data['inputBuffer'] = inputBuffer.filter(s => s.amount > 0);
        }
      }
    }
  }
}
