/**
 * Pjak SDK — Local-only påskäggsjakt game logic.
 * No database, no networking. Just eggs, codes, and proximity.
 *
 * Usage:
 *   import { PjakGame } from './pjak-sdk';
 *   import eggs from '../shared/eggs.json';
 *
 *   const game = new PjakGame(eggs);
 *   game.start();
 *   game.on('eggFound', (egg, code) => { ... });
 *   game.updatePlayerPosition(lat, lng);
 */

export type Egg = {
  id: number;
  label: string;
  lat: number;
  lng: number;
};

export type SessionEgg = Egg & {
  code: string;
  collected: boolean;
};

export type PjakEvents = {
  start: (sessionEggs: SessionEgg[]) => void;
  proximity: (distance: number, isInRange: boolean) => void;
  eggFound: (egg: SessionEgg, code: string) => void;
  eggCollected: (egg: SessionEgg, nextEgg: SessionEgg | null) => void;
  gameFinished: (sessionEggs: SessionEgg[]) => void;
};

export class PjakGame {
  private eggs: Egg[];
  private session: SessionEgg[] = [];
  private currentIdx = 0;
  private proximityRadius: number;
  private listeners: Partial<{ [K in keyof PjakEvents]: PjakEvents[K][] }> = {};

  constructor(eggs: Egg[], proximityRadius = 15) {
    this.eggs = eggs;
    this.proximityRadius = proximityRadius;
  }

  // --- Start a new session (generates fresh codes) ---
  start(): SessionEgg[] {
    this.session = this.eggs.map(e => ({
      ...e,
      code: this.randomCode(),
      collected: false,
    }));
    this.currentIdx = 0;
    this.emit('start', this.session);
    return this.session;
  }

  // --- Feed GPS position ---
  updatePlayerPosition(lat: number, lng: number): void {
    const current = this.session[this.currentIdx];
    if (!current || current.collected) return;

    const dist = this.distanceMeters(lat, lng, current.lat, current.lng);
    const inRange = dist <= this.proximityRadius;
    this.emit('proximity', dist, inRange);

    if (inRange) {
      this.emit('eggFound', current, current.code);
    }
  }

  // --- Collect current egg ---
  collect(): SessionEgg | null {
    const current = this.session[this.currentIdx];
    if (!current) return null;

    current.collected = true;
    this.currentIdx++;

    const next = this.session[this.currentIdx] || null;
    this.emit('eggCollected', current, next);

    if (this.currentIdx >= this.session.length) {
      this.emit('gameFinished', this.session);
    }

    return current;
  }

  // --- Validate a code (for Mac dashboard) ---
  validateCode(input: string): boolean {
    const current = this.session[this.currentIdx];
    if (!current) return false;
    return input.trim().toUpperCase() === current.code.toUpperCase();
  }

  // --- Getters ---
  getCurrentEgg(): SessionEgg | null { return this.session[this.currentIdx] || null; }
  getSession(): SessionEgg[] { return this.session; }
  getCurrentIndex(): number { return this.currentIdx; }
  isFinished(): boolean { return this.currentIdx >= this.session.length; }

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

  private randomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

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
