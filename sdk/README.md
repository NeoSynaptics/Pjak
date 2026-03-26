# Pjak SDK

Drop-in Easter egg hunt game logic for any app.

## Quick Start

```typescript
import { PjakGame } from './pjak-sdk';

// Connect
const game = new PjakGame('https://your-project.supabase.co', 'your-anon-key');
await game.connectLatest();

// Listen for events
game.on('eggFound', (waypoint, code) => {
  console.log(`Found egg! Code: ${code}`);
  // Show the code to the player
});

game.on('proximity', (distance, isInRange) => {
  console.log(`${Math.round(distance)}m from egg, in range: ${isInRange}`);
});

game.on('currentWaypoint', (wp) => {
  if (wp) console.log(`Next: ${wp.label} at ${wp.lat}, ${wp.lng}`);
});

game.on('gameFinished', () => {
  console.log('All eggs found!');
});

// Feed GPS updates
game.updatePlayerPosition(59.3293, 18.0686);

// Mark egg as collected (after player confirms)
const current = game.getCurrentWaypoint();
if (current) await game.collectEgg(current.id);

// Cleanup
await game.disconnect();
```

## Events

| Event | Args | When |
|---|---|---|
| `gameUpdate` | `(game)` | Game state changes |
| `waypointChange` | `(waypoints[])` | Waypoints added/removed/updated |
| `currentWaypoint` | `(waypoint \| null)` | Current target changes |
| `proximity` | `(distance, isInRange)` | Player position updated |
| `eggFound` | `(waypoint, code)` | Player is within range of an egg |
| `gameFinished` | `()` | All eggs collected |
