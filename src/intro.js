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
  FLASH_START: 2500,
  FLASH_END:   3500,
  BAR_FULL:    4000,
  DINO_SPAWN:  4500,  // after bar turns red
  GEMINI_APPEAR: 1500, // ms after dino trips
};

const SPEECH_TEXT = 'OH NOOO THE CRASHING CORRUPTING CORE IS HERE!! ITS GOING TO DESTROY ALL OF US SAVE USSS';
const GEMINI_SPEECH = 'Oh no, Dino! Please help me defeat The Crash! Build things by searching for them!';
const RUN_SPEED = 15;    // m/s rightward

// ─── Sprite image (base64 data URI) ────────────────────────────────────────
const trexImage = new Image();
trexImage.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAhAAAABeAgMAAAAPo8UvAAAADFBMVEX///9TU1P39/f///+TS9URAAAAAXRSTlMAQObYZgAAASdJREFUeF7t1qFOBEEQRdEyGP7vGQy/hsHc/0MPSe8ylU2vKEIqqQnviRZXdI7pyUQuONda901FGAG6j8aa+6mDEUboHP01sk5EHHWEjt/UY0dk/U+Ir/cdkXUEovV1GFF/HQMR/mLWEUYYYQRrf65XRhgB2595Y80lYRjCCG7AV/IZ0FdDabgDhiKMgE+tAX01ES+ajDBCADpHZw0tRdaZCCNEGhCdNSSlQTEVYUROQGeNxxoxH2EErXU+wohdQXONqyBorDsixiB2Be01JiOM2BXQX1MRUxFGpAL6aypiMsIIJCFBtSK98fFYKd6wFDEbYUQgEYh6hTSkonbDDTAdYQTrKNd9QPWGUFwAYYRYR7U+XemGfB0ajTACWEe1Pl3thtxMhBHfOCEbEnR2KZcAAAAASUVORK5CYII=';

// ─── Public factory ────────────────────────────────────────────────────────
export function createIntro(world, canvas, healthBar, geminiIcon, searchBar) {
  const W = canvas.width / SCALE;
  const H = canvas.height / SCALE;

  const startTime = Date.now();
  let dinoBody = null;
  let dinoObj = null;
  let complete = false;
  let dinoSpawned = false;
  let dinoTripped = false;
  let dinoTripTime = 0;
  let geminiAppeared = false;

  // Ground Y: dino feet on top of the footer bar (top edge at H - 7.5)
  const groundY = H - 7.5 - DINO_HH;

  // Trip position: 33% in from the left edge
  const tripX = W * 0.33;

  healthBar.show();

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
      density: 0.2 / dinoArea,
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
    dinoTripTime = Date.now();

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

  // ── Per-frame update ────────────────────────────────────────────────────
  function update() {
    const elapsed = Date.now() - startTime;

    // ── Loading bar progress (stops once bar is full) ─────────────────
    if (!complete) {
      if (elapsed < T.FLASH_START) {
        // Blue bar grows with ease-out cubic up to ~88%
        const t = Math.min(elapsed / T.FLASH_START, 1);
        const progress = 1 - Math.pow(1 - t, 3);
        healthBar.setProgress(progress * 0.88);
        healthBar.setColor('#4285f4');
      } else if (elapsed < T.FLASH_END) {
        // Flash between blue and red every 100ms
        const flashIndex = Math.floor((elapsed - T.FLASH_START) / 100);
        healthBar.setColor(flashIndex % 2 === 0 ? '#4285f4' : '#d93025');
        // Bar continues slowly: 88% → 96%
        const flashT = (elapsed - T.FLASH_START) / (T.FLASH_END - T.FLASH_START);
        healthBar.setProgress(0.88 + flashT * 0.08);
      } else if (elapsed < T.BAR_FULL) {
        // Settle on red, fill 96% → 100%
        healthBar.setColor('#d93025');
        const fillT = (elapsed - T.FLASH_END) / (T.BAR_FULL - T.FLASH_END);
        healthBar.setProgress(0.96 + fillT * 0.04);
      } else {
        // Bar full → intro complete
        healthBar.setIntroComplete();
        complete = true;
      }
    }

    // ── Spawn dino after bar turns red ────────────────────────────────
    if (elapsed >= T.DINO_SPAWN && !dinoSpawned) {
      spawnDino();
    }

    // ── Dino animation & movement (continues after intro completes) ──
    if (dinoBody && !dinoTripped) {
      dinoObj.spriteReady = trexImage.complete;

      // Running animation: alternate frames 2 and 3 every 100ms
      dinoObj.currentFrame = Math.floor(elapsed / 100) % 2 === 0 ? 2 : 3;

      // Run rightward at steady pace
      dinoBody.setLinearVelocity(new planck.Vec2(RUN_SPEED, 0));

      // Check if dino reached the trip point (~33% in from left)
      const pos = dinoBody.getPosition();
      if (pos.x >= tripX) {
        tripDino();
      }
    }

    // ── Gemini icon appearance after dino trips ──
    if (dinoTripped && !geminiAppeared && dinoTripTime > 0) {
      const timeSinceTrip = Date.now() - dinoTripTime;
      if (timeSinceTrip >= T.GEMINI_APPEAR && geminiIcon) {
        geminiAppeared = true;
        geminiIcon.appear(GEMINI_SPEECH);

        // Hide Gemini's intro speech after a few seconds and start placeholder animation
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

  return { update, isComplete, getDinoBody };
}
