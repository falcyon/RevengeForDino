/**
 * Persistent health bar drawn at the viewport bottom.
 * During the intro it acts as a loading bar (blue, progress-based).
 * After the intro it becomes the enemy health bar (red, health-based).
 * Includes particle effects when health decreases.
 */
export function createHealthBar(canvas) {
  const ctx = canvas.getContext('2d');

  let barProgress = 0;        // 0–1 fraction of viewport width (intro mode)
  let barColor = '#4285f4';   // Google blue
  let visible = false;
  let introComplete = false;

  const maxHealth = 100;
  let currentHealth = 100;
  let previousHealth = 100;

  const BAR_HEIGHT = 8;       // pixels (wider bar)

  // Particle system for damage effects
  const particles = [];
  const MAX_PARTICLES = 100;

  function setProgress(fraction) {
    barProgress = fraction;
  }

  function setColor(color) {
    barColor = color;
  }

  function show() { visible = true; }
  function hide() { visible = false; }

  function setIntroComplete() {
    introComplete = true;
    barColor = '#d93025';
    barProgress = 1.0;
  }

  function takeDamage(amount) {
    previousHealth = currentHealth;
    currentHealth = Math.max(0, currentHealth - amount);

    // Spawn particles at the damage point
    const damageX = (currentHealth / maxHealth) * canvas.width;
    spawnDamageParticles(damageX, amount);
  }

  function spawnDamageParticles(x, amount) {
    const count = Math.min(15, Math.floor(amount * 2));
    const baseY = canvas.height - BAR_HEIGHT / 2;

    for (let i = 0; i < count; i++) {
      if (particles.length >= MAX_PARTICLES) {
        particles.shift(); // Remove oldest
      }

      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.8;
      const speed = 2 + Math.random() * 4;

      particles.push({
        x: x + (Math.random() - 0.5) * 20,
        y: baseY + (Math.random() - 0.5) * BAR_HEIGHT,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2, // Bias upward
        life: 1.0,
        decay: 0.015 + Math.random() * 0.02,
        size: 2 + Math.random() * 4,
        color: Math.random() > 0.3 ? '#ff4444' : '#ffaa00',
        type: Math.random() > 0.5 ? 'spark' : 'chunk',
      });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15; // Gravity
      p.vx *= 0.98; // Air resistance
      p.life -= p.decay;

      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = p.life;

      if (p.type === 'spark') {
        // Glowing spark
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.fill();
      } else {
        // Rectangular chunk
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size * p.life, p.size * p.life);
      }

      ctx.restore();
    }
  }

  function draw() {
    if (!visible) return;

    const { width, height } = canvas;
    const drawWidth = introComplete
      ? (currentHealth / maxHealth) * width
      : barProgress * width;

    // Update and draw particles
    updateParticles();
    drawParticles();

    // Bar background (darker)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, height - BAR_HEIGHT, width, BAR_HEIGHT);

    // Main bar with gradient
    const grad = ctx.createLinearGradient(0, height - BAR_HEIGHT, 0, height);
    if (introComplete) {
      grad.addColorStop(0, '#ff4444');
      grad.addColorStop(0.5, barColor);
      grad.addColorStop(1, '#aa1111');
    } else {
      grad.addColorStop(0, '#66aaff');
      grad.addColorStop(0.5, barColor);
      grad.addColorStop(1, '#2266cc');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, height - BAR_HEIGHT, drawWidth, BAR_HEIGHT);

    // Highlight line at top
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillRect(0, height - BAR_HEIGHT, drawWidth, 1);

    // Pulsing glow when low health
    if (introComplete && currentHealth < maxHealth * 0.3) {
      const pulse = 0.3 + 0.2 * Math.sin(Date.now() * 0.01);
      ctx.fillStyle = `rgba(255, 0, 0, ${pulse})`;
      ctx.fillRect(0, height - BAR_HEIGHT - 2, drawWidth, BAR_HEIGHT + 4);
    }
  }

  return {
    setProgress,
    setColor,
    show,
    hide,
    setIntroComplete,
    takeDamage,
    getHealth() { return currentHealth; },
    getMaxHealth() { return maxHealth; },
    draw,
  };
}
