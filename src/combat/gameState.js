import {
  CRASH_INITIAL_RADIUS,
  CRASH_MAX_RADIUS,
  CRASH_GROW_RATE,
} from './combatConstants.js';

/**
 * Combat state machine.
 * States: 'idle' → 'entering' → 'combat' → 'victory' | 'defeat'
 */
export function createGameState(healthBar) {
  let state = 'idle';
  let visualRadius = CRASH_INITIAL_RADIUS;
  let elapsed = 0;
  let damageFlash = 0;

  // Stats tracking
  let objectsCreated = 0;
  let objectsConsumed = 0;
  let totalDamageDealt = 0;
  let victoryTime = 0;

  function start() {
    if (state !== 'idle') return;
    state = 'entering';
    visualRadius = CRASH_INITIAL_RADIUS;
    elapsed = 0;
    objectsCreated = 0;
    objectsConsumed = 0;
    totalDamageDealt = 0;
  }

  function enterCombat() {
    if (state === 'entering') state = 'combat';
  }

  function update(dt) {
    if (state !== 'entering' && state !== 'combat') return;

    elapsed += dt;

    // Grow the visual radius over time
    if (state === 'combat') {
      visualRadius += CRASH_GROW_RATE * dt;
    }

    // Decay damage flash
    if (damageFlash > 0) {
      damageFlash = Math.max(0, damageFlash - dt);
    }

    // Win condition: health depleted
    if (healthBar.getHealth() <= 0 && state === 'combat') {
      state = 'victory';
      victoryTime = Date.now();
      return;
    }

    // Lose condition: crash fills screen
    if (visualRadius >= CRASH_MAX_RADIUS) {
      state = 'defeat';
      return;
    }
  }

  function triggerDamageFlash() {
    damageFlash = 0.2;
  }

  function isActive() {
    return state === 'entering' || state === 'combat';
  }

  function getState() {
    return state;
  }

  // Stats tracking methods
  function trackObjectCreated() {
    objectsCreated++;
  }

  function trackObjectConsumed() {
    objectsConsumed++;
  }

  function trackDamage(amount) {
    totalDamageDealt += amount;
  }

  function getStats() {
    return {
      objectsCreated,
      objectsConsumed,
      totalDamageDealt,
      elapsed,
      victoryTime,
    };
  }

  return {
    start,
    enterCombat,
    update,
    triggerDamageFlash,
    isActive,
    getState,
    trackObjectCreated,
    trackObjectConsumed,
    trackDamage,
    getStats,
    get visualRadius() { return visualRadius; },
    get elapsed() { return elapsed; },
    get damageFlash() { return damageFlash; },
    get victoryTime() { return victoryTime; },
  };
}
