import type { GameState, Entity, Tile, BuildingType } from '../sim/types';
import { BUILDINGS, BUILDING_LIST, RECIPES } from '../content/buildings';
import { RESOURCES } from '../content/resources';
import { RESEARCH_TREE } from '../content/research';
import { ACHIEVEMENTS } from '../content/events';
import { canStartResearch, startResearch, getResearchProgress, isUnlocked } from '../sim/ResearchService';
import { takeLoan, repayLoan, generateDailyContract } from '../sim/EconomyService';
import { formatMoney, formatNumber } from '../utils/helpers';
import { saveManager } from '../persistence/SaveManager';
import type { GameScene, OverlayMode } from '../render/GameScene';
import { showAuthModal } from './AuthModal';
import { showSaveModal } from './SaveModal';
import { TICKS_PER_DAY } from '../utils/constants';

export class UIManager {
  private scene: GameScene;
  private state!: GameState;

  // DOM elements
  private moneyDisplay: HTMLElement;
  private powerDisplay: HTMLElement;
  private repDisplay: HTMLElement;
  private dayDisplay: HTMLElement;
  private statusHint: HTMLElement;
  private bottomBar: HTMLElement;
  private sidePanel: HTMLElement;
  private tooltip: HTMLElement;
  private alertList: HTMLElement;
  private tutorialOverlay: HTMLElement;
  private tutorialBox: HTMLElement;

  private activeCategory: string | null = null;
  private sidePanelMode: string | null = null;
  private tutorialStep = 0;
  private tutorialDone = false;

  constructor(scene: GameScene) {
    this.scene = scene;

    this.moneyDisplay = document.getElementById('money-display')!;
    this.powerDisplay = document.getElementById('power-display')!;
    this.repDisplay = document.getElementById('rep-display')!;
    this.dayDisplay = document.getElementById('day-display')!;
    this.statusHint = document.getElementById('status-hint')!;
    this.bottomBar = document.getElementById('bottom-bar')!;
    this.sidePanel = document.getElementById('side-panel')!;
    this.tooltip = document.getElementById('tooltip')!;
    this.alertList = document.getElementById('alert-list')!;
    this.tutorialOverlay = document.getElementById('tutorial-overlay')!;
    this.tutorialBox = document.getElementById('tutorial-box')!;

    this.setupSpeedControls();
    this.setupOverlayModes();
    this.setupAuthButton();
    this.setupBuildBar();
    this.setupSceneCallbacks();

    // Show tutorial if new game
    if (!localStorage.getItem('dss_tutorial_done')) {
      this.showTutorial();
    }
  }

