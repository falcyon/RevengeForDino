import planck from 'planck';
import { SCALE, CAT_DINO } from './constants.js';
import { registerObject } from './objects.js';

// ─── Sprite constants (1x T-Rex: 44×47 display, source sheet is 2x 88×94) ──
const SPRITE_W = 44;
const SPRITE_H = 47;
const DINO_HW = SPRITE_W / (2 * SCALE);
const DINO_HH = SPRITE_H / (2 * SCALE);

// Hitbox is narrower than the sprite, shifted back (left) and up
const HITBOX_HW = (SPRITE_W - 10) / (2 * SCALE);
const HITBOX_HH = (SPRITE_H + 4) / (2 * SCALE);
const HITBOX_OFFSET_X = -2 / SCALE;
const HITBOX_OFFSET_Y = -5 / SCALE;

// ─── Timeline (milliseconds) ───────────────────────────────────────────────
const T = {
  GEMINI_APPEAR: 0,       // Gemini visible immediately
  GEMINI_GREETING: 1500,  // After flourish, Gemini says hi
  DINO_SPAWN: 2000,       // Dino enters from left
  SEARCH_BAR_SPAWN: 3000, // Search bar appears
  DINO_TRIP: 4500,        // Dino trips, search bar flung
  CRASH_VISIBLE: 5000,    // The Crash appears, Gemini speaks
};

// ─── Element spawn schedule (ms from start) ────────────────────────────────
const SPAWN = {
  FOOTER: 0,
  LOGO_START: 1500,
  LOGO_INTERVAL: 0,
  NAV: 1000,
  SEARCH_BUTTONS: 3500,
  FOOTER_LINKS: 200,
};

const SPEECH_TEXT = 'OH NOOO THE Collapsing Corrupting Core of Crashes IS HERE!! ITS GOING TO DESTROY ALL OF US SAVE USSS';
const GEMINI_GREETING = 'Hi, I\'m Gemini! How can I help you?';
const GEMINI_SPEECH = 'Can you please help me defeat the Collapsing Corrupting Core of Crashes! Build things by searching for them!';
const RUN_SPEED = 15;    // m/s rightward

// ─── Sprite image (base64 data URI) ────────────────────────────────────────
const trexImage = new Image();
trexImage.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAhAAAABeAgMAAAAPo8UvAAAADFBMVEX///9TU1P39/f///+TS9URAAAAAXRSTlMAQObYZgAAASdJREFUeF7t1qFOBEEQRdEyGP7vGQy/hsHc/0MPSe8ylU2vKEIqqQnviRZXdI7pyUQuONda901FGAG6j8aa+6mDEUboHP01sk5EHHWEjt/UY0dk/U+Ir/cdkXUEovV1GFF/HQMR/mLWEUYYYQRrf65XRhgB2595Y80lYRjCCG7AV/IZ0FdDabgDhiKMgE+tAX01ES+ajDBCADpHZw0tRdaZCCNEGhCdNSSlQTEVYUROQGeNxxoxH2EErXU+wohdQXONqyBorDsixiB2Be01JiOM2BXQX1MRUxFGpAL6aypiMsIIJCFBtSK98fFYKd6wFDEbYUQgEYh6hTSkonbDDTAdYQTrKNd9QPWGUFwAYYRYR7U+XemGfB0ajTACWEe1Pl3thtxMhBHfOCEbEnR2KZcAAAAASUVORK5CYII=';

