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
      const spawnX = W * 0.75 + Math.random() * (W * 0.2);
      const spawnY = H * 0.25;
      executor.execute(cached, spawnX, spawnY);
      gameState.trackObjectCreated();
      // Show the cached code in Gemini's speech bubble
      showCodeInSpeechBubble(cached);
      return;
    }

    const { code } = await generateObject(text);

    // Spawn at the top-right area of the world
    const spawnX = W * 0.75 + Math.random() * (W * 0.2);
    const spawnY = H * 0.15;

    executor.execute(code, spawnX, spawnY);
    gameState.trackObjectCreated();
    cache.set(key, code);
    // Show the generated code in Gemini's speech bubble
    showCodeInSpeechBubble(code);
  } catch (e) {
    console.error('Generation failed:', e);
    overlay.showError(e.message);
  } finally {
    isGenerating = false;
    searchBar.setLoading(false);
    geminiIcon.setLoading(false);
  }
}

// Show code in Gemini's speech bubble, then hide after a few seconds
function showCodeInSpeechBubble(code) {
  if (!geminiIcon.isVisible()) return;
  geminiIcon.setSpeech(code);
  setTimeout(() => {
    geminiIcon.hideSpeech();
  }, 6000);
}

// Google landing page elements (all start static, become dynamic on drag)
createGooglePage(world);
const searchBar = createSearchBar(world, W * 0.5, H * 0.40, handleSearch);

// --- Gemini icon ---
const geminiIcon = createGeminiIcon(world, canvas);

// --- Input ---
const inputState = setupInput(canvas, world);

// --- Renderer ---
const renderer = createRenderer(canvas, getObjects, { jointDots: [] }, inputState);

// --- Intro & Health Bar ---
const healthBar = createHealthBar(canvas);
const intro = createIntro(world, canvas, healthBar, geminiIcon, searchBar);

// --- Combat system ---
const gameState = createGameState(healthBar);
const crash = createCrash(world, gameState, healthBar, W, H);
const crashRenderer = createCrashRenderer(canvas, crash, gameState, world);
const combatHUD = createCombatHUD(canvas, gameState, geminiIcon, intro);

// Wire up target provider to aim at The Crash's eye
executor.setTargetProvider(() => crash.getEyePosition());
let combatSpawnScheduled = false;
let crashDestroyed = false;

// --- Game loop ---
function loop() {
  const state = gameState.getState();

  // Intro state machine (loading bar, dino, etc.)
  intro.update();

  // Spawn The Crash after intro completes
  if (intro.isComplete() && !combatSpawnScheduled && state === 'idle') {
    combatSpawnScheduled = true;
    setTimeout(() => gameState.start(), CRASH_SPAWN_DELAY);
  }

  // Run all updaters from generated objects (with auto-removal on error)
  if (state !== 'defeat') {
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
  }

  geminiIcon.update();

  // Update combat
  if (gameState.isActive()) {
    gameState.update(1 / 60);
    crash.update(1 / 60);
  }

  // Victory cleanup (once)
  if (state === 'victory' && !crashDestroyed) {
    crashDestroyed = true;
    crash.destroy();
  }

  // Physics step (skip on defeat to freeze everything)
  if (state !== 'defeat') {
    world.step(1 / 60, 8, 3);
  }

  cleanupOOB();
  renderer.draw();
  crashRenderer.draw();
  healthBar.draw();
  overlay.draw();
  combatHUD.draw();
  requestAnimationFrame(loop);
}

loop();
