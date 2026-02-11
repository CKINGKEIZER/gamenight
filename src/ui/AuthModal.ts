import type { GameState } from '../sim/types';
import {
  isSupabaseConfigured,
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  signOut,
  getUser,
  onAuthStateChange,
  ensureProfile,
} from '../persistence/SupabaseClient';
import { saveManager } from '../persistence/SaveManager';

let currentUser: { id: string; email?: string } | null = null;
let authInitialized = false;

export function initAuth(): void {
  if (authInitialized) return;
  authInitialized = true;

  if (!isSupabaseConfigured()) {
    console.log('Supabase not configured - running in guest mode only');
    return;
  }

  // Check initial session
  getUser().then(user => {
    if (user) {
      currentUser = { id: user.id, email: user.email ?? undefined };
      saveManager.setUserId(user.id);
      ensureProfile(user);
      updateAuthButton();
    }
  });

  // Listen for auth changes
  onAuthStateChange((user) => {
    if (user) {
      currentUser = { id: user.id, email: user.email ?? undefined };
      saveManager.setUserId(user.id);
      ensureProfile(user);
    } else {
      currentUser = null;
      saveManager.setUserId(null);
    }
    updateAuthButton();
  });
}

export function getCurrentUser() {
  return currentUser;
}

function updateAuthButton(): void {
  const btn = document.getElementById('auth-btn');
  if (btn) {
    btn.textContent = currentUser ? (currentUser.email?.split('@')[0] ?? 'User') : 'Guest';
  }
}

export function showAuthModal(gameState: GameState): void {
  // Remove existing modal
  document.querySelector('.modal-backdrop.auth-modal')?.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop auth-modal';

  const modal = document.createElement('div');
  modal.className = 'modal';

  if (currentUser) {
    // Show account info
    modal.innerHTML = `
      <h2>Account</h2>
      <div style="margin-bottom:12px">
        <div>Logged in as: <strong>${currentUser.email ?? 'User'}</strong></div>
        <div style="color:#666;font-size:11px">ID: ${currentUser.id.slice(0, 8)}...</div>
      </div>
      <button id="auth-signout">Sign Out</button>
      <button class="secondary" id="auth-close">Close</button>
    `;
  } else {
    const supabaseOk = isSupabaseConfigured();
    modal.innerHTML = `
      <h2>Deep Shaft Syndicate</h2>
      <div id="auth-error" class="error" style="display:none"></div>
      <div id="auth-success" class="success" style="display:none"></div>

      ${supabaseOk ? `
        <button id="auth-google" style="width:100%;margin-bottom:8px">Continue with Google</button>
        <div class="divider"></div>
        <label>Email</label>
        <input type="email" id="auth-email" placeholder="you@example.com" />
        <label>Password</label>
        <input type="password" id="auth-password" placeholder="Password (min 6 chars)" />
        <div style="margin-top:8px">
          <button id="auth-login">Log In</button>
          <button class="secondary" id="auth-signup">Sign Up</button>
        </div>
        <div class="divider"></div>
      ` : `
        <div style="color:#888;margin-bottom:12px">Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable accounts.</div>
      `}
      <button class="secondary" id="auth-guest" style="width:100%">Play as Guest (Local saves only)</button>
    `;
  }

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  // Close on backdrop click
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  // Event handlers
  modal.querySelector('#auth-close')?.addEventListener('click', () => backdrop.remove());
  modal.querySelector('#auth-guest')?.addEventListener('click', () => backdrop.remove());

  modal.querySelector('#auth-signout')?.addEventListener('click', async () => {
    await signOut();
    currentUser = null;
    saveManager.setUserId(null);
    updateAuthButton();
    backdrop.remove();
  });

  modal.querySelector('#auth-google')?.addEventListener('click', async () => {
    try {
      await signInWithGoogle();
    } catch (err: any) {
      showError(modal, err.message);
    }
  });

  modal.querySelector('#auth-login')?.addEventListener('click', async () => {
    const email = (modal.querySelector('#auth-email') as HTMLInputElement)?.value;
    const password = (modal.querySelector('#auth-password') as HTMLInputElement)?.value;
    if (!email || !password) { showError(modal, 'Email and password required'); return; }

    try {
      const user = await signInWithEmail(email, password);
      currentUser = { id: user.id, email: user.email ?? undefined };
      saveManager.setUserId(user.id);
      updateAuthButton();

      // Offer merge if guest had progress
      if (gameState.tick > 100) {
        showMergePrompt(gameState, backdrop);
      } else {
        backdrop.remove();
      }
    } catch (err: any) {
      showError(modal, err.message);
    }
  });

  modal.querySelector('#auth-signup')?.addEventListener('click', async () => {
    const email = (modal.querySelector('#auth-email') as HTMLInputElement)?.value;
    const password = (modal.querySelector('#auth-password') as HTMLInputElement)?.value;
    if (!email || !password) { showError(modal, 'Email and password required'); return; }
    if (password.length < 6) { showError(modal, 'Password must be at least 6 characters'); return; }

    try {
      const user = await signUpWithEmail(email, password);
      if (user) {
        showSuccess(modal, 'Account created! Check your email to confirm, then log in.');
      }
    } catch (err: any) {
      showError(modal, err.message);
    }
  });
}

function showMergePrompt(gameState: GameState, backdrop: HTMLElement): void {
  const modal = backdrop.querySelector('.modal')!;
  modal.innerHTML = `
    <h2>Merge Guest Save?</h2>
    <p style="color:#aaa;margin-bottom:12px">You have local progress (Day ${gameState.day}, ${formatMoney(gameState.money)}). Upload to cloud?</p>
    <button id="merge-yes">Upload to Cloud Slot 0</button>
    <button class="secondary" id="merge-no">Start Fresh</button>
  `;

  modal.querySelector('#merge-yes')?.addEventListener('click', async () => {
    await saveManager.mergeGuestSave(gameState, 0);
    backdrop.remove();
  });

  modal.querySelector('#merge-no')?.addEventListener('click', () => {
    backdrop.remove();
  });
}

function showError(modal: Element, message: string): void {
  const el = modal.querySelector('#auth-error') as HTMLElement;
  if (el) { el.textContent = message; el.style.display = 'block'; }
}

function showSuccess(modal: Element, message: string): void {
  const el = modal.querySelector('#auth-success') as HTMLElement;
  if (el) { el.textContent = message; el.style.display = 'block'; }
}

function formatMoney(n: number): string {
  return `$${Math.floor(n).toLocaleString()}`;
}
