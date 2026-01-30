import planck from 'planck';
import { clearSpawnedObjects, registerObject, getObjects } from '../objects.js';
import { SCALE } from '../constants.js';

/**
 * Combat HUD — victory and defeat end screens with Box2D physics elements.
 * Both screens share common cleanup and UI creation logic.
 */
export function createCombatHUD(canvas, gameState, geminiIcon, intro, searchBar, world, crash, executor) {
  const ctx = canvas.getContext('2d');

  // Shared state
  let gameOverTime = 0;
  let cleanupDone = false;
  let endScreenBodiesCreated = false;
  let playAgainButtonCreated = false;
  let speechShown = false;

  // Particles
  const particles = [];
  let particlesInitialized = false;

  // Box2D bodies for end screen
  let mainTextBody = null;
  let subtitleBody = null;
  let playAgainBody = null;

  /**
   * Initialize particles (confetti falls for victory, debris rises for defeat)
   */
  function initParticles(isVictory) {
    if (particlesInitialized) return;
    particlesInitialized = true;

    const colors = isVictory
      ? ['#0F9D58', '#F4B400', '#4285F4', '#DB4437']
      : ['#1a1a1a', '#2d2d2d', '#ff0040', '#440015', '#333333'];

    const count = isVictory ? 25 : 50;

    for (let i = 0; i < count; i++) {
      if (isVictory) {
        // Confetti falls from top
        particles.push({
          x: Math.random() * canvas.width,
          y: -20 - Math.random() * 800,
          vx: (Math.random() - 0.5) * 4,
          vy: 2 + Math.random() * 4,
          size: 6 + Math.random() * 10,
          color: colors[Math.floor(Math.random() * colors.length)],
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.3,
          shape: Math.random() > 0.5 ? 'rect' : 'circle',
          rounds: 0,
          maxRounds: 5,
          rising: false,
        });
      } else {
        // Debris rises from bottom
        particles.push({
          x: Math.random() * canvas.width,
          y: canvas.height + 20 + Math.random() * 600,
          vx: (Math.random() - 0.5) * 2,
          vy: -(1 + Math.random() * 2.5), // Negative = rising
          size: 4 + Math.random() * 12,
          color: colors[Math.floor(Math.random() * colors.length)],
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.15,
          shape: Math.random() > 0.3 ? 'rect' : 'triangle',
          rounds: 0,
          maxRounds: 8,
          rising: true,
        });
      }
    }
  }

  function updateParticles() {
    for (const p of particles) {
      if (p.rounds >= p.maxRounds) continue;

      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;

      p.vx += (Math.random() - 0.5) * 0.1;
      p.vx *= 0.98;

      if (p.rising) {
        // Rising debris - slight upward acceleration, slow down over time
        p.vy *= 0.999;
        p.vy = Math.max(p.vy, -3); // Cap rising speed

        // Reset when off top of screen
        if (p.y < -20) {
          p.rounds++;
          if (p.rounds < p.maxRounds) {
            p.y = canvas.height + 20 + Math.random() * 200;
            p.x = Math.random() * canvas.width;
            p.vy = -(0.5 + Math.random() * 2);
          }
        }
      } else {
        // Falling confetti - gravity
        p.vy += 0.08;
        p.vy = Math.min(p.vy, 3);

        // Reset when off bottom of screen
        if (p.y > canvas.height + 20) {
          p.rounds++;
          if (p.rounds < p.maxRounds) {
            p.y = -20;
            p.x = Math.random() * canvas.width;
            p.vy = 0.5 + Math.random() * 2;
          }
        }
      }
    }
  }

  function drawParticles() {
    for (const p of particles) {
      if (p.rounds >= p.maxRounds) continue;
      // Skip if off-screen
      if (p.rising && p.y < -20) continue;
      if (!p.rising && p.y > canvas.height + 20) continue;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;

      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.6);
      } else if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Triangle
        ctx.beginPath();
        ctx.moveTo(0, -p.size / 2);
        ctx.lineTo(p.size / 2, p.size / 2);
        ctx.lineTo(-p.size / 2, p.size / 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /**
   * Common cleanup for both victory and defeat
   */
  function cleanupForGameOver() {
    if (cleanupDone) return;
    cleanupDone = true;

    // Stop all updaters and clear ephemeral bodies (bullets, particles)
    if (executor?.clearAll) {
      executor.clearAll();
    }

    // Remove Google page elements
    const objects = getObjects();
    const typesToRemove = ['logoletter', 'button', 'textlink', 'appsgrid', 'footerbar', 'dino'];
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (typesToRemove.includes(obj.type)) {
        try {
          world.destroyBody(obj.body);
        } catch (e) { /* Body may already be destroyed */ }
        objects.splice(i, 1);
      }
    }

    // Destroy The Crash
    if (crash?.destroy) {
      crash.destroy();
    }

    // Clear spawned objects (AI-generated debris)
    clearSpawnedObjects(world);

    // Restore search bar to center (for both victory and defeat)
    if (searchBar?.restoreForVictory) {
      searchBar.restoreForVictory();
    }
  }

  /**
   * Create main text and subtitle as Box2D bodies
   */
  function createEndScreenBodies(isVictory) {
    if (endScreenBodiesCreated) return;
    endScreenBodiesCreated = true;

    const W = canvas.width / SCALE;
    const H = canvas.height / SCALE;
    const reason = gameState.defeatReason;
    const isGeminiConsumed = reason === 'gemini_consumed';

    // Main text config
    let mainText, textHW, textType, textColors, glitch1, glitch2;

    if (isVictory) {
      mainText = 'VICTORY!';
      textHW = 20;
      textType = 'victory-text';
      textColors = null; // victory-text uses fixed color
      glitch1 = null;
      glitch2 = null;
    } else {
      mainText = isGeminiConsumed ? 'GEMINI LOST.' : 'CRASHED.';
      textHW = isGeminiConsumed ? 22 : 18;
      textType = 'defeat-text';
      textColors = isGeminiConsumed
        ? ['#4285f4', '#a259ff', '#4285f4', '#ffffff']
        : ['#ff0040', '#ffffff'];
      glitch1 = isGeminiConsumed ? '#4285f4' : '#ff0040';
      glitch2 = isGeminiConsumed ? '#a259ff' : '#00ff41';
    }

    const textHH = 4;

    // Create main text body - spawn near top of visible screen so it's immediately visible
    mainTextBody = world.createBody({
      type: 'dynamic',
      position: new planck.Vec2(W / 2, H * 0.15),
      angularDamping: 2.0,
      linearDamping: 0.3,
    });
    mainTextBody.createFixture(new planck.Box(textHW, textHH), {
      density: 0.3,
      friction: 0.5,
      restitution: 0.3,
    });
    mainTextBody.setAngularVelocity((Math.random() - 0.5) * 0.3);

    const mainTextObj = {
      body: mainTextBody,
      type: textType,
      hw: textHW,
      hh: textHH,
      label: mainText,
      color: '#00ff41',
      colors: textColors,
      glitchColor1: glitch1,
      glitchColor2: glitch2,
    };
    registerObject(mainTextObj);

    // Subtitle (only for defeat)
    if (!isVictory) {
      const subtitleText = isGeminiConsumed
        ? 'Consumed by The Crash...'
        : 'The void consumed everything.';
      const subHW = 20;
      const subHH = 1.5;

      subtitleBody = world.createBody({
        type: 'dynamic',
        position: new planck.Vec2(W / 2 + (Math.random() - 0.5) * 10, H * 0.25),
        angularDamping: 2.0,
        linearDamping: 0.3,
      });
      subtitleBody.createFixture(new planck.Box(subHW, subHH), {
        density: 0.25,
        friction: 0.5,
        restitution: 0.2,
      });

      const subtitleObj = {
        body: subtitleBody,
        type: 'defeat-text',
        hw: subHW,
        hh: subHH,
        label: subtitleText,
        colors: ['#888888', '#666666'],
        glitchColor1: '#444444',
        glitchColor2: '#333333',
      };
      registerObject(subtitleObj);
    }
  }

  /**
   * Create Play Again button as Box2D body
   */
  function createPlayAgainButton(isVictory) {
    if (playAgainButtonCreated) return;
    playAgainButtonCreated = true;

    const W = canvas.width / SCALE;
    const H = canvas.height / SCALE;
    const btnHW = 10;
    const btnHH = 2.5;

    // Position below search bar
    let btnX = W / 2;
    let btnY;

    if (searchBar?.body) {
      const pos = searchBar.body.getPosition();
      btnX = pos.x;
      btnY = pos.y + 8;
    } else {
      btnY = H * 0.55; // Fallback: center of screen
    }

    // Both victory and defeat buttons are static below search bar
    playAgainBody = world.createBody({
      type: 'static',
      position: new planck.Vec2(btnX, btnY),
    });
    playAgainBody.setUserData({ draggable: true });

    playAgainBody.createFixture(new planck.Box(btnHW, btnHH), {
      density: 0.4,
      friction: 0.6,
      restitution: 0.3,
    });

    const buttonObj = {
      body: playAgainBody,
      type: isVictory ? 'victory-button' : 'defeat-button',
      hw: btnHW,
      hh: btnHH,
      label: isVictory ? 'Play Again' : 'Try Again',
      color: isVictory ? '#4285F4' : '#ff0040',
    };
    registerObject(buttonObj);

    // Click listener
    canvas.addEventListener('click', (e) => {
      if (!playAgainBody) return;
      const mx = e.clientX / SCALE;
      const my = e.clientY / SCALE;
      const currentPos = playAgainBody.getPosition();
      const angle = playAgainBody.getAngle();

      const dx = mx - currentPos.x;
      const dy = my - currentPos.y;
      const cos = Math.cos(-angle);
      const sin = Math.sin(-angle);
      const localX = dx * cos - dy * sin;
      const localY = dx * sin + dy * cos;

      if (Math.abs(localX) <= btnHW && Math.abs(localY) <= btnHH) {
        window.location.reload();
      }
    });
  }

  /**
   * Show Gemini speech with stats
   */
  function showGeminiSpeech(isVictory) {
    if (speechShown || !geminiIcon) return;

    const reason = gameState.defeatReason;
    const isGeminiConsumed = reason === 'gemini_consumed';

    // Don't show speech if Gemini was consumed
    if (!isVictory && isGeminiConsumed) return;

    speechShown = true;
    const stats = gameState.getStats();

    let speech;
    if (isVictory) {
      const elapsed = stats.elapsed;
      const mins = Math.floor(elapsed / 60);
      const secs = Math.floor(elapsed % 60);
      const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

      speech = `WE DID IT! The Crash is destroyed!\n\n`;
      speech += `Time: ${timeStr}\n`;
      speech += `Objects Created: ${stats.objectsCreated}\n`;
      speech += `Objects Lost: ${stats.objectsConsumed}\n`;
      speech += `Damage Dealt: ${Math.floor(stats.totalDamageDealt)}`;
    } else {
      speech = `The Crash consumed everything...\n\n`;
      speech += `Objects Created: ${stats.objectsCreated}\n`;
      speech += `Objects Lost: ${stats.objectsConsumed}\n`;
      speech += `We'll get it next time!`;
    }

    geminiIcon.setSpeech(speech);
  }

  /**
   * Main draw function - handles both victory and defeat
   */
  function draw() {
    const state = gameState.getState();

    if (state !== 'victory' && state !== 'defeat') return;

    const isVictory = state === 'victory';

    // Track time since game over
    if (gameOverTime === 0) {
      gameOverTime = Date.now();
    }
    const timeSinceGameOver = (Date.now() - gameOverTime) / 1000;

    // Initialize and draw particles
    initParticles(isVictory);
    updateParticles();
    drawParticles();

    // Cleanup after short delay
    if (timeSinceGameOver > 0.3) {
      cleanupForGameOver();
    }

    // Create end screen bodies
    if (timeSinceGameOver > 0.5) {
      createEndScreenBodies(isVictory);
    }

    // Show Gemini speech
    if (timeSinceGameOver > 0.8) {
      showGeminiSpeech(isVictory);
    }

    // Create Play Again button
    if (timeSinceGameOver > 1.2) {
      createPlayAgainButton(isVictory);
    }
  }

  return { draw };
}
