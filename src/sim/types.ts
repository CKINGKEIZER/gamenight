import type { Direction } from '../utils/helpers';

// ── Resource Types ──
export type ResourceType =
  | 'iron_ore' | 'copper_ore' | 'gold_ore' | 'crystal_ore' | 'uranium_ore'
  | 'coal' | 'stone' | 'ice'
  | 'iron_ingot' | 'copper_ingot' | 'gold_ingot' | 'crystal'
  | 'steel' | 'circuit' | 'advanced_circuit' | 'uranium_rod'
  | 'spare_parts' | 'coolant' | 'explosives' | 'research_pack'
  | 'energy_cell';

// ── Building Types ──
export type BuildingType =
  | 'mining_rig' | 'advanced_drill' | 'blast_miner'
  | 'conveyor' | 'splitter' | 'merger' | 'storage'
  | 'smelter' | 'refinery' | 'assembler'
  | 'coal_generator' | 'gas_generator' | 'nuclear_reactor'
  | 'power_line' | 'battery' | 'transformer'
  | 'cooling_tower' | 'heat_exchanger' | 'cryo_unit'
  | 'repair_bay' | 'maintenance_hub'
  | 'support_pillar' | 'rock_bolter' | 'water_pump' | 'gas_vent'
  | 'selling_terminal' | 'research_lab' | 'contract_office'
  | 'lamp' | 'radar';

// ── Tile Types ──
export type TileType = 'empty' | 'rock' | 'iron_vein' | 'copper_vein' | 'gold_vein'
  | 'crystal_vein' | 'uranium_vein' | 'coal_vein' | 'gas_pocket' | 'water_pocket'
  | 'bedrock' | 'surface';

// ── Entity ──
export interface Entity {
  id: string;
  type: BuildingType;
  x: number;
  y: number;
  width: number;
  height: number;
  direction: Direction;
  durability: number; // 0..1
  maxDurability: number;
  enabled: boolean;
  powered: boolean;
  temperature: number; // °C
  // Building-specific data
  data: Record<string, unknown>;
}

// ── Inventory Item ──
export interface ItemStack {
  resource: ResourceType;
  amount: number;
}

// ── Conveyor Item ──
export interface ConveyorItem {
  resource: ResourceType;
  progress: number; // 0..1 along the belt
}

// ── Tile ──
export interface Tile {
  type: TileType;
  x: number;
  y: number;
  stability: number;
  revealed: boolean;
  entityId: string | null;
  resourceAmount: number; // ore remaining
  temperature: number;
  gasLevel: number;
  waterLevel: number;
}

// ── Market ──
export interface MarketPrice {
  resource: ResourceType;
  basePrice: number;
  currentPrice: number;
  demand: number; // -1..1
  volatility: number;
}

// ── Contract ──
export interface Contract {
  id: string;
  name: string;
  requirements: ItemStack[];
  reward: number;
  reputationReward: number;
  deadline: number; // tick
  fulfilled: ItemStack[];
  accepted: boolean;
  completed: boolean;
  failed: boolean;
  daily: boolean;
}

// ── Research ──
export interface ResearchNode {
  id: string;
  name: string;
  description: string;
  cost: ItemStack[];
  ticksRequired: number;
  prerequisites: string[];
  unlocks: string[]; // building types or upgrade keys
  branch: string;
}

export interface ResearchState {
  completed: string[];
  current: string | null;
  progress: number; // ticks spent
  inputConsumed: Record<string, number>;
}

// ── Loan ──
export interface Loan {
  id: string;
  principal: number;
  remaining: number;
  interestRate: number;
  daysTaken: number;
  daysRemaining: number;
}

// ── Achievement ──
export interface Achievement {
  key: string;
  name: string;
  description: string;
  condition: (state: GameState) => boolean;
  unlocked: boolean;
}

// ── Alert ──
export interface Alert {
  id: string;
  type: 'danger' | 'warning' | 'info';
  message: string;
  entityId?: string;
  x?: number;
  y?: number;
  tick: number;
  dismissed: boolean;
}

