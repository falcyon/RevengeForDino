import planck from 'planck';
import { SCALE, WALL_THICKNESS, CAT_WALL, COLORS } from './constants.js';
import { fetchAllFirebase, LS_PREFIX_EXPORT } from './cache.js';
import { CURATED_OBJECTS } from './curatedCache.js';

// --- Canvas setup ---
const canvas = document.getElementById('c');
const sidebar = document.getElementById('sidebar');
const objectList = document.getElementById('object-list');
const statusEl = document.getElementById('status');
const btnRefresh = document.getElementById('btn-refresh');
const btnClear = document.getElementById('btn-clear');

function resizeCanvas() {
  canvas.width = window.innerWidth - sidebar.offsetWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// --- Physics world (same as world.js but uses canvas size) ---
let world;
const objects = [];
const updaters = [];

function createWorld() {
  const w = new planck.World({ gravity: new planck.Vec2(0, 40) });
  const W = canvas.width / SCALE;
  const H = canvas.height / SCALE;
  const t = WALL_THICKNESS;

  const wallDefs = [
    { x: W / 2, y: H + t, hw: W / 2 + t, hh: t },   // bottom
    { x: W / 2, y: -t, hw: W / 2 + t, hh: t },       // top
    { x: -t, y: H / 2, hw: t, hh: H / 2 + t },       // left
    { x: W + t, y: H / 2, hw: t, hh: H / 2 + t },    // right
  ];

  for (const wd of wallDefs) {
    const body = w.createBody({ type: 'static', position: new planck.Vec2(wd.x, wd.y) });
    body.createFixture(new planck.Box(wd.hw, wd.hh), {
      friction: 0.6,
      filterCategoryBits: CAT_WALL,
      filterMaskBits: 0xFFFF,
    });
    body.setUserData({ isWall: true });
  }

  // Visible floor platform
  const floorH = 2;
  const floor = w.createBody({ type: 'static', position: new planck.Vec2(W / 2, H - floorH) });
  floor.createFixture(new planck.Box(W / 2, floorH), {
    friction: 0.8,
    filterCategoryBits: CAT_WALL,
    filterMaskBits: 0xFFFF,
  });
  floor.setUserData({ isWall: true, isFloor: true });
  objects.push({ body: floor, type: 'rect', hw: W / 2, hh: floorH, color: '#333' });

  return w;
}

function registerObject(obj) {
  objects.push(obj);
}

// --- Executor (inline, mirrors src/executor.js but uses local state) ---
const MAX_EPHEMERAL = 400;
const ephemeral = []; // global ring buffer for bodies created during update()

// Dev page target: bottom center (simulated enemy position)
let devTargetX = null;
let devTargetY = null;

function unregisterObject(obj) {
  const i = objects.indexOf(obj);
  if (i !== -1) objects.splice(i, 1);
}

function execute(code, spawnX, spawnY, targetX = null, targetY = null) {
  const W = canvas.width / SCALE;
  const H = canvas.height / SCALE;

  // Default target to left side, 90% down
  const tx = targetX ?? W * 0.15;
  const ty = targetY ?? H * 0.9;
  devTargetX = tx;
  devTargetY = ty;

  let inUpdate = false;

  function wrappedRegister(obj) {
    obj.spawned = true;
    registerObject(obj);
    if (inUpdate) {
      ephemeral.push(obj);
      if (ephemeral.length > MAX_EPHEMERAL) {
        const old = ephemeral.shift();
        unregisterObject(old);
        world.destroyBody(old.body);
      }
    }
  }

  // getTarget returns current target position (for dev, it's static)
  function getTarget() {
    return { x: devTargetX, y: devTargetY };
  }

  let fn;
  try {
    fn = new Function(
      'planck', 'world', 'registerObject', 'W', 'H', 'spawnX', 'spawnY', 'targetX', 'targetY', 'getTarget',
      code,
    );
  } catch (e) {
    statusEl.textContent = `Syntax error: ${e.message}`;
    return;
  }

  let result;
  try {
    result = fn(planck, world, wrappedRegister, W, H, spawnX, spawnY, tx, ty, getTarget);
  } catch (e) {
    statusEl.textContent = `Runtime error: ${e.message}`;
    return;
  }

  if (result && typeof result.update === 'function') {
    const origUpdate = result.update;
    updaters.push({
      update() {
        inUpdate = true;
        origUpdate();
        inUpdate = false;
      },
    });
  }

  statusEl.textContent = `Spawned object (${objects.length} bodies)`;
}

function cleanupOOB() {
  const W = canvas.width / SCALE;
  const H = canvas.height / SCALE;
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    if (!obj.spawned) continue;
    const p = obj.body.getPosition();
    if (p.x < -W * 0.1 || p.x > W * 1.1 || p.y < -H * 0.1 || p.y > H * 1.1) {
      objects.splice(i, 1);
      world.destroyBody(obj.body);
    }
  }
}

