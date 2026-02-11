import Phaser from 'phaser';
import type { GameState, Entity, BuildingType, Tile, ConveyorItem } from '../sim/types';
import { BUILDINGS, RECIPES as RECIPES_LIST } from '../content/buildings';
import { RESOURCES } from '../content/resources';
import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from '../utils/constants';
import { tileKey, genId, DIRECTION_OFFSETS, rotateDirection, type Direction } from '../utils/helpers';
import { initSimLoop, stepSimLoop, serializeState, deserializeState } from '../sim/SimLoop';
import { createInitialGameState } from '../sim/WorldGen';
import { isUnlocked } from '../sim/ResearchService';
import { saveManager } from '../persistence/SaveManager';

// Tile colors
const TILE_COLORS: Record<string, number> = {
  empty: 0x1a1a2e,
  rock: 0x444455,
  surface: 0x556644,
  bedrock: 0x222222,
  iron_vein: 0x8B4513,
  copper_vein: 0xB87333,
  gold_vein: 0xDAA520,
  crystal_vein: 0x9932CC,
  uranium_vein: 0x32CD32,
  coal_vein: 0x3a3a3a,
  gas_pocket: 0x556B2F,
  water_pocket: 0x1E90FF,
};

export type OverlayMode = 'none' | 'power' | 'heat' | 'throughput' | 'stability';

export class GameScene extends Phaser.Scene {
  state!: GameState;

  // Rendering
  private tileGraphics!: Phaser.GameObjects.Graphics;
  private entityGraphics!: Phaser.GameObjects.Graphics;
  private overlayGraphics!: Phaser.GameObjects.Graphics;
  private playerGraphics!: Phaser.GameObjects.Graphics;
  private itemGraphics!: Phaser.GameObjects.Graphics;
  private uiCamera!: Phaser.Cameras.Scene2D.Camera;

  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  // Build mode
  buildMode: BuildingType | null = null;
  buildDirection: Direction = 'right';
  private ghostX = 0;
  private ghostY = 0;
  deleteMode = false;
  copyMode = false;

  // Overlay
  overlayMode: OverlayMode = 'none';

  // Camera
  private cameraSpeed = 400;
  private zoomLevel = 1;

  // Viewport culling
  private visibleTiles: Set<string> = new Set();
  private lastCamX = -1;
  private lastCamY = -1;

  // Callbacks for UI
  onStateUpdate?: (state: GameState) => void;
  onEntityClick?: (entityId: string) => void;
  onTileHover?: (x: number, y: number, tile: Tile | null) => void;
  onEntityHover?: (entity: Entity | null) => void;
  onBuildComplete?: () => void;

  constructor() {
    super({ key: 'GameScene' });
  }

  async create(): Promise<void> {
    // Try loading saved game
    const saved = await saveManager.loadLocalAutosave();
    if (saved) {
      this.state = saved;
    } else {
      this.state = createInitialGameState();
    }

    initSimLoop(this.state);

    // Create graphics layers
    this.tileGraphics = this.add.graphics();
    this.entityGraphics = this.add.graphics();
    this.itemGraphics = this.add.graphics();
    this.overlayGraphics = this.add.graphics();
    this.playerGraphics = this.add.graphics();

    // Set world bounds
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH * TILE_SIZE, WORLD_HEIGHT * TILE_SIZE);
    this.cameras.main.setZoom(this.zoomLevel);

    // Center on player
    this.cameras.main.centerOn(
      this.state.playerX * TILE_SIZE,
      this.state.playerY * TILE_SIZE
    );

