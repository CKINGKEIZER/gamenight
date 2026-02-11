# Deep Shaft Syndicate

A browser-based sandbox automation game. Build an underground mining and processing empire in a procedurally generated cavern. Automate extraction, transport, processing, and shipping while managing power, heat, maintenance, cave stability, and a volatile market.

## Quick Start

```bash
npm install
npm run dev        # Start dev server on http://localhost:3000
npm run build      # Production build to dist/
npm run test       # Run simulation tests
```

## Controls

| Key | Action |
|-----|--------|
| WASD / Arrow Keys | Move player |
| Mouse Click | Place building / Click entity |
| Right Click | Cancel build mode |
| R | Rotate building direction |
| ESC | Cancel build/delete mode |
| Mouse Wheel | Zoom in/out |

## Gameplay

1. **Move** your character (green circle) through the starting cavern with WASD
2. **Dig** adjacent rock tiles using the Dig button in the toolbar
3. **Build** structures: select a category at the bottom, then pick a building
4. **Power everything**: place Coal Generators and connect with Power Lines
5. **Mine**: place Mining Rigs near ore veins; connect output with Conveyors
6. **Process**: Smelters turn ore into ingots; Refineries and Assemblers make components
7. **Sell**: route products to a Selling Terminal to earn money
8. **Research**: build a Research Lab and store resources to unlock advanced tech
9. **Expand**: go deeper for rarer ores, manage increasing heat and instability

## Building Categories

- **Mine**: Mining Rig, Advanced Drill, Blast Miner
- **Logistics**: Conveyor, Splitter, Merger, Storage
- **Processing**: Smelter, Refinery, Assembler
- **Power**: Coal Generator, Gas Generator, Nuclear Reactor, Power Line, Battery, Transformer
- **Cooling**: Cooling Tower, Heat Exchanger, Cryo Unit
- **Maintenance**: Repair Bay, Maintenance Hub
- **Stability**: Support Pillar, Rock Bolter, Water Pump, Gas Vent
- **Commerce**: Selling Terminal, Research Lab, Contract Office
- **Misc**: Lamp, Radar Scanner

## Systems

### Logistics
Conveyors move items directionally. Splitters divide output two ways. Mergers combine inputs. Belts jam when output is blocked — design buffer storage to prevent cascades.

### Power Grid
Buildings connected via Power Lines form networks. Generators produce kW; consumers draw kW. Batteries store excess. Under-powered buildings shut down. Use Transformers to reduce line loss.

### Heat
Smelters and reactors generate heat. Cooling Towers, Heat Exchangers, and Cryo Units remove it. Overheating (>150°C) damages buildings. Nuclear reactors above 300°C trigger a **meltdown** — massive area destruction.

### Maintenance
All buildings wear over time. At 0% durability they break. Repair Bays auto-fix nearby buildings if supplied with Spare Parts. Maintenance Hubs slow wear in an area.

### Cave Stability
Mining reduces stability. Support Pillars and Rock Bolters reinforce areas. Low stability triggers cave-ins that destroy buildings and block passages. Gas pockets can explode near heat sources. Water seepage requires pumps.

### Economy
Dynamic market prices fluctuate. Contracts offer delivery rewards with deadlines. Loans provide capital with daily interest. Reputation improves with completed contracts and unlocks better deals.

### Research
30+ research nodes across 7 branches. Requires a Research Lab and specific resources stored nearby. Unlocks advanced buildings and global upgrades.

### Events & Achievements
Random events: earthquakes, gas leaks, water breaches, power surges, market crashes/booms. Triggered events: reactor instability, blast miner explosions. 14 achievements tracked locally and synced to cloud.

## Balancing Knobs

All balancing values are in `src/utils/constants.ts`:

| Constant | Default | Description |
|----------|---------|-------------|
| `STARTING_MONEY` | 5000 | Initial cash |
| `SIM_TICK_MS` | 100 | Sim tick interval (ms) |
| `TICKS_PER_DAY` | 6000 | Game ticks per in-game day |
| `CONVEYOR_SPEED` | 1 | Items per tick per belt |
| `OVERHEAT_THRESHOLD` | 150 | °C where damage starts |
| `MELTDOWN_THRESHOLD` | 300 | °C for nuclear meltdown |
| `BASE_STABILITY` | 100 | Starting cave stability |
| `LOAN_INTEREST_RATE` | 0.05 | Daily interest rate |
| `BASE_WEAR_RATE` | 0.001 | Per-tick wear multiplier |

