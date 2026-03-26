/**
 * Pjak SDK — Local-only påskäggsjakt game logic.
 * No database, no networking. Eggs with fixed codes from eggs.json.
 *
 * Usage:
 *   import { PjakGame } from './pjak-sdk';
 *   import eggs from '../shared/eggs.json';
 *
 *   const game = new PjakGame(eggs);
 *   game.on('eggFound', (egg) => showCode(egg.code));
 *   game.on('gameFinished', () => celebrate());
 *   game.updatePlayerPosition(lat, lng);
 */

export type Egg = {
  id: number;
  label: string;
  lat: number;
  lng: number;
  code: string;
};

export type PjakEvents = {
  proximity: (egg: Egg, distance: number, isInRange: boolean) => void;
  eggFound: (egg: Egg) => void;
  codeCorrect: (egg: Egg, nextEgg: Egg | null) => void;
  codeWrong: (egg: Egg, attempt: string) => void;
  gameFinished: () => void;
};

export class PjakGame {
  private eggs: Egg[];
  private currentIdx = 0;
  private collected = new Set<number>();
  private proximityRadius: number;
  private listeners: Partial<{ [K in keyof PjakEvents]: PjakEvents[K][] }> = {};

  constructor(eggs: Egg[], proximityRadius = 15) {
    this.eggs = eggs;
  }

  // --- Feed GPS ---
  updatePlayerPosition(lat: number, lng: number): void {
    const current = this.eggs[this.currentIdx];
    if (!current || this.isFinished()) return;

    const dist = this.distanceMeters(lat, lng, current.lat, current.lng);
    const inRange = dist <= this.proximityRadius;
    this.emit('proximity', current, dist, inRange);

    if (inRange) {
      this.emit('eggFound', current);
    }
  }

  // --- Validate code (for Mac side) ---
  submitCode(input: string): boolean {
    const current = this.eggs[this.currentIdx];
    if (!current) return false;

    if (input.trim().toUpperCase() === current.code.toUpperCase()) {
      this.collected.add(current.id);
      this.currentIdx++;
      const next = this.eggs[this.currentIdx] || null;
      this.emit('codeCorrect', current, next);
      if (this.isFinished()) this.emit('gameFinished');
      return true;
    } else {
      this.emit('codeWrong', current, input);
      return false;
    }
  }

  // --- Advance (for phone side, after showing code) ---
  advance(): void {
    const current = this.eggs[this.currentIdx];
    if (!current) return;
    this.collected.add(current.id);
    this.currentIdx++;
    const next = this.eggs[this.currentIdx] || null;
    this.emit('codeCorrect', current, next);
    if (this.isFinished()) this.emit('gameFinished');
  }

  // --- Reset ---
  restart(): void {
    this.currentIdx = 0;
    this.collected.clear();
  }

  // --- Getters ---
  getCurrentEgg(): Egg | null { return this.eggs[this.currentIdx] || null; }
  getEggs(): Egg[] { return this.eggs; }
  getCurrentIndex(): number { return this.currentIdx; }
  isCollected(id: number): boolean { return this.collected.has(id); }
  isFinished(): boolean { return this.currentIdx >= this.eggs.length; }

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