    // Input
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = {
        W: this.input.keyboard.addKey('W'),
        A: this.input.keyboard.addKey('A'),
        S: this.input.keyboard.addKey('S'),
        D: this.input.keyboard.addKey('D'),
      };
      this.keys = {
        R: this.input.keyboard.addKey('R'),
        Q: this.input.keyboard.addKey('Q'),
        E: this.input.keyboard.addKey('E'),
        ESC: this.input.keyboard.addKey('ESC'),
        DEL: this.input.keyboard.addKey('DELETE'),
      };
    }

    // Mouse input
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        this.buildMode = null;
        this.deleteMode = false;
        this.copyMode = false;
        return;
      }
      this.handleClick(pointer);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.handleHover(pointer);
    });

    // Zoom
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gx: number[], _gy: number[], _gz: number[], dy: number) => {
      const delta = dy > 0 ? -0.1 : 0.1;
      this.zoomLevel = Phaser.Math.Clamp(this.zoomLevel + delta, 0.3, 3);
      this.cameras.main.setZoom(this.zoomLevel);
    });

    // Right click to cancel
    this.input.mouse?.disableContextMenu();
  }

  update(time: number, delta: number): void {
    // Simulation
    stepSimLoop(this.state, delta);

    // Player movement
    this.updatePlayerMovement(delta);

    // Camera follow
    this.cameras.main.centerOn(
      this.state.playerX * TILE_SIZE + TILE_SIZE / 2,
      this.state.playerY * TILE_SIZE + TILE_SIZE / 2
    );

    // Reveal tiles near player
    this.revealNearPlayer();

    // Render
    this.renderWorld();

    // Rotation key
    if (this.keys?.R && Phaser.Input.Keyboard.JustDown(this.keys.R)) {
      this.buildDirection = rotateDirection(this.buildDirection);
    }
    if (this.keys?.ESC && Phaser.Input.Keyboard.JustDown(this.keys.ESC)) {
      this.buildMode = null;
      this.deleteMode = false;
      this.copyMode = false;
    }

    // Save manager tick
    saveManager.tick(this.state, Date.now());

    // UI callback
    this.onStateUpdate?.(this.state);
  }

  private updatePlayerMovement(delta: number): void {
    const speed = 0.15;
    let dx = 0, dy = 0;

    if (this.wasd?.A?.isDown || this.cursors?.left?.isDown) dx -= speed;
    if (this.wasd?.D?.isDown || this.cursors?.right?.isDown) dx += speed;
    if (this.wasd?.W?.isDown || this.cursors?.up?.isDown) dy -= speed;
    if (this.wasd?.S?.isDown || this.cursors?.down?.isDown) dy += speed;

    if (dx !== 0 || dy !== 0) {
      const newX = this.state.playerX + dx;
      const newY = this.state.playerY + dy;

      // Collision check
      const tileX = Math.floor(newX);
      const tileY = Math.floor(newY);
      const tile = this.state.tiles.get(tileKey(tileX, tileY));

      if (tile && (tile.type === 'empty' || tile.type === 'surface') && !tile.entityId) {
        this.state.playerX = Phaser.Math.Clamp(newX, 0, WORLD_WIDTH - 1);
        this.state.playerY = Phaser.Math.Clamp(newY, 0, WORLD_HEIGHT - 1);
      } else {
        // Try just X
        const tileXOnly = this.state.tiles.get(tileKey(Math.floor(newX), Math.floor(this.state.playerY)));
        if (tileXOnly && (tileXOnly.type === 'empty' || tileXOnly.type === 'surface') && !tileXOnly.entityId) {
          this.state.playerX = Phaser.Math.Clamp(newX, 0, WORLD_WIDTH - 1);
        }
        // Try just Y
        const tileYOnly = this.state.tiles.get(tileKey(Math.floor(this.state.playerX), Math.floor(newY)));
        if (tileYOnly && (tileYOnly.type === 'empty' || tileYOnly.type === 'surface') && !tileYOnly.entityId) {
          this.state.playerY = Phaser.Math.Clamp(newY, 0, WORLD_HEIGHT - 1);
        }
      }
    }
  }

  private revealNearPlayer(): void {
    const px = Math.floor(this.state.playerX);
    const py = Math.floor(this.state.playerY);
    const revealRadius = 8;

    for (let dx = -revealRadius; dx <= revealRadius; dx++) {
      for (let dy = -revealRadius; dy <= revealRadius; dy++) {
        if (dx * dx + dy * dy > revealRadius * revealRadius) continue;
        const tile = this.state.tiles.get(tileKey(px + dx, py + dy));
        if (tile) tile.revealed = true;
      }
    }

    // Also reveal around lamps and radars
    for (const entity of this.state.entities.values()) {
      if (!entity.enabled || !entity.powered) continue;
      const radius = entity.type === 'radar' ? 15 : entity.type === 'lamp' ? 6 : 0;
      if (radius === 0) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          if (dx * dx + dy * dy > radius * radius) continue;
          const tile = this.state.tiles.get(tileKey(entity.x + dx, entity.y + dy));
          if (tile) tile.revealed = true;
        }
      }
    }
  }

  private renderWorld(): void {
    this.tileGraphics.clear();
    this.entityGraphics.clear();
    this.overlayGraphics.clear();
    this.playerGraphics.clear();
    this.itemGraphics.clear();

    // Get visible area
    const cam = this.cameras.main;
    const startX = Math.max(0, Math.floor((cam.scrollX) / TILE_SIZE) - 1);
    const startY = Math.max(0, Math.floor((cam.scrollY) / TILE_SIZE) - 1);
    const endX = Math.min(WORLD_WIDTH, Math.ceil((cam.scrollX + cam.width / cam.zoom) / TILE_SIZE) + 1);
    const endY = Math.min(WORLD_HEIGHT, Math.ceil((cam.scrollY + cam.height / cam.zoom) / TILE_SIZE) + 1);

    // Render tiles
    for (let x = startX; x < endX; x++) {
      for (let y = startY; y < endY; y++) {
        const tile = this.state.tiles.get(tileKey(x, y));
        if (!tile) continue;

        if (!tile.revealed) {
          this.tileGraphics.fillStyle(0x050510, 1);
          this.tileGraphics.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          continue;
        }

        let color = TILE_COLORS[tile.type] ?? 0x333333;

        // Water tint
        if (tile.waterLevel > 0.1) {
          const c = Phaser.Display.Color.Interpolate.ColorWithColor(
            Phaser.Display.Color.IntegerToColor(color),
            Phaser.Display.Color.IntegerToColor(0x1E90FF),
            100,
            Math.floor(tile.waterLevel * 60)
          );
          color = Phaser.Display.Color.GetColor(c.r, c.g, c.b);
        }

        // Gas tint
        if (tile.gasLevel > 0.2) {
          const c = Phaser.Display.Color.Interpolate.ColorWithColor(
            Phaser.Display.Color.IntegerToColor(color),
            Phaser.Display.Color.IntegerToColor(0x9ACD32),
            100,
            Math.floor(tile.gasLevel * 40)
          );
          color = Phaser.Display.Color.GetColor(c.r, c.g, c.b);
        }

        this.tileGraphics.fillStyle(color, 1);
        this.tileGraphics.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

        // Grid lines (subtle)
        this.tileGraphics.lineStyle(1, 0x222233, 0.2);
        this.tileGraphics.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }

    // Render entities
    const renderedEntities = new Set<string>();
    for (let x = startX; x < endX; x++) {
      for (let y = startY; y < endY; y++) {
        const tile = this.state.tiles.get(tileKey(x, y));
        if (!tile?.entityId || renderedEntities.has(tile.entityId)) continue;
        renderedEntities.add(tile.entityId);

        const entity = this.state.entities.get(tile.entityId);
        if (!entity) continue;

        this.renderEntity(entity);
      }
    }

    // Render conveyor items
    for (const [entityId, items] of this.state.logistics.conveyorItems) {
      const entity = this.state.entities.get(entityId);
      if (!entity) continue;
      if (entity.x < startX - 1 || entity.x > endX + 1 || entity.y < startY - 1 || entity.y > endY + 1) continue;

      for (const item of items) {
        const [dx, dy] = DIRECTION_OFFSETS[entity.direction];
        const ix = (entity.x + 0.5 + dx * item.progress * 0.8) * TILE_SIZE;
        const iy = (entity.y + 0.5 + dy * item.progress * 0.8) * TILE_SIZE;
        const resDef = RESOURCES[item.resource];
        const itemColor = parseInt(resDef.color.replace('#', ''), 16);
        this.itemGraphics.fillStyle(itemColor, 1);
        this.itemGraphics.fillCircle(ix, iy, 3);
      }
    }

    // Render overlay
    if (this.overlayMode !== 'none') {
      this.renderOverlay(startX, startY, endX, endY);
    }

    // Render player
    const px = this.state.playerX * TILE_SIZE + TILE_SIZE / 2;
    const py = this.state.playerY * TILE_SIZE + TILE_SIZE / 2;
    this.playerGraphics.fillStyle(0x00ff88, 1);
    this.playerGraphics.fillCircle(px, py, TILE_SIZE * 0.4);
    this.playerGraphics.lineStyle(2, 0xffffff, 0.8);
    this.playerGraphics.strokeCircle(px, py, TILE_SIZE * 0.4);

    // Build ghost
    if (this.buildMode) {
      const def = BUILDINGS[this.buildMode];
      const canPlace = this.canPlaceBuilding(this.ghostX, this.ghostY, def.width, def.height);
      const ghostColor = canPlace ? 0x00ff00 : 0xff0000;
      this.overlayGraphics.fillStyle(ghostColor, 0.3);
      this.overlayGraphics.fillRect(
        this.ghostX * TILE_SIZE, this.ghostY * TILE_SIZE,
        def.width * TILE_SIZE, def.height * TILE_SIZE
      );
      this.overlayGraphics.lineStyle(2, ghostColor, 0.8);
      this.overlayGraphics.strokeRect(
        this.ghostX * TILE_SIZE, this.ghostY * TILE_SIZE,
        def.width * TILE_SIZE, def.height * TILE_SIZE
      );

      // Direction arrow
      const cx = (this.ghostX + def.width / 2) * TILE_SIZE;
      const cy = (this.ghostY + def.height / 2) * TILE_SIZE;
      const [adx, ady] = DIRECTION_OFFSETS[this.buildDirection];
      this.overlayGraphics.lineStyle(3, 0xffffff, 0.8);
      this.overlayGraphics.lineBetween(cx, cy, cx + adx * TILE_SIZE, cy + ady * TILE_SIZE);
    }

    // Delete mode crosshair
    if (this.deleteMode) {
      this.overlayGraphics.lineStyle(2, 0xff0000, 0.8);
      this.overlayGraphics.strokeRect(
        this.ghostX * TILE_SIZE, this.ghostY * TILE_SIZE,
        TILE_SIZE, TILE_SIZE
      );
    }
  }

  private renderEntity(entity: Entity): void {
    const def = BUILDINGS[entity.type];
    const x = entity.x * TILE_SIZE;
    const y = entity.y * TILE_SIZE;
    const w = def.width * TILE_SIZE;
    const h = def.height * TILE_SIZE;

    // Base color
    let color = def.color;
    if (!entity.enabled) color = 0x333333;
    else if (!entity.powered && def.powerConsumption > 0) color = 0x554422;

    // Durability-based darkening
    const durMult = 0.4 + entity.durability * 0.6;
    const r = ((color >> 16) & 0xff) * durMult;
    const g = ((color >> 8) & 0xff) * durMult;
    const b = (color & 0xff) * durMult;
    color = (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b);

    this.entityGraphics.fillStyle(color, 0.9);
    this.entityGraphics.fillRect(x + 1, y + 1, w - 2, h - 2);

    // Border
    const borderColor = entity.durability < 0.3 ? 0xff3333 : entity.powered || def.powerConsumption === 0 ? 0x88aacc : 0x554422;
    this.entityGraphics.lineStyle(1, borderColor, 0.8);
    this.entityGraphics.strokeRect(x + 1, y + 1, w - 2, h - 2);

    // Direction indicator for conveyors
    if (entity.type === 'conveyor' || entity.type === 'splitter' || entity.type === 'merger') {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const [dx, dy] = DIRECTION_OFFSETS[entity.direction];
      this.entityGraphics.lineStyle(2, 0xcccccc, 0.6);
      this.entityGraphics.lineBetween(cx - dx * 6, cy - dy * 6, cx + dx * 8, cy + dy * 8);
    }

    // Durability bar (if damaged)
    if (entity.durability < 0.9) {
      const barW = w - 4;
      const barH = 3;
      this.entityGraphics.fillStyle(0x333333, 0.8);
      this.entityGraphics.fillRect(x + 2, y + h - 5, barW, barH);
      const durColor = entity.durability > 0.5 ? 0x44aa44 : entity.durability > 0.2 ? 0xaa8833 : 0xaa3333;
      this.entityGraphics.fillStyle(durColor, 0.9);
      this.entityGraphics.fillRect(x + 2, y + h - 5, barW * entity.durability, barH);
    }
  }

  private renderOverlay(startX: number, startY: number, endX: number, endY: number): void {
    for (let x = startX; x < endX; x++) {
      for (let y = startY; y < endY; y++) {
        const tile = this.state.tiles.get(tileKey(x, y));
        if (!tile || !tile.revealed) continue;

        let alpha = 0;
        let color = 0;

        switch (this.overlayMode) {
          case 'power': {
            if (tile.entityId) {
              const entity = this.state.entities.get(tile.entityId);
              if (entity) {
                const def = BUILDINGS[entity.type];
                if (def.powerGeneration) { color = 0x00ff00; alpha = 0.4; }
                else if (def.powerConsumption > 0) {
                  color = entity.powered ? 0x4488ff : 0xff4444;
                  alpha = 0.3;
                }
              }
            }
            break;
          }
          case 'heat': {
            const temp = tile.entityId
              ? (this.state.entities.get(tile.entityId)?.temperature ?? tile.temperature)
              : tile.temperature;
            if (temp > 50) {
              alpha = Math.min(0.6, (temp - 50) / 250);
              color = temp > 150 ? 0xff0000 : temp > 100 ? 0xff8800 : 0xffcc00;
            }
            break;
          }
          case 'throughput': {
            if (tile.entityId) {
              const items = this.state.logistics.conveyorItems.get(tile.entityId);
              if (items && items.length > 0) {
                alpha = 0.3 + items.length * 0.15;
                color = items.length >= 4 ? 0xff4444 : 0x44ff44;
              }
            }
            break;
          }
          case 'stability': {
            if (tile.stability < 80) {
              alpha = Math.min(0.6, (80 - tile.stability) / 80);
              color = tile.stability < 30 ? 0xff0000 : tile.stability < 50 ? 0xff8800 : 0xffcc00;
            }
            break;
          }
        }

        if (alpha > 0) {
          this.overlayGraphics.fillStyle(color, alpha);
          this.overlayGraphics.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  // ── Build System ──

  canPlaceBuilding(x: number, y: number, width: number, height: number): boolean {
    for (let tx = x; tx < x + width; tx++) {
      for (let ty = y; ty < y + height; ty++) {
        const tile = this.state.tiles.get(tileKey(tx, ty));
        if (!tile) return false;
        if (!tile.revealed) return false;
        if (tile.type !== 'empty' && tile.type !== 'surface') return false;
        if (tile.entityId) return false;
        if (tile.waterLevel > 0.5) return false;
      }
    }
    return true;
  }

  placeBuilding(x: number, y: number, type: BuildingType, direction: Direction): boolean {
    const def = BUILDINGS[type];

    // Check research
    if (def.unlockResearch && !isUnlocked(this.state, type)) return false;

    // Check cost
    if (this.state.money < def.cost) return false;

    // Check placement
    if (!this.canPlaceBuilding(x, y, def.width, def.height)) return false;

    // Check build resources
    if (def.buildResources) {
      for (const req of def.buildResources) {
        let found = 0;
        for (const [, contents] of this.state.logistics.storageContents) {
          const stack = contents.find(s => s.resource === req.resource);
          if (stack) found += stack.amount;
        }
        if (found < req.amount) return false;
      }
      // Consume build resources
      for (const req of def.buildResources) {
        let remaining = req.amount;
        for (const [, contents] of this.state.logistics.storageContents) {
          const stack = contents.find(s => s.resource === req.resource);
          if (stack && remaining > 0) {
            const take = Math.min(stack.amount, remaining);
            stack.amount -= take;
            remaining -= take;
          }
        }
      }
    }

    // Deduct cost
    this.state.money -= def.cost;

    // Create entity
    const id = genId();
    const entity: Entity = {
      id,
      type,
      x,
      y,
      width: def.width,
      height: def.height,
      direction,
      durability: def.maxDurability,
      maxDurability: def.maxDurability,
      enabled: true,
      powered: false,
      temperature: this.state.tiles.get(tileKey(x, y))?.temperature ?? 20,
      data: {},
    };

    // Initialize processing data
    if (def.category === 'processing' || def.recipe) {
      entity.data['inputBuffer'] = [];
      entity.data['outputBuffer'] = [];
      entity.data['cycleProgress'] = 0;
      // Set default recipe
      const defaultRecipe = RECIPES_LIST.find((r) => r.building === type);
      if (defaultRecipe) {
        entity.data['recipe'] = defaultRecipe.id;
      }
    }

    // Initialize selling terminal
    if (type === 'selling_terminal') {
      entity.data['sellBuffer'] = [];
    }

    // Initialize battery
    if (def.batteryCapacity) {
      entity.data['stored'] = 0;
    }

    // Place on tiles
    for (let tx = x; tx < x + def.width; tx++) {
      for (let ty = y; ty < y + def.height; ty++) {
        const tile = this.state.tiles.get(tileKey(tx, ty));
        if (tile) tile.entityId = id;
      }
    }

    this.state.entities.set(id, entity);

    // Initialize storage
    if (type === 'storage') {
      this.state.logistics.storageContents.set(id, []);
    }

    // Initialize conveyor
    if (type === 'conveyor' || type === 'splitter' || type === 'merger') {
      this.state.logistics.conveyorItems.set(id, []);
    }

    return true;
  }

  deleteBuilding(x: number, y: number): boolean {
    const tile = this.state.tiles.get(tileKey(x, y));
    if (!tile?.entityId) return false;

    const entity = this.state.entities.get(tile.entityId);
    if (!entity) return false;

    const def = BUILDINGS[entity.type];

    // Refund partial cost
    this.state.money += Math.floor(def.cost * 0.5);

    // Clear tiles
    for (let tx = entity.x; tx < entity.x + entity.width; tx++) {
      for (let ty = entity.y; ty < entity.y + entity.height; ty++) {
        const t = this.state.tiles.get(tileKey(tx, ty));
        if (t) t.entityId = null;
      }
    }

    // Remove entity data
    this.state.logistics.conveyorItems.delete(tile.entityId);
    this.state.logistics.storageContents.delete(tile.entityId);
    this.state.entities.delete(tile.entityId);

    return true;
  }

  // ── Input Handlers ──

  private handleClick(pointer: Phaser.Input.Pointer): void {
    const worldX = pointer.worldX;
    const worldY = pointer.worldY;
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);

    if (this.deleteMode) {
      this.deleteBuilding(tileX, tileY);
      return;
    }

    if (this.buildMode) {
      const def = BUILDINGS[this.buildMode];
      // Align to grid based on building size
      const placeX = tileX;
      const placeY = tileY;
      if (this.placeBuilding(placeX, placeY, this.buildMode, this.buildDirection)) {
        this.onBuildComplete?.();
      }
      return;
    }

    // Click on entity
    const tile = this.state.tiles.get(tileKey(tileX, tileY));
    if (tile?.entityId) {
      this.onEntityClick?.(tile.entityId);
    }
  }

  private handleHover(pointer: Phaser.Input.Pointer): void {
    const worldX = pointer.worldX;
    const worldY = pointer.worldY;
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);

    this.ghostX = tileX;
    this.ghostY = tileY;

    const tile = this.state.tiles.get(tileKey(tileX, tileY));
    this.onTileHover?.(tileX, tileY, tile ?? null);

    if (tile?.entityId) {
      const entity = this.state.entities.get(tile.entityId);
      this.onEntityHover?.(entity ?? null);
    } else {
      this.onEntityHover?.(null);
    }
  }

  // ── World Manipulation ──

  /** Mine a rock tile (player action) */
  mineRock(x: number, y: number): boolean {
    const tile = this.state.tiles.get(tileKey(x, y));
    if (!tile || tile.type === 'bedrock' || tile.type === 'empty' || tile.type === 'surface') return false;
    if (!tile.revealed) return false;
    if (tile.entityId) return false;

    // Player can manually mine adjacent tiles
    const dist = Math.abs(x - Math.floor(this.state.playerX)) + Math.abs(y - Math.floor(this.state.playerY));
    if (dist > 2) return false;

    tile.type = 'empty';
    tile.resourceAmount = 0;
    tile.stability = Math.max(0, tile.stability - 10);

    return true;
  }

  jumpToPosition(x: number, y: number): void {
    this.cameras.main.centerOn(x * TILE_SIZE, y * TILE_SIZE);
  }
}
