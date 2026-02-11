import type { GameState, Entity, ResourceType, TileType } from './types';
import { BUILDINGS } from '../content/buildings';
import { tileKey, DIRECTION_OFFSETS } from '../utils/helpers';

const TILE_TO_RESOURCE: Partial<Record<TileType, ResourceType>> = {
  iron_vein: 'iron_ore',
  copper_vein: 'copper_ore',
  gold_vein: 'gold_ore',
  crystal_vein: 'crystal_ore',
  uranium_vein: 'uranium_ore',
  coal_vein: 'coal',
};

/**
 * Mining simulation:
 * - Mining rigs extract resources from nearby veins
 * - Output goes to adjacent conveyor/storage in facing direction
 * - Advanced drills have larger radius and faster speed
 * - Blast miners extract massively but damage stability
 */

export function updateMining(state: GameState): void {
  const deepMining = state.research.completed.includes('deep_mining');
  const quantumMining = state.research.completed.includes('quantum_drill');
  const speedMult = (deepMining ? 1.5 : 1) * (quantumMining ? 2 : 1);

  for (const [id, entity] of state.entities) {
    const def = BUILDINGS[entity.type];
    if (!def.miningSpeed) continue;
    if (!entity.enabled || !entity.powered || entity.durability <= 0) continue;

    const miningSpeed = def.miningSpeed * speedMult;
    const radius = def.miningRadius ?? 2;

    // Find nearby ore tiles
    let mined = false;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const tile = state.tiles.get(tileKey(entity.x + dx, entity.y + dy));
        if (!tile || tile.resourceAmount <= 0) continue;

        const resource = TILE_TO_RESOURCE[tile.type];
        if (!resource) continue;

        // Extract
        const extracted = Math.min(miningSpeed, tile.resourceAmount);
        tile.resourceAmount -= extracted;

        // Accumulate in output buffer
        const buffer = (entity.data['outputBuffer'] as number) ?? 0;
        entity.data['outputResource'] = resource;
        entity.data['outputBuffer'] = buffer + extracted;

        // Blast miner reduces stability
        if (entity.type === 'blast_miner') {
          tile.stability = Math.max(0, tile.stability - 0.5);
          // Random explosion chance when durability is low
        }

        if (tile.resourceAmount <= 0) {
          tile.type = 'empty';
          tile.resourceAmount = 0;
        }
        mined = true;
        break;
      }
      if (mined) break;
    }

    // Output accumulated items
    const outputBuffer = (entity.data['outputBuffer'] as number) ?? 0;
    const outputResource = entity.data['outputResource'] as ResourceType | undefined;
    if (outputBuffer >= 1 && outputResource) {
      // Try to output in facing direction
      const [dx, dy] = DIRECTION_OFFSETS[entity.direction];
      const outX = entity.x + (entity.direction === 'right' ? entity.width : entity.direction === 'left' ? -1 : dx);
      const outY = entity.y + (entity.direction === 'down' ? entity.height : entity.direction === 'up' ? -1 : dy);

      const outTile = state.tiles.get(tileKey(outX, outY));
      if (outTile?.entityId) {
        const outEntity = state.entities.get(outTile.entityId);
        if (outEntity) {
          const delivered = tryOutputItem(state, outEntity, outTile.entityId, outputResource);
          if (delivered) {
            entity.data['outputBuffer'] = Math.max(0, outputBuffer - 1);
          }
        }
      }
    }
  }
}

function tryOutputItem(
  state: GameState,
  target: Entity,
  targetId: string,
  resource: ResourceType
): boolean {
  // To conveyor
  if (target.type === 'conveyor' || target.type === 'splitter' || target.type === 'merger') {
    const items = state.logistics.conveyorItems.get(targetId) ?? [];
    if (items.length < 4) {
      items.push({ resource, progress: 0 });
      state.logistics.conveyorItems.set(targetId, items);
      return true;
    }
    return false;
  }

  // To storage
  if (target.type === 'storage') {
    const contents = state.logistics.storageContents.get(targetId) ?? [];
    const capacity = BUILDINGS[target.type].storageCapacity ?? 200;
    const total = contents.reduce((s, i) => s + i.amount, 0);
    if (total < capacity) {
      const existing = contents.find(s => s.resource === resource);
      if (existing) existing.amount++;
      else contents.push({ resource, amount: 1 });
      state.logistics.storageContents.set(targetId, contents);
      return true;
    }
    return false;
  }

  return false;
}
