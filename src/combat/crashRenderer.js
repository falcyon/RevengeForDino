import { SCALE, COLORS, DEBUG } from '../constants.js';
import {
  CRASH_INITIAL_RADIUS,
  SUCTION_STRENGTH,
  SUCTION_GROWTH,
} from './combatConstants.js';

// Error text fragments that float inside the void
const ERROR_TEXTS = [
  'Aw, Snap!',
  'ERR_CONNECTION_RESET',
  "This page isn't working",
  ':(',
  'ERR_CRASHED',
  'SIGKILL',
  'fatal error',
  'null',
  'undefined',
  '0xDEAD',
];

// Pre-generate some drifting text particles
const TEXT_PARTICLES = [];
for (let i = 0; i < 12; i++) {
  TEXT_PARTICLES.push({
    text: ERROR_TEXTS[i % ERROR_TEXTS.length],
    angle: Math.random() * Math.PI * 2,
    radiusFrac: 0.2 + Math.random() * 0.6, // fraction of visual radius
    speed: 0.1 + Math.random() * 0.3,       // radians per second
    fontSize: 8 + Math.random() * 10,
    alpha: 0.15 + Math.random() * 0.35,
  });
}

// Victory explosion particles - generated when victory happens
const EXPLOSION_PARTICLES = [];
const SCATTERED_TEXTS = [];

/**
 * Renders The Crash entity — void visual, glitch edge, static noise,
 * error text, eye, damage flash, and screen corruption.
 */