// --- Clear world (destroy all non-wall bodies) ---
function clearWorld() {
  for (let body = world.getBodyList(); body; body = body.getNext()) {
    if (body.getUserData()?.isWall) continue;
    world.destroyBody(body);
  }
  // Keep floor in objects array, remove everything else
  for (let i = objects.length - 1; i >= 0; i--) {
    if (!objects[i].body.getUserData()?.isFloor) {
      objects.splice(i, 1);
    }
  }
  updaters.length = 0;
  statusEl.textContent = 'Cleared.';
}

// --- Rebuild world from scratch ---
function resetWorld() {
  objects.length = 0;
  updaters.length = 0;
  world = createWorld(); // createWorld adds floor to objects
  // Set default target position (left side, 90% down)
  const W = canvas.width / SCALE;
  const H = canvas.height / SCALE;
  devTargetX = W * 0.15;
  devTargetY = H * 0.9;
}

// --- Simple renderer (draws circles, rects, and generic shapes) ---
const ctx = canvas.getContext('2d');

function draw() {
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  // Wall border
  ctx.strokeStyle = COLORS.wall;
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, width, height);

  for (const obj of objects) {
    const pos = obj.body.getPosition();
    const angle = obj.body.getAngle();

    ctx.save();
    ctx.translate(pos.x * SCALE, pos.y * SCALE);
    ctx.rotate(angle);

    if (obj.type === 'circle') {
      const r = obj.radius * SCALE;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = obj.color || '#e94560';
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
    } else if (obj.hw != null && obj.hh != null) {
      const w = obj.hw * 2 * SCALE;
      const h = obj.hh * 2 * SCALE;
      ctx.fillStyle = obj.color || '#45b7d1';
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
    } else {
      // Fallback: draw all fixtures
      for (let f = obj.body.getFixtureList(); f; f = f.getNext()) {
        const shape = f.getShape();
        const type = shape.getType();
        if (type === 'circle') {
          const r = shape.getRadius() * SCALE;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fillStyle = obj.color || '#e94560';
          ctx.fill();
        } else if (type === 'polygon') {
          const verts = [];
          for (let i = 0; i < shape.m_count; i++) {
            verts.push(shape.m_vertices[i]);
          }
          if (verts.length > 0) {
            ctx.beginPath();
            ctx.moveTo(verts[0].x * SCALE, verts[0].y * SCALE);
            for (let i = 1; i < verts.length; i++) {
              ctx.lineTo(verts[i].x * SCALE, verts[i].y * SCALE);
            }
            ctx.closePath();
            ctx.fillStyle = obj.color || '#45b7d1';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.25)';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }
    }

    ctx.restore();
  }

  // Also draw any bodies not in objects array (from generated code that creates bodies directly)
  // This catches bodies created without registerObject
  drawUntracked();

  // Draw target crosshair
  if (devTargetX != null && devTargetY != null) {
    const tx = devTargetX * SCALE;
    const ty = devTargetY * SCALE;
    const size = 15;
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    // Crosshair
    ctx.beginPath();
    ctx.moveTo(tx - size, ty);
    ctx.lineTo(tx + size, ty);
    ctx.moveTo(tx, ty - size);
    ctx.lineTo(tx, ty + size);
    ctx.stroke();
    // Circle
    ctx.beginPath();
    ctx.arc(tx, ty, size * 0.7, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawUntracked() {
  const trackedBodies = new Set(objects.map(o => o.body));
  for (let body = world.getBodyList(); body; body = body.getNext()) {
    if (body.getUserData()?.isWall) continue;
    if (trackedBodies.has(body)) continue;

    const pos = body.getPosition();
    const angle = body.getAngle();

    ctx.save();
    ctx.translate(pos.x * SCALE, pos.y * SCALE);
    ctx.rotate(angle);

    for (let f = body.getFixtureList(); f; f = f.getNext()) {
      const shape = f.getShape();
      const type = shape.getType();
      if (type === 'circle') {
        const r = shape.getRadius() * SCALE;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = '#888';
        ctx.fill();
      } else if (type === 'polygon') {
        const verts = [];
        for (let i = 0; i < shape.m_count; i++) {
          verts.push(shape.m_vertices[i]);
        }
        if (verts.length > 0) {
          ctx.beginPath();
          ctx.moveTo(verts[0].x * SCALE, verts[0].y * SCALE);
          for (let i = 1; i < verts.length; i++) {
            ctx.lineTo(verts[i].x * SCALE, verts[i].y * SCALE);
          }
          ctx.closePath();
          ctx.fillStyle = '#888';
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }
}

// --- Mouse drag (simplified input) ---
let mouseJoint = null;
let mouseTarget = null;
let groundBody = null;

function setupInput() {
  groundBody = world.createBody();
  groundBody.setUserData({ isWall: true }); // so it doesn't get cleared

  function toWorld(px, py) {
    return new planck.Vec2(px / SCALE, py / SCALE);
  }

  function findBodyAt(pt) {
    const d = 0.001;
    const aabb = new planck.AABB(
      new planck.Vec2(pt.x - d, pt.y - d),
      new planck.Vec2(pt.x + d, pt.y + d),
    );
    let found = null;
    world.queryAABB(aabb, (fixture) => {
      const body = fixture.getBody();
      if (body.getType() === 'dynamic' && fixture.testPoint(pt)) {
        found = body;
        return false;
      }
      return true;
    });
    return found;
  }

  canvas.addEventListener('mousedown', (e) => {
    if (mouseJoint) return;
    const rect = canvas.getBoundingClientRect();
    const wp = toWorld(e.clientX - rect.left, e.clientY - rect.top);
    const body = findBodyAt(wp);
    if (!body) return;
    mouseJoint = world.createJoint(
      new planck.MouseJoint(
        { maxForce: 500 * body.getMass(), frequencyHz: 5, dampingRatio: 0.7 },
        groundBody, body, wp,
      ),
    );
    mouseTarget = wp;
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!mouseJoint) return;
    const rect = canvas.getBoundingClientRect();
    mouseTarget = toWorld(e.clientX - rect.left, e.clientY - rect.top);
    mouseJoint.setTarget(mouseTarget);
  });

  canvas.addEventListener('mouseup', () => {
    if (!mouseJoint) return;
    world.destroyJoint(mouseJoint);
    mouseJoint = null;
    mouseTarget = null;
  });
}

// --- Fetch cached entries ---
let entries = {}; // key → code

async function fetchEntries() {
  statusEl.textContent = 'Fetching...';
  entries = {};

  // Firebase
  const firebase = await fetchAllFirebase();
  for (const [key, code] of Object.entries(firebase)) {
    if (typeof code === 'string') {
      entries[key] = code;
    }
  }

  // localStorage
  for (let i = 0; i < localStorage.length; i++) {
    const lsKey = localStorage.key(i);
    if (lsKey.startsWith(LS_PREFIX_EXPORT)) {
      const name = lsKey.slice(LS_PREFIX_EXPORT.length);
      if (!entries[name]) {
        try {
          const val = JSON.parse(localStorage.getItem(lsKey));
          if (typeof val === 'string') entries[name] = val;
        } catch { /* skip */ }
      }
    }
  }

  // Curated (highest priority - overwrites others)
  for (const [key, code] of Object.entries(CURATED_OBJECTS)) {
    entries[key] = code;
  }

  renderSidebar();
  statusEl.textContent = `${Object.keys(entries).length} cached objects`;
}

// --- Sidebar rendering ---
let activeKey = null;

function renderSidebar() {
  objectList.innerHTML = '';
  const keys = Object.keys(entries).sort();
  for (const key of keys) {
    const el = document.createElement('div');
    el.className = 'object-item' + (key === activeKey ? ' active' : '');
    el.textContent = key;
    el.addEventListener('click', () => spawnEntry(key));
    objectList.appendChild(el);
  }
}

function spawnEntry(key) {
  const code = entries[key];
  if (!code) return;

  activeKey = key;
  renderSidebar();

  // Clear existing spawned bodies, keep walls
  clearWorld();

  const W = canvas.width / SCALE;
  const H = canvas.height / SCALE;
  const spawnX = W * 0.7;
  const spawnY = H * 0.2;

  execute(code, spawnX, spawnY);
}

// --- Buttons ---
btnRefresh.addEventListener('click', fetchEntries);
btnClear.addEventListener('click', () => {
  clearWorld();
  activeKey = null;
  renderSidebar();
});

// --- Init ---
resetWorld();
setupInput();
fetchEntries();

// --- Game loop ---
function loop() {
  // Run updaters
  for (let i = updaters.length - 1; i >= 0; i--) {
    try {
      updaters[i].update();
    } catch (e) {
      console.warn('Updater error, removing:', e);
      updaters.splice(i, 1);
    }
  }

  world.step(1 / 60, 8, 3);
  cleanupOOB();
  draw();
  requestAnimationFrame(loop);
}

loop();
