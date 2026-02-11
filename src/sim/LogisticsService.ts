import type { GameState, Entity, ConveyorItem, ItemStack, ResourceType } from './types';
import { BUILDINGS } from '../content/buildings';
import { DIRECTION_OFFSETS, type Direction, tileKey } from '../utils/helpers';
import { CONVEYOR_SPEED, CONVEYOR_CAPACITY, STORAGE_DEFAULT_CAPACITY } from '../utils/constants';

/**
 * Logistics simulation:
 * - Conveyors move items in their facing direction
 * - Items flow from outputs to inputs
 * - Splitters distribute evenly
 * - Mergers combine inputs
 * - Storage buffers items
 * - Jams occur when output is blocked
 */

export function updateLogistics(state: GameState): void {
  const throughputMult = state.research.completed.includes('automation_2') ? 1.5 : 1;

  // Process each conveyor
  for (const [id, entity] of state.entities) {
    if (entity.type !== 'conveyor' && entity.type !== 'splitter' && entity.type !== 'merger') continue;
    if (!entity.enabled || !entity.powered || entity.durability <= 0) continue;

    const items = state.logistics.conveyorItems.get(id) ?? [];

    // Move items forward
    const speed = CONVEYOR_SPEED * throughputMult * 0.1;
    for (const item of items) {
      item.progress += speed;
    }

    // Items that reached the end (progress >= 1)
    const completed: ConveyorItem[] = [];
    const remaining: ConveyorItem[] = [];
    for (const item of items) {
      if (item.progress >= 1) {
        completed.push(item);
      } else {
        remaining.push(item);
      }
    }

    // Try to pass completed items to the next entity
    const [dx, dy] = DIRECTION_OFFSETS[entity.direction];
    const nextTileKey = tileKey(entity.x + dx, entity.y + dy);
    const nextTile = state.tiles.get(nextTileKey);
    const nextEntityId = nextTile?.entityId;
    const nextEntity = nextEntityId ? state.entities.get(nextEntityId) : null;

    for (const item of completed) {
      if (tryDeliverItem(state, nextEntity, nextEntityId, item.resource, entity.type === 'splitter' ? entity : undefined)) {
        // Delivered successfully
      } else {
        // Jam! Item stays at end of belt
        item.progress = 0.99;
        remaining.push(item);
      }
    }

    state.logistics.conveyorItems.set(id, remaining.slice(0, CONVEYOR_CAPACITY));
  }

  // Process storages - output to front
  for (const [id, entity] of state.entities) {
    if (entity.type !== 'storage') continue;
    if (!entity.enabled || entity.durability <= 0) continue;

    const contents = state.logistics.storageContents.get(id) ?? [];
    if (contents.length === 0) continue;

    // Output from the front
    const [dx, dy] = DIRECTION_OFFSETS[entity.direction];
    const outX = entity.x + (entity.direction === 'right' ? entity.width : entity.direction === 'left' ? -1 : 0);
    const outY = entity.y + (entity.direction === 'down' ? entity.height : entity.direction === 'up' ? -1 : 0);
    const outKey = tileKey(outX, outY);
    const outTile = state.tiles.get(outKey);
    const outEntityId = outTile?.entityId;
    const outEntity = outEntityId ? state.entities.get(outEntityId) : null;

    if (outEntity && contents.length > 0) {
      // Try to output first available item
      for (let i = 0; i < contents.length; i++) {
        if (contents[i].amount > 0) {
          if (tryDeliverItem(state, outEntity, outEntityId!, contents[i].resource)) {
            contents[i].amount--;
            if (contents[i].amount <= 0) {
              contents.splice(i, 1);
            }
            break;
          }
        }
      }
    }
  }
}

function tryDeliverItem(
  state: GameState,
  target: Entity | null | undefined,
  targetId: string | null | undefined,
  resource: ResourceType,
  splitter?: Entity
): boolean {
  if (!target || !targetId) return false;

  // Deliver to conveyor
  if (target.type === 'conveyor' || target.type === 'merger') {
    const items = state.logistics.conveyorItems.get(targetId) ?? [];
    if (items.length < CONVEYOR_CAPACITY) {
      items.push({ resource, progress: 0 });
      state.logistics.conveyorItems.set(targetId, items);
      return true;
    }
    return false;
  }

  // Deliver to splitter - it acts as a conveyor that will split outputs
  if (target.type === 'splitter') {
    const items = state.logistics.conveyorItems.get(targetId) ?? [];
    if (items.length < CONVEYOR_CAPACITY) {
      items.push({ resource, progress: 0 });
      state.logistics.conveyorItems.set(targetId, items);
      return true;
    }
    return false;
  }

  // Deliver to storage
  if (target.type === 'storage') {
    const contents = state.logistics.storageContents.get(targetId) ?? [];
    const def = BUILDINGS[target.type];
    const capacity = def.storageCapacity ?? STORAGE_DEFAULT_CAPACITY;
    const totalStored = contents.reduce((s, i) => s + i.amount, 0);
    if (totalStored < capacity) {
      const existing = contents.find(s => s.resource === resource);
      if (existing) {
        existing.amount++;
      } else {
        contents.push({ resource, amount: 1 });
      }
      state.logistics.storageContents.set(targetId, contents);
      return true;
    }
    return false;
  }

  // Deliver to processing building (smelter, refinery, assembler, etc.)
  if (target.data['inputBuffer']) {
    const buffer = target.data['inputBuffer'] as ItemStack[];
    const existing = buffer.find(s => s.resource === resource);
    const bufferTotal = buffer.reduce((s, i) => s + i.amount, 0);
    if (bufferTotal < 20) {  // input buffer limit
      if (existing) {
        existing.amount++;
      } else {
        buffer.push({ resource, amount: 1 });
      }
      return true;
    }
    return false;
  }

  // Deliver to selling terminal
  if (target.type === 'selling_terminal') {
    const buffer = (target.data['sellBuffer'] as ItemStack[]) ?? [];
    const existing = buffer.find(s => s.resource === resource);
    if (existing) {
      existing.amount++;
    } else {
      buffer.push({ resource, amount: 1 });
    }
    target.data['sellBuffer'] = buffer;
    return true;
  }

  return false;
}

// Extract items from storage for use by other systems
export function extractFromStorage(
  state: GameState,
  entityId: string,
  resource: ResourceType,
  amount: number
): number {
  const contents = state.logistics.storageContents.get(entityId) ?? [];
  const stack = contents.find(s => s.resource === resource);
  if (!stack) return 0;
  const taken = Math.min(stack.amount, amount);
  stack.amount -= taken;
  if (stack.amount <= 0) {
    const idx = contents.indexOf(stack);
    if (idx >= 0) contents.splice(idx, 1);
  }
  return taken;
}

// Find nearest storage with a given resource
export function findStorageWith(
  state: GameState,
  resource: ResourceType,
  nearX: number,
  nearY: number,
  maxDist = 20
): string | null {
  let bestId: string | null = null;
  let bestDist = maxDist + 1;

  for (const [id, entity] of state.entities) {
    if (entity.type !== 'storage') continue;
    const contents = state.logistics.storageContents.get(id) ?? [];
    if (contents.some(s => s.resource === resource && s.amount > 0)) {
      const dist = Math.abs(entity.x - nearX) + Math.abs(entity.y - nearY);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    }
  }
  return bestId;
}

export function getStorageTotal(state: GameState, entityId: string): number {
  const contents = state.logistics.storageContents.get(entityId) ?? [];
  return contents.reduce((s, i) => s + i.amount, 0);
}
