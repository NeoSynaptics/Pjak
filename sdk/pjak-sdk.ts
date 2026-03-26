/**
 * Pjak SDK — Drop into any app to add påskäggsjakt functionality.
 *
 * Usage:
 *   import { PjakGame } from 'pjak-sdk';
 *   const game = new PjakGame(supabaseUrl, supabaseKey);
 *   await game.connect(gameId);
 *   game.onWaypointChange((waypoint) => { ... });
 *   game.updatePlayerPosition(lat, lng);
 */

import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

export type Waypoint = {
  id: string;
  game_id: string;
  idx: number;
  label: string;
  lat: number;
  lng: number;
  code: string;
  collected: boolean;
};

export type Game = {
  id: string;
  name: string;
  current_waypoint_index: number;
  status: 'waiting' | 'active' | 'finished';
};

export type PlayerPosition = {
  lat: number;
  lng: number;
};

export type PjakEvents = {
  gameUpdate: (game: Game) => void;
  waypointChange: (waypoints: Waypoint[]) => void;
  currentWaypoint: (waypoint: Waypoint | null) => void;
  proximity: (distance: number, isInRange: boolean) => void;
  eggFound: (waypoint: Waypoint, code: string) => void;
  gameFinished: () => void;
};

export class PjakGame {
  private supabase: SupabaseClient;
  private channel: RealtimeChannel | null = null;
  private game: Game | null = null;
  private waypoints: Waypoint[] = [];
  private playerPos: PlayerPosition = { lat: 0, lng: 0 };
  private listeners: Partial<{ [K in keyof PjakEvents]: PjakEvents[K][] }> = {};
  private proximityRadius: number;

  constructor(supabaseUrl: string, supabaseKey: string, proximityRadius = 15) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.proximityRadius = proximityRadius;
  }

  // --- Connect to a game ---
  async connect(gameId: string): Promise<Game | null> {
    const { data: game } = await this.supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();

    if (!game) return null;
    this.game = game;

    const { data: wps } = await this.supabase
      .from('waypoints')
      .select('*')
      .eq('game_id', gameId)
      .order('idx');

    this.waypoints = wps || [];

    // Subscribe to realtime updates
    this.channel = this.supabase
      .channel(`pjak-${gameId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => {
          this.game = payload.new as Game;
          this.emit('gameUpdate', this.game);
          this.emit('currentWaypoint', this.getCurrentWaypoint());
          if (this.game.status === 'finished') this.emit('gameFinished');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'waypoints', filter: `game_id=eq.${gameId}` },
        async () => {
          const { data } = await this.supabase
            .from('waypoints')
            .select('*')
            .eq('game_id', gameId)
            .order('idx');
          this.waypoints = data || [];
          this.emit('waypointChange', this.waypoints);
          this.emit('currentWaypoint', this.getCurrentWaypoint());
        }
      )
      .subscribe();

    return this.game;
  }

  // --- Connect to the latest active game ---
  async connectLatest(): Promise<Game | null> {
    const { data: games } = await this.supabase
      .from('games')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!games || games.length === 0) return null;
    return this.connect(games[0].id);
  }

  // --- Update player GPS position ---
  async updatePlayerPosition(lat: number, lng: number): Promise<void> {
    this.playerPos = { lat, lng };

    if (this.game) {
      await this.supabase.from('player_position').upsert(
        { game_id: this.game.id, lat, lng, updated_at: new Date().toISOString() },
        { onConflict: 'game_id' }
      );
    }

    // Check proximity to current waypoint
    const current = this.getCurrentWaypoint();
    if (current) {
      const dist = this.distanceMeters(lat, lng, current.lat, current.lng);
      const inRange = dist <= this.proximityRadius;
      this.emit('proximity', dist, inRange);

      if (inRange) {
        this.emit('eggFound', current, current.code);
      }
    }
  }

  // --- Get current waypoint ---
  getCurrentWaypoint(): Waypoint | null {
    if (!this.game) return null;
    return this.waypoints.find(w => w.idx === this.game!.current_waypoint_index) || null;
  }

  // --- Get all waypoints ---
  getWaypoints(): Waypoint[] {
    return this.waypoints;
  }

  // --- Get game state ---
  getGame(): Game | null {
    return this.game;
  }

  // --- Mark egg as collected ---
  async collectEgg(waypointId: string): Promise<void> {
    await this.supabase
      .from('waypoints')
      .update({ collected: true })
      .eq('id', waypointId);
  }

  // --- Event listeners ---
  on<K extends keyof PjakEvents>(event: K, callback: PjakEvents[K]): () => void {
    if (!this.listeners[event]) this.listeners[event] = [];
    (this.listeners[event] as PjakEvents[K][]).push(callback);

    // Return unsubscribe function
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

  // --- Disconnect ---
  async disconnect(): Promise<void> {
    if (this.channel) {
      await this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  // --- Haversine distance ---
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
