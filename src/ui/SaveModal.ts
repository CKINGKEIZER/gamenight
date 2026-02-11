import { saveManager } from '../persistence/SaveManager';
import type { GameState } from '../sim/types';

export function showSaveModal(state: GameState): void {
  // Save modal is integrated into the side panel via UIManager.renderSavesPanel
  // This is a standalone version for quick access
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <h2>Quick Save</h2>
    <button id="qs-local" style="width:100%;margin-bottom:8px">Save Locally</button>
    <button id="qs-export" style="width:100%;margin-bottom:8px" class="secondary">Export JSON</button>
    <div class="divider"></div>
    <button id="qs-close" class="secondary" style="width:100%">Close</button>
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  modal.querySelector('#qs-close')?.addEventListener('click', () => backdrop.remove());

  modal.querySelector('#qs-local')?.addEventListener('click', async () => {
    await saveManager.saveLocalAutosave(state);
    const info = modal.querySelector('#qs-close')!;
    info.textContent = 'Saved! Close';
  });

  modal.querySelector('#qs-export')?.addEventListener('click', () => {
    const json = saveManager.exportToJSON(state);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deep_shaft_save_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}
