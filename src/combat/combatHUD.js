/**
 * Combat HUD — victory confetti and defeat overlay.
 * Victory: Gemini congratulates with stats, confetti falls
 * Defeat: Glitchy "CRASHED" overlay
 */
export function createCombatHUD(canvas, gameState, geminiIcon, intro) {
  const ctx = canvas.getContext('2d');

  let clickListenerAdded = false;
  let victoryClickAdded = false;

  // Confetti particles
  const confetti = [];
  let confettiInitialized = false;

  function initConfetti() {
    if (confettiInitialized) return;
    confettiInitialized = true;

    const colors = ['#0F9D58', '#F4B400', '#4285F4', '#DB4437'];
    for (let i = 0; i < 20; i++) {
      confetti.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * 1000,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 4,
        size: 6 + Math.random() * 10,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.3,
        shape: Math.random() > 0.5 ? 'rect' : 'circle',
      });
    }
  }

  function updateConfetti() {
    for (const c of confetti) {
      c.x += c.vx;
      c.y += c.vy;
      c.vy += 0.1; // gravity
      c.vy = Math.min(c.vy, 2); // terminal velocity
      c.rotation += c.rotationSpeed;

      // Wobble
      c.vx += (Math.random() - 0.5) * 0.2;
      c.vx *= 0.99;

      // Reset if off screen
      if (c.y > canvas.height + 20) {
        c.y = -20;
        c.x = Math.random() * canvas.width;
        c.vy = 0.1 + Math.random() ;
      }
    }
  }

  function drawConfetti() {
    for (const c of confetti) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rotation);
      ctx.fillStyle = c.color;

      if (c.shape === 'rect') {
        ctx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, c.size / 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function draw() {
    const state = gameState.getState();

    if (state === 'victory') {
      drawVictory();
    } else if (state === 'defeat') {
      drawDefeat();
    }
  }

  function drawVictory() {
    const stats = gameState.getStats();
    const timeSinceVictory = gameState.victoryTime ? (Date.now() - gameState.victoryTime) / 1000 : 0;

    // Initialize and update confetti
    initConfetti();
    updateConfetti();
    drawConfetti();

    // Check if dino survived
    const dinoBody = intro?.getDinoBody?.();
    const dinoSaved = dinoBody && dinoBody.isActive();

    // Build Gemini's congratulation speech
    const elapsed = stats.elapsed;
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    let speech = `WE DID IT! The Crash is destroyed!\n\n`;
    speech += `Time: ${timeStr}\n`;
    speech += `Objects Created: ${stats.objectsCreated}\n`;
    speech += `Objects Lost: ${stats.objectsConsumed}\n`;
    speech += `Damage Dealt: ${Math.floor(stats.totalDamageDealt)}\n\n`;

    if (dinoSaved) {
      speech += `Dino survived! Great job protecting them!`;
    } else {
      speech += `Dino was consumed... but we still won!`;
    }

    // Show speech on Gemini after a short delay
    if (timeSinceVictory > 0.8 && geminiIcon) {
      geminiIcon.setSpeech(speech);
    }

    // Draw "VICTORY" banner at top
    if (timeSinceVictory > 0.5) {
      const alpha = Math.min(1, (timeSinceVictory - 0.5) * 2);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Banner background
      const bannerY = 60;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.beginPath();
      ctx.roundRect(canvas.width / 2 - 200, bannerY - 35, 400, 70, 15);
      ctx.fill();

      // Victory text with glow
      ctx.font = 'bold 48px "Product Sans", Arial, sans-serif';
      ctx.fillStyle = '#00ff41';
      ctx.shadowColor = '#00ff41';
      ctx.shadowBlur = 20;
      ctx.fillText('VICTORY!', canvas.width / 2, bannerY);
      ctx.shadowBlur = 0;

      ctx.restore();
    }

    // Play again hint at bottom
    if (timeSinceVictory > 2) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '18px Arial, sans-serif';
      const promptAlpha = 0.5 + 0.5 * Math.sin(Date.now() * 0.004);
      ctx.fillStyle = `rgba(255, 255, 255, ${promptAlpha})`;
      ctx.fillText('Click anywhere to play again', canvas.width / 2, canvas.height - 40);
      ctx.restore();
    }

    // Add click-to-reload listener once
    if (!victoryClickAdded) {
      victoryClickAdded = true;
      setTimeout(() => {
        canvas.addEventListener('click', () => {
          window.location.reload();
        }, { once: true });
      }, 2000);
    }
  }

  function drawDefeat() {
    const { width, height } = canvas;
    const time = Date.now() * 0.001;

    // Full black overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Glitch distortion on text
    const glitchX = (Math.random() - 0.5) * 4;
    const glitchY = (Math.random() - 0.5) * 2;

    // Main text with glitch offset
    ctx.font = 'bold 72px "Product Sans", Arial, sans-serif';
    ctx.fillStyle = DEFEAT_COLORS[Math.floor(time * 8) % DEFEAT_COLORS.length];
    ctx.fillText('CRASHED.', width / 2 + glitchX, height / 2 - 20 + glitchY);

    // Ghost copies for glitch effect
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#ff0040';
    ctx.fillText('CRASHED.', width / 2 + glitchX + 3, height / 2 - 20 + glitchY - 2);
    ctx.fillStyle = '#00ff41';
    ctx.fillText('CRASHED.', width / 2 + glitchX - 2, height / 2 - 20 + glitchY + 2);
    ctx.globalAlpha = 1;

    // Subtitle
    ctx.font = '20px Arial, sans-serif';
    ctx.fillStyle = '#888888';
    ctx.fillText('Click to retry', width / 2, height / 2 + 40);

    ctx.restore();

    // Add click-to-reload listener once
    if (!clickListenerAdded) {
      clickListenerAdded = true;
      setTimeout(() => {
        canvas.addEventListener('click', () => {
          window.location.reload();
        }, { once: true });
      }, 500);
    }
  }

  return { draw };
}

const DEFEAT_COLORS = ['#ff0040', '#ffffff', '#ff0040', '#ffffff'];
