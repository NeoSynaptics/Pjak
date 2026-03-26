/**
 * Pjak SDK — Drop into any app to add påskäggsjakt functionality.
 * v2: Permanent eggs, replayable sessions with fresh codes.
 *
 * Usage:
 *   import { PjakGame } from 'pjak-sdk';
 *   const pjak = new PjakGame(supabaseUrl, supabaseKey);
 *   await pjak.connectLatest();
 *   pjak.on('eggFound', (egg, code) => { ... });
 *   pjak.updatePlayerPosition(lat, lng);
 */

import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

export type Egg = {
  id: string;
  idx: number;
  label: string;
  lat: number;
  lng: number;
};

export type SessionEgg = {
  id: string;
  game_id: string;
  egg_id: string;
  idx: number;
  code: string;
  collected: boolean;
};

export type Game = {
  id: string;
  name: string;
  current_egg_index: number;
  status: 'waiting' | 'active' | 'finished';
};

export type PjakEvents = {
  gameUpdate: (game: Game) => void;
  eggsLoaded: (eggs: Egg[]) => void;
  sessionUpdate: (sessionEggs: SessionEgg[]) => void;
  currentEgg: (egg: Egg | null, sessionEgg: SessionEgg | null) => void;
  proximity: (distance: number, isInRange: boolean) => void;
  eggFound: (egg: Egg, code: string) => void;
  gameFinished: () => void;
};

export class PjakGame {
  private supabase: SupabaseClient;
  private channel: RealtimeChannel | null = null;
  private game: Game | null = null;
  private eggs: Egg[] = [];
  private sessionEggs: SessionEgg[] = [];
  private listeners: Partial<{ [K in keyof PjakEvents]: PjakEvents[K][] }> = {};
  private proximityRadius: number;

  constructor(supabaseUrl: string, supabaseKey: string, proximityRadius = 15) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.proximityRadius = proximityRadius;
  }

  // --- Load permanent eggs ---
  async loadEggs(): Promise<Egg[]> {
    const { data } = await this.supabase.from('eggs').select('*').order('idx');
    this.eggs = data || [];
    this.emit('eggsLoaded', this.eggs);
    return this.eggs;
  }

  // --- Connect to a game session ---
  async connect(gameId: string): Promise<Game | null> {
    await this.loadEggs();

    const { data: game } = await this.supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();

    if (!game) return null;
    this.game = game;

    const { data: ses } = await this.supabase
      .from('session_eggs')
      .select('*')
      .eq('game_id', gameId)
      .order('idx');
    this.sessionEggs = ses || [];

    // Subscribe to realtime
    this.channel = this.supabase
      .channel(`pjak-${gameId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => {
          this.game = payload.new as Game;
          this.emit('gameUpdate', this.game);
          this.emitCurrentEgg();
          if (this.game.status === 'finished') this.emit('gameFinished');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_eggs', filter: `game_id=eq.${gameId}` },
        async () => {
          const { data } = await this.supabase
            .from('session_eggs')
            .select('*')
            .eq('game_id', gameId)
            .order('idx');
          this.sessionEggs = data || [];
          this.emit('sessionUpdate', this.sessionEggs);
          this.emitCurrentEgg();
        }
      )
      .subscribe();

    return this.game;
  }

  // --- Connect to latest active game ---
  async connectLatest(): Promise<Game | null> {
    const { data: games } = await this.supabase
      .from('games')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!games || games.length === 0) return null;
    return this.connect(games[0].id);
  }

  // --- Update player GPS ---
  async updatePlayerPosition(lat: number, lng: number): Promise<void> {
    if (this.game) {
      await this.supabase.from('player_position').upsert(
        { game_id: this.game.id, lat, lng, updated_at: new Date().toISOString() },
        { onConflict: 'game_id' }
      );
    }

    // Check proximity
    const { egg } = this.getCurrentEgg();
    if (egg) {
      const dist = this.distanceMeters(lat, lng, egg.lat, egg.lng);
      const inRange = dist <= this.proximityRadius;
      this.emit('proximity', dist, inRange);

      if (inRange) {
        const se = this.getCurrentSessionEgg();
        if (se) this.emit('eggFound', egg, se.code);
      }
    }
  }

  // --- Get current egg ---
  getCurrentEgg(): { egg: Egg | null; sessionEgg: SessionEgg | null } {
    if (!this.game) return { egg: null, sessionEgg: null };
    const se = this.sessionEggs.find(s => s.idx === this.game!.current_egg_index);
    const egg = se ? this.eggs.find(e => e.id === se.egg_id) || null : null;
    return { egg, sessionEgg: se || null };
  }

  private getCurrentSessionEgg(): SessionEgg | null {
    if (!this.game) return null;
    return this.sessionEggs.find(s => s.idx === this.game!.current_egg_index) || null;
  }

  // --- Mark egg as collected ---
  async collectEgg(sessionEggId: string): Promise<void> {
    await this.supabase.from('session_eggs').update({ collected: true }).eq('id', sessionEggId);
  }

  // --- Getters ---
  getEggs(): Egg[] { return this.eggs; }
  getSessionEggs(): SessionEgg[] { return this.sessionEggs; }
  getGame(): Game | null { return this.game; }

  // --- Events ---
  on<K extends keyof PjakEvents>(event: K, callback: PjakEvents[K]): () => void {
    if (!this.listeners[event]) this.listeners[event] = [];
    (this.listeners[event] as PjakEvents[K][]).push(callback);
    return () => {
      const arr = this.listeners[event] as PjakEvents[K][];
      const idx = arr.indexOf(callback);
      if (idx >= 0) arr.splice(idx, 1);
    };
  }

  private emit<K extends keyof PjakEvents>(event: K, ...args: Parameters<PjakEvents[K]>): void {
    const cbs = this.listeners[event] as PjakEvents[K][] | undefined;
    if (cbs) cbs.forEach(cb => (cb as (...a: any[]) => void)(...args));
  }

  private emitCurrentEgg(): void {
    const { egg, sessionEgg } = this.getCurrentEgg();
    this.emit('currentEgg', egg, sessionEgg);
  }

  // --- Disconnect ---
  async disconnect(): Promise<void> {
    if (this.channel) {
      await this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  // --- Haversine ---
  private distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
