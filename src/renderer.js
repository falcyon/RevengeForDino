import { SCALE, COLORS, DEBUG } from './constants.js';
import { drawSpeechBubble } from './speechBubble.js';

/**
 * Creates the renderer that draws the physics scene onto a canvas each frame.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Function} getObjects   – returns the tracked object array
 * @param {object}   sceneRefs    – { jointDots: Joint[] }
 * @param {object}   inputState   – { getMouseTarget, getMouseJoint }
 */
export function createRenderer(canvas, getObjects, sceneRefs, inputState) {
  const ctx = canvas.getContext('2d');
  const startTime = Date.now();
  let lastFrameTime = Date.now();

  // Weathering effect state
  let weatheringIntensity = 0;
  const WEATHERING_START = 3000;   // Start after 3 seconds
  const WEATHERING_RAMP = 15000;   // Full intensity over 15 more seconds

  // Screen shake provider (set via setShakeProvider)
  let shakeProvider = null;

  // Pseudo-random for consistent noise
  let noiseSeed = 0;
  function seededRandom() {
    noiseSeed = (noiseSeed * 1664525 + 1013904223) & 0x7fffffff;
    return noiseSeed / 0x7fffffff;
  }

  function drawWeatheringEffects(width, height) {
    const elapsed = Date.now() - startTime;
    if (elapsed < WEATHERING_START) return;

    // Calculate intensity (0 to 1)
    weatheringIntensity = Math.min(1, (elapsed - WEATHERING_START) / WEATHERING_RAMP);
    const intensity = weatheringIntensity;

    noiseSeed = Math.floor(Date.now() * 3);
    const time = Date.now() * 0.001;

    ctx.save();

    // 1. Subtle color tint shift (getting more red/corrupted)
    ctx.fillStyle = `rgba(255, 240, 235, ${intensity * 0.15})`;
    ctx.fillRect(0, 0, width, height);

    // 2. Random noise specks
    const noiseCount = Math.floor(20 + intensity * 80);
    for (let i = 0; i < noiseCount; i++) {
      const x = seededRandom() * width;
      const y = seededRandom() * height;
      const size = 1 + seededRandom() * 2;
      const alpha = 0.03 + seededRandom() * 0.05 * intensity;

      ctx.fillStyle = seededRandom() > 0.5
        ? `rgba(0, 0, 0, ${alpha})`
        : `rgba(255, 0, 50, ${alpha * 0.5})`;
      ctx.fillRect(x, y, size, size);
    }

    // 4. Occasional glitch bars (horizontal displacement effect)
    if (intensity > 0.3) {
      const glitchCount = Math.floor(intensity * 4);
      for (let i = 0; i < glitchCount; i++) {
        if (seededRandom() > 0.7) {
          const y = seededRandom() * height;
          const h = 1 + seededRandom() * 3;
          const offset = (seededRandom() - 0.5) * 10 * intensity;

          ctx.fillStyle = `rgba(255, 0, 60, ${0.05 * intensity})`;
          ctx.fillRect(offset, y, width, h);
        }
      }
    }

    // 5. Vignette darkening at edges (intensifies over time)
    const vignetteGrad = ctx.createRadialGradient(
      width / 2, height / 2, Math.min(width, height) * 0.3,
      width / 2, height / 2, Math.max(width, height) * 0.8
    );
    vignetteGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignetteGrad.addColorStop(1, `rgba(20, 0, 10, ${intensity * 0.25})`);
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, width, height);

    // 5. Flickering brightness (subtle, starts early)
    if (intensity > 0.1 && Math.sin(time * 15) > 0.95) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.03 * intensity})`;
      ctx.fillRect(0, 0, width, height);
    }

    ctx.restore();
  }

  function draw() {
    const { width, height } = canvas;

    // Calculate delta time for shake decay
    const now = Date.now();
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    // Get shake offset if provider is set
    let shakeX = 0;
    let shakeY = 0;
    if (shakeProvider) {
      const shake = shakeProvider(dt);
      shakeX = shake.x;
      shakeY = shake.y;
    }

    ctx.clearRect(0, 0, width, height);

    // Apply shake transform
    ctx.save();
    ctx.translate(shakeX, shakeY);

    // Background
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(-shakeX, -shakeY, width, height);

    // Weathering effects on background (disabled for now)
    // drawWeatheringEffects(width, height);

    // Wall border
    ctx.strokeStyle = COLORS.wall;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);

    // Joint dots
    ctx.fillStyle = COLORS.jointDot;
    ctx.globalAlpha = 0.5;
    for (const j of sceneRefs.jointDots) {
      const a = j.getAnchorA();
      ctx.beginPath();
      ctx.arc(a.x * SCALE, a.y * SCALE, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // All tracked bodies (gemini-icon drawn last to stay on top)
    const objects = getObjects();
    let geminiObj = null;

    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];

      // Skip hidden objects (e.g., Google UI on victory)
      if (obj.hidden) continue;

      // Skip objects with invalid or destroyed bodies
      if (!obj.body || typeof obj.body.getAngle !== 'function') {
        continue;
      }

      // Defer gemini-icon to draw last
      if (obj.type === 'gemini-icon') {
        geminiObj = obj;
        continue;
      }

      const pos = obj.body.getPosition();
      const angle = obj.body.getAngle();

      ctx.save();
      ctx.translate(pos.x * SCALE, pos.y * SCALE);
      ctx.rotate(angle);

      if (obj.type === 'circle') {
        drawCircle(ctx, obj);
      } else if (obj.type === 'searchbar') {
        drawSearchBar(ctx, obj);
      } else if (obj.type === 'logoletter') {
        drawLogoLetter(ctx, obj);
      } else if (obj.type === 'button') {
        drawButton(ctx, obj);
      } else if (obj.type === 'textlink') {
        drawTextLink(ctx, obj);
      } else if (obj.type === 'appsgrid') {
        drawAppsGrid(ctx, obj);
      } else if (obj.type === 'footerbar') {
        drawFooterBar(ctx, obj);
      } else if (obj.type === 'dino') {
        drawDino(ctx, obj);
      } else if (obj.type === 'victory-text') {
        drawVictoryText(ctx, obj);
      } else if (obj.type === 'victory-button') {
        drawVictoryButton(ctx, obj);
      } else if (obj.type === 'defeat-text') {
        drawDefeatText(ctx, obj);
      } else if (obj.type === 'defeat-button') {
        drawDefeatButton(ctx, obj);
      } else {
        drawRect(ctx, obj);
      }

      if (DEBUG) {
        drawDebugHitbox(ctx, obj);
        drawMassLabel(ctx, obj);
      }

      ctx.restore();
    }

    // Draw Gemini icon last so it's always on top
    if (geminiObj && !geminiObj.hidden) {
      const pos = geminiObj.body.getPosition();
      const angle = geminiObj.body.getAngle();
      ctx.save();
      ctx.translate(pos.x * SCALE, pos.y * SCALE);
      ctx.rotate(angle);
      drawGeminiIcon(ctx, geminiObj);
      if (DEBUG) {
        drawDebugHitbox(ctx, geminiObj);
        drawMassLabel(ctx, geminiObj);
      }
      ctx.restore();
    }

    // Mouse joint tether
    const target = inputState.getMouseTarget();
    const joint = inputState.getMouseJoint();
    if (joint && target) {
      const bodyPos = joint.getBodyB().getPosition();

      ctx.beginPath();
      ctx.moveTo(target.x * SCALE, target.y * SCALE);
      ctx.lineTo(bodyPos.x * SCALE, bodyPos.y * SCALE);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(target.x * SCALE, target.y * SCALE, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fill();
    }

    // End shake transform
    ctx.restore();
  }

  function setShakeProvider(provider) {
    shakeProvider = provider;
  }

  return { draw, setShakeProvider };
}

// ---------------------------------------------------------------------------
// Gemini sparkle icon (4-pointed star with bezier-eased rotation)
// ---------------------------------------------------------------------------

function bezierEase(t) {
  // Cubic bezier ease-in-out approximation
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Linearly interpolate between two hex colors
 */
function lerpColor(color1, color2, t) {
  const c1 = parseInt(color1.slice(1), 16);
  const c2 = parseInt(color2.slice(1), 16);

  const r1 = (c1 >> 16) & 0xff;
  const g1 = (c1 >> 8) & 0xff;
  const b1 = c1 & 0xff;

  const r2 = (c2 >> 16) & 0xff;
  const g2 = (c2 >> 8) & 0xff;
  const b2 = c2 & 0xff;

  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function drawGeminiSparkle(ctx, cx, cy, size) {
  const period = 2000; // ms per full rotation
  const raw = (Date.now() % period) / period;
  const angle = bezierEase(raw) * Math.PI * 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  // 4-pointed star using bezier curves
  const outer = size;
  const inner = size * 0.3;

  // Gemini gradient: blue to purple
  const grad = ctx.createLinearGradient(-outer, -outer, outer, outer);
  grad.addColorStop(0, '#4285f4');
  grad.addColorStop(0.5, '#a259ff');
  grad.addColorStop(1, '#4285f4');

  ctx.beginPath();
  ctx.moveTo(0, -outer);
  ctx.bezierCurveTo(inner * 0.4, -inner, inner, -inner * 0.4, outer, 0);
  ctx.bezierCurveTo(inner, inner * 0.4, inner * 0.4, inner, 0, outer);
  ctx.bezierCurveTo(-inner * 0.4, inner, -inner, inner * 0.4, -outer, 0);
  ctx.bezierCurveTo(-inner, -inner * 0.4, -inner * 0.4, -inner, 0, -outer);
  ctx.closePath();

  ctx.fillStyle = grad;
  ctx.fill();

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Shape drawing helpers
// ---------------------------------------------------------------------------

function drawCircle(ctx, obj) {
  const r = obj.radius * SCALE;

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = obj.color;
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Rotation indicator
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(r * 0.8, 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawSearchBar(ctx, obj) {
  const w = obj.hw * 2 * SCALE;
  const h = obj.hh * 2 * SCALE;
  const r = h / 2;             // pill-shaped corners (radius = half height)
  const x = -w / 2;
  const y = -h / 2;

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;

  // Rounded rect fill (greyed out when loading)
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = obj.loading ? '#f0f0f0' : obj.color;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Border
  ctx.strokeStyle = obj.loading ? '#ccc' : obj.borderColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Clip so text doesn't overflow the rounded rect
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.clip();

  if (obj.loading) {
    // --- Loading state: animated "Gemini is cooking..." text ---
    const textX = x + h * 0.6;
    const fontSize = Math.max(10, h * 0.38);
    ctx.font = `${fontSize}px Arial, sans-serif`;
    ctx.textBaseline = 'middle';
    const dotCount = (Math.floor(Date.now() / 400) % 3) + 1;
    ctx.fillStyle = '#4285f4';
    ctx.fillText('Gemini is cooking' + '.'.repeat(dotCount), textX, 0);
  } else {
    // --- Normal state ---
    // Magnifying glass icon (left side)
    const iconX = x + h * 0.6;
    const iconY = 0;
    const iconR = h * 0.18;
    ctx.strokeStyle = COLORS.searchBarText;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(iconX, iconY, iconR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(iconX + iconR * 0.7, iconY + iconR * 0.7);
    ctx.lineTo(iconX + iconR * 1.5, iconY + iconR * 1.5);
    ctx.stroke();

    // Text — user input or placeholder
    const textX = iconX + iconR * 2 + 6;
    const fontSize = Math.max(10, h * 0.38);
    ctx.font = `${fontSize}px Arial, sans-serif`;
    ctx.textBaseline = 'middle';

    if (obj.text) {
      ctx.fillStyle = '#202124';
      ctx.fillText(obj.text, textX, 0);
      const textW = ctx.measureText(obj.text).width;
      if (Math.floor(Date.now() / 530) % 2 === 0) {
        ctx.fillStyle = '#202124';
        ctx.fillRect(textX + textW + 2, -fontSize * 0.45, 1.5, fontSize * 0.9);
      }
    } else if (obj.focused) {
      if (Math.floor(Date.now() / 530) % 2 === 0) {
        ctx.fillStyle = '#202124';
        ctx.fillRect(textX, -fontSize * 0.45, 1.5, fontSize * 0.9);
      }
    } else if (obj.animatedPlaceholder) {
      // Show animated placeholder with typing effect
      ctx.fillStyle = '#5f6368';
      ctx.fillText(obj.animatedPlaceholder, textX, 0);
      // Blinking cursor at end of animated text
      const textW = ctx.measureText(obj.animatedPlaceholder).width;
      if (Math.floor(Date.now() / 530) % 2 === 0) {
        ctx.fillStyle = '#5f6368';
        ctx.fillRect(textX + textW + 2, -fontSize * 0.45, 1.5, fontSize * 0.9);
      }
    } else if (obj.victoryPlaceholder) {
      // Victory mode: show playground message
      ctx.fillStyle = '#0F9D58'; // Google green
      ctx.fillText(obj.victoryPlaceholder, textX, 0);
    } else {
      ctx.fillStyle = COLORS.searchBarText;
      ctx.fillText('Search Google or type a URL', textX, 0);
    }
  }

  ctx.restore();
}

function drawRect(ctx, obj) {
  const w = obj.hw * 2 * SCALE;
  const h = obj.hh * 2 * SCALE;

  ctx.fillStyle = obj.color;
  ctx.fillRect(-w / 2, -h / 2, w, h);

  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
}

// ---------------------------------------------------------------------------
// Google landing page element helpers
// ---------------------------------------------------------------------------

function drawLogoLetter(ctx, obj) {
  const h = obj.hh * 2 * SCALE;
  const fontSize = obj.fontSize || h * 0.7;
  ctx.font = `bold ${fontSize}px "Product Sans", Arial, sans-serif`;
  ctx.fillStyle = obj.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tx = obj.textOffsetX || 0;
  const ty = obj.textOffsetY || 0;
  ctx.fillText(obj.char, tx, ty);
  ctx.textAlign = 'left';
}

function drawButton(ctx, obj) {
  const w = obj.hw * 2 * SCALE;
  const h = obj.hh * 2 * SCALE;
  const r = obj.rounded ? h / 2 : 4;

  // Background
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, r);
  ctx.fillStyle = obj.bgColor;
  ctx.fill();

  // Border
  ctx.strokeStyle = obj.borderColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Label
  const fontSize = Math.max(12, h * 0.42);
  ctx.font = `500 ${fontSize}px Arial, sans-serif`;
  ctx.fillStyle = obj.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(obj.label, 0, 0);
  ctx.textAlign = 'left';
}

function drawTextLink(ctx, obj) {
  const h = obj.hh * 2 * SCALE;
  const fontSize = Math.max(12, h * 0.5);
  ctx.font = `${fontSize}px Arial, sans-serif`;
  ctx.fillStyle = obj.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(obj.label, 0, 0);
  ctx.textAlign = 'left';
}

function drawVictoryText(ctx, obj) {
  const h = obj.hh * 2 * SCALE;
  const fontSize = Math.max(36, h * 0.8);

  ctx.font = `bold ${fontSize}px "Product Sans", Arial, sans-serif`;
  ctx.fillStyle = '#00ff41';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(obj.label, 0, 0);
  ctx.textAlign = 'left';
}

function drawVictoryButton(ctx, obj) {
  const w = obj.hw * 2 * SCALE;
  const h = obj.hh * 2 * SCALE;
  const r = h / 2;

  // Background with glow
  ctx.save();
  ctx.shadowColor = '#4285f4';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, r);
  ctx.fillStyle = '#4285f4';
  ctx.fill();
  ctx.restore();

  // Label
  const fontSize = Math.max(14, h * 0.45);
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(obj.label, 0, 0);
  ctx.textAlign = 'left';
}

function drawDefeatText(ctx, obj) {
  const h = obj.hh * 2 * SCALE;
  const fontSize = Math.max(36, h * 0.8);
  const time = Date.now() * 0.001;

  // Glitch offset
  const glitchX = (Math.sin(time * 20) * 2 + Math.random() - 0.5) * 3;
  const glitchY = (Math.cos(time * 15) + Math.random() - 0.5) * 2;

  ctx.save();
  ctx.font = `bold ${fontSize}px "Product Sans", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Ghost copies for glitch effect
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = obj.glitchColor1 || '#ff0040';
  ctx.fillText(obj.label, glitchX + 3, glitchY - 2);
  ctx.fillStyle = obj.glitchColor2 || '#00ff41';
  ctx.fillText(obj.label, -glitchX - 2, -glitchY + 2);

  // Main text - flicker between colors
  ctx.globalAlpha = 1;
  const colors = obj.colors || ['#ff0040', '#ffffff'];
  ctx.fillStyle = colors[Math.floor(time * 8) % colors.length];
  ctx.fillText(obj.label, 0, 0);

  ctx.textAlign = 'left';
  ctx.restore();
}

