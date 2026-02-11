import type { GameState, GameEvent } from '../sim/types';
import { pickRandom } from '../utils/helpers';

function hasEntitiesOfType(state: GameState, type: string): boolean {
  for (const e of state.entities.values()) {
    if (e.type === type) return true;
  }
  return false;
}

function getEntitiesByType(state: GameState, type: string) {
  const result: string[] = [];
  for (const [id, e] of state.entities) {
    if (e.type === type) result.push(id);
  }
  return result;
}

export function createGameEvents(): GameEvent[] {
  return [
    {
      id: 'minor_quake',
      name: 'Minor Earthquake',
      description: 'A tremor shakes the cavern. Stability reduced in random area.',
      category: 'random',
      cooldownTicks: 6000,
      lastTriggered: -10000,
      triggerCondition: (state) => state.tick > 1000 && Math.random() < 0.001,
      effect: (state) => {
        // Reduce stability in a random area
        const tiles = Array.from(state.tiles.values()).filter(t => t.revealed);
        if (tiles.length === 0) return;
        const center = pickRandom(tiles);
        for (const t of state.tiles.values()) {
          const dx = Math.abs(t.x - center.x);
          const dy = Math.abs(t.y - center.y);
          if (dx + dy < 8) {
            t.stability = Math.max(0, t.stability - (15 - dx - dy));
          }
        }
        state.alerts.push({
          id: `eq_${state.tick}`, type: 'danger', message: 'Minor earthquake! Check stability!',
          x: center.x, y: center.y, tick: state.tick, dismissed: false,
        });
      },
    },
    {
      id: 'gas_leak',
      name: 'Gas Leak',
      description: 'A pocket of gas vents into the mine. Dangerous near ignition sources.',
      category: 'random',
      cooldownTicks: 4000,
      lastTriggered: -10000,
      triggerCondition: (state) => state.tick > 500 && Math.random() < 0.002,
      effect: (state) => {
        const tiles = Array.from(state.tiles.values()).filter(t => t.revealed && t.type !== 'bedrock');
        if (tiles.length === 0) return;
        const center = pickRandom(tiles);
        for (const t of state.tiles.values()) {
          const dx = Math.abs(t.x - center.x);
          const dy = Math.abs(t.y - center.y);
          if (dx + dy < 5) {
            t.gasLevel = Math.min(1, t.gasLevel + 0.3);
          }
        }
        state.alerts.push({
          id: `gas_${state.tick}`, type: 'warning', message: 'Gas leak detected! Install gas vents!',
          x: center.x, y: center.y, tick: state.tick, dismissed: false,
        });
      },
    },
    {
      id: 'water_breach',
      name: 'Water Breach',
      description: 'Underground water floods a section of the mine.',
      category: 'random',
      cooldownTicks: 5000,
      lastTriggered: -10000,
      triggerCondition: (state) => state.tick > 2000 && Math.random() < 0.001,
      effect: (state) => {
        const tiles = Array.from(state.tiles.values()).filter(t => t.revealed && t.type !== 'bedrock');
        if (tiles.length === 0) return;
        const center = pickRandom(tiles);
        for (const t of state.tiles.values()) {
          const dx = Math.abs(t.x - center.x);
          const dy = Math.abs(t.y - center.y);
          if (dx + dy < 6) {
            t.waterLevel = Math.min(1, t.waterLevel + 0.5);
          }
        }
        state.alerts.push({
          id: `water_${state.tick}`, type: 'danger', message: 'Water breach! Deploy pumps!',
          x: center.x, y: center.y, tick: state.tick, dismissed: false,
        });
      },
    },
    {
      id: 'equipment_surge',
      name: 'Power Surge',
      description: 'A power surge damages electrical equipment.',
      category: 'random',
      cooldownTicks: 5000,
      lastTriggered: -10000,
      triggerCondition: (state) => state.tick > 1500 && state.powerGrid.totalGeneration > 200 && Math.random() < 0.001,
      effect: (state) => {
        for (const e of state.entities.values()) {
          if (e.powered && Math.random() < 0.3) {
            e.durability = Math.max(0, e.durability - 0.2);
          }
        }
        state.alerts.push({
          id: `surge_${state.tick}`, type: 'warning', message: 'Power surge! Equipment damaged!',
          tick: state.tick, dismissed: false,
        });
      },
    },
    {
      id: 'market_crash',
      name: 'Market Crash',
      description: 'Resource prices plummet temporarily.',
      category: 'random',
      cooldownTicks: 12000,
      lastTriggered: -20000,
      triggerCondition: (state) => state.tick > 3000 && Math.random() < 0.0005,
      effect: (state) => {
        for (const m of state.market) {
          m.demand = Math.max(-1, m.demand - 0.5);
          m.currentPrice = m.basePrice * (1 + m.demand * 0.5);
        }
        state.alerts.push({
          id: `crash_${state.tick}`, type: 'warning', message: 'Market crash! Prices plummeting!',
          tick: state.tick, dismissed: false,
        });
      },
    },
    {
      id: 'market_boom',
      name: 'Market Boom',
      description: 'Demand surges! Sell now for big profits.',
      category: 'random',
      cooldownTicks: 12000,
      lastTriggered: -20000,
      triggerCondition: (state) => state.tick > 3000 && Math.random() < 0.0005,
      effect: (state) => {
        for (const m of state.market) {
          m.demand = Math.min(1, m.demand + 0.5);
          m.currentPrice = m.basePrice * (1 + m.demand * 0.5);
        }
        state.alerts.push({
          id: `boom_${state.tick}`, type: 'info', message: 'Market boom! Prices surging!',
          tick: state.tick, dismissed: false,
        });
      },
    },
    {
      id: 'reactor_warning',
      name: 'Reactor Instability',
      description: 'Nuclear reactor temperature critical!',
      category: 'triggered',
      cooldownTicks: 1000,
      lastTriggered: -10000,
      triggerCondition: (state) => {
        for (const e of state.entities.values()) {
          if (e.type === 'nuclear_reactor' && e.temperature > 250) return true;
        }
        return false;
      },
      effect: (state) => {
        state.alerts.push({
          id: `reactor_${state.tick}`, type: 'danger',
          message: 'REACTOR CRITICAL! Meltdown imminent! Cool it NOW!',
          tick: state.tick, dismissed: false,
        });
      },
    },
    {
      id: 'reactor_meltdown',
      name: 'REACTOR MELTDOWN',
      description: 'Nuclear reactor has melted down! Massive destruction!',
      category: 'disaster',
      cooldownTicks: 0,
      lastTriggered: -10000,
      triggerCondition: (state) => {
        for (const e of state.entities.values()) {
          if (e.type === 'nuclear_reactor' && e.temperature > 300) return true;
        }
        return false;
      },
      effect: (state) => {
        // Find the overheating reactor
        for (const [id, e] of state.entities) {
          if (e.type === 'nuclear_reactor' && e.temperature > 300) {
            // Destroy everything in a large radius
            const destroyIds: string[] = [];
            for (const [oid, other] of state.entities) {
              const dx = Math.abs(other.x - e.x);
              const dy = Math.abs(other.y - e.y);
              if (dx + dy < 12) {
                destroyIds.push(oid);
              }
            }
            for (const did of destroyIds) {
              const de = state.entities.get(did);
              if (de) {
                // Clear tile references
                for (let tx = de.x; tx < de.x + de.width; tx++) {
                  for (let ty = de.y; ty < de.y + de.height; ty++) {
                    const tile = state.tiles.get(`${tx},${ty}`);
                    if (tile) { tile.entityId = null; tile.stability = 0; tile.temperature += 50; }
                  }
                }
                state.entities.delete(did);
                state.logistics.conveyorItems.delete(did);
                state.logistics.storageContents.delete(did);
              }
            }
            state.money = Math.max(0, state.money - 5000);
            state.alerts.push({
              id: `meltdown_${state.tick}`, type: 'danger',
              message: `MELTDOWN! Reactor destroyed ${destroyIds.length} buildings! $5000 cleanup cost!`,
              x: e.x, y: e.y, tick: state.tick, dismissed: false,
            });
            break;
          }
        }
      },
    },
    {
      id: 'blast_miner_explosion',
      name: 'Blast Miner Explosion',
      description: 'A blast miner detonated prematurely!',
      category: 'triggered',
      cooldownTicks: 3000,
      lastTriggered: -10000,
      triggerCondition: (state) => {
        for (const e of state.entities.values()) {
          if (e.type === 'blast_miner' && e.durability < 0.15 && e.enabled) return true;
        }
        return false;
      },
      effect: (state) => {
        for (const [id, e] of state.entities) {
          if (e.type === 'blast_miner' && e.durability < 0.15) {
            // Explode nearby
            const destroyIds: string[] = [];
            for (const [oid, other] of state.entities) {
              if (oid === id) continue;
              const dx = Math.abs(other.x - e.x);
              const dy = Math.abs(other.y - e.y);
              if (dx + dy < 6) {
                other.durability = Math.max(0, other.durability - 0.5);
                if (other.durability <= 0) destroyIds.push(oid);
              }
            }
            // Destroy the miner itself
            for (let tx = e.x; tx < e.x + e.width; tx++) {
              for (let ty = e.y; ty < e.y + e.height; ty++) {
                const tile = state.tiles.get(`${tx},${ty}`);
                if (tile) { tile.entityId = null; tile.stability = Math.max(0, tile.stability - 30); }
              }
            }
            state.entities.delete(id);
            for (const did of destroyIds) {
              const de = state.entities.get(did);
              if (de) {
                for (let tx = de.x; tx < de.x + de.width; tx++) {
                  for (let ty = de.y; ty < de.y + de.height; ty++) {
                    const tile = state.tiles.get(`${tx},${ty}`);
                    if (tile) tile.entityId = null;
                  }
                }
                state.entities.delete(did);
              }
            }
            state.alerts.push({
              id: `explosion_${state.tick}`, type: 'danger',
              message: `Blast miner exploded! ${destroyIds.length + 1} buildings destroyed!`,
              x: e.x, y: e.y, tick: state.tick, dismissed: false,
            });
            break;
          }
        }
      },
    },
    {
      id: 'ore_discovery',
      name: 'Rich Vein Discovery',
      description: 'Miners discovered an exceptionally rich ore deposit!',
      category: 'random',
      cooldownTicks: 8000,
      lastTriggered: -10000,
      triggerCondition: (state) => state.tick > 2000 && hasEntitiesOfType(state, 'mining_rig') && Math.random() < 0.001,
      effect: (state) => {
        // Double the resource of a random nearby vein
        const miners = getEntitiesByType(state, 'mining_rig');
        if (miners.length === 0) return;
        const minerId = pickRandom(miners);
        const miner = state.entities.get(minerId)!;
        for (const t of state.tiles.values()) {
          const dx = Math.abs(t.x - miner.x);
          const dy = Math.abs(t.y - miner.y);
          if (dx + dy < 5 && t.resourceAmount > 0) {
            t.resourceAmount *= 2;
          }
        }
        state.alerts.push({
          id: `ore_${state.tick}`, type: 'info',
          message: 'Rich vein discovered! Doubled nearby ore!',
          x: miner.x, y: miner.y, tick: state.tick, dismissed: false,
        });
      },
    },
  ];
}

