import type { GameState, Entity, PowerNetwork } from './types';
import { BUILDINGS } from '../content/buildings';
import { tileKey, genId } from '../utils/helpers';
import { POWER_LINE_LOSS_PER_TILE, BATTERY_CHARGE_RATE } from '../utils/constants';

/**
 * Power grid simulation:
 * - Generators produce power
 * - Consumers draw power
 * - Power lines connect buildings into networks
 * - Batteries store excess and discharge deficit
 * - Satisfaction ratio determines building operation
 */

export function updatePowerGrid(state: GameState): void {
  // Build adjacency graph via power lines and direct connections
  const networks = buildPowerNetworks(state);

  let totalGen = 0;
  let totalCons = 0;
  let totalBatStored = 0;
  let totalBatCap = 0;

  for (const network of networks) {
    let gen = 0;
    let cons = 0;
    let batStored = 0;
    let batCap = 0;

    // Calculate generation
    for (const gid of network.generatorIds) {
      const e = state.entities.get(gid);
      if (!e || !e.enabled || e.durability <= 0) continue;
      const def = BUILDINGS[e.type];

      // Generators that need fuel - check if they have fuel
      if (def.recipe && def.powerGeneration) {
        const hasInput = (e.data['hasInput'] as boolean) ?? false;
        if (hasInput) {
          gen += def.powerGeneration * e.durability;
        }
      } else if (def.powerGeneration) {
        // Gas generator - check if near gas
        if (e.type === 'gas_generator') {
          const nearGas = checkNearGas(state, e);
          if (nearGas) gen += def.powerGeneration * e.durability;
        } else {
          gen += def.powerGeneration * e.durability;
        }
      }
    }

    // Calculate consumption
    for (const cid of network.consumerIds) {
      const e = state.entities.get(cid);
      if (!e || !e.enabled || e.durability <= 0) continue;
      const def = BUILDINGS[e.type];
      cons += def.powerConsumption;
    }

    // Battery state
    for (const bid of network.batteryIds) {
      const e = state.entities.get(bid);
      if (!e || !e.enabled || e.durability <= 0) continue;
      const def = BUILDINGS[e.type];
      const stored = (e.data['stored'] as number) ?? 0;
      const cap = def.batteryCapacity ?? 0;
      batStored += stored;
      batCap += cap;
    }

    // Calculate satisfaction
    let available = gen;
    const deficit = cons - gen;

    if (deficit > 0 && batStored > 0) {
      // Discharge batteries
      const discharge = Math.min(deficit, batStored, BATTERY_CHARGE_RATE);
      available += discharge;
      // Distribute discharge across batteries
      for (const bid of network.batteryIds) {
        const e = state.entities.get(bid);
        if (!e) continue;
        const stored = (e.data['stored'] as number) ?? 0;
        const share = stored / (batStored || 1);
        e.data['stored'] = Math.max(0, stored - discharge * share);
      }
      batStored -= discharge;
    } else if (deficit < 0 && batCap > batStored) {
      // Charge batteries
      const excess = -deficit;
      const charge = Math.min(excess, batCap - batStored, BATTERY_CHARGE_RATE);
      for (const bid of network.batteryIds) {
        const e = state.entities.get(bid);
        if (!e) continue;
        const def = BUILDINGS[e.type];
        const stored = (e.data['stored'] as number) ?? 0;
        const cap = def.batteryCapacity ?? 0;
        const share = (cap - stored) / (batCap - batStored || 1);
        e.data['stored'] = Math.min(cap, stored + charge * share);
      }
      batStored += charge;
    }

    const satisfaction = cons > 0 ? Math.min(1, available / cons) : 1;

    // Apply power state to entities
    for (const cid of network.consumerIds) {
      const e = state.entities.get(cid);
      if (e) e.powered = satisfaction >= 0.5;
    }
    for (const gid of network.generatorIds) {
      const e = state.entities.get(gid);
      if (e) e.powered = true;
    }

    network.totalGeneration = gen;
    network.totalConsumption = cons;
    network.satisfaction = satisfaction;

    totalGen += gen;
    totalCons += cons;
    totalBatStored += batStored;
    totalBatCap += batCap;
  }

  // Mark disconnected entities as unpowered
  const connectedIds = new Set<string>();
  for (const n of networks) {
    for (const id of [...n.generatorIds, ...n.consumerIds, ...n.batteryIds]) {
      connectedIds.add(id);
    }
  }
  for (const [id, e] of state.entities) {
    const def = BUILDINGS[e.type];
    if (def.powerConsumption > 0 && !connectedIds.has(id)) {
      e.powered = false;
    }
    // Buildings with 0 power consumption are always "powered"
    if (def.powerConsumption === 0 && !def.powerGeneration) {
      e.powered = true;
    }
  }

  state.powerGrid = {
    totalGeneration: totalGen,
    totalConsumption: totalCons,
    totalBatteryStored: totalBatStored,
    totalBatteryCapacity: totalBatCap,
    networks,
  };
}