export function createCrashRenderer(canvas, crash, gameState, world) {
  const ctx = canvas.getContext('2d');

  // Noise seed that changes each frame for static effect
  let noiseSeed = 0;

  // Victory animation state
  let victoryStarted = false;
  let eyeFallY = 0;
  let eyeFallVy = 0;
  let eyeRotation = 0;
  let eyeFinalY = 0;

  // Simple pseudo-random from seed
  function seededRandom() {
    noiseSeed = (noiseSeed * 1664525 + 1013904223) & 0x7fffffff;
    return noiseSeed / 0x7fffffff;
  }

  function initVictoryAnimation(px, py, pr, eyePx, eyePy, eyePr) {
    if (victoryStarted) return;
    victoryStarted = true;

    eyeFallY = eyePy;
    eyeFallVy = -8; // Initial upward pop
    eyeFinalY = canvas.height - eyePr - 20;

    // Generate explosion particles
    EXPLOSION_PARTICLES.length = 0;
    for (let i = 0; i < 50; i++) {
      const angle = (i / 50) * Math.PI * 2 + Math.random() * 0.5;
      EXPLOSION_PARTICLES.push({
        x: px,
        y: py,
        vx: Math.cos(angle) * (100 + Math.random() * 200),
        vy: Math.sin(angle) * (100 + Math.random() * 200),
        size: 5 + Math.random() * 20,
        color: ['#ff0040', '#00ff41', '#4285f4', '#ff00ff', '#ffffff'][Math.floor(Math.random() * 5)],
        alpha: 1,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 10,
      });
    }

    // Generate scattered error texts
    SCATTERED_TEXTS.length = 0;
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      SCATTERED_TEXTS.push({
        text: ERROR_TEXTS[Math.floor(Math.random() * ERROR_TEXTS.length)],
        x: px,
        y: py,
        vx: Math.cos(angle) * (50 + Math.random() * 150),
        vy: Math.sin(angle) * (50 + Math.random() * 150) - 100,
        fontSize: 12 + Math.random() * 24,
        alpha: 1,
        rotation: (Math.random() - 0.5) * 0.5,
        rotationSpeed: (Math.random() - 0.5) * 3,
      });
    }
  }

  function updateVictoryAnimation(dt) {
    // Update eye fall
    eyeFallVy += 800 * dt; // gravity
    eyeFallY += eyeFallVy * dt;
    eyeRotation += 5 * dt;

    // Bounce off ground
    if (eyeFallY >= eyeFinalY) {
      eyeFallY = eyeFinalY;
      eyeFallVy = -eyeFallVy * 0.4;
      if (Math.abs(eyeFallVy) < 20) eyeFallVy = 0;
    }

    // Update explosion particles
    for (const p of EXPLOSION_PARTICLES) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 300 * dt; // gravity
      p.alpha = Math.max(0, p.alpha - dt * 0.4);
      p.rotation += p.rotationSpeed * dt;
    }

    // Update scattered texts
    for (const t of SCATTERED_TEXTS) {
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.vy += 200 * dt; // gravity
      t.alpha = Math.max(0, t.alpha - dt * 0.15);
      t.rotation += t.rotationSpeed * dt;

      // Bounce off ground
      if (t.y > canvas.height - 30) {
        t.y = canvas.height - 30;
        t.vy = -t.vy * 0.5;
        t.vx *= 0.8;
      }
    }
  }

  function drawVictoryAnimation(eyePr) {
    const dt = 1 / 60;
    updateVictoryAnimation(dt);

    // Draw explosion particles
    for (const p of EXPLOSION_PARTICLES) {
      if (p.alpha <= 0) continue;
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }

    // Draw scattered error texts
    ctx.save();
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of SCATTERED_TEXTS) {
      if (t.alpha <= 0) continue;
      ctx.save();
      ctx.globalAlpha = t.alpha;
      ctx.translate(t.x, t.y);
      ctx.rotate(t.rotation);
      ctx.font = `bold ${t.fontSize}px monospace`;
      ctx.fillStyle = '#00ff41';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeText(t.text, 0, 0);
      ctx.fillText(t.text, 0, 0);
      ctx.restore();
    }
    ctx.restore();

    // Draw fallen eye at center-bottom
    const eyeX = canvas.width / 2;
    ctx.save();
    ctx.translate(eyeX, eyeFallY);
    ctx.rotate(eyeRotation);
    drawEyeLocal(0, 0, eyePr);
    ctx.restore();
  }

  // Eye drawing without position transform (for victory animation)
  function drawEyeLocal(ex, ey, er) {
    // Dimmed/defeated look
    ctx.globalAlpha = 0.7;

    // Outer glow (dimmer)
    const glowGrad = ctx.createRadialGradient(ex, ey, er * 0.3, ex, ey, er * 1.5);
    glowGrad.addColorStop(0, 'rgba(100, 32, 32, 0.3)');
    glowGrad.addColorStop(1, 'rgba(100, 32, 32, 0)');
    ctx.beginPath();
    ctx.arc(ex, ey, er * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = glowGrad;
    ctx.fill();

    // Iris — darker, defeated
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    const irisGrad = ctx.createRadialGradient(ex, ey, 0, ex, ey, er);
    irisGrad.addColorStop(0, '#330000');
    irisGrad.addColorStop(0.5, '#550000');
    irisGrad.addColorStop(1, '#440000');
    ctx.fillStyle = irisGrad;
    ctx.fill();

    // X marks (dead eyes)
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 4;
    const xSize = er * 0.5;
    ctx.beginPath();
    ctx.moveTo(ex - xSize, ey - xSize);
    ctx.lineTo(ex + xSize, ey + xSize);
    ctx.moveTo(ex + xSize, ey - xSize);
    ctx.lineTo(ex - xSize, ey + xSize);
    ctx.stroke();

    ctx.globalAlpha = 1;
  }

  function draw() {
    const state = gameState.getState();

    if (!gameState.isActive() && state !== 'victory' && state !== 'defeat') return;

    const center = crash.getCenter();
    const eyePos = crash.getEyePosition();
    const radius = gameState.visualRadius;

    const px = center.x * SCALE;
    const py = center.y * SCALE;
    const pr = radius * SCALE;
    const eyePx = eyePos.x * SCALE;
    const eyePy = eyePos.y * SCALE;
    const eyePr = crash.getEyeRadius() * SCALE;

    noiseSeed = Math.floor(Date.now() * 7);

    // Victory animation
    if (state === 'victory') {
      initVictoryAnimation(px, py, pr, eyePx, eyePy, eyePr);
      drawVictoryAnimation(eyePr);
      return;
    }

    // --- Screen corruption (when large) ---
    if (radius > CRASH_INITIAL_RADIUS * 2) {
      drawScreenCorruption(pr);
    }

    // --- Void visual (dark circle with glitch edge) ---
    drawVoidBody(px, py, pr);

    // --- Static noise inside void ---
    drawStaticNoise(px, py, pr);

    // --- Error text fragments ---
    drawErrorTexts(px, py, pr);

    // --- Eye visual ---
    drawEye(eyePx, eyePy, eyePr);

    // --- Damage flash ---
    if (gameState.damageFlash > 0) {
      drawDamageFlash(px, py, pr, eyePx, eyePy, eyePr);
    }

    // --- Debug: suction lines to every affected body ---
    if (DEBUG && world) {
      drawSuctionLines(px, py, center);
    }
  }

  function drawVoidBody(px, py, pr) {
    ctx.save();

    // Radial gradient: opaque black center → semi-transparent edge
    const grad = ctx.createRadialGradient(px, py, 0, px, py, pr);
    grad.addColorStop(0, 'rgba(5, 0, 5, 0.95)');
    grad.addColorStop(0.5, 'rgba(10, 0, 10, 0.9)');
    grad.addColorStop(0.75, 'rgba(20, 0, 15, 0.7)');
    grad.addColorStop(0.9, 'rgba(40, 0, 20, 0.4)');
    grad.addColorStop(1, 'rgba(60, 0, 30, 0)');

    // Jagged edge via sine wave distortion
    const time = Date.now() * 0.001;
    const segments = 80;

    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      // Layered sine distortion for organic edge
      const distort = 1
        + 0.04 * Math.sin(angle * 7 + time * 3)
        + 0.03 * Math.sin(angle * 13 - time * 5)
        + 0.02 * Math.sin(angle * 23 + time * 8);
      const r = pr * distort;
      const x = px + Math.cos(angle) * r;
      const y = py + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Glitchy red edge glow
    ctx.strokeStyle = COLORS.crashEdge;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.4 + 0.15 * Math.sin(time * 6);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Green glitch lines on edge
    ctx.strokeStyle = COLORS.crashGlitch;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.2;
    for (let i = 0; i < 5; i++) {
      const a1 = seededRandom() * Math.PI * 2;
      const a2 = a1 + 0.2 + seededRandom() * 0.5;
      ctx.beginPath();
      for (let j = 0; j <= 8; j++) {
        const a = a1 + (a2 - a1) * (j / 8);
        const r = pr * (0.92 + seededRandom() * 0.12);
        const x = px + Math.cos(a) * r;
        const y = py + Math.sin(a) * r;
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  function drawStaticNoise(px, py, pr) {
    ctx.save();

    // Clip to void area
    ctx.beginPath();
    ctx.arc(px, py, pr * 0.9, 0, Math.PI * 2);
    ctx.clip();

    // Random colored rectangles cycling inside
    const noiseCount = Math.min(60, Math.floor(pr * 0.3));
    for (let i = 0; i < noiseCount; i++) {
      const angle = seededRandom() * Math.PI * 2;
      const dist = seededRandom() * pr * 0.85;
      const nx = px + Math.cos(angle) * dist;
      const ny = py + Math.sin(angle) * dist;
      const nw = 2 + seededRandom() * 8;
      const nh = 1 + seededRandom() * 3;

      const colors = ['#ff0040', '#00ff41', '#4285f4', '#ffffff', '#ff00ff'];
      ctx.fillStyle = colors[Math.floor(seededRandom() * colors.length)];
      ctx.globalAlpha = 0.05 + seededRandom() * 0.15;
      ctx.fillRect(nx, ny, nw, nh);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawErrorTexts(px, py, pr) {
    ctx.save();

    // Clip to void area
    ctx.beginPath();
    ctx.arc(px, py, pr * 0.85, 0, Math.PI * 2);
    ctx.clip();

    const time = Date.now() * 0.001;

    for (const p of TEXT_PARTICLES) {
      const angle = p.angle + time * p.speed;
      const dist = p.radiusFrac * pr;
      const tx = px + Math.cos(angle) * dist;
      const ty = py + Math.sin(angle) * dist;

      ctx.font = `bold ${p.fontSize}px monospace`;
      ctx.fillStyle = COLORS.crashGlitch;
      ctx.globalAlpha = p.alpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.text, tx, ty);
    }

    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.restore();
  }

  function drawEye(ex, ey, er) {
    ctx.save();

    // Outer glow
    const glowGrad = ctx.createRadialGradient(ex, ey, er * 0.3, ex, ey, er * 2);
    glowGrad.addColorStop(0, 'rgba(255, 32, 32, 0.4)');
    glowGrad.addColorStop(0.5, 'rgba(255, 32, 32, 0.15)');
    glowGrad.addColorStop(1, 'rgba(255, 32, 32, 0)');
    ctx.beginPath();
    ctx.arc(ex, ey, er * 2, 0, Math.PI * 2);
    ctx.fillStyle = glowGrad;
    ctx.fill();

    // Iris — dark red circle with concentric rings
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    const irisGrad = ctx.createRadialGradient(ex, ey, 0, ex, ey, er);
    irisGrad.addColorStop(0, '#660000');
    irisGrad.addColorStop(0.5, '#aa0000');
    irisGrad.addColorStop(0.8, '#cc1111');
    irisGrad.addColorStop(1, '#880000');
    ctx.fillStyle = irisGrad;
    ctx.fill();

    // Concentric iris rings
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.3)';
    ctx.lineWidth = 1;
    for (let r = er * 0.3; r < er; r += er * 0.2) {
      ctx.beginPath();
      ctx.arc(ex, ey, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Fracture lines from center
    const time = Date.now() * 0.001;
    ctx.strokeStyle = 'rgba(255, 100, 50, 0.4)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + time * 0.2;
      ctx.beginPath();
      ctx.moveTo(ex + Math.cos(angle) * er * 0.15, ey + Math.sin(angle) * er * 0.15);
      ctx.lineTo(ex + Math.cos(angle) * er * 0.95, ey + Math.sin(angle) * er * 0.95);
      ctx.stroke();
    }

    // Pupil — bright white/red center
    const pupilR = er * 0.25;
    const pupilGrad = ctx.createRadialGradient(ex, ey, 0, ex, ey, pupilR);
    pupilGrad.addColorStop(0, COLORS.crashEyePupil);
    pupilGrad.addColorStop(0.6, '#ff6666');
    pupilGrad.addColorStop(1, '#ff2020');
    ctx.beginPath();
    ctx.arc(ex, ey, pupilR, 0, Math.PI * 2);
    ctx.fillStyle = pupilGrad;
    ctx.fill();

    ctx.restore();
  }

  function drawDamageFlash(px, py, pr, ex, ey, er) {
    const t = gameState.damageFlash / 0.2; // 1→0 decay

    ctx.save();

    // White pulse ring on the eye
    ctx.beginPath();
    ctx.arc(ex, ey, er * (1 + (1 - t) * 1.5), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, ${t * 0.8})`;
    ctx.lineWidth = 3 * t;
    ctx.stroke();

    // Brief white fill on eye
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${t * 0.3})`;
    ctx.fill();

    // Edge pulse on the void
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, ${t * 0.25})`;
    ctx.lineWidth = 4 * t;
    ctx.stroke();

    ctx.restore();
  }

  function drawScreenCorruption(pr) {
    const intensity = Math.min(1, (pr / SCALE - CRASH_INITIAL_RADIUS * 2) / (60 * SCALE));
    const barCount = Math.floor(3 + intensity * 8);

    ctx.save();
    for (let i = 0; i < barCount; i++) {
      const y = seededRandom() * canvas.height;
      const h = 1 + seededRandom() * 4;
      const offset = (seededRandom() - 0.5) * 20 * intensity;

      ctx.globalAlpha = 0.03 + seededRandom() * 0.08 * intensity;

      // Glitch bar: offset a horizontal strip
      try {
        const stripW = Math.floor(canvas.width);
        const stripH = Math.max(1, Math.floor(h));
        const srcY = Math.max(0, Math.min(Math.floor(y), canvas.height - stripH));
        if (stripW > 0 && stripH > 0 && srcY >= 0) {
          ctx.drawImage(canvas, 0, srcY, stripW, stripH, offset, srcY, stripW, stripH);
        }
      } catch (e) {
        // Canvas read may fail in some contexts
      }

      // Random colored bar overlay
      const colors = ['#ff0040', '#00ff41', '#4285f4'];
      ctx.fillStyle = colors[Math.floor(seededRandom() * colors.length)];
      ctx.fillRect(0, y, canvas.width, h);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawSuctionLines(px, py, center) {
    const radius = gameState.visualRadius;
    const growDelta = radius - CRASH_INITIAL_RADIUS;
    const strength = SUCTION_STRENGTH + SUCTION_GROWTH * growDelta;

    ctx.save();
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let b = world.getBodyList(); b; b = b.getNext()) {
      const ud = b.getUserData();
      if (ud?.isCursor || ud?.isGeminiIcon || ud?.isCrash || ud?.isEphemeral) continue;
      if (b.getType() === 'kinematic') continue;
      // Skip walls (static bodies with no meaningful userData)
      if (b.getType() === 'static' && !ud?.isPageElement && !ud?.isFooterBar) continue;

      const pos = b.getWorldCenter();
      const dx = center.x - pos.x;
      const dy = center.y - pos.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < 1) continue;

      const dist = Math.sqrt(distSq);
      const force = strength / dist;

      const bx = pos.x * SCALE;
      const by = pos.y * SCALE;

      // Line color: green → yellow → red as force increases
      const t = Math.min(force / 50, 1);
      const r = Math.floor(255 * t);
      const g = Math.floor(255 * (1 - t * 0.5));
      const lineColor = `rgba(${r}, ${g}, 0, 0.4)`;

      // Line thickness: 1px at low force, up to 6px at high force
      const thickness = Math.min(1 + (force / 10), 6);

      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(bx, by);
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = thickness;
      ctx.stroke();

      // Force label at midpoint with dark background
      const mx = (px + bx) / 2;
      const my = (py + by) / 2;
      const label = force.toFixed(1);
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(mx - tw / 2 - 2, my - 6, tw + 4, 12);
      ctx.fillStyle = `rgb(${r}, ${g}, 0)`;
      ctx.fillText(label, mx, my);
    }

    ctx.restore();
  }

  return { draw };
}
