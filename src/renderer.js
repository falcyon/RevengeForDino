import { SCALE, COLORS, DEBUG } from './constants.js';

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

  // Weathering effect state
  let weatheringIntensity = 0;
  const WEATHERING_START = 3000;   // Start after 3 seconds
  const WEATHERING_RAMP = 15000;   // Full intensity over 15 more seconds

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
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, width, height);

    // Weathering effects on background
    drawWeatheringEffects(width, height);

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

    // All tracked bodies
    const objects = getObjects();
    let cursorObj = null;
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      if (obj.type === 'cursor') { cursorObj = obj; continue; }

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
      } else if (obj.type === 'gemini-icon') {
        drawGeminiIcon(ctx, obj);
      } else if (obj.type === 'dino') {
        drawDino(ctx, obj);
      } else {
        drawRect(ctx, obj);
      }

      if (DEBUG) {
        drawDebugHitbox(ctx, obj);
        drawMassLabel(ctx, obj);
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

    // Cursor drawn last (always on top)
    if (cursorObj) {
      const cpos = cursorObj.body.getPosition();
      ctx.save();
      ctx.translate(cpos.x * SCALE, cpos.y * SCALE);
      drawCursorArrow(ctx);
      ctx.restore();
    }
  }

  return { draw };
}

// ---------------------------------------------------------------------------
// Gemini sparkle icon (4-pointed star with bezier-eased rotation)
// ---------------------------------------------------------------------------

function bezierEase(t) {
  // Cubic bezier ease-in-out approximation
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
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

  // Rounded rect fill
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = obj.color;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Border
  ctx.strokeStyle = obj.borderColor;
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

  // Bezier-eased spin when loading
  if (obj.loading) {
    const period = 1500;
    const raw = (Date.now() % period) / period;
    const eased = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;
    ctx.rotate(eased * Math.PI * 2);
  }

  // Flourish sparkle effect during entrance
  if (obj.flourishStartTime && obj.flourishScale < 1) {
    const elapsed = Date.now() - obj.flourishStartTime;
    const sparkleAlpha = Math.max(0, 1 - elapsed / 800);
    if (sparkleAlpha > 0) {
      // Draw expanding sparkle rings
      ctx.globalAlpha = sparkleAlpha * 0.5;
      for (let i = 1; i <= 3; i++) {
        const ringR = r * (1 + i * 0.4 * (1 - sparkleAlpha));
        ctx.beginPath();
        ctx.arc(0, 0, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = i % 2 === 0 ? '#4285f4' : '#a259ff';
        ctx.lineWidth = 3 - i * 0.5;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  // Gemini sparkle: four-pointed star drawn with bezier curves
  const grad = ctx.createLinearGradient(-r, -r, r, r);
  grad.addColorStop(0.5, '#4285f4');
  grad.addColorStop(1, '#efb401');
  grad.addColorStop(0.2, '#e43e2b');

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
    drawGeminiSpeechBubble(ctx, obj.speechText, r);
    ctx.restore();
  }
}

function drawGeminiSpeechBubble(ctx, text, iconRadius) {
  const maxWidth = 280;
  const padding = 10;
  const fontSize = 11;
  const lineHeight = 14;
  const tailH = 10;
  const maxLines = 8; // Show more lines for regular text, truncate code after 5

  // Check if this is code (starts with common code patterns)
  const isCode = text.includes('function') || text.includes('const ') ||
                 text.includes('let ') || text.includes('world.') ||
                 text.includes('planck.') || text.includes('{');

  ctx.font = isCode ? `${fontSize}px monospace` : `bold ${fontSize}px Arial, sans-serif`;

  // Split by newlines first for code, then word wrap
  let lines = [];
  if (isCode) {
    const codeLines = text.split('\n');
    for (const line of codeLines) {
      if (lines.length >= 5) {
        lines.push('...');
        break;
      }
      // Truncate long lines
      const truncated = line.length > 40 ? line.substring(0, 37) + '...' : line;
      lines.push(truncated);
    }
  } else {
    // Word wrap for regular text
    const words = text.split(' ');
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      if (ctx.measureText(testLine).width > maxWidth - padding * 2) {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
        if (lines.length >= maxLines) {
          lines.push('...');
          break;
        }
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine && lines.length < maxLines) lines.push(currentLine);
  }

  // Calculate bubble dimensions
  let bubbleW = padding * 2;
  for (const line of lines) {
    bubbleW = Math.max(bubbleW, ctx.measureText(line).width + padding * 2);
  }
  bubbleW = Math.min(bubbleW, maxWidth);
  const bubbleH = lines.length * lineHeight + padding * 2;
  const bubbleX = -bubbleW / 2;
  const bubbleY = -iconRadius - bubbleH - tailH - 8;

  // Bubble background with slight transparency for code
  ctx.fillStyle = isCode ? '#1e1e1e' : '#ffffff';
  ctx.strokeStyle = isCode ? '#4285f4' : '#000000';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 8);
  ctx.fill();
  ctx.stroke();

  // Tail (triangle pointing down toward icon)
  ctx.fillStyle = isCode ? '#1e1e1e' : '#ffffff';
  ctx.strokeStyle = isCode ? '#4285f4' : '#000000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, bubbleY + bubbleH);
  ctx.lineTo(8, bubbleY + bubbleH);
  ctx.lineTo(0, bubbleY + bubbleH + tailH);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Cover the tail join line
  ctx.fillStyle = isCode ? '#1e1e1e' : '#ffffff';
  ctx.fillRect(-7, bubbleY + bubbleH - 2, 14, 4);

  // Text
  ctx.fillStyle = isCode ? '#9cdcfe' : '#000000';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], bubbleX + padding, bubbleY + padding + i * lineHeight);
  }
  ctx.textAlign = 'left';
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
    drawSpeechBubble(ctx, obj.speechText, dh);
    ctx.restore();
  }
}

function drawSpeechBubble(ctx, text, spriteHeight) {
  const maxWidth = 220;
  const padding = 10;
  const fontSize = 12;
  const lineHeight = 16;
  const tailH = 10;

  ctx.font = `bold ${fontSize}px Arial, sans-serif`;

  // Word wrap
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  for (const word of words) {
    const testLine = currentLine ? currentLine + ' ' + word : word;
    if (ctx.measureText(testLine).width > maxWidth - padding * 2) {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const bubbleW = maxWidth;
  const bubbleH = lines.length * lineHeight + padding * 2;
  const bubbleX = -bubbleW / 2;
  const bubbleY = -spriteHeight / 2 - bubbleH - tailH - 5;

  // Bubble background
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 8);
  ctx.fill();
  ctx.stroke();

  // Tail (triangle pointing down toward dino)
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, bubbleY + bubbleH);
  ctx.lineTo(8, bubbleY + bubbleH);
  ctx.lineTo(0, bubbleY + bubbleH + tailH);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Cover the tail join line with white
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-7, bubbleY + bubbleH - 2, 14, 4);

  // Text
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], bubbleX + padding, bubbleY + padding + i * lineHeight);
  }
  ctx.textAlign = 'left';
}

function drawCursorArrow(ctx) {
  // Standard arrow cursor shape (pixel-sized, drawn at body origin)
  // The body origin is the arrow tip (top-left corner of the cursor)
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 21);
  ctx.lineTo(4.2, 16.8);
  ctx.lineTo(8.4, 24);
  ctx.lineTo(11.2, 22.4);
  ctx.lineTo(7, 15.4);
  ctx.lineTo(12.6, 14.7);
  ctx.closePath();

  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.2;
  ctx.lineJoin = 'round';
  ctx.stroke();
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
