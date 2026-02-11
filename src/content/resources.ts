import type { ResourceType } from '../sim/types';

export interface ResourceDef {
  type: ResourceType;
  name: string;
  color: string;
  baseValue: number;
  stackSize: number;
  tier: number;
  category: 'ore' | 'raw' | 'ingot' | 'component' | 'advanced';
}

export const RESOURCES: Record<ResourceType, ResourceDef> = {
  // Ores (tier 0)
  iron_ore: { type: 'iron_ore', name: 'Iron Ore', color: '#8B4513', baseValue: 5, stackSize: 100, tier: 0, category: 'ore' },
  copper_ore: { type: 'copper_ore', name: 'Copper Ore', color: '#B87333', baseValue: 8, stackSize: 100, tier: 0, category: 'ore' },
  coal: { type: 'coal', name: 'Coal', color: '#2F2F2F', baseValue: 3, stackSize: 100, tier: 0, category: 'raw' },
  stone: { type: 'stone', name: 'Stone', color: '#808080', baseValue: 1, stackSize: 100, tier: 0, category: 'raw' },
  ice: { type: 'ice', name: 'Ice', color: '#ADD8E6', baseValue: 2, stackSize: 100, tier: 0, category: 'raw' },
  gold_ore: { type: 'gold_ore', name: 'Gold Ore', color: '#FFD700', baseValue: 25, stackSize: 50, tier: 1, category: 'ore' },
  crystal_ore: { type: 'crystal_ore', name: 'Crystal Ore', color: '#E040FB', baseValue: 40, stackSize: 50, tier: 2, category: 'ore' },
  uranium_ore: { type: 'uranium_ore', name: 'Uranium Ore', color: '#76FF03', baseValue: 80, stackSize: 20, tier: 3, category: 'ore' },

  // Ingots (tier 1)
  iron_ingot: { type: 'iron_ingot', name: 'Iron Ingot', color: '#A0A0A0', baseValue: 15, stackSize: 100, tier: 1, category: 'ingot' },
  copper_ingot: { type: 'copper_ingot', name: 'Copper Ingot', color: '#CD7F32', baseValue: 22, stackSize: 100, tier: 1, category: 'ingot' },
  gold_ingot: { type: 'gold_ingot', name: 'Gold Ingot', color: '#FFD700', baseValue: 75, stackSize: 50, tier: 1, category: 'ingot' },
  crystal: { type: 'crystal', name: 'Crystal', color: '#E040FB', baseValue: 120, stackSize: 50, tier: 2, category: 'ingot' },

  // Components (tier 2)
  steel: { type: 'steel', name: 'Steel', color: '#708090', baseValue: 35, stackSize: 100, tier: 2, category: 'component' },
  circuit: { type: 'circuit', name: 'Circuit', color: '#00C853', baseValue: 50, stackSize: 50, tier: 2, category: 'component' },
  spare_parts: { type: 'spare_parts', name: 'Spare Parts', color: '#9E9E9E', baseValue: 30, stackSize: 50, tier: 2, category: 'component' },
  coolant: { type: 'coolant', name: 'Coolant', color: '#00BCD4', baseValue: 20, stackSize: 50, tier: 2, category: 'component' },
  explosives: { type: 'explosives', name: 'Explosives', color: '#FF5722', baseValue: 45, stackSize: 20, tier: 2, category: 'component' },

  // Advanced (tier 3)
  advanced_circuit: { type: 'advanced_circuit', name: 'Advanced Circuit', color: '#AA00FF', baseValue: 150, stackSize: 20, tier: 3, category: 'advanced' },
  uranium_rod: { type: 'uranium_rod', name: 'Uranium Rod', color: '#76FF03', baseValue: 300, stackSize: 10, tier: 3, category: 'advanced' },
  research_pack: { type: 'research_pack', name: 'Research Pack', color: '#2196F3', baseValue: 100, stackSize: 20, tier: 3, category: 'advanced' },
  energy_cell: { type: 'energy_cell', name: 'Energy Cell', color: '#FFEB3B', baseValue: 200, stackSize: 10, tier: 3, category: 'advanced' },
};

export const RESOURCE_LIST = Object.values(RESOURCES);
