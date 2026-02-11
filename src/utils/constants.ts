// Grid and world constants
export const TILE_SIZE = 32;
export const WORLD_WIDTH = 200; // tiles
export const WORLD_HEIGHT = 150; // tiles
export const CHUNK_SIZE = 16; // tiles per chunk

// Simulation
export const SIM_TICK_MS = 100; // 100ms per tick = 10 ticks/sec
export const TICKS_PER_DAY = 6000; // 10 min real = 1 game day at 1x
export const LOCAL_SAVE_INTERVAL_MS = 30_000;
export const CLOUD_SAVE_INTERVAL_MS = 120_000;

// Performance
export const MAX_ENTITIES = 2000;
export const SPATIAL_CELL_SIZE = 8; // tiles per spatial cell

// Economy
export const STARTING_MONEY = 5000;
export const LOAN_INTEREST_RATE = 0.05; // per game day
export const MAX_LOAN_AMOUNT = 50000;
export const CONTRACT_PENALTY_RATE = 0.5; // fraction of reward lost

// Physics/heat
export const AMBIENT_TEMP = 20; // °C at surface
export const TEMP_PER_DEPTH = 0.5; // +°C per tile depth
export const OVERHEAT_THRESHOLD = 150; // °C
export const MELTDOWN_THRESHOLD = 300; // °C
export const HEAT_DISSIPATION_RATE = 0.02; // per tick, fraction to ambient

// Cave stability
export const BASE_STABILITY = 100;
export const STABILITY_DANGER = 30;
export const CAVEIN_THRESHOLD = 10;

// Power
export const POWER_LINE_LOSS_PER_TILE = 0.01; // 1% per tile
export const BATTERY_CHARGE_RATE = 50; // kW
export const BATTERY_CAPACITY = 5000; // kWh (in game units)

// Maintenance
export const BASE_WEAR_RATE = 0.001; // per tick
export const REPAIR_THRESHOLD = 0.3; // auto-repair below this
export const FAILURE_THRESHOLD = 0; // fails at 0

// Conveyor
export const CONVEYOR_SPEED = 1; // items per tick per belt
export const CONVEYOR_CAPACITY = 4; // items on a belt segment
export const STORAGE_DEFAULT_CAPACITY = 100;

// Save
export const MAX_SAVE_SLOTS = 5;
export const SAVE_VERSION = 1;