// ── Achievements ──
export interface AchievementDef {
  key: string;
  name: string;
  description: string;
  condition: (state: GameState) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'first_mine', name: 'First Strike', description: 'Place your first mining rig.',
    condition: (state) => { for (const e of state.entities.values()) if (e.type === 'mining_rig') return true; return false; } },
  { key: 'first_sale', name: 'Open for Business', description: 'Sell your first resource.',
    condition: (state) => state.money > 5000 + 100 },
  { key: 'power_up', name: 'Power Up', description: 'Generate 500+ kW of power.',
    condition: (state) => state.powerGrid.totalGeneration >= 500 },
  { key: 'mass_production', name: 'Mass Production', description: 'Have 10+ conveyors running.',
    condition: (state) => { let c = 0; for (const e of state.entities.values()) if (e.type === 'conveyor' && e.enabled) c++; return c >= 10; } },
  { key: 'wealthy', name: 'Deep Pockets', description: 'Accumulate $50,000.',
    condition: (state) => state.money >= 50000 },
  { key: 'researcher', name: 'Knowledge Seeker', description: 'Complete 5 research nodes.',
    condition: (state) => state.research.completed.length >= 5 },
  { key: 'nuclear_age', name: 'Nuclear Age', description: 'Build a nuclear reactor.',
    condition: (state) => { for (const e of state.entities.values()) if (e.type === 'nuclear_reactor') return true; return false; } },
  { key: 'meltdown_survivor', name: 'Meltdown Survivor', description: 'Survive a reactor meltdown.',
    condition: (state) => state.alerts.some(a => a.message.includes('MELTDOWN')) },
  { key: 'contract_master', name: 'Contract Master', description: 'Complete 10 contracts.',
    condition: (state) => state.contracts.filter(c => c.completed).length >= 10 },
  { key: 'cave_in_survivor', name: 'Cave-In Survivor', description: 'Experience a cave-in and recover.',
    condition: (state) => state.alerts.some(a => a.message.includes('Cave-in')) },
  { key: 'big_base', name: 'Industrial Complex', description: 'Have 100+ buildings placed.',
    condition: (state) => state.entities.size >= 100 },
  { key: 'millionaire', name: 'Millionaire', description: 'Accumulate $1,000,000.',
    condition: (state) => state.money >= 1000000 },
  { key: 'full_research', name: 'Omniscient', description: 'Complete all research.',
    condition: (state) => state.research.completed.length >= 30 },
  { key: 'singularity', name: 'Singularity', description: 'Achieve the singularity.',
    condition: (state) => state.research.completed.includes('singularity') },
  { key: 'debt_free', name: 'Debt Free', description: 'Pay off all loans.',
    condition: (state) => state.loans.length > 0 && state.loans.every(l => l.remaining <= 0) },
];
