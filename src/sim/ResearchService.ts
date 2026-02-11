import type { GameState, ItemStack } from './types';
import { RESEARCH_TREE } from '../content/research';

/**
 * Research simulation:
 * - Player selects a research node
 * - Research lab consumes required resources
 * - Progress tracked in ticks
 * - Completion unlocks buildings/upgrades
 * - Prerequisites must be met
 */

export function updateResearch(state: GameState): void {
  if (!state.research.current) return;

  const node = RESEARCH_TREE.find(n => n.id === state.research.current);
  if (!node) {
    state.research.current = null;
    return;
  }

  // Check if research lab exists and is powered
  let hasLab = false;
  for (const entity of state.entities.values()) {
    if (entity.type === 'research_lab' && entity.enabled && entity.powered && entity.durability > 0) {
      hasLab = true;
      break;
    }
  }

  if (!hasLab) return;

  // Check if resources have been consumed
  const allConsumed = node.cost.every(req => {
    const consumed = state.research.inputConsumed[req.resource] ?? 0;
    return consumed >= req.amount;
  });

  if (!allConsumed) {
    // Try to consume from nearby storage
    for (const req of node.cost) {
      const consumed = state.research.inputConsumed[req.resource] ?? 0;
      if (consumed >= req.amount) continue;

      // Find storage with this resource
      for (const [id, entity] of state.entities) {
        if (entity.type !== 'storage') continue;
        const contents = state.logistics.storageContents.get(id) ?? [];
        const stack = contents.find(s => s.resource === req.resource);
        if (stack && stack.amount > 0) {
          stack.amount--;
          if (stack.amount <= 0) {
            const idx = contents.indexOf(stack);
            if (idx >= 0) contents.splice(idx, 1);
          }
          state.research.inputConsumed[req.resource] = consumed + 1;
          break;
        }
      }
    }
    return;
  }

  // Progress research
  state.research.progress++;

  if (state.research.progress >= node.ticksRequired) {
    // Complete!
    state.research.completed.push(node.id);
    state.research.current = null;
    state.research.progress = 0;
    state.research.inputConsumed = {};

    state.alerts.push({
      id: `research_${node.id}`, type: 'info',
      message: `Research complete: ${node.name}!`,
      tick: state.tick, dismissed: false,
    });
  }
}

export function canStartResearch(state: GameState, nodeId: string): boolean {
  const node = RESEARCH_TREE.find(n => n.id === nodeId);
  if (!node) return false;
  if (state.research.completed.includes(nodeId)) return false;
  if (state.research.current) return false;

  // Check prerequisites
  return node.prerequisites.every(p => state.research.completed.includes(p));
}

export function startResearch(state: GameState, nodeId: string): boolean {
  if (!canStartResearch(state, nodeId)) return false;
  state.research.current = nodeId;
  state.research.progress = 0;
  state.research.inputConsumed = {};
  return true;
}

export function getResearchProgress(state: GameState): { node: typeof RESEARCH_TREE[0] | null; progress: number; total: number } {
  if (!state.research.current) return { node: null, progress: 0, total: 0 };
  const node = RESEARCH_TREE.find(n => n.id === state.research.current);
  if (!node) return { node: null, progress: 0, total: 0 };
  return { node, progress: state.research.progress, total: node.ticksRequired };
}

export function isUnlocked(state: GameState, buildingType: string): boolean {
  const node = RESEARCH_TREE.find(n => n.unlocks.includes(buildingType));
  if (!node) return true; // No research required
  return state.research.completed.includes(node.id);
}
