import { createClient, type SupabaseClient, type User, type Session } from '@supabase/supabase-js';
import type { SerializedGameState } from '../sim/types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (supabase) return supabase;
  if (!supabaseUrl || !supabaseKey) return null;
  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
  return supabase;
}

export function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseKey);
}

// ── Auth ──

export async function signInWithGoogle(): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured');
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured');
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signUpWithEmail(email: string, password: string): Promise<User | null> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured');
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signOut(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}

export async function getUser(): Promise<User | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

export async function getSession(): Promise<Session | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

export function onAuthStateChange(callback: (user: User | null) => void): () => void {
  const sb = getSupabase();
  if (!sb) return () => {};
  const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
    callback(session?.user ?? null);
  });
  return () => subscription.unsubscribe();
}

// ── Profile ──

export async function ensureProfile(user: User): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from('profiles').upsert({
    id: user.id,
    display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Miner',
  }, { onConflict: 'id' });
  if (error) console.error('Profile upsert error:', error);
}

// ── Cloud Saves ──

export interface CloudSaveSlot {
  id: string;
  slot: number;
  name: string;
  updatedAt: string;
  simTimeMs: number;
  version: number;
}

export async function listCloudSaves(userId: string): Promise<CloudSaveSlot[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('saves')
    .select('id, slot, name, updated_at, version, data')
    .eq('user_id', userId)
    .order('slot');
  if (error) { console.error('List saves error:', error); return []; }
  return (data ?? []).map(d => ({
    id: d.id,
    slot: d.slot,
    name: d.name,
    updatedAt: d.updated_at,
    simTimeMs: (d.data as any)?.simTimeMs ?? 0,
    version: d.version,
  }));
}

export async function loadCloudSave(userId: string, slot: number): Promise<SerializedGameState | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from('saves')
    .select('data, updated_at')
    .eq('user_id', userId)
    .eq('slot', slot)
    .single();
  if (error || !data) return null;
  return data.data as unknown as SerializedGameState;
}

export async function saveToCloud(
  userId: string,
  slot: number,
  name: string,
  state: SerializedGameState
): Promise<{ updatedAt: string } | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from('saves')
    .upsert({
      user_id: userId,
      slot,
      name,
      data: state as unknown as Record<string, unknown>,
      version: state.version ?? 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,slot' })
    .select('updated_at')
    .single();

  if (error) {
    console.error('Cloud save error:', error);
    return null;
  }
  return { updatedAt: data.updated_at };
}

export async function deleteCloudSave(userId: string, slot: number): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { error } = await sb
    .from('saves')
    .delete()
    .eq('user_id', userId)
    .eq('slot', slot);
  return !error;
}

// ── Achievements ──

export async function syncAchievements(
  userId: string,
  achievements: Map<string, boolean>
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  const rows = Array.from(achievements.entries())
    .filter(([, v]) => v)
    .map(([key]) => ({
      user_id: userId,
      key,
    }));

  if (rows.length === 0) return;

  const { error } = await sb
    .from('achievements')
    .upsert(rows, { onConflict: 'user_id,key', ignoreDuplicates: true });

  if (error) console.error('Achievement sync error:', error);
}

export async function loadAchievements(userId: string): Promise<string[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('achievements')
    .select('key')
    .eq('user_id', userId);
  if (error) return [];
  return (data ?? []).map(d => d.key);
}

// ── Leaderboard ──

export async function submitScore(userId: string, netWorth: number, displayName?: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  // Using saves table indirectly - store in profiles or a leaderboard table
  // For now, just log it
  console.log('Score submitted:', netWorth, displayName);
}
