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
  };
  registerObject(obj);

  // Track mouse position in world coords
  let mouseWorldX = W / 2;
  let mouseWorldY = H / 2;

  canvas.addEventListener('mousemove', (e) => {
    mouseWorldX = e.clientX / SCALE;
    mouseWorldY = e.clientY / SCALE;
  });

  // Offset so it doesn't sit right on the cursor
  const OFFSET_X = 6;
  const OFFSET_Y = -12;
  const FOLLOW_STRENGTH = 1;

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

    // Flourish entrance animation - dramatic spiral zoom
    if (obj.flourishStartTime > 0) {
      const elapsed = Date.now() - obj.flourishStartTime;
      if (elapsed < FLOURISH_DURATION) {
        const progress = elapsed / FLOURISH_DURATION;

        // Scale: starts tiny, overshoots to 1.3, settles at 1
        let scale;
        if (progress < 0.6) {
          // Zoom in with overshoot
          const t = progress / 0.6;
          scale = t * t * (3 - 2 * t) * 1.3; // smoothstep to 1.3
        } else {
          // Settle back to 1
          const t = (progress - 0.6) / 0.4;
          scale = 1.3 - 0.3 * (t * t * (3 - 2 * t)); // smoothstep back to 1
        }
        obj.flourishScale = scale;

        // Spiral path from bottom-center up to final position
        const spiralRadius = (1 - progress) * 15; // shrinks from 15 to 0
        const spiralAngle = progress * Math.PI * 4; // 2 full rotations
        const centerX = W / 2;
        const centerY = H * 0.75;

        // Start from below screen, spiral up
        const startY = H + 10;
        const currentY = startY + (centerY - startY) * Math.pow(progress, 0.5);

        const targetX = centerX + Math.cos(spiralAngle) * spiralRadius;
        const targetY = currentY + Math.sin(spiralAngle) * spiralRadius * 0.5;

        const pos = body.getPosition();
        const dx = targetX - pos.x;
        const dy = targetY - pos.y;
        body.setLinearVelocity(new planck.Vec2(dx * 8, dy * 8));

        // Spin the icon during flourish (stored for renderer)
        obj.flourishRotation = progress * Math.PI * 6; // 3 full spins

        return;
      } else {
        obj.flourishScale = 1;
        obj.flourishStartTime = 0; // Animation complete
        obj.flourishRotation = 0;
      }
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
    // Position at center
    body.setPosition(new planck.Vec2(W / 2, H / 2));
    body.setLinearVelocity(new planck.Vec2(0, 0));
    // Set speech bubble
    if (speechText) {
      obj.showSpeech = true;
      obj.speechText = speechText;
    }
  }

  function setSpeech(text) {
    if (text) {
      obj.showSpeech = true;
      obj.speechText = text;
    } else {
      obj.showSpeech = false;
      obj.speechText = '';
    }
  }

  function hideSpeech() {
    obj.showSpeech = false;
    obj.speechText = '';
  }

  return {
    body,
    obj,
    update,
    setLoading(v) { obj.loading = v; },
    appear,
    setSpeech,
    hideSpeech,
    isVisible() { return obj.visible; },
  };
}
