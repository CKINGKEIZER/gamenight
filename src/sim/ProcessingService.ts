import type { GameState, Entity, ItemStack, ResourceType } from './types';
import { BUILDINGS } from '../content/buildings';
import { RECIPES } from '../content/buildings';
import { DIRECTION_OFFSETS, tileKey } from '../utils/helpers';

/**
 * Processing simulation:
 * - Smelters, refineries, assemblers consume inputs and produce outputs
 * - Recipe-based production cycles
 * - Input from adjacent conveyors/storage
 * - Output to facing direction
 */

export function updateProcessing(state: GameState): void {
  const efficientSmelting = state.research.completed.includes('efficient_smelting');
  const zeroWaste = state.research.completed.includes('zero_waste');
  const overclock = state.research.completed.includes('overclock');

  for (const [id, entity] of state.entities) {
    const def = BUILDINGS[entity.type];
    if (def.category !== 'processing') continue;
    if (!entity.enabled || !entity.powered || entity.durability <= 0) continue;

    // Initialize data if needed
    if (!entity.data['inputBuffer']) entity.data['inputBuffer'] = [] as ItemStack[];
    if (!entity.data['outputBuffer']) entity.data['outputBuffer'] = [] as ItemStack[];
    if (entity.data['cycleProgress'] === undefined) entity.data['cycleProgress'] = 0;

    // Get recipe
    const recipeId = entity.data['recipe'] as string | undefined;
    const recipe = recipeId
      ? RECIPES.find(r => r.id === recipeId)
      : RECIPES.find(r => r.building === entity.type);

    if (!recipe) continue;

    const inputBuffer = entity.data['inputBuffer'] as ItemStack[];
    const outputBuffer = entity.data['outputBuffer'] as ItemStack[];
    let cycleProgress = entity.data['cycleProgress'] as number;

    // Check if we have inputs for current cycle
    const hasInputs = recipe.inputs.every(req => {
      const available = inputBuffer.find(s => s.resource === req.resource);
      const needed = efficientSmelting && entity.type === 'smelter'
        ? Math.ceil(req.amount * 0.75)
        : req.amount;
      return available && available.amount >= needed;
    });

    if (hasInputs && outputBuffer.reduce((s, i) => s + i.amount, 0) < 10) {
      // Advance cycle
      const speedMult = overclock ? 1.25 : 1;
      cycleProgress += speedMult;

      if (cycleProgress >= recipe.ticksPerCycle) {
        // Consume inputs
        const skipConsume = zeroWaste && Math.random() < 0.2;
        if (!skipConsume) {
          for (const req of recipe.inputs) {
            const stack = inputBuffer.find(s => s.resource === req.resource);
            if (stack) {
              const needed = efficientSmelting && entity.type === 'smelter'
                ? Math.ceil(req.amount * 0.75)
                : req.amount;
              stack.amount -= needed;
            }
          }
          // Clean empty stacks
          entity.data['inputBuffer'] = inputBuffer.filter(s => s.amount > 0);
        }

        // Produce outputs
        for (const out of recipe.outputs) {
          const existing = outputBuffer.find(s => s.resource === out.resource);
          if (existing) existing.amount += out.amount;
          else outputBuffer.push({ resource: out.resource, amount: out.amount });
        }

        cycleProgress = 0;

        // For generators: mark as having input
        if (def.powerGeneration) {
          entity.data['hasInput'] = true;
        }
      }

      entity.data['cycleProgress'] = cycleProgress;
    } else if (!hasInputs && def.powerGeneration) {
      entity.data['hasInput'] = false;
    }

    // Output items in facing direction
    if (outputBuffer.length > 0 && outputBuffer[0].amount > 0) {
      const [dx, dy] = DIRECTION_OFFSETS[entity.direction];
      const outX = entity.x + (entity.direction === 'right' ? entity.width : entity.direction === 'left' ? -1 : dx);
      const outY = entity.y + (entity.direction === 'down' ? entity.height : entity.direction === 'up' ? -1 : dy);

      const outTile = state.tiles.get(tileKey(outX, outY));
      if (outTile?.entityId) {
        const outEntity = state.entities.get(outTile.entityId);
        if (outEntity) {
          if (tryOutputItem(state, outEntity, outTile.entityId, outputBuffer[0].resource)) {
            outputBuffer[0].amount--;
            if (outputBuffer[0].amount <= 0) outputBuffer.shift();
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
  if (target.type === 'conveyor' || target.type === 'splitter' || target.type === 'merger') {
    const items = state.logistics.conveyorItems.get(targetId) ?? [];
    if (items.length < 4) {
      items.push({ resource, progress: 0 });
      state.logistics.conveyorItems.set(targetId, items);
      return true;
    }
    return false;
  }

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

  // Chain into another processor's input
  if (target.data['inputBuffer']) {
    const buffer = target.data['inputBuffer'] as ItemStack[];
    const total = buffer.reduce((s, i) => s + i.amount, 0);
    if (total < 20) {
      const existing = buffer.find(s => s.resource === resource);
      if (existing) existing.amount++;
      else buffer.push({ resource, amount: 1 });
      return true;
    }
    return false;
  }

  return false;
}
