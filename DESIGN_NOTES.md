# Deep Shaft Syndicate — Design Notes

## Architecture

### Simulation-Render Separation
The simulation (`src/sim/`) is entirely deterministic and runs on a fixed timestep (100ms ticks). Rendering (`src/render/`) interpolates visual state from the sim. This ensures:
- Deterministic replay potential
- Consistent behavior regardless of frame rate
- Speed controls work by multiplying the accumulator, not changing tick rate

### Fixed Timestep Loop
```
accumulator += deltaTime * speed
while accumulator >= SIM_TICK_MS:
    simTick(state)
    accumulator -= SIM_TICK_MS
```
A "spiral of death" guard limits to 20 ticks per frame.

### Entity-Component-ish Design
Entities are stored in a flat `Map<string, Entity>` with a generic `data: Record<string, unknown>` bag for type-specific state (input buffers, cycle progress, recipes). This keeps the core type simple while allowing building-specific behavior in each service.

### Tile Grid
200x150 tiles, each 32px. Tiles store: type, stability, temperature, gas level, water level, entity reference. Tiles are the spatial index — entity lookup by position goes through tile.entityId.

## Simulation Services

Each service is a pure function: `update(state: GameState) -> void`. They mutate state in place for performance. Execution order matters:

1. **PowerService** — builds networks, calculates satisfaction, sets entity.powered
2. **MiningService** — extracts from veins into output buffers
3. **ProcessingService** — consumes inputs, produces outputs, manages recipes
4. **LogisticsService** — moves items along conveyors, delivers to storages
5. **HeatService** — generates/dissipates heat, applies overheat damage
6. **MaintenanceService** — applies wear, runs repair bays
7. **StabilityService** — support structures, pumps, cave-ins, flooding
8. **ResearchService** — consumes stored resources, advances progress
9. **EconomyService** — market fluctuation, sales, contracts, loans
10. **EventService** — random events, achievement checks

### Power Grid Algorithm
Builds networks via BFS flood-fill through power lines and adjacent power-relevant buildings. Each network calculates generation, consumption, battery state independently. Satisfaction ratio determines if consumers get power.

### Logistics Flow
Items are modeled as `ConveyorItem` with a progress float (0..1) along the belt. When progress >= 1, the item attempts to transfer to the next entity in the facing direction. If blocked, progress stays at 0.99 (jam). Jams cascade backward naturally.

### Market Price Model
Each resource has a `demand` value (-0.8 to 0.8) that random-walks with resource-tier-scaled volatility. Price = basePrice * (1 + demand * 0.5). Selling pushes demand down (supply pressure). Market events can spike or crash demand.

### Cave Stability
Each tile has a stability value (0-100). Mining operations and empty space reduce stability. Support structures add stability in a radius. Below threshold 10, there's a probability of cave-in proportional to how far below threshold. Cave-ins convert tiles to rock and destroy buildings.

## Formulas

### Heat
```
entityTemp += heatGeneration * 0.1  (per tick when operating)
entityTemp += (ambientTemp - entityTemp) * HEAT_DISSIPATION_RATE  (ambient pull)
ambientTemp = 20 + depth * 0.5  (°C)
```

### Cooling Effect
```
for each entity in coolingRadius:
    factor = 1 - distance / (radius + 1)
    entity.temp -= coolingPower * factor * 0.1
```

### Wear
```
wear = def.wearRate * hubReduction * nanoRepairMult
durability -= wear  (per tick when operating)
```

### Market
```
demand += random(-0.5, 0.5) * volatility * tradeEmpireMult
price = basePrice * (1 + demand * 0.5) * marketMasteryMult
```

### Stability
```
support: tile.stability += bonus * distanceFactor * 0.01 (per tick)
decay: tile.stability -= 0.005 (per tick for empty/occupied tiles)
cave-in chance: (threshold - stability) / threshold * 0.01
```

## Extension Points

### Adding Buildings
1. Add type to `BuildingType` union in `src/sim/types.ts`
2. Add definition to `BUILDINGS` in `src/content/buildings.ts`
3. If it has a recipe, add to `RECIPES` array
4. If it needs special logic, add handling in the appropriate service
5. If locked, add a research node in `src/content/research.ts`

### Adding Resources
1. Add type to `ResourceType` union in `src/sim/types.ts`
2. Add definition to `RESOURCES` in `src/content/resources.ts`
3. Add ore vein type to `TileType` if minable
4. Add to `VEIN_TYPES` in `WorldGen.ts` for world generation
5. Add recipes that use/produce it

### Adding Research
Add to `RESEARCH_TREE` in `src/content/research.ts`. Must specify:
- `id`, `name`, `description`
- `branch` (for UI grouping)
- `cost` (resource requirements)
- `ticksRequired`
- `prerequisites` (array of research IDs)
- `unlocks` (array of building types or upgrade keys)

Upgrade keys are checked in services via `state.research.completed.includes('key')`.

### Adding Events
Add to `createGameEvents()` in `src/content/events.ts`:
- `triggerCondition`: pure function of state, return boolean
- `effect`: mutate state (add alerts, damage entities, etc.)
- `cooldownTicks`: minimum ticks between triggers

### Adding Achievements
Add to `ACHIEVEMENTS` in `src/content/events.ts`:
- `key`: unique identifier (synced to cloud)
- `condition`: pure function of state

## Failure Modes (By Design)

### Conveyor Jam Cascade
When a belt's output is blocked, items pile up, which blocks the upstream belt, which blocks the one before it... Eventually mining rigs stop producing because their output is full. Player must add buffer storage or fix the bottleneck.

### Power Brownout Cascade
If a generator runs out of fuel, its network loses power. Conveyors stop, so fuel stops flowing to generators. If cooling stops too, buildings overheat, taking damage, which increases maintenance load. Player needs batteries as buffer and redundant fuel paths.

### Nuclear Meltdown
The nuclear reactor generates 20 heat/tick. If cooling fails (power loss, coolant shortage, cooling tower breaks), temperature climbs. At 250°C a warning fires. At 300°C: meltdown. Destroys everything within 12 tiles. Costs $5000 cleanup. This is the game's signature disaster.

### Blast Miner Explosion
When a blast miner's durability drops below 15%, it can explode, destroying itself and damaging buildings within 6 tiles. Heavily damages cave stability too.

## Save System Design

### Compression
Saves are compressed with LZ-String (UTF-16 variant for IndexedDB compatibility). Typical save size: 200KB uncompressed → ~50KB compressed. This fits comfortably in Supabase jsonb columns.

### Conflict Resolution
Each save tracks `simTimeMs` (monotonic) and the DB tracks `updated_at` (server timestamp). On sync:
1. Compare cloud `updated_at` vs local last-save time
2. Compare `simTimeMs` to determine which has more gameplay
3. Prompt user — never silently overwrite

### Guest Merge
When a guest logs in, local autosave is offered for upload to cloud slot 0. This preserves progress from anonymous play sessions.

## Performance Notes

- Tiles are only rendered within the camera viewport (frustum culling)
- Events/achievements check every 10/100 ticks, not every tick
- Water flooding and gas spread use batched updates
- Cave-in checks run every 10 ticks
- Entity rendering deduplicates via Set (multi-tile buildings)
- Graphics are redrawn each frame (Phaser Graphics objects, no texture atlas needed)
- Target: 60 FPS with 300+ entities on a mid-range laptop