// ─── Public factory ────────────────────────────────────────────────────────
export function createIntro(world, canvas, healthBar, geminiIcon, searchBar, googlePage) {
  const W = canvas.width / SCALE;
  const H = canvas.height / SCALE;

  const startTime = Date.now();
  let dinoBody = null;
  let dinoObj = null;
  let complete = false;
  let dinoSpawned = false;
  let dinoTripped = false;
  let geminiAppeared = false;
  let searchBarSpawned = false;
  let searchBarFlung = false;
  let crashTriggered = false;
  let geminiGreeted = false;

  // Screen shake state
  let shakeIntensity = 0;
  let shakeTime = 0;
  const SHAKE_DURATION = 0.4;
  const SHAKE_INTENSITY = 6;

  // Track which element groups have been spawned
  const spawned = {
    footer: false,
    logo: [],  // Track each letter individually
    nav: false,
    searchButtons: false,
    footerLinks: false,
  };

  // Ground Y: dino feet on top of the footer bar (top edge at H - 7.5)
  const groundY = H - 7.5 - DINO_HH;

  // Store search bar's intended position
  const searchBarTargetX = W * 0.5;
  const searchBarTargetY = H * 0.40;

  // Move search bar off-screen initially
  if (searchBar && searchBar.body) {
    searchBar.body.setPosition(new planck.Vec2(-100, searchBarTargetY));
  }

  healthBar.show();

  // Gemini appears immediately at t=0
  if (geminiIcon) {
    geminiIcon.appear();
  }

  // ── Spawn dino ──────────────────────────────────────────────────────────
  function spawnDino() {
    const spawnX = -20; // offscreen left
    dinoBody = world.createBody({
      type: 'dynamic',
      position: new planck.Vec2(spawnX, groundY),
      fixedRotation: true,
    });
    dinoBody.setGravityScale(0);

    const dinoArea = 4 * HITBOX_HW * HITBOX_HH;
    dinoBody.createFixture(new planck.Box(HITBOX_HW, HITBOX_HH, new planck.Vec2(HITBOX_OFFSET_X, HITBOX_OFFSET_Y), Math.PI / 6), {
      density: 0.3 / dinoArea,
      friction: 0.5,
      restitution: 0.1,
      filterCategoryBits: CAT_DINO,
      filterMaskBits: 0, // no collisions while running (cinematic)
    });

    dinoObj = {
      body: dinoBody,
      type: 'dino',
      hw: DINO_HW,
      hh: DINO_HH,
      sprite: trexImage,
      spriteReady: trexImage.complete,
      currentFrame: 2,
      showSpeech: true,
      speechText: SPEECH_TEXT,
    };
    registerObject(dinoObj);
    dinoSpawned = true;
  }

  // ── Trip the dino ─────────────────────────────────────────────────────
  function tripDino() {
    dinoTripped = true;

    // Enable gravity so it falls
    dinoBody.setGravityScale(1);

    // Allow rotation so it tumbles
    dinoBody.setFixedRotation(false);

    // Dead sprite (frame 4: X eyes)
    dinoObj.currentFrame = 4;

    // Hide speech bubble after a few seconds
    setTimeout(() => { dinoObj.showSpeech = false; }, 6000);

    // Upward fling with a bit of forward momentum and clockwise spin
    dinoBody.setLinearVelocity(new planck.Vec2(5, -10));
    dinoBody.setAngularVelocity(2);

    // Delay enabling collisions so the dino clears the ground first
    setTimeout(() => {
      const fixture = dinoBody.getFixtureList();
      if (fixture) {
        fixture.setFilterData({
          categoryBits: CAT_DINO,
          maskBits: 0xFFFF,
          groupIndex: 0,
        });
      }
    }, 150);
  }

  // ── Fling the search bar ─────────────────────────────────────────────
  function flingSearchBar() {
    if (!searchBar || !searchBar.body) return;

    const body = searchBar.body;

    // Convert from static to dynamic
    body.setType('dynamic');
    body.setGravityScale(1);

    // Fling slightly to the right with some upward arc
    body.setLinearVelocity(new planck.Vec2(8, -5));
    body.setAngularVelocity(0.5);
  }

  // ── Spawn elements progressively ───────────────────────────────────────
  function updateElementSpawn(elapsed) {
    if (!googlePage) return;

    // Footer bar (background - first)
    if (!spawned.footer && elapsed >= SPAWN.FOOTER) {
      spawned.footer = true;
      googlePage.spawnFooter();
    }

    // Logo letters (one by one with slight delay)
    for (let i = 0; i < googlePage.logoLetterCount; i++) {
      const letterTime = SPAWN.LOGO_START + i * SPAWN.LOGO_INTERVAL;
      if (!spawned.logo[i] && elapsed >= letterTime) {
        spawned.logo[i] = true;
        googlePage.spawnLogoLetter(i);
      }
    }

    // Top navigation
    if (!spawned.nav && elapsed >= SPAWN.NAV) {
      spawned.nav = true;
      googlePage.spawnNav();
    }

    // Search buttons
    if (!spawned.searchButtons && elapsed >= SPAWN.SEARCH_BUTTONS) {
      spawned.searchButtons = true;
      googlePage.spawnSearchButtons();
    }

    // Footer links
    if (!spawned.footerLinks && elapsed >= SPAWN.FOOTER_LINKS) {
      spawned.footerLinks = true;
      googlePage.spawnFooterLinks();
    }
  }

  // ── Per-frame update ────────────────────────────────────────────────────
  function update() {
    const elapsed = Date.now() - startTime;

    // ── Spawn elements progressively ──────────────────────────────────
    updateElementSpawn(elapsed);

    // ── Gemini greeting after flourish ────────────────────────────────
    if (elapsed >= T.GEMINI_GREETING && !geminiGreeted && geminiIcon) {
      geminiGreeted = true;
      geminiIcon.setSpeech(GEMINI_GREETING);
    }

    // ── Spawn dino at t=2000 ──────────────────────────────────────────
    if (elapsed >= T.DINO_SPAWN && !dinoSpawned) {
      spawnDino();
    }

    // ── Spawn search bar at t=3000 ────────────────────────────────────
    if (elapsed >= T.SEARCH_BAR_SPAWN && !searchBarSpawned && searchBar && searchBar.body) {
      searchBarSpawned = true;
      searchBar.body.setPosition(new planck.Vec2(searchBarTargetX, searchBarTargetY));
    }

    // ── Dino animation & movement ─────────────────────────────────────
    if (dinoBody && !dinoTripped) {
      dinoObj.spriteReady = trexImage.complete;

      // Running animation: alternate frames 2 and 3 every 100ms
      dinoObj.currentFrame = Math.floor(elapsed / 100) % 2 === 0 ? 2 : 3;

      // Run rightward at steady pace
      dinoBody.setLinearVelocity(new planck.Vec2(RUN_SPEED, 0));
    }

    // ── Dino trips + search bar flung at t=4500 ───────────────────────
    if (elapsed >= T.DINO_TRIP && !dinoTripped && dinoBody) {
      tripDino();
    }

    if (elapsed >= T.DINO_TRIP && !searchBarFlung && searchBar && searchBar.body) {
      searchBarFlung = true;
      flingSearchBar();
      // Trigger screen shake
      shakeIntensity = SHAKE_INTENSITY;
      shakeTime = SHAKE_DURATION;
    }

    // ── Crash visible + Gemini speech at t=5000 ───────────────────────
    if (elapsed >= T.CRASH_VISIBLE && !crashTriggered) {
      crashTriggered = true;
      complete = true;
      healthBar.setIntroComplete();

      // Gemini speaks when crash appears
      if (geminiIcon && !geminiAppeared) {
        geminiAppeared = true;
        geminiIcon.setSpeech(GEMINI_SPEECH);

        // Hide speech after a few seconds and start placeholder animation
        setTimeout(() => {
          if (geminiIcon) {
            geminiIcon.hideSpeech();
          }
          if (searchBar) {
            searchBar.startAnimatedPlaceholder();
          }
        }, 5000);
      }
    }
  }

  function isComplete() {
    return complete;
  }

  function getDinoBody() {
    return dinoBody;
  }

  // Get screen shake offset (called by renderer)
  function getShake(dt) {
    if (shakeTime <= 0) return { x: 0, y: 0 };

    shakeTime -= dt;
    const t = shakeTime / SHAKE_DURATION;
    const intensity = shakeIntensity * t;

    return {
      x: (Math.random() - 0.5) * 2 * intensity,
      y: (Math.random() - 0.5) * 2 * intensity,
    };
  }

  return { update, isComplete, getDinoBody, getShake };
}
