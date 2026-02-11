import planck from 'planck';
import { SCALE, CAT_GEMINI } from './constants.js';
import { registerObject } from './objects.js';

const ICON_R = 3; // half-size in meters

/**
 * Creates a floating Gemini sparkle icon that follows the mouse cursor.
 * Uses a dynamic body with zero gravity and smooth velocity-based tracking.
 * Supports speech bubbles and a flourish entrance animation.
 */
export function createGeminiIcon(world, canvas) {
  const W = canvas.width / SCALE;
  const H = canvas.height / SCALE;

  // Start off-screen (will be revealed via flourish)
  const initX = W / 2;
  const initY = H + 20; // below the screen
  const body = world.createBody({
    type: 'dynamic',
    position: new planck.Vec2(initX, initY),
    fixedRotation: true,
  });

  body.setGravityScale(0);
  body.setUserData({ isGeminiIcon: true });

  // Diamond hitbox: a box rotated 45°
  const DIAMOND_HALF = ICON_R * 0.7; // half-size of the square before rotation
  body.createFixture(new planck.Box(DIAMOND_HALF, DIAMOND_HALF, new planck.Vec2(0, 0), Math.PI / 4), {
    density: 0.5,
    friction: 0,
    restitution: 0,
    isSensor: true, // doesn't collide, just floats
    filterCategoryBits: CAT_GEMINI,
    filterMaskBits: 0, // collide with nothing
  });

  const obj = {
    body,
    type: 'gemini-icon',
    radius: ICON_R,
    hitShape: 'diamond',
    diamondHalf: DIAMOND_HALF,
    loading: false,
    // Speech bubble
    showSpeech: false,
    speechText: '',
    // Flourish animation state
    visible: false,
    flourishScale: 0,
    flourishStartTime: 0,
    flourishRotation: 0,
    // Danger zone visual feedback (0 = safe, 1 = max danger)
    dangerLevel: 0,
  };
  registerObject(obj);

  // Track mouse position in world coords (default to where Gemini appears)
  let mouseWorldX = W / 2;
  let mouseWorldY = H * 0.65 + 12; // offset to account for OFFSET_Y

  canvas.addEventListener('mousemove', (e) => {
    mouseWorldX = e.clientX / SCALE;
    mouseWorldY = e.clientY / SCALE;
  });

  // Offset so it doesn't sit right on the cursor
  const OFFSET_X = 6;
  const OFFSET_Y = -12;
  const FOLLOW_STRENGTH = 1;

  // FlyTo animation state
  let flyTarget = null;
  let flyCallback = null;
  const FLY_SPEED = 12; // velocity multiplier for flying to target

  // Hold position state (keeps Gemini in place, ignoring mouse)
  let holdPosition = null;

  // Idle floating motion — gentle figure-8-ish bob
  let t = 0;
  const BOB_AMP_X = 1.8;  // meters of horizontal sway
  const BOB_AMP_Y = 2.5;  // meters of vertical bob
  const BOB_FREQ_X = 0.14; // Hz
  const BOB_FREQ_Y = 0.22; // Hz (different from X for lissajous feel)

  // Flourish animation duration
  const FLOURISH_DURATION = 1500; // ms - longer for more dramatic entrance

  function update() {
    if (!obj.visible) return;

    t += 1 / 60;

    // Flourish entrance animation - scale up in place
    if (obj.flourishStartTime > 0) {
      const elapsed = Date.now() - obj.flourishStartTime;
      if (elapsed < FLOURISH_DURATION) {
        const progress = elapsed / FLOURISH_DURATION;

        // Scale: starts tiny, overshoots to 1.2, settles at 1
        let scale;
        if (progress < 0.6) {
          // Zoom in with overshoot
          const t = progress / 0.6;
          scale = t * t * (3 - 2 * t) * 1.2; // smoothstep to 1.2
        } else {
          // Settle back to 1
          const t = (progress - 0.6) / 0.4;
          scale = 1.2 - 0.2 * (t * t * (3 - 2 * t)); // smoothstep back to 1
        }
        obj.flourishScale = scale;

        // Spin the icon during flourish (stored for renderer)
        obj.flourishRotation = progress * Math.PI * 4; // 2 full spins

        // Stay in place - no movement
        body.setLinearVelocity(new planck.Vec2(0, 0));

        return;
      } else {
        obj.flourishScale = 1;
        obj.flourishStartTime = 0; // Animation complete
        obj.flourishRotation = 0;
      }
    }

    // FlyTo animation - move to specific target position
    if (flyTarget) {
      const pos = body.getPosition();
      const dx = flyTarget.x - pos.x;
      const dy = flyTarget.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 1.5) {
        // Arrived at target - hold this position
        holdPosition = { x: flyTarget.x, y: flyTarget.y };
        flyTarget = null;
        if (flyCallback) {
          const cb = flyCallback;
          flyCallback = null;
          cb();
        }
      } else {
        // Fly toward target
        body.setLinearVelocity(new planck.Vec2(dx * FLY_SPEED, dy * FLY_SPEED));
        return;
      }
    }

    // Hold position - stay at fixed location, ignore mouse
    if (holdPosition) {
      const pos = body.getPosition();
      const dx = holdPosition.x - pos.x;
      const dy = holdPosition.y - pos.y;
      // Gently stay in place with slight bob
      const bobX = Math.sin(t * BOB_FREQ_X * Math.PI * 2) * BOB_AMP_X * 0.3;
      const bobY = Math.sin(t * BOB_FREQ_Y * Math.PI * 2) * BOB_AMP_Y * 0.3;
      body.setLinearVelocity(new planck.Vec2((dx + bobX) * 2, (dy + bobY) * 2));
      return;
    }

    const bobX = Math.sin(t * BOB_FREQ_X * Math.PI * 2) * BOB_AMP_X;
    const bobY = Math.sin(t * BOB_FREQ_Y * Math.PI * 2) * BOB_AMP_Y;

    const pos = body.getPosition();
    const targetX = mouseWorldX + OFFSET_X + bobX;
    const targetY = mouseWorldY + OFFSET_Y + bobY;
    const dx = targetX - pos.x;
    const dy = targetY - pos.y;

    body.setLinearVelocity(new planck.Vec2(dx * FOLLOW_STRENGTH, dy * FOLLOW_STRENGTH));
  }

  // Start the flourish entrance animation
  function appear(speechText) {
    obj.visible = true;
    obj.flourishStartTime = Date.now();
    obj.flourishScale = 0;
    // Position further down
    body.setPosition(new planck.Vec2(W / 2, H * 0.65));
    body.setLinearVelocity(new planck.Vec2(0, 0));
    // Set speech bubble
    if (speechText) {
      obj.showSpeech = true;
      obj.speechText = speechText;
    }
  }

  function setSpeech(text, options) {
    if (text) {
      obj.showSpeech = true;
      obj.speechText = text;
      obj.speechLabel = options?.label || null;
    } else {
      obj.showSpeech = false;
      obj.speechText = '';
      obj.speechLabel = null;
    }
  }

  function hideSpeech() {
    obj.showSpeech = false;
    obj.speechText = '';
    obj.speechLabel = null;
  }

  /**
   * Fly to a specific world position, then call callback when arrived.
   * @param {number} x - World X coordinate
   * @param {number} y - World Y coordinate
   * @param {Function} [callback] - Called when Gemini arrives at the position
   */
  function flyTo(x, y, callback) {
    flyTarget = { x, y };
    flyCallback = callback || null;
  }

  /**
   * Cancel any in-progress flyTo animation
   */
  function cancelFlyTo() {
    flyTarget = null;
    flyCallback = null;
  }

  /**
   * Release hold position, allowing Gemini to follow mouse again
   */
  function releaseHold() {
    holdPosition = null;
  }

  return {
    body,
    obj,
    update,
    setLoading(v) { obj.loading = v; },
    setDangerLevel(v) { obj.dangerLevel = v; },
    appear,
    setSpeech,
    hideSpeech,
    flyTo,
    cancelFlyTo,
    releaseHold,
    isVisible() { return obj.visible; },
  };
}