Building definitions in `src/content/buildings.ts`, resources in `src/content/resources.ts`, research in `src/content/research.ts`, recipes in `src/content/buildings.ts` (RECIPES array).

## Supabase Configuration

### 1. Create Project
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your **Project URL** and **anon public key** from Settings > API

### 2. Environment Variables
Create `.env` in the project root:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Database Schema
Run the SQL in `supabase/schema.sql` in Supabase SQL Editor. This creates:
- `profiles` table with RLS
- `saves` table (5 slots per user) with RLS
- `achievements` table with RLS
- All required policies

### 4. Enable Google Auth
1. Supabase Dashboard > Authentication > Providers > Google
2. Enable Google provider
3. Set OAuth credentials from Google Cloud Console
4. Add redirect URLs:
   - `http://localhost:3000` (development)
   - `https://your-app.vercel.app` (production)

### 5. Configure Redirect URLs
In Supabase Dashboard > Authentication > URL Configuration:
- Site URL: `https://your-app.vercel.app`
- Redirect URLs: add both `http://localhost:3000` and `https://your-app.vercel.app`

## Save System

### Local Saves
- **Autosave** every 30 seconds to IndexedDB (with localStorage fallback)
- **Manual save** via Save panel
- **Export/Import** JSON files

### Cloud Saves (when logged in)
- 5 cloud save slots (0-4) per user
- **Cloud autosave** every 120 seconds to active slot
- **Conflict resolution**: if cloud is newer, prompted to choose local or cloud
- Saves compressed with LZ-String before storage

### Guest-to-Account Merge
When a guest logs in, they're offered the option to upload their local save to cloud slot 0.

## Deploying to Vercel

```bash
npm run build
# Deploy dist/ to Vercel
```

Add environment variables in Vercel project settings:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Build command: `npm run build`
Output directory: `dist`

## Project Structure

```
src/
  sim/              # Deterministic simulation logic
    types.ts        # All type definitions
    WorldGen.ts     # Procedural world generation
    SimLoop.ts      # Main sim loop + serialization
    PowerService.ts # Power grid simulation
    HeatService.ts  # Heat/cooling simulation
    LogisticsService.ts  # Conveyor/storage item flow
    MiningService.ts     # Resource extraction
    ProcessingService.ts # Smelter/refinery/assembler
    EconomyService.ts    # Market, contracts, loans
    StabilityService.ts  # Cave stability, hazards
    MaintenanceService.ts # Wear, repair
    ResearchService.ts   # Tech tree
    EventService.ts      # Random events, achievements
  render/
    GameScene.ts    # Phaser 3 game scene, rendering, input
  ui/
    UIManager.ts    # All UI panels, tooltips, overlays
    AuthModal.ts    # Auth modal + session management
    SaveModal.ts    # Quick save modal
  content/
    buildings.ts    # Building definitions + recipes
    resources.ts    # Resource definitions
    research.ts     # Research tree (30+ nodes)
    events.ts       # Event definitions + achievements
  persistence/
    LocalStorage.ts # IndexedDB + localStorage saves
    SupabaseClient.ts # Supabase auth + cloud saves
    SaveManager.ts  # Save orchestration + sync
  utils/
    constants.ts    # All balancing constants
    helpers.ts      # Utility functions
  main.ts           # Entry point
supabase/
  schema.sql        # Database schema + RLS policies
tests/
  sim.test.ts       # 31 simulation tests
```

## Tech Stack

- **Vite** - Build tool
- **TypeScript** - Type safety
- **Phaser 3** - 2D game engine (rendering, input, camera)
- **Supabase** - Auth (Google OAuth + email) + PostgreSQL (saves, achievements)
- **LZ-String** - Save compression
- **Vitest** - Testing

## License

ISC
