import type { BuildingDef, BuildingType } from '../sim/types';

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  // ── Mining ──
  mining_rig: {
    type: 'mining_rig', name: 'Mining Rig', description: 'Extracts ore from veins. Basic but reliable.',
    category: 'mining', width: 2, height: 2, cost: 500, powerConsumption: 20,
    heatGeneration: 0.5, maxDurability: 1, wearRate: 0.0008,
    color: 0xcc8833, icon: '⛏',
    miningSpeed: 0.05, miningRadius: 2,
  },
  advanced_drill: {
    type: 'advanced_drill', name: 'Advanced Drill', description: 'Faster extraction, higher power draw.',
    category: 'mining', width: 2, height: 2, cost: 2000, powerConsumption: 60,
    heatGeneration: 1.5, maxDurability: 1, wearRate: 0.001,
    color: 0xdd9944, icon: '🔩', unlockResearch: 'advanced_mining',
    miningSpeed: 0.15, miningRadius: 3,
  },
  blast_miner: {
    type: 'blast_miner', name: 'Blast Miner', description: 'Uses explosives for massive extraction. Damages stability. Can chain-explode.',
    category: 'mining', width: 3, height: 3, cost: 8000,
    powerConsumption: 100, heatGeneration: 5, maxDurability: 1, wearRate: 0.002,
    color: 0xff5522, icon: '💥', unlockResearch: 'blast_mining',
    miningSpeed: 0.5, miningRadius: 5,
    buildResources: [{ resource: 'explosives', amount: 5 }],
  },

  // ── Logistics ──
  conveyor: {
    type: 'conveyor', name: 'Conveyor Belt', description: 'Moves items in one direction.',
    category: 'logistics', width: 1, height: 1, cost: 20, powerConsumption: 1,
    heatGeneration: 0, maxDurability: 1, wearRate: 0.0003,
    color: 0x666666, icon: '→', throughput: 1,
  },
  splitter: {
    type: 'splitter', name: 'Splitter', description: 'Splits input evenly to two outputs.',
    category: 'logistics', width: 1, height: 1, cost: 100, powerConsumption: 2,
    heatGeneration: 0, maxDurability: 1, wearRate: 0.0004,
    color: 0x886666, icon: '⑂', throughput: 1,
  },
  merger: {
    type: 'merger', name: 'Merger', description: 'Merges two inputs into one output.',
    category: 'logistics', width: 1, height: 1, cost: 100, powerConsumption: 2,
    heatGeneration: 0, maxDurability: 1, wearRate: 0.0004,
    color: 0x668866, icon: '⑃', throughput: 1,
  },
  storage: {
    type: 'storage', name: 'Storage Bin', description: 'Stores items. Accepts from any side, outputs forward.',
    category: 'logistics', width: 2, height: 2, cost: 300, powerConsumption: 0,
    heatGeneration: 0, maxDurability: 1, wearRate: 0.0001,
    color: 0x556677, icon: '📦', storageCapacity: 200,
  },

  // ── Processing ──
  smelter: {
    type: 'smelter', name: 'Smelter', description: 'Smelts ore into ingots. Generates significant heat.',
    category: 'processing', width: 2, height: 2, cost: 1200, powerConsumption: 40,
    heatGeneration: 3, maxDurability: 1, wearRate: 0.001,
    color: 0xdd6633, icon: '🔥',
    recipe: { inputs: [{ resource: 'iron_ore', amount: 2 }], outputs: [{ resource: 'iron_ingot', amount: 1 }], ticksPerCycle: 30 },
  },
  refinery: {
    type: 'refinery', name: 'Refinery', description: 'Refines materials into advanced components.',
    category: 'processing', width: 3, height: 2, cost: 3500, powerConsumption: 80,
    heatGeneration: 4, maxDurability: 1, wearRate: 0.0012,
    color: 0xaa55aa, icon: '⚗', unlockResearch: 'refining',
    recipe: { inputs: [{ resource: 'iron_ingot', amount: 2 }, { resource: 'coal', amount: 1 }], outputs: [{ resource: 'steel', amount: 1 }], ticksPerCycle: 50 },
  },
  assembler: {
    type: 'assembler', name: 'Assembler', description: 'Combines components into complex items.',
    category: 'processing', width: 3, height: 3, cost: 5000, powerConsumption: 60,
    heatGeneration: 2, maxDurability: 1, wearRate: 0.001,
    color: 0x5577aa, icon: '🔧', unlockResearch: 'assembly',
    recipe: { inputs: [{ resource: 'copper_ingot', amount: 2 }, { resource: 'iron_ingot', amount: 1 }], outputs: [{ resource: 'circuit', amount: 1 }], ticksPerCycle: 60 },
  },

  // ── Power ──
  coal_generator: {
    type: 'coal_generator', name: 'Coal Generator', description: 'Burns coal to produce power. Reliable workhorse.',
    category: 'power', width: 2, height: 2, cost: 800, powerConsumption: 0,
    heatGeneration: 4, maxDurability: 1, wearRate: 0.0008,
    color: 0x555544, icon: '⚡', powerGeneration: 100,
    recipe: { inputs: [{ resource: 'coal', amount: 1 }], outputs: [], ticksPerCycle: 100 },
  },
  gas_generator: {
    type: 'gas_generator', name: 'Gas Generator', description: 'Extracts gas from pockets for power. Must be near gas.',
    category: 'power', width: 2, height: 2, cost: 2000, powerConsumption: 0,
    heatGeneration: 3, maxDurability: 1, wearRate: 0.001,
    color: 0x668844, icon: '💨', unlockResearch: 'gas_power',
    powerGeneration: 200,
  },
  nuclear_reactor: {
    type: 'nuclear_reactor', name: 'Nuclear Reactor', description: 'Massive power output. Extreme heat. Meltdown risk if cooling fails.',
    category: 'power', width: 4, height: 4, cost: 25000, powerConsumption: 0,
    heatGeneration: 20, maxDurability: 1, wearRate: 0.0015,
    color: 0x66ff33, icon: '☢', unlockResearch: 'nuclear_power',
    powerGeneration: 2000,
    recipe: { inputs: [{ resource: 'uranium_rod', amount: 1 }], outputs: [], ticksPerCycle: 500 },
  },
  power_line: {
    type: 'power_line', name: 'Power Line', description: 'Connects buildings to power network.',
    category: 'power', width: 1, height: 1, cost: 10, powerConsumption: 0,
    heatGeneration: 0, maxDurability: 1, wearRate: 0.0001,
    color: 0xaaaa33, icon: '─',
  },
  battery: {
    type: 'battery', name: 'Battery Bank', description: 'Stores excess power for later use.',
    category: 'power', width: 2, height: 1, cost: 1500, powerConsumption: 0,
    heatGeneration: 0.5, maxDurability: 1, wearRate: 0.0005,
    color: 0x33aa33, icon: '🔋', unlockResearch: 'energy_storage',
    batteryCapacity: 5000,
  },
  transformer: {
    type: 'transformer', name: 'Transformer', description: 'Reduces power loss in connected network.',
    category: 'power', width: 1, height: 1, cost: 500, powerConsumption: 5,
    heatGeneration: 0.5, maxDurability: 1, wearRate: 0.0004,
    color: 0xaaaa55, icon: '⏚', unlockResearch: 'efficient_power',
  },

  // ── Cooling ──
  cooling_tower: {
    type: 'cooling_tower', name: 'Cooling Tower', description: 'Removes heat from nearby buildings. Essential for smelters.',
    category: 'cooling', width: 2, height: 2, cost: 600, powerConsumption: 30,
    heatGeneration: -5, maxDurability: 1, wearRate: 0.0006,
    color: 0x33aadd, icon: '❄', coolingPower: 5, coolingRadius: 4,
  },
  heat_exchanger: {
    type: 'heat_exchanger', name: 'Heat Exchanger', description: 'Advanced cooling. Requires coolant supply.',
    category: 'cooling', width: 2, height: 2, cost: 2500, powerConsumption: 50,
    heatGeneration: -10, maxDurability: 1, wearRate: 0.0008,
    color: 0x2299cc, icon: '🌊', unlockResearch: 'advanced_cooling',
    coolingPower: 10, coolingRadius: 6,
    recipe: { inputs: [{ resource: 'coolant', amount: 1 }], outputs: [], ticksPerCycle: 200 },
  },
  cryo_unit: {
    type: 'cryo_unit', name: 'Cryo Unit', description: 'Industrial cryo cooling. Handles reactor heat.',
    category: 'cooling', width: 3, height: 3, cost: 10000, powerConsumption: 150,
    heatGeneration: -25, maxDurability: 1, wearRate: 0.001,
    color: 0x0088ff, icon: '🧊', unlockResearch: 'cryo_cooling',
    coolingPower: 25, coolingRadius: 8,
    recipe: { inputs: [{ resource: 'coolant', amount: 2 }, { resource: 'ice', amount: 1 }], outputs: [], ticksPerCycle: 150 },
  },

  // ── Maintenance ──
  repair_bay: {
    type: 'repair_bay', name: 'Repair Bay', description: 'Auto-repairs nearby buildings using spare parts.',
    category: 'maintenance', width: 2, height: 2, cost: 1000, powerConsumption: 20,
    heatGeneration: 0.5, maxDurability: 1, wearRate: 0.0003,
    color: 0x33aa55, icon: '🔧',
    recipe: { inputs: [{ resource: 'spare_parts', amount: 1 }], outputs: [], ticksPerCycle: 100 },
  },
  maintenance_hub: {
    type: 'maintenance_hub', name: 'Maintenance Hub', description: 'Reduces wear rate of all buildings in radius.',
    category: 'maintenance', width: 3, height: 3, cost: 4000, powerConsumption: 40,
    heatGeneration: 1, maxDurability: 1, wearRate: 0.0002,
    color: 0x44bb66, icon: '🏭', unlockResearch: 'maintenance_network',
  },

  // ── Stability ──
  support_pillar: {
    type: 'support_pillar', name: 'Support Pillar', description: 'Increases stability of surrounding area.',
    category: 'stability', width: 1, height: 1, cost: 200, powerConsumption: 0,
    heatGeneration: 0, maxDurability: 1, wearRate: 0.0001,
    color: 0x999988, icon: '┃', stabilityBonus: 20, stabilityRadius: 3,
  },
  rock_bolter: {
    type: 'rock_bolter', name: 'Rock Bolter', description: 'Reinforces cave walls. Larger stability area.',
    category: 'stability', width: 1, height: 1, cost: 800, powerConsumption: 10,
    heatGeneration: 0, maxDurability: 1, wearRate: 0.0005,
    color: 0xaa9977, icon: '🔩', unlockResearch: 'cave_engineering',
    stabilityBonus: 40, stabilityRadius: 5,
  },
  water_pump: {
    type: 'water_pump', name: 'Water Pump', description: 'Removes water from flooded areas.',
    category: 'stability', width: 1, height: 1, cost: 400, powerConsumption: 15,
    heatGeneration: 0.5, maxDurability: 1, wearRate: 0.0006,
    color: 0x3366aa, icon: '💧',
  },
  gas_vent: {
    type: 'gas_vent', name: 'Gas Vent', description: 'Vents dangerous gas buildup.',
    category: 'stability', width: 1, height: 1, cost: 300, powerConsumption: 10,
    heatGeneration: 0, maxDurability: 1, wearRate: 0.0004,
    color: 0x88aa33, icon: '🌬',
  },

  // ── Commerce ──
  selling_terminal: {
    type: 'selling_terminal', name: 'Selling Terminal', description: 'Sell stored resources at market price.',
    category: 'commerce', width: 2, height: 2, cost: 1500, powerConsumption: 10,
    heatGeneration: 0, maxDurability: 1, wearRate: 0.0002,
    color: 0x33aa88, icon: '💰',
  },
  research_lab: {
    type: 'research_lab', name: 'Research Lab', description: 'Consumes research packs to unlock technologies.',
    category: 'commerce', width: 3, height: 3, cost: 3000, powerConsumption: 50,
    heatGeneration: 1, maxDurability: 1, wearRate: 0.0004,
    color: 0x3355dd, icon: '🔬',
  },
  contract_office: {
    type: 'contract_office', name: 'Contract Office', description: 'Accept and manage delivery contracts.',
    category: 'commerce', width: 2, height: 2, cost: 1000, powerConsumption: 5,
    heatGeneration: 0, maxDurability: 1, wearRate: 0.0002,
    color: 0xaa8833, icon: '📋',
  },

  // ── Misc ──
  lamp: {
    type: 'lamp', name: 'Lamp', description: 'Reveals nearby area. Cheap.',
    category: 'misc', width: 1, height: 1, cost: 50, powerConsumption: 2,
    heatGeneration: 0, maxDurability: 1, wearRate: 0.0001,
    color: 0xffdd55, icon: '💡',
  },
  radar: {
    type: 'radar', name: 'Radar Scanner', description: 'Reveals ore veins and hazards in a large area.',
    category: 'misc', width: 2, height: 2, cost: 2000, powerConsumption: 30,
    heatGeneration: 0.5, maxDurability: 1, wearRate: 0.0005,
    color: 0x55ddaa, icon: '📡', unlockResearch: 'radar_scanning',
  },
};