function checkNearGas(state: GameState, entity: Entity): boolean {
  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = -3; dy <= 3; dy++) {
      const tile = state.tiles.get(tileKey(entity.x + dx, entity.y + dy));
      if (tile && (tile.type === 'gas_pocket' || tile.gasLevel > 0.2)) return true;
    }
  }
  return false;
}

function buildPowerNetworks(state: GameState): PowerNetwork[] {
  // Build a set of power-relevant entities and power lines
  const powerEntities = new Map<string, Entity>();
  const powerLinePositions = new Set<string>();

  for (const [id, e] of state.entities) {
    if (e.durability <= 0) continue;
    const def = BUILDINGS[e.type];
    if (e.type === 'power_line') {
      powerLinePositions.add(tileKey(e.x, e.y));
    }
    if (def.powerGeneration || def.powerConsumption > 0 || def.batteryCapacity) {
      powerEntities.set(id, e);
    }
  }

  // Flood fill networks via adjacency
  const visited = new Set<string>();
  const entityNetwork = new Map<string, number>(); // entityId -> network index
  const networks: PowerNetwork[] = [];

  // Consider entities connected if they share tiles with power lines or are adjacent
  for (const [id, e] of powerEntities) {
    if (entityNetwork.has(id)) continue;

    const network: PowerNetwork = {
      id: genId(),
      generatorIds: [],
      consumerIds: [],
      batteryIds: [],
      totalGeneration: 0,
      totalConsumption: 0,
      satisfaction: 0,
    };
    const nIdx = networks.length;
    networks.push(network);

    // BFS from this entity through power lines
    const queue: string[] = [];

    // Add all tiles of this entity as starting points
    for (let tx = e.x; tx < e.x + e.width; tx++) {
      for (let ty = e.y; ty < e.y + e.height; ty++) {
        const key = tileKey(tx, ty);
        if (!visited.has(key)) {
          visited.add(key);
          queue.push(key);
        }
      }
    }
    entityNetwork.set(id, nIdx);
    categorizeEntity(e, id, network);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const [cx, cy] = current.split(',').map(Number);

      // Check 4 neighbors
      for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        const nkey = tileKey(nx, ny);
        if (visited.has(nkey)) continue;

        // Check if neighbor is a power line
        if (powerLinePositions.has(nkey)) {
          visited.add(nkey);
          queue.push(nkey);
          continue;
        }

        // Check if neighbor belongs to a power entity
        const tile = state.tiles.get(nkey);
        if (tile && tile.entityId) {
          const neighborEntity = state.entities.get(tile.entityId);
          if (neighborEntity && powerEntities.has(tile.entityId) && !entityNetwork.has(tile.entityId)) {
            entityNetwork.set(tile.entityId, nIdx);
            categorizeEntity(neighborEntity, tile.entityId, network);
            // Add all tiles of this entity
            for (let tx = neighborEntity.x; tx < neighborEntity.x + neighborEntity.width; tx++) {
              for (let ty = neighborEntity.y; ty < neighborEntity.y + neighborEntity.height; ty++) {
                const ekey = tileKey(tx, ty);
                if (!visited.has(ekey)) {
                  visited.add(ekey);
                  queue.push(ekey);
                }
              }
            }
          }
        }
      }
    }
  }

  return networks;
}

function categorizeEntity(e: Entity, id: string, network: PowerNetwork): void {
  const def = BUILDINGS[e.type];
  if (def.powerGeneration) {
    network.generatorIds.push(id);
  }
  if (def.powerConsumption > 0) {
    network.consumerIds.push(id);
  }
  if (def.batteryCapacity) {
    network.batteryIds.push(id);
  }
}
