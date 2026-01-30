import { SCALE } from './constants.js';
import { createWorld } from './world.js';
import { getObjects } from './objects.js';
import { createSearchBar } from './searchbar.js';
import { createGooglePage } from './googlepage.js';
import { setupInput } from './input.js';
import { createRenderer } from './renderer.js';
import { generateObject, normalizePrompt } from './gemini.js';
import { createExecutor } from './executor.js';
import { createLoadingOverlay } from './loading.js';
import { createCache } from './cache.js';
import { createGeminiIcon } from './geminiIcon.js';
import { createHealthBar } from './healthBar.js';
import { createIntro } from './intro.js';
import { createGameState } from './combat/gameState.js';
import { createCrash } from './combat/theCrash.js';
import { createCrashRenderer } from './combat/crashRenderer.js';
import { createCombatHUD } from './combat/combatHUD.js';
import { CRASH_SPAWN_DELAY } from './combat/combatConstants.js';
import { CURATED_OBJECTS } from './curatedCache.js';

// --- Canvas setup ---
const canvas = document.getElementById('c');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- Physics ---
const world = createWorld();

const W = canvas.width / SCALE;
const H = canvas.height / SCALE;

// --- OOB cleanup: destroy spawned (Gemini/cache) bodies that leave the screen ---
function cleanupOOB() {
  const objs = getObjects();
  for (let i = objs.length - 1; i >= 0; i--) {
    const obj = objs[i];
    if (!obj.spawned) continue;
    const p = obj.body.getPosition();
    if (p.x < -W * 0.1 || p.x > W * 1.1 || p.y < -H * 0.1 || p.y > H * 1.1) {
      objs.splice(i, 1);
      world.destroyBody(obj.body);
    }
  }
}

// --- AI object generation ---
const executor = createExecutor(world);
const overlay = createLoadingOverlay(canvas);
const cache = createCache();
let isGenerating = false;

async function handleSearch(text, searchBarBody) {
  if (!intro.isComplete()) return;
  if (isGenerating) return;
  isGenerating = true;
  searchBar.setLoading(true);
  geminiIcon.setLoading(true);

  // Stop animated placeholder when user starts searching
  searchBar.stopAnimatedPlaceholder();

  try {
    // Normalize prompt via Gemini Flash → 1-2 word cache key
    const key = await normalizePrompt(text);
    console.log('[Normalize]', text, '→', key);

    // Check cache (localStorage L1, then Firebase L2)
    const cached = await cache.get(key);
    if (cached) {
      // Spawn below Gemini's current position
      await animateGeminiSpawn(cached);
      gameState.trackObjectCreated();
      return;
    }

    const { code } = await generateObject(text);

    // Spawn below Gemini's current position
    await animateGeminiSpawn(code);
    gameState.trackObjectCreated();
    cache.set(key, code);
  } catch (e) {
    console.error('Generation failed:', e);
    overlay.showError(e.message);
  } finally {
    isGenerating = false;
    searchBar.setLoading(false);
    geminiIcon.setLoading(false);
  }
}

/**
 * Gemini shows code, waits, then spawns object below its current position.
 * @param {string} code - The code to execute
 * @returns {Promise} - Resolves when animation completes and object is spawned
 */
function animateGeminiSpawn(code) {
  return new Promise((resolve) => {
    // Get Gemini's current position - spawn below it
    const geminiPos = geminiIcon.body.getPosition();
    const spawnX = geminiPos.x;
    const spawnY = geminiPos.y + 8; // Spawn 8 meters below Gemini

    if (!geminiIcon.isVisible()) {
      // If Gemini isn't visible, just spawn immediately at default location
      executor.execute(code, W * 0.5, H * 0.3);
      resolve();
      return;
    }

    // Show code in speech bubble
    geminiIcon.setSpeech(code);

    // Wait 2 seconds, then spawn the object
    setTimeout(() => {
      // Get position again in case Gemini moved
      const pos = geminiIcon.body.getPosition();
      executor.execute(code, pos.x, pos.y + 8);

      // Hide speech bubble 3 seconds after spawn (5 total)
      setTimeout(() => {
        geminiIcon.hideSpeech();
        resolve();
      }, 3000);
    }, 2000);
  });
}