export const BUILDING_LIST = Object.values(BUILDINGS);

export function getBuildingsByCategory(category: BuildingDef['category']): BuildingDef[] {
  return BUILDING_LIST.filter(b => b.category === category);
}

// Additional recipes for smelter/refinery/assembler (selectable)
export const RECIPES = [
  // Smelter recipes
  { id: 'smelt_iron', name: 'Smelt Iron', building: 'smelter' as const, inputs: [{ resource: 'iron_ore' as const, amount: 2 }], outputs: [{ resource: 'iron_ingot' as const, amount: 1 }], ticksPerCycle: 30 },
  { id: 'smelt_copper', name: 'Smelt Copper', building: 'smelter' as const, inputs: [{ resource: 'copper_ore' as const, amount: 2 }], outputs: [{ resource: 'copper_ingot' as const, amount: 1 }], ticksPerCycle: 30 },
  { id: 'smelt_gold', name: 'Smelt Gold', building: 'smelter' as const, inputs: [{ resource: 'gold_ore' as const, amount: 3 }], outputs: [{ resource: 'gold_ingot' as const, amount: 1 }], ticksPerCycle: 50 },
  { id: 'refine_crystal', name: 'Refine Crystal', building: 'smelter' as const, inputs: [{ resource: 'crystal_ore' as const, amount: 2 }], outputs: [{ resource: 'crystal' as const, amount: 1 }], ticksPerCycle: 60 },
  // Refinery recipes
  { id: 'make_steel', name: 'Make Steel', building: 'refinery' as const, inputs: [{ resource: 'iron_ingot' as const, amount: 2 }, { resource: 'coal' as const, amount: 1 }], outputs: [{ resource: 'steel' as const, amount: 1 }], ticksPerCycle: 50 },
  { id: 'make_coolant', name: 'Make Coolant', building: 'refinery' as const, inputs: [{ resource: 'ice' as const, amount: 3 }, { resource: 'copper_ingot' as const, amount: 1 }], outputs: [{ resource: 'coolant' as const, amount: 2 }], ticksPerCycle: 40 },
  { id: 'make_explosives', name: 'Make Explosives', building: 'refinery' as const, inputs: [{ resource: 'coal' as const, amount: 3 }, { resource: 'stone' as const, amount: 2 }], outputs: [{ resource: 'explosives' as const, amount: 1 }], ticksPerCycle: 60 },
  { id: 'make_uranium_rod', name: 'Enrich Uranium', building: 'refinery' as const, inputs: [{ resource: 'uranium_ore' as const, amount: 5 }], outputs: [{ resource: 'uranium_rod' as const, amount: 1 }], ticksPerCycle: 100 },
  // Assembler recipes
  { id: 'make_circuit', name: 'Make Circuit', building: 'assembler' as const, inputs: [{ resource: 'copper_ingot' as const, amount: 2 }, { resource: 'iron_ingot' as const, amount: 1 }], outputs: [{ resource: 'circuit' as const, amount: 1 }], ticksPerCycle: 60 },
  { id: 'make_adv_circuit', name: 'Advanced Circuit', building: 'assembler' as const, inputs: [{ resource: 'circuit' as const, amount: 2 }, { resource: 'gold_ingot' as const, amount: 1 }, { resource: 'crystal' as const, amount: 1 }], outputs: [{ resource: 'advanced_circuit' as const, amount: 1 }], ticksPerCycle: 100 },
  { id: 'make_spare_parts', name: 'Make Spare Parts', building: 'assembler' as const, inputs: [{ resource: 'iron_ingot' as const, amount: 2 }, { resource: 'steel' as const, amount: 1 }], outputs: [{ resource: 'spare_parts' as const, amount: 2 }], ticksPerCycle: 40 },
  { id: 'make_research_pack', name: 'Research Pack', building: 'assembler' as const, inputs: [{ resource: 'circuit' as const, amount: 1 }, { resource: 'crystal' as const, amount: 1 }, { resource: 'steel' as const, amount: 1 }], outputs: [{ resource: 'research_pack' as const, amount: 1 }], ticksPerCycle: 80 },
  { id: 'make_energy_cell', name: 'Energy Cell', building: 'assembler' as const, inputs: [{ resource: 'advanced_circuit' as const, amount: 1 }, { resource: 'uranium_rod' as const, amount: 1 }, { resource: 'steel' as const, amount: 2 }], outputs: [{ resource: 'energy_cell' as const, amount: 1 }], ticksPerCycle: 120 },
];
