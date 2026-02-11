import type { GameState } from './types';
import { createGameEvents } from '../content/events';
import { ACHIEVEMENTS } from '../content/events';

let gameEvents = createGameEvents();

export function resetEvents(): void {
  gameEvents = createGameEvents();
}

/**
 * Event simulation:
 * - Random events triggered by conditions
 * - Achievements checked periodically
 */

export function updateEvents(state: GameState): void {
  // Process events every 10 ticks
  if (state.tick % 10 !== 0) return;

  for (const event of gameEvents) {
    // Check cooldown
    if (state.tick - event.lastTriggered < event.cooldownTicks) continue;

    // Check condition
    if (event.triggerCondition(state)) {
      event.effect(state);
      event.lastTriggered = state.tick;
    }
  }

  // Check achievements every 100 ticks
  if (state.tick % 100 === 0) {
    checkAchievements(state);
  }

  // Clean old alerts (keep last 20)
  const activeAlerts = state.alerts.filter(a => !a.dismissed);
  if (activeAlerts.length > 20) {
    // Dismiss oldest
    const sorted = activeAlerts.sort((a, b) => a.tick - b.tick);
    for (let i = 0; i < sorted.length - 20; i++) {
      sorted[i].dismissed = true;
    }
  }
}

function checkAchievements(state: GameState): void {
  for (const achievement of ACHIEVEMENTS) {
    if (state.achievements.get(achievement.key)) continue;

    if (achievement.condition(state)) {
      state.achievements.set(achievement.key, true);
      state.alerts.push({
        id: `ach_${achievement.key}`, type: 'info',
        message: `Achievement unlocked: ${achievement.name}!`,
        tick: state.tick, dismissed: false,
      });
    }
  }
}
