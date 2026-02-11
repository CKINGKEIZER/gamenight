import type { GameState, SerializedGameState } from '../sim/types';
import { serializeState, deserializeState } from '../sim/SimLoop';
import { saveLocal, loadLocal, deleteLocal, exportSaveToJSON, importSaveFromJSON } from './LocalStorage';
import {
  getUser, saveToCloud, loadCloudSave, listCloudSaves, deleteCloudSave,
  syncAchievements, loadAchievements, type CloudSaveSlot
} from './SupabaseClient';
import { LOCAL_SAVE_INTERVAL_MS, CLOUD_SAVE_INTERVAL_MS, MAX_SAVE_SLOTS } from '../utils/constants';

const LOCAL_AUTOSAVE_KEY = 'autosave';

export class SaveManager {
  private lastLocalSave = 0;
  private lastCloudSave = 0;
  private userId: string | null = null;
  private activeSlot = 0;

  setUserId(userId: string | null): void {
    this.userId = userId;
  }

  getActiveSlot(): number { return this.activeSlot; }
  setActiveSlot(slot: number): void { this.activeSlot = slot; }

  // ── Autosave tick ──
  async tick(state: GameState, now: number): Promise<void> {
    // Local autosave
    if (now - this.lastLocalSave >= LOCAL_SAVE_INTERVAL_MS) {
      await this.saveLocalAutosave(state);
      this.lastLocalSave = now;
    }

    // Cloud autosave
    if (this.userId && now - this.lastCloudSave >= CLOUD_SAVE_INTERVAL_MS) {
      await this.saveCloudSlot(state, this.activeSlot, 'Autosave');
      this.lastCloudSave = now;
    }
  }

  // ── Local ──
  async saveLocalAutosave(state: GameState): Promise<void> {
    const data = serializeState(state);
    await saveLocal(LOCAL_AUTOSAVE_KEY, data);
  }

  async loadLocalAutosave(): Promise<GameState | null> {
    const data = await loadLocal(LOCAL_AUTOSAVE_KEY);
    if (!data) return null;
    return deserializeState(data);
  }

  async saveLocalSlot(state: GameState, name: string): Promise<void> {
    const data = serializeState(state);
    await saveLocal(`manual_${name}`, data);
  }

  async loadLocalSlot(name: string): Promise<GameState | null> {
    const data = await loadLocal(`manual_${name}`);
    if (!data) return null;
    return deserializeState(data);
  }

  // ── Cloud ──
  async saveCloudSlot(state: GameState, slot: number, name: string): Promise<boolean> {
    if (!this.userId) return false;
    if (slot < 0 || slot >= MAX_SAVE_SLOTS) return false;
    const data = serializeState(state);
    const result = await saveToCloud(this.userId, slot, name, data);
    return result !== null;
  }

  async loadCloudSlot(slot: number): Promise<GameState | null> {
    if (!this.userId) return null;
    const data = await loadCloudSave(this.userId, slot);
    if (!data) return null;
    return deserializeState(data);
  }

  async listCloudSlots(): Promise<CloudSaveSlot[]> {
    if (!this.userId) return [];
    return listCloudSaves(this.userId);
  }

  async deleteCloudSlot(slot: number): Promise<boolean> {
    if (!this.userId) return false;
    return deleteCloudSave(this.userId, slot);
  }

  // ── Conflict resolution ──
  async checkConflict(
    localState: GameState,
    slot: number
  ): Promise<{ hasConflict: boolean; cloudNewer: boolean; cloudSimTime: number; localSimTime: number }> {
    if (!this.userId) return { hasConflict: false, cloudNewer: false, cloudSimTime: 0, localSimTime: 0 };

    const slots = await this.listCloudSlots();
    const cloudSlot = slots.find(s => s.slot === slot);
    if (!cloudSlot) return { hasConflict: false, cloudNewer: false, cloudSimTime: 0, localSimTime: 0 };

    const localSimTime = localState.simTimeMs;
    const cloudSimTime = cloudSlot.simTimeMs;

    if (Math.abs(cloudSimTime - localSimTime) < 1000) {
      return { hasConflict: false, cloudNewer: false, cloudSimTime, localSimTime };
    }

    return {
      hasConflict: true,
      cloudNewer: new Date(cloudSlot.updatedAt).getTime() > (localState.createdAt + localState.totalPlayTimeMs),
      cloudSimTime,
      localSimTime,
    };
  }

  // ── Merge (guest -> account) ──
  async mergeGuestSave(state: GameState, slot: number): Promise<boolean> {
    if (!this.userId) return false;
    return this.saveCloudSlot(state, slot, 'Merged from guest');
  }

  // ── Achievements ──
  async syncAchievementsToCloud(state: GameState): Promise<void> {
    if (!this.userId) return;
    await syncAchievements(this.userId, state.achievements);
  }

  async loadCloudAchievements(): Promise<string[]> {
    if (!this.userId) return [];
    return loadAchievements(this.userId);
  }

  // ── Export/Import ──
  exportToJSON(state: GameState): string {
    return exportSaveToJSON(serializeState(state));
  }

  importFromJSON(json: string): GameState | null {
    const data = importSaveFromJSON(json);
    if (!data) return null;
    return deserializeState(data);
  }

  // ── Force save on major action ──
  async forceSave(state: GameState): Promise<void> {
    await this.saveLocalAutosave(state);
    if (this.userId) {
      await this.saveCloudSlot(state, this.activeSlot, 'Save');
    }
  }
}

export const saveManager = new SaveManager();