  private setupSpeedControls(): void {
    document.querySelectorAll('#speed-controls button').forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseInt((btn as HTMLElement).dataset.speed || '1');
        this.scene.state.speed = speed;
        document.querySelectorAll('#speed-controls button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  private setupOverlayModes(): void {
    document.querySelectorAll('#overlay-modes button').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = (btn as HTMLElement).dataset.mode as OverlayMode;
        this.scene.overlayMode = mode;
        document.querySelectorAll('#overlay-modes button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  private setupAuthButton(): void {
    const btn = document.getElementById('auth-btn')!;
    btn.addEventListener('click', () => {
      showAuthModal(this.scene.state);
    });
  }

  private setupBuildBar(): void {
    this.bottomBar.innerHTML = '';

    // Category buttons
    const categories = [
      { id: 'mining', label: 'Mine', icon: '⛏' },
      { id: 'logistics', label: 'Logi', icon: '→' },
      { id: 'processing', label: 'Proc', icon: '🔥' },
      { id: 'power', label: 'Power', icon: '⚡' },
      { id: 'cooling', label: 'Cool', icon: '❄' },
      { id: 'maintenance', label: 'Maint', icon: '🔧' },
      { id: 'stability', label: 'Cave', icon: '┃' },
      { id: 'commerce', label: 'Trade', icon: '💰' },
      { id: 'misc', label: 'Misc', icon: '💡' },
    ];

    for (const cat of categories) {
      const btn = document.createElement('button');
      btn.className = 'build-btn';
      btn.innerHTML = `<span class="icon">${cat.icon}</span>${cat.label}`;
      btn.addEventListener('click', () => {
        if (this.activeCategory === cat.id) {
          this.activeCategory = null;
          this.showBuildCategories();
          this.scene.buildMode = null;
        } else {
          this.activeCategory = cat.id;
          this.showBuildingsForCategory(cat.id);
        }
      });
      this.bottomBar.appendChild(btn);
    }

    // Separator
    const sep = document.createElement('div');
    sep.style.cssText = 'width:1px;height:40px;background:#444;flex-shrink:0;margin:0 4px';
    this.bottomBar.appendChild(sep);

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'build-btn';
    delBtn.innerHTML = '<span class="icon">🗑</span>Del';
    delBtn.addEventListener('click', () => {
      this.scene.deleteMode = !this.scene.deleteMode;
      this.scene.buildMode = null;
      delBtn.classList.toggle('active', this.scene.deleteMode);
    });
    this.bottomBar.appendChild(delBtn);

    // Mine rock button
    const mineBtn = document.createElement('button');
    mineBtn.className = 'build-btn';
    mineBtn.innerHTML = '<span class="icon">⛏</span>Dig';
    mineBtn.addEventListener('click', () => {
      // Mine the tile the player is facing
      const px = Math.floor(this.scene.state.playerX);
      const py = Math.floor(this.scene.state.playerY);
      // Try all adjacent tiles
      for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        if (this.scene.mineRock(px + dx, py + dy)) break;
      }
    });
    this.bottomBar.appendChild(mineBtn);

    // Special panels
    const panels = [
      { id: 'research', label: 'Res', icon: '🔬' },
      { id: 'contracts', label: 'Con', icon: '📋' },
      { id: 'economy', label: 'Eco', icon: '📊' },
      { id: 'saves', label: 'Save', icon: '💾' },
    ];

    const sep2 = document.createElement('div');
    sep2.style.cssText = 'width:1px;height:40px;background:#444;flex-shrink:0;margin:0 4px';
    this.bottomBar.appendChild(sep2);

    for (const panel of panels) {
      const btn = document.createElement('button');
      btn.className = 'build-btn';
      btn.innerHTML = `<span class="icon">${panel.icon}</span>${panel.label}`;
      btn.addEventListener('click', () => {
        if (this.sidePanelMode === panel.id) {
          this.closeSidePanel();
        } else {
          this.openSidePanel(panel.id);
        }
      });
      this.bottomBar.appendChild(btn);
    }
  }

  private showBuildCategories(): void {
    // Reset to categories view
    const buttons = this.bottomBar.querySelectorAll('.build-btn');
    buttons.forEach(b => b.classList.remove('active'));
    this.activeCategory = null;
  }

  private showBuildingsForCategory(category: string): void {
    const buildings = BUILDING_LIST.filter(b => b.category === category);

    // Create a sub-bar
    const existing = this.bottomBar.querySelector('.sub-bar');
    if (existing) existing.remove();

    const subBar = document.createElement('div');
    subBar.className = 'sub-bar';
    subBar.style.cssText = 'display:flex;gap:4px;margin-left:8px;';

    for (const bDef of buildings) {
      const unlocked = !bDef.unlockResearch || isUnlocked(this.scene.state, bDef.type);
      const btn = document.createElement('button');
      btn.className = 'build-btn' + (unlocked ? '' : ' locked');
      btn.style.opacity = unlocked ? '1' : '0.4';
      btn.innerHTML = `<span class="icon">${bDef.icon}</span><span>${bDef.name.slice(0, 6)}</span>`;
      btn.title = `${bDef.name} - $${bDef.cost} - ${bDef.powerConsumption}kW`;

      if (unlocked) {
        btn.addEventListener('click', () => {
          this.scene.buildMode = bDef.type;
          this.scene.deleteMode = false;
          subBar.querySelectorAll('.build-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      }

      subBar.appendChild(btn);
    }

    this.bottomBar.appendChild(subBar);
  }

  private setupSceneCallbacks(): void {
    this.scene.onStateUpdate = (state) => {
      this.state = state;
      this.updateTopBar();
      this.updateStatusHint();
      this.updateAlerts();
    };

    this.scene.onEntityHover = (entity) => {
      if (entity) {
        this.showEntityTooltip(entity);
      } else {
        this.tooltip.style.display = 'none';
      }
    };

    this.scene.onTileHover = (x, y, tile) => {
      if (!tile) return;
      if (tile.entityId) return; // Entity tooltip handled separately
      if (!tile.revealed) return;
      this.showTileTooltip(x, y, tile);
    };

    this.scene.onEntityClick = (entityId) => {
      const entity = this.scene.state.entities.get(entityId);
      if (entity) {
        this.openEntityPanel(entity, entityId);
      }
    };
  }


  private updateStatusHint(): void {
    if (!this.state) return;

    const buildingCount = this.state.entities.size;
    if (buildingCount === 0) {
      this.statusHint.textContent = 'Start by moving with WASD/Arrows, then press Dig (⛏) to clear adjacent rock.';
      return;
    }

    const hasPower = Array.from(this.state.entities.values()).some(e => e.type === 'coal_generator' || e.type === 'gas_generator' || e.type === 'nuclear_reactor');
    if (!hasPower) {
      this.statusHint.textContent = 'Tip: place a Coal Generator ⚡ and some Power Lines so your machines can run.';
      return;
    }

    const hasMining = Array.from(this.state.entities.values()).some(e => e.type === 'mining_rig' || e.type === 'advanced_drill');
    if (!hasMining) {
      this.statusHint.textContent = 'Next goal: place a Mining Rig ⛏ near ore and route output with Conveyors.';
      return;
    }

    this.statusHint.textContent = 'Factory running: check Research, Contracts, and overlays to optimize output.';
  }

  private updateTopBar(): void {
    if (!this.state) return;
    this.moneyDisplay.textContent = formatMoney(this.state.money);
    this.powerDisplay.textContent = `${formatNumber(this.state.powerGrid.totalGeneration, 0)}/${formatNumber(this.state.powerGrid.totalConsumption, 0)} kW`;
    this.repDisplay.textContent = String(this.state.reputation);
    this.dayDisplay.textContent = String(this.state.day);

    // Update auth button
    const btn = document.getElementById('auth-btn')!;
    const userId = saveManager['userId'];
    btn.textContent = userId ? 'Account' : 'Guest';
  }

  private updateAlerts(): void {
    if (!this.state) return;
    const active = this.state.alerts.filter(a => !a.dismissed).slice(-5);
    this.alertList.innerHTML = '';

    for (const alert of active) {
      const div = document.createElement('div');
      div.className = `alert-item ${alert.type}`;
      div.innerHTML = `<span>${alert.message}</span><span class="alert-dismiss">✕</span>`;
      div.addEventListener('click', () => {
        if (alert.x !== undefined && alert.y !== undefined) {
          this.scene.jumpToPosition(alert.x, alert.y);
        }
      });
      div.querySelector('.alert-dismiss')?.addEventListener('click', (e) => {
        e.stopPropagation();
        alert.dismissed = true;
        div.remove();
      });
      this.alertList.appendChild(div);
    }
  }

  private showEntityTooltip(entity: Entity): void {
    const def = BUILDINGS[entity.type];
    const inputBuffer = entity.data['inputBuffer'] as any[] | undefined;
    const outputBuffer = entity.data['outputBuffer'] as any[] | undefined;
    const cycleProgress = entity.data['cycleProgress'] as number | undefined;

    let html = `<div class="tt-title">${def.icon} ${def.name}</div>`;
    html += `<div class="tt-stat">Durability: ${(entity.durability * 100).toFixed(0)}%</div>`;
    html += `<div class="tt-stat">Temp: ${entity.temperature.toFixed(1)}°C</div>`;
    html += `<div class="tt-stat">Power: ${entity.powered ? '✓' : '✗'} (${def.powerConsumption > 0 ? def.powerConsumption + 'kW' : def.powerGeneration ? '+' + def.powerGeneration + 'kW' : '0kW'})</div>`;

    if (inputBuffer && inputBuffer.length > 0) {
      html += `<div class="tt-stat">Input: ${inputBuffer.map((s: any) => `${s.amount}x ${RESOURCES[s.resource as keyof typeof RESOURCES]?.name ?? s.resource}`).join(', ')}</div>`;
    }
    if (outputBuffer && outputBuffer.length > 0) {
      html += `<div class="tt-stat">Output: ${outputBuffer.map((s: any) => `${s.amount}x ${RESOURCES[s.resource as keyof typeof RESOURCES]?.name ?? s.resource}`).join(', ')}</div>`;
    }
    if (cycleProgress !== undefined && def.recipe) {
      html += `<div class="tt-stat">Progress: ${((cycleProgress / def.recipe.ticksPerCycle) * 100).toFixed(0)}%</div>`;
    }

    // Storage contents
    const contents = this.state.logistics.storageContents.get(entity.id);
    if (contents && contents.length > 0) {
      const total = contents.reduce((s, i) => s + i.amount, 0);
      html += `<div class="tt-stat">Stored: ${total}/${def.storageCapacity ?? 200}</div>`;
      for (const item of contents.slice(0, 5)) {
        html += `<div class="tt-stat">  ${item.amount}x ${RESOURCES[item.resource]?.name ?? item.resource}</div>`;
      }
    }

    // Conveyor items
    const convItems = this.state.logistics.conveyorItems.get(entity.id);
    if (convItems && convItems.length > 0) {
      html += `<div class="tt-stat">Belt: ${convItems.length}/4 items</div>`;
    }

    // Battery
    if (def.batteryCapacity) {
      const stored = (entity.data['stored'] as number) ?? 0;
      html += `<div class="tt-stat">Battery: ${formatNumber(stored)}/${formatNumber(def.batteryCapacity)} kWh</div>`;
    }

    if (entity.durability < 0.3) {
      html += `<div class="tt-warn">⚠ Needs repair!</div>`;
    }
    if (entity.temperature > 150) {
      html += `<div class="tt-warn">⚠ Overheating!</div>`;
    }

    this.tooltip.innerHTML = html;
    this.tooltip.style.display = 'block';
    // Position near mouse
    const rect = document.getElementById('game-container')!.getBoundingClientRect();
    this.tooltip.style.left = Math.min(window.innerWidth - 260, this.scene.input.activePointer.x + 15) + 'px';
    this.tooltip.style.top = Math.min(window.innerHeight - 200, this.scene.input.activePointer.y + 15) + 'px';
  }

  private showTileTooltip(x: number, y: number, tile: Tile): void {
    let html = `<div class="tt-title">${tile.type.replace(/_/g, ' ')} (${x}, ${y})</div>`;
    html += `<div class="tt-stat">Stability: ${tile.stability.toFixed(0)}</div>`;
    html += `<div class="tt-stat">Temp: ${tile.temperature.toFixed(1)}°C</div>`;
    if (tile.resourceAmount > 0) {
      html += `<div class="tt-stat">Ore: ${tile.resourceAmount}</div>`;
    }
    if (tile.waterLevel > 0.05) {
      html += `<div class="tt-warn">Water: ${(tile.waterLevel * 100).toFixed(0)}%</div>`;
    }
    if (tile.gasLevel > 0.05) {
      html += `<div class="tt-warn">Gas: ${(tile.gasLevel * 100).toFixed(0)}%</div>`;
    }

    this.tooltip.innerHTML = html;
    this.tooltip.style.display = 'block';
    this.tooltip.style.left = Math.min(window.innerWidth - 260, this.scene.input.activePointer.x + 15) + 'px';
    this.tooltip.style.top = Math.min(window.innerHeight - 200, this.scene.input.activePointer.y + 15) + 'px';
  }

  // ── Side Panel ──

  openSidePanel(mode: string): void {
    this.sidePanelMode = mode;
    this.sidePanel.classList.add('open');

    switch (mode) {
      case 'research': this.renderResearchPanel(); break;
      case 'contracts': this.renderContractsPanel(); break;
      case 'economy': this.renderEconomyPanel(); break;
      case 'saves': this.renderSavesPanel(); break;
    }
  }

  closeSidePanel(): void {
    this.sidePanelMode = null;
    this.sidePanel.classList.remove('open');
  }

  private openEntityPanel(entity: Entity, entityId: string): void {
    this.sidePanelMode = 'entity';
    this.sidePanel.classList.add('open');
    this.renderEntityPanel(entity, entityId);
  }

  private renderEntityPanel(entity: Entity, entityId: string): void {
    const def = BUILDINGS[entity.type];
    let html = `<h3>${def.icon} ${def.name}</h3>`;
    html += `<p style="color:#888;font-size:11px">${def.description}</p>`;
    html += `<div style="margin:8px 0">`;
    html += `<div>Enabled: <button id="toggle-entity" style="background:${entity.enabled ? '#2a4a2e' : '#4a2a2e'};border:1px solid #555;color:#fff;padding:2px 8px;cursor:pointer">${entity.enabled ? 'ON' : 'OFF'}</button></div>`;
    html += `<div style="margin-top:4px">Direction: <button id="rotate-entity" style="background:#1a1a2e;border:1px solid #555;color:#fff;padding:2px 8px;cursor:pointer">${entity.direction} ↻</button></div>`;
    html += `</div>`;

    // Recipe selector for processing buildings
    if (def.category === 'processing' || (def.recipe && (entity.type === 'smelter' || entity.type === 'refinery' || entity.type === 'assembler'))) {
      const availableRecipes = RECIPES.filter(r => r.building === entity.type);
      if (availableRecipes.length > 1) {
        const currentRecipe = entity.data['recipe'] as string;
        html += `<h3>Recipe</h3>`;
        for (const recipe of availableRecipes) {
          const active = currentRecipe === recipe.id;
          html += `<div class="research-node ${active ? 'unlocked' : ''}" data-recipe="${recipe.id}" style="cursor:pointer">`;
          html += `<div class="rn-name">${recipe.name}</div>`;
          html += `<div class="rn-cost">In: ${recipe.inputs.map(i => `${i.amount}x ${RESOURCES[i.resource]?.name ?? i.resource}`).join(', ')}</div>`;
          html += `<div class="rn-cost">Out: ${recipe.outputs.map(o => `${o.amount}x ${RESOURCES[o.resource]?.name ?? o.resource}`).join(', ') || 'Power'}</div>`;
          html += `<div class="rn-cost">Time: ${recipe.ticksPerCycle} ticks</div>`;
          html += `</div>`;
        }
      }
    }

    this.sidePanel.innerHTML = html;

    // Event handlers
    this.sidePanel.querySelector('#toggle-entity')?.addEventListener('click', () => {
      entity.enabled = !entity.enabled;
      this.renderEntityPanel(entity, entityId);
    });

    this.sidePanel.querySelector('#rotate-entity')?.addEventListener('click', () => {
      entity.direction = (['up', 'right', 'down', 'left'] as const)[((['up', 'right', 'down', 'left'] as const).indexOf(entity.direction) + 1) % 4];
      this.renderEntityPanel(entity, entityId);
    });

    // Recipe selection
    this.sidePanel.querySelectorAll('[data-recipe]').forEach(el => {
      el.addEventListener('click', () => {
        const recipeId = (el as HTMLElement).dataset.recipe;
        if (recipeId) {
          entity.data['recipe'] = recipeId;
          entity.data['cycleProgress'] = 0;
          this.renderEntityPanel(entity, entityId);
        }
      });
    });
  }

  private renderResearchPanel(): void {
    const progress = getResearchProgress(this.state);
    let html = '<h3>🔬 Research</h3>';

    if (progress.node) {
      html += `<div class="research-node researching">`;
      html += `<div class="rn-name">Researching: ${progress.node.name}</div>`;
      html += `<div class="rn-progress"><div class="rn-progress-bar" style="width:${(progress.progress / progress.total * 100)}%"></div></div>`;
      html += `<div class="rn-cost">${progress.progress}/${progress.total} ticks</div>`;
      html += `</div>`;
    }

    // Group by branch
    const branches = new Map<string, typeof RESEARCH_TREE>();
    for (const node of RESEARCH_TREE) {
      const branch = branches.get(node.branch) ?? [];
      branch.push(node);
      branches.set(node.branch, branch);
    }

    for (const [branch, nodes] of branches) {
      html += `<h3 style="text-transform:capitalize">${branch}</h3>`;
      for (const node of nodes) {
        const completed = this.state.research.completed.includes(node.id);
        const canStart = canStartResearch(this.state, node.id);
        const isCurrently = this.state.research.current === node.id;
        const status = completed ? 'unlocked' : isCurrently ? 'researching' : canStart ? '' : 'locked';

        html += `<div class="research-node ${status}" data-research="${node.id}">`;
        html += `<div class="rn-name">${completed ? '✓ ' : ''}${node.name}</div>`;
        html += `<div class="rn-cost">${node.description}</div>`;
        if (!completed) {
          html += `<div class="rn-cost">Cost: ${node.cost.map(c => `${c.amount}x ${RESOURCES[c.resource]?.name ?? c.resource}`).join(', ')}</div>`;
          html += `<div class="rn-cost">Time: ${node.ticksRequired} ticks</div>`;
          if (node.prerequisites.length > 0) {
            html += `<div class="rn-cost">Requires: ${node.prerequisites.join(', ')}</div>`;
          }
        }
        if (isCurrently) {
          const consumed = this.state.research.inputConsumed;
          html += `<div class="rn-cost">Input: ${node.cost.map(c => `${consumed[c.resource] ?? 0}/${c.amount} ${RESOURCES[c.resource]?.name ?? c.resource}`).join(', ')}</div>`;
          html += `<div class="rn-progress"><div class="rn-progress-bar" style="width:${(this.state.research.progress / node.ticksRequired * 100)}%"></div></div>`;
        }
        html += `</div>`;
      }
    }

    this.sidePanel.innerHTML = html;

    // Click to start research
    this.sidePanel.querySelectorAll('[data-research]').forEach(el => {
      el.addEventListener('click', () => {
        const nodeId = (el as HTMLElement).dataset.research!;
        if (startResearch(this.state, nodeId)) {
          this.renderResearchPanel();
        }
      });
    });
  }

  private renderContractsPanel(): void {
    let html = '<h3>📋 Contracts</h3>';

    // Daily contract
    const existingDaily = this.state.contracts.find(c => c.daily && !c.completed && !c.failed);
    if (!existingDaily) {
      html += '<button id="gen-daily" style="background:#2a4a6e;border:1px solid #6af;color:#fff;padding:4px 8px;cursor:pointer;margin-bottom:8px;font-family:inherit">Generate Daily Contract</button>';
    }

    // Available contracts
    html += '<h3>Available</h3>';
    const available = this.state.contracts.filter(c => !c.accepted && !c.completed && !c.failed);
    if (available.length === 0) html += '<div style="color:#666">No contracts available</div>';
    for (const contract of available) {
      html += `<div class="contract-item" data-accept="${contract.id}">`;
      html += `<div class="ci-title">${contract.name}</div>`;
      html += `<div class="ci-reward">Reward: ${formatMoney(contract.reward)} | Rep: +${contract.reputationReward}</div>`;
      html += `<div class="ci-deadline">Deadline: Day ${Math.ceil(contract.deadline / TICKS_PER_DAY)}</div>`;
      html += `<div>Requirements: ${contract.requirements.map(r => `${r.amount}x ${RESOURCES[r.resource]?.name ?? r.resource}`).join(', ')}</div>`;
      html += `<button style="background:#2a4a2e;border:1px solid #4a4;color:#fff;padding:2px 6px;cursor:pointer;font-family:inherit;margin-top:4px">Accept</button>`;
      html += `</div>`;
    }

    // Active contracts
    html += '<h3>Active</h3>';
    const active = this.state.contracts.filter(c => c.accepted && !c.completed && !c.failed);
    if (active.length === 0) html += '<div style="color:#666">No active contracts</div>';
    for (const contract of active) {
      html += `<div class="contract-item active">`;
      html += `<div class="ci-title">${contract.name}</div>`;
      html += `<div class="ci-reward">Reward: ${formatMoney(contract.reward)}</div>`;
      html += `<div class="ci-deadline">Deadline: Day ${Math.ceil(contract.deadline / TICKS_PER_DAY)}</div>`;
      html += `<div>Progress: ${contract.fulfilled.map((f, i) => `${f.amount}/${contract.requirements[i]?.amount ?? 0} ${RESOURCES[f.resource]?.name ?? f.resource}`).join(', ')}</div>`;
      html += `</div>`;
    }

    // Completed
    const completed = this.state.contracts.filter(c => c.completed).slice(-5);
    if (completed.length > 0) {
      html += '<h3>Completed</h3>';
      for (const c of completed) {
        html += `<div class="contract-item" style="opacity:0.5"><div class="ci-title">✓ ${c.name}</div></div>`;
      }
    }

    this.sidePanel.innerHTML = html;

    // Accept contracts
    this.sidePanel.querySelectorAll('[data-accept]').forEach(el => {
      el.querySelector('button')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const contractId = (el as HTMLElement).dataset.accept!;
        const contract = this.state.contracts.find(c => c.id === contractId);
        if (contract) {
          contract.accepted = true;
          this.renderContractsPanel();
        }
      });
    });

    // Daily contract
    this.sidePanel.querySelector('#gen-daily')?.addEventListener('click', () => {
      const daily = generateDailyContract(this.state);
      this.state.contracts.push(daily);
      this.renderContractsPanel();
    });
  }

  private renderEconomyPanel(): void {
    let html = '<h3>📊 Economy</h3>';
    html += `<div>Cash: ${formatMoney(this.state.money)}</div>`;
    html += `<div>Reputation: ${this.state.reputation}</div>`;
    html += `<div>Day: ${this.state.day}</div>`;

    // Market prices
    html += '<h3>Market Prices</h3>';
    html += '<div style="max-height:200px;overflow-y:auto">';
    for (const price of this.state.market) {
      const res = RESOURCES[price.resource];
      if (!res) continue;
      const color = price.demand > 0.1 ? '#4a4' : price.demand < -0.1 ? '#a44' : '#888';
      html += `<div style="display:flex;justify-content:space-between;padding:2px 0;color:${color}">`;
      html += `<span>${res.name}</span>`;
      html += `<span>${formatMoney(price.currentPrice)} (${price.demand > 0 ? '+' : ''}${(price.demand * 100).toFixed(0)}%)</span>`;
      html += `</div>`;
    }
    html += '</div>';

    // Loans
    html += '<h3>Loans</h3>';
    html += `<div>Debt: ${formatMoney(this.state.loans.reduce((s, l) => s + l.remaining, 0))}</div>`;
    html += `<button id="take-loan-5k" style="background:#2a4a6e;border:1px solid #6af;color:#fff;padding:2px 6px;cursor:pointer;font-family:inherit;margin:4px 2px">Borrow $5K</button>`;
    html += `<button id="take-loan-10k" style="background:#2a4a6e;border:1px solid #6af;color:#fff;padding:2px 6px;cursor:pointer;font-family:inherit;margin:4px 2px">Borrow $10K</button>`;

    for (const loan of this.state.loans) {
      html += `<div style="margin:4px 0;padding:4px;background:#1a1a2e;border:1px solid #444">`;
      html += `<div>Remaining: ${formatMoney(loan.remaining)} | ${loan.daysRemaining} days</div>`;
      html += `<button data-repay="${loan.id}" style="background:#4a2a2e;border:1px solid #a33;color:#fff;padding:2px 6px;cursor:pointer;font-family:inherit">Repay $1K</button>`;
      html += `</div>`;
    }

    // Achievements
    html += '<h3>Achievements</h3>';
    for (const ach of ACHIEVEMENTS) {
      const unlocked = this.state.achievements.get(ach.key);
      html += `<div style="color:${unlocked ? '#4a4' : '#555'};padding:2px 0">${unlocked ? '✓' : '○'} ${ach.name}: ${ach.description}</div>`;
    }

    this.sidePanel.innerHTML = html;

    // Loan buttons
    this.sidePanel.querySelector('#take-loan-5k')?.addEventListener('click', () => {
      takeLoan(this.state, 5000);
      this.renderEconomyPanel();
    });
    this.sidePanel.querySelector('#take-loan-10k')?.addEventListener('click', () => {
      takeLoan(this.state, 10000);
      this.renderEconomyPanel();
    });
    this.sidePanel.querySelectorAll('[data-repay]').forEach(el => {
      el.addEventListener('click', () => {
        const loanId = (el as HTMLElement).dataset.repay!;
        repayLoan(this.state, loanId, 1000);
        this.renderEconomyPanel();
      });
    });
  }

  private async renderSavesPanel(): Promise<void> {
    let html = '<h3>💾 Save/Load</h3>';

    // Local save
    html += '<button id="local-save" style="background:#2a4a6e;border:1px solid #6af;color:#fff;padding:6px 12px;cursor:pointer;font-family:inherit;margin:4px 0;width:100%">Save Locally</button>';
    html += '<button id="export-save" style="background:#1a1a2e;border:1px solid #555;color:#fff;padding:6px 12px;cursor:pointer;font-family:inherit;margin:4px 0;width:100%">Export to JSON</button>';
    html += '<button id="import-save" style="background:#1a1a2e;border:1px solid #555;color:#fff;padding:6px 12px;cursor:pointer;font-family:inherit;margin:4px 0;width:100%">Import from JSON</button>';

    // Cloud saves
    html += '<div class="divider" style="border-top:1px solid #333;margin:8px 0"></div>';
    html += '<h3>Cloud Saves</h3>';

    const userId = saveManager['userId'];
    if (!userId) {
      html += '<div style="color:#666">Log in to use cloud saves</div>';
    } else {
      html += '<div id="cloud-slots">Loading...</div>';
    }

    this.sidePanel.innerHTML = html;

    // Event handlers
    this.sidePanel.querySelector('#local-save')?.addEventListener('click', async () => {
      await saveManager.saveLocalAutosave(this.scene.state);
      alert('Game saved locally!');
    });

    this.sidePanel.querySelector('#export-save')?.addEventListener('click', () => {
      const json = saveManager.exportToJSON(this.scene.state);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `deep_shaft_save_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    this.sidePanel.querySelector('#import-save')?.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const text = await file.text();
        const loaded = saveManager.importFromJSON(text);
        if (loaded) {
          Object.assign(this.scene.state, loaded);
          alert('Save imported!');
        } else {
          alert('Invalid save file!');
        }
      };
      input.click();
    });

    // Load cloud slots
    if (userId) {
      const slots = await saveManager.listCloudSlots();
      const slotsDiv = this.sidePanel.querySelector('#cloud-slots');
      if (slotsDiv) {
        let shtml = '';
        for (let i = 0; i < 5; i++) {
          const slot = slots.find(s => s.slot === i);
          shtml += `<div class="save-slot" data-cloud-slot="${i}">`;
          shtml += `<div class="ss-name">Slot ${i}: ${slot?.name ?? 'Empty'}</div>`;
          if (slot) {
            shtml += `<div class="ss-time">Updated: ${new Date(slot.updatedAt).toLocaleString()}</div>`;
            shtml += `<button data-cloud-load="${i}" style="background:#2a4a6e;border:1px solid #6af;color:#fff;padding:2px 6px;cursor:pointer;font-family:inherit;margin:2px">Load</button>`;
            shtml += `<button data-cloud-delete="${i}" style="background:#4a1a1a;border:1px solid #a33;color:#fff;padding:2px 6px;cursor:pointer;font-family:inherit;margin:2px">Delete</button>`;
          }
          shtml += `<button data-cloud-save="${i}" style="background:#2a4a2e;border:1px solid #4a4;color:#fff;padding:2px 6px;cursor:pointer;font-family:inherit;margin:2px">Save Here</button>`;
          shtml += `</div>`;
        }
        slotsDiv.innerHTML = shtml;

        // Cloud save handlers
        slotsDiv.querySelectorAll('[data-cloud-save]').forEach(el => {
          el.addEventListener('click', async () => {
            const slot = parseInt((el as HTMLElement).dataset.cloudSave!);
            await saveManager.saveCloudSlot(this.scene.state, slot, `Save Slot ${slot}`);
            this.renderSavesPanel();
          });
        });

        slotsDiv.querySelectorAll('[data-cloud-load]').forEach(el => {
          el.addEventListener('click', async () => {
            const slot = parseInt((el as HTMLElement).dataset.cloudLoad!);
            const loaded = await saveManager.loadCloudSlot(slot);
            if (loaded) {
              Object.assign(this.scene.state, loaded);
              alert('Cloud save loaded!');
            }
          });
        });

        slotsDiv.querySelectorAll('[data-cloud-delete]').forEach(el => {
          el.addEventListener('click', async () => {
            const slot = parseInt((el as HTMLElement).dataset.cloudDelete!);
            if (confirm('Delete this cloud save?')) {
              await saveManager.deleteCloudSlot(slot);
              this.renderSavesPanel();
            }
          });
        });
      }
    }
  }

  // ── Tutorial ──

  private showTutorial(): void {
    const steps = [
      { title: 'Welcome to Deep Shaft Syndicate!', text: 'You start as the operator (green marker). Move first, clear a little space, then begin building your first line.' },
      { title: 'Movement & Digging', text: 'Use WASD or Arrow Keys to move. The Dig button mines nearby rock tiles so you can expand your build area.' },
      { title: 'Building Basics', text: 'Use bottom categories, select a building, then left-click to place. Press R to rotate and right-click or ESC to cancel.' },
      { title: 'Power', text: 'Most buildings need power. Place a Coal Generator and connect buildings with Power Lines. Keep coal flowing!' },
      { title: 'Mining & Selling', text: 'Place Mining Rigs near ore veins. Connect with Conveyors to a Selling Terminal. Watch the money flow!' },
      { title: 'Heat & Stability', text: 'Smelters generate heat — place Cooling Towers nearby. Mining reduces cave stability — use Support Pillars to prevent cave-ins.' },
      { title: 'Research', text: 'Build a Research Lab to unlock advanced technology. Store resources — the lab will consume them for research.' },
      { title: 'Good Luck!', text: 'Manage your growing operation carefully. Poor design leads to cascading failures and chaos. That\'s where the fun is! Press ESC to dismiss build mode.' },
    ];

    this.tutorialStep = 0;
    this.tutorialOverlay.classList.add('active');

    const showStep = () => {
      const step = steps[this.tutorialStep];
      this.tutorialBox.innerHTML = `
        <h3>${step.title}</h3>
        <p>${step.text}</p>
        <div style="color:#666;font-size:11px;margin-bottom:8px">${this.tutorialStep + 1}/${steps.length}</div>
        <button id="tutorial-next">${this.tutorialStep < steps.length - 1 ? 'Next' : 'Start Playing!'}</button>
        <button id="tutorial-skip" style="background:#1a1a2e;border-color:#555;margin-left:4px">Skip Tutorial</button>
      `;

      this.tutorialBox.querySelector('#tutorial-next')?.addEventListener('click', () => {
        this.tutorialStep++;
        if (this.tutorialStep >= steps.length) {
          this.tutorialOverlay.classList.remove('active');
          localStorage.setItem('dss_tutorial_done', '1');
        } else {
          showStep();
        }
      });

      this.tutorialBox.querySelector('#tutorial-skip')?.addEventListener('click', () => {
        this.tutorialOverlay.classList.remove('active');
        localStorage.setItem('dss_tutorial_done', '1');
      });
    };

    showStep();
  }
}