function drawDefeatButton(ctx, obj) {
  const w = obj.hw * 2 * SCALE;
  const h = obj.hh * 2 * SCALE;
  const r = h / 2;

  // Background with red glow
  ctx.save();
  ctx.shadowColor = '#ff0040';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, r);
  ctx.fillStyle = '#ff0040';
  ctx.fill();
  ctx.restore();

  // Label
  const fontSize = Math.max(14, h * 0.45);
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(obj.label, 0, 0);
  ctx.textAlign = 'left';
}

function drawAppsGrid(ctx, obj) {
  const h = obj.hh * 2 * SCALE;
  const dotR = Math.max(2, h * 0.08);
  const spacing = h * 0.25;

  ctx.fillStyle = '#5f6368';
  for (let row = -1; row <= 1; row++) {
    for (let col = -1; col <= 1; col++) {
      ctx.beginPath();
      ctx.arc(col * spacing, row * spacing, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawFooterBar(ctx, obj) {
  const w = obj.hw * 2 * SCALE;
  const h = Math.max(1, obj.hh * 2 * SCALE);
  ctx.fillStyle = obj.bgColor;
  ctx.fillRect(-w / 2, -h / 2, w, h);
}

function drawGeminiIcon(ctx, obj) {
  // Don't draw if not visible yet
  if (!obj.visible) return;

  const baseR = obj.radius * SCALE;
  // Apply flourish scale
  const scale = obj.flourishScale !== undefined ? obj.flourishScale : 1;
  const r = baseR * scale;

  if (r <= 0) return;

  ctx.save();

  // Flourish rotation during entrance animation
  if (obj.flourishRotation) {
    ctx.rotate(obj.flourishRotation);
  } else if (obj.loading) {
    // Bezier-eased spin when loading
    const period = 1500;
    const raw = (Date.now() % period) / period;
    const eased = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;
    ctx.rotate(eased * Math.PI * 2);
  }

  // Flourish sparkle effect during entrance
  if (obj.flourishStartTime && obj.flourishScale < 1) {
    const elapsed = Date.now() - obj.flourishStartTime;
    const progress = Math.min(elapsed / 1500, 1);

    // Sparkle particles flying outward
    const numSparkles = 8;
    for (let i = 0; i < numSparkles; i++) {
      const angle = (i / numSparkles) * Math.PI * 2 + elapsed * 0.003;
      const dist = r * (0.5 + progress * 2);
      const sparkleSize = r * 0.15 * (1 - progress);
      const alpha = (1 - progress) * 0.8;

      if (alpha > 0 && sparkleSize > 0) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(Math.cos(angle) * dist, Math.sin(angle) * dist);
        ctx.rotate(angle + elapsed * 0.01);

        // Mini 4-pointed star
        ctx.fillStyle = i % 2 === 0 ? '#4285f4' : '#fbbc04';
        ctx.beginPath();
        ctx.moveTo(0, -sparkleSize);
        ctx.quadraticCurveTo(sparkleSize * 0.3, -sparkleSize * 0.3, sparkleSize, 0);
        ctx.quadraticCurveTo(sparkleSize * 0.3, sparkleSize * 0.3, 0, sparkleSize);
        ctx.quadraticCurveTo(-sparkleSize * 0.3, sparkleSize * 0.3, -sparkleSize, 0);
        ctx.quadraticCurveTo(-sparkleSize * 0.3, -sparkleSize * 0.3, 0, -sparkleSize);
        ctx.fill();
        ctx.restore();
      }
    }

    // Glowing ring
    const ringAlpha = Math.sin(progress * Math.PI) * 0.6;
    if (ringAlpha > 0) {
      ctx.globalAlpha = ringAlpha;
      ctx.beginPath();
      ctx.arc(0, 0, r * (1.2 + progress * 0.5), 0, Math.PI * 2);
      ctx.strokeStyle = '#a259ff';
      ctx.lineWidth = 4 * (1 - progress);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Danger zone visual feedback: stretch and warning glow
  const dangerLevel = obj.dangerLevel || 0;
  if (dangerLevel > 0) {
    // Pulsing warning glow
    const pulseTime = Date.now() * 0.008;
    const pulseIntensity = 0.5 + Math.sin(pulseTime) * 0.5;
    const glowAlpha = dangerLevel * pulseIntensity * 0.6;

    ctx.save();
    ctx.globalAlpha = glowAlpha;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ff0040';
    ctx.fill();
    ctx.restore();

    // Apply stretch distortion toward void (horizontal stretch simulates pull)
    const stretchX = 1 + dangerLevel * 0.4; // stretch up to 40% wider
    const stretchY = 1 - dangerLevel * 0.2; // compress up to 20% shorter
    ctx.scale(stretchX, stretchY);
  }

  // Gemini sparkle: four-pointed star drawn with bezier curves
  const grad = ctx.createLinearGradient(-r, -r, r, r);

  // Shift colors toward red/warning when in danger
  if (dangerLevel > 0.3) {
    const t = (dangerLevel - 0.3) / 0.7; // 0 to 1 as danger increases
    grad.addColorStop(0.5, lerpColor('#4285f4', '#ff4040', t));
    grad.addColorStop(1, lerpColor('#efb401', '#ff0040', t));
    grad.addColorStop(0.2, '#e43e2b');
  } else {
    grad.addColorStop(0.5, '#4285f4');
    grad.addColorStop(1, '#efb401');
    grad.addColorStop(0.2, '#e43e2b');
  }

  ctx.fillStyle = grad;
  ctx.beginPath();

  // Four-pointed star via quadratic curves
  const tip = r * 0.95;
  const mid = r * 0.18;
  ctx.moveTo(0, -tip);
  ctx.quadraticCurveTo(mid, -mid, tip, 0);
  ctx.quadraticCurveTo(mid, mid, 0, tip);
  ctx.quadraticCurveTo(-mid, mid, -tip, 0);
  ctx.quadraticCurveTo(-mid, -mid, 0, -tip);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  // Speech bubble (counter-rotate so it stays upright, drawn after restore)
  if (obj.showSpeech && obj.speechText && scale >= 0.8) {
    ctx.save();
    ctx.rotate(-obj.body.getAngle());
    drawSpeechBubble(ctx, {
      text: obj.speechText,
      anchorX: 0,
      anchorY: -r,
      maxWidth: 280,
      theme: 'auto',
      tailDirection: 'down',
      label: obj.speechLabel || null,
    });
    ctx.restore();
  }
}

function drawDino(ctx, obj) {
  if (!obj.spriteReady || !obj.sprite) return;

  const frame = obj.currentFrame;
  // Source crop from the 2x sprite sheet (88×94 per frame)
  const sx = frame * 88;
  const sw = 88;
  const sh = 94;
  // Display at 1x size derived from physics half-extents
  const dw = obj.hw * 2 * SCALE;
  const dh = obj.hh * 2 * SCALE;

  // Dino sprite naturally faces right (direction of travel from left)
  ctx.drawImage(obj.sprite, sx, 0, sw, sh, -dw / 2, -dh / 2, dw, dh);

  // Speech bubble (counter-rotate so it stays upright)
  if (obj.showSpeech && obj.speechText) {
    ctx.save();
    ctx.rotate(-obj.body.getAngle());
    drawSpeechBubble(ctx, {
      text: obj.speechText,
      anchorX: 0,
      anchorY: -dh / 2,
      maxWidth: 220,
      theme: 'light',
      tailDirection: 'down',
    });
    ctx.restore();
  }
}

function drawMassLabel(ctx, obj) {
  const body = obj.body;
  if (!body) return;
  const mass = body.getMass();
  // Static bodies have mass 0 — show the fixture density * area instead
  let label;
  if (mass > 0) {
    label = mass.toFixed(1) + 'kg';
  } else {
    // Compute from fixture density for static bodies
    const f = body.getFixtureList();
    if (!f) return;
    const d = f.getDensity();
    const shape = f.getShape();
    let area = 0;
    if (shape.getType() === 'circle') {
      const r = shape.getRadius();
      area = Math.PI * r * r;
    } else if (shape.getType() === 'polygon') {
      // Approximate with bounding box from half-widths
      if (obj.hw != null && obj.hh != null) {
        area = 4 * obj.hw * obj.hh;
      }
    }
    const effectiveMass = d * area;
    label = effectiveMass.toFixed(1) + 'kg*';
  }

  // Offset below the object center
  const offsetY = obj.radius ? obj.radius * SCALE + 10 : (obj.hh ? obj.hh * SCALE + 10 : 15);

  ctx.save();
  ctx.rotate(-obj.body.getAngle()); // unrotate so text is always upright
  ctx.font = 'bold 10px monospace';
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(label, 0, offsetY);
  ctx.restore();
}

function drawDebugHitbox(ctx, obj) {
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = '#ff0000';
  ctx.lineWidth = 1.5;

  // Read actual fixture shape from the Box2D body for accurate hitbox visualization
  let drawn = false;
  try {
    const fixture = obj.body && obj.body.getFixtureList();
    if (fixture) {
      const shape = fixture.getShape();
      const type = shape.getType();
      if (type === 'circle') {
        const r = shape.getRadius() * SCALE;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
        drawn = true;
      } else if (type === 'polygon') {
        const verts = shape.m_vertices;
        const count = shape.m_count;
        if (verts && count > 0) {
          ctx.beginPath();
          for (let i = 0; i < count; i++) {
            const v = verts[i];
            const px = v.x * SCALE;
            const py = v.y * SCALE;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
          drawn = true;
        }
      }
    }
  } catch (_) { /* fall through to legacy drawing */ }

  if (!drawn) {
    if (obj.hitShape === 'diamond') {
      const s = obj.diamondHalf * SCALE;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s, 0);
      ctx.closePath();
      ctx.stroke();
    } else if (obj.hitShape === 'circle' || obj.type === 'circle') {
      const r = obj.radius * SCALE;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (obj.hw != null && obj.hh != null) {
      const w = obj.hw * 2 * SCALE;
      const h = obj.hh * 2 * SCALE;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
    }
  }
  ctx.globalAlpha = 1.0;
}