// ── Event ──
export interface GameEvent {
  id: string;
  name: string;
  description: string;
  triggerCondition: (state: GameState) => boolean;
  effect: (state: GameState) => void;
  cooldownTicks: number;
  lastTriggered: number;
  category: 'random' | 'triggered' | 'disaster';
}

// ── Game State ──
export interface GameState {
  // Core
  tick: number;
  simTimeMs: number;
  speed: number; // 0, 1, 2, 5
  day: number;

  // Player
  playerX: number;
  playerY: number;
  money: number;
  reputation: number;

  // World
  tiles: Map<string, Tile>;
  entities: Map<string, Entity>;
  revealedChunks: Set<string>;

  // Systems
  powerGrid: PowerGridState;
  logistics: LogisticsState;
  research: ResearchState;
  market: MarketPrice[];
  contracts: Contract[];
  loans: Loan[];
  alerts: Alert[];
  achievements: Map<string, boolean>;

  // Metadata
  seed: number;
  version: number;
  createdAt: number;
  totalPlayTimeMs: number;
}

export interface PowerGridState {
  totalGeneration: number;
  totalConsumption: number;
  totalBatteryStored: number;
  totalBatteryCapacity: number;
  networks: PowerNetwork[];
}

export interface PowerNetwork {
  id: string;
  generatorIds: string[];
  consumerIds: string[];
  batteryIds: string[];
  totalGeneration: number;
  totalConsumption: number;
  satisfaction: number; // 0..1
}

export interface LogisticsState {
  conveyorItems: Map<string, ConveyorItem[]>; // entityId -> items
  storageContents: Map<string, ItemStack[]>; // entityId -> items
}

// ── Serializable form ──
export interface SerializedGameState {
  tick: number;
  simTimeMs: number;
  speed: number;
  day: number;
  playerX: number;
  playerY: number;
  money: number;
  reputation: number;
  tiles: Array<[string, Tile]>;
  entities: Array<[string, Entity]>;
  revealedChunks: string[];
  powerGrid: PowerGridState;
  logistics: {
    conveyorItems: Array<[string, ConveyorItem[]]>;
    storageContents: Array<[string, ItemStack[]]>;
  };
  research: ResearchState;
  market: MarketPrice[];
  contracts: Contract[];
  loans: Loan[];
  alerts: Alert[];
  achievements: Array<[string, boolean]>;
  seed: number;
  version: number;
  createdAt: number;
  totalPlayTimeMs: number;
}

// ── Building Definition (data-driven) ──
export interface BuildingDef {
  type: BuildingType;
  name: string;
  description: string;
  category: 'mining' | 'logistics' | 'processing' | 'power' | 'cooling' | 'maintenance' | 'stability' | 'commerce' | 'misc';
  width: number;
  height: number;
  cost: number;
  buildResources?: ItemStack[];
  powerConsumption: number; // kW, negative = generates
  heatGeneration: number; // °C/tick
  maxDurability: number;
  wearRate: number; // per tick
  unlockResearch?: string;
  color: number; // hex color for rendering
  icon: string;
  // Processing
  recipe?: {
    inputs: ItemStack[];
    outputs: ItemStack[];
    ticksPerCycle: number;
  };
  // Storage
  storageCapacity?: number;
  storageFilter?: ResourceType[];
  // Conveyor
  throughput?: number; // items/tick
  // Power
  powerGeneration?: number;
  batteryCapacity?: number;
  // Cooling
  coolingPower?: number; // °C/tick removed
  coolingRadius?: number;
  // Stability
  stabilityBonus?: number;
  stabilityRadius?: number;
  // Mining
  miningSpeed?: number; // resource/tick
  miningRadius?: number;
}

// ── Recipe ──
export interface Recipe {
  id: string;
  name: string;
  building: BuildingType;
  inputs: ItemStack[];
  outputs: ItemStack[];
  ticksPerCycle: number;
}