// Google landing page - returns spawn functions for delayed loading
const googlePage = createGooglePage(world);
const searchBar = createSearchBar(world, W * 0.5, H * 0.40, handleSearch);

// --- Gemini icon ---
const geminiIcon = createGeminiIcon(world, canvas);

// --- Input ---
const inputState = setupInput(canvas, world);

// --- Renderer ---
const renderer = createRenderer(canvas, getObjects, { jointDots: [] }, inputState);

// --- Intro & Health Bar ---
const healthBar = createHealthBar(canvas);
const intro = createIntro(world, canvas, healthBar, geminiIcon, searchBar, googlePage);

// --- Combat system ---
const gameState = createGameState(healthBar);
const crash = createCrash(world, gameState, healthBar, W, H, geminiIcon);
const crashRenderer = createCrashRenderer(canvas, crash, gameState, world);
const combatHUD = createCombatHUD(canvas, gameState, geminiIcon, intro, searchBar, world, crash, executor);

// Wire up target provider to aim at The Crash's eye, or center-bottom in playground mode
executor.setTargetProvider(() => {
  const state = gameState.getState();
  // In victory/defeat (playground mode), use center of screen as target
  if (state === 'victory' || state === 'defeat') {
    return { x: W * 0.5, y: H * 0.7 };
  }
  // During combat, aim at The Crash's eye
  const eyePos = crash.getEyePosition();
  if (eyePos) return eyePos;
  // Fallback
  return { x: W * 0.5, y: H * 0.7 };
});

// Wire up screen shake from The Crash and intro to the renderer
renderer.setShakeProvider((dt) => {
  const crashShake = crash.getShake(dt);
  const introShake = intro.getShake(dt);
  return {
    x: crashShake.x + introShake.x,
    y: crashShake.y + introShake.y,
  };
});

// --- "I'm Feeling Lucky" button spawns random curated object ---
// (click handler set up after buttons spawn in intro)
let luckyAnimating = false;
let luckyClickHandlerSet = false;
function setupLuckyClickHandler() {
  if (luckyClickHandlerSet) return;
  const luckyButton = googlePage.getLuckyButton();
  if (!luckyButton) return;
  luckyClickHandlerSet = true;

  inputState.onClickBody(luckyButton, async () => {
    if (!intro.isComplete()) return;
    if (luckyAnimating) return;
    luckyAnimating = true;

    const keys = Object.keys(CURATED_OBJECTS);
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    const code = CURATED_OBJECTS[randomKey];

    // Spawn below Gemini's current position
    await animateGeminiSpawn(code);
    gameState.trackObjectCreated();
    console.log('[Feeling Lucky]', randomKey);

    luckyAnimating = false;
  });
}

let combatSpawnScheduled = false;

// --- Game loop ---
function loop() {
  const state = gameState.getState();

  // Intro state machine (loading bar, dino, etc.)
  intro.update();

  // Set up lucky button click handler once it's spawned
  setupLuckyClickHandler();

  // Spawn The Crash after intro completes
  if (intro.isComplete() && !combatSpawnScheduled && state === 'idle') {
    combatSpawnScheduled = true;
    setTimeout(() => gameState.start(), CRASH_SPAWN_DELAY);
  }

  // Run all updaters from generated objects (with auto-removal on error)
  // Note: clearAll() is called on game over, so new playground spawns still work
  const updaters = executor.getUpdaters();
  for (let i = updaters.length - 1; i >= 0; i--) {
    try {
      updaters[i].update();
      if (updaters[i].dead) updaters.splice(i, 1);
    } catch (e) {
      console.warn('Updater error, removing:', e);
      updaters.splice(i, 1);
    }
  }

  geminiIcon.update();

  // Update combat
  if (gameState.isActive()) {
    gameState.update(1 / 60);
    crash.update(1 / 60);
    // Update Gemini danger level for visual feedback
    geminiIcon.setDangerLevel(crash.getGeminiDangerLevel());
  } else {
    geminiIcon.setDangerLevel(0);
  }

  // Game over cleanup handled by combatHUD now

  // Physics step (always run - defeat screen needs physics for falling text)
  world.step(1 / 60, 8, 3);

  cleanupOOB();
  renderer.draw();
  crashRenderer.draw();
  healthBar.draw();
  overlay.draw();
  combatHUD.draw();
  requestAnimationFrame(loop);
}

loop();
