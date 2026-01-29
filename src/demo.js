import planck from 'planck';
import { SCALE, WALL_THICKNESS, COLORS } from './constants.js';
import { CURATED_OBJECTS } from './curatedCache.js';

// --- Gemini 2.5 Flash API ---
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

const SYSTEM_PROMPT = `You generate planck.js code for a Box2D physics game. Return ONLY executable JS — no markdown, no comments, no blank lines.
Machine-executed only. Maximize conciseness: single-letter vars, inline everything, only create a variable if referenced more than once.

Available: planck, world, registerObject(obj), W, H, spawnX, spawnY
Gravity: (0, 40), positive Y = down. World ~320×180m.
Register circles: registerObject({body,type:'circle',radius,color})
Register rects: registerObject({body,type:'rect',hw,hh,color})
Colors: hex strings. Use varied colors for different parts.
Joints: RevoluteJoint, WeldJoint, DistanceJoint, PrismaticJoint
For continuous behavior: return {update:function(){}} (called 60fps).
If input is gibberish: throw new Error("Cannot understand request");
Be CREATIVE — use multiple bodies + joints. Don't just make a single shape.

EXAMPLES:
User: "ball"
var b=world.createBody({type:'dynamic',position:planck.Vec2(spawnX,spawnY)});b.createFixture(planck.Circle(2),{density:2,friction:.3,restitution:.9});registerObject({body:b,type:'circle',radius:2,color:'#e94560'});

User: "car"
var c=spawnX,d=spawnY,a=world.createBody({type:'dynamic',position:planck.Vec2(c,d)});a.createFixture(planck.Box(5,1.2),{density:2,friction:.3,restitution:.1});registerObject({body:a,type:'rect',hw:5,hh:1.2,color:'#e74c3c'});var b=world.createBody({type:'dynamic',position:planck.Vec2(c-.5,d-2)});b.createFixture(planck.Box(3,1),{density:.8,friction:.3,restitution:.1});registerObject({body:b,type:'rect',hw:3,hh:1,color:'#c0392b'});world.createJoint(new planck.WeldJoint({},a,b,planck.Vec2(c-.5,d-1.2)));var e=world.createBody({type:'dynamic',position:planck.Vec2(c-3.5,d+2)});e.createFixture(planck.Circle(1.3),{density:3,friction:.9,restitution:.05});registerObject({body:e,type:'circle',radius:1.3,color:'#2c3e50'});world.createJoint(new planck.RevoluteJoint({enableMotor:true,motorSpeed:20,maxMotorTorque:8000},a,e,planck.Vec2(c-3.5,d+2)));var f=world.createBody({type:'dynamic',position:planck.Vec2(c+3.5,d+2)});f.createFixture(planck.Circle(1.3),{density:3,friction:.9,restitution:.05});registerObject({body:f,type:'circle',radius:1.3,color:'#2c3e50'});world.createJoint(new planck.RevoluteJoint({enableMotor:true,motorSpeed:20,maxMotorTorque:8000},a,f,planck.Vec2(c+3.5,d+2)));

User: "asdfghjk"
throw new Error("Cannot understand request");
`;

function stripCodeFences(text) {
  let code = text.trim();
  const fenceMatch = code.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/i);
  if (fenceMatch) code = fenceMatch[1];
  code = code.replace(/^```(?:javascript|js)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  const lines = code.split('\n');
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '' || /^(var |const |let |function |return |throw |if |for |while |\{|\/\/)/.test(trimmed)) {
      startIdx = i;
      break;
    }
  }
  return lines.slice(startIdx).join('\n').trim();
}

async function generateWithGemini(userPrompt) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        { role: 'user', parts: [{ text: SYSTEM_PROMPT + '\n\nReply with only "ready".' }] },
        { role: 'model', parts: [{ text: 'ready' }] },
        { role: 'user', parts: [{ text: `Create: "${userPrompt}"` }] },
      ],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 16384,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');

  console.log('[Gemini raw response]', text);
  const code = stripCodeFences(text);
  console.log('[Gemini stripped code]', code);
  return code;
}

// --- Canvas setup ---
const canvas = document.getElementById('c');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const ctx = canvas.getContext('2d');
const W = canvas.width / SCALE;
const H = canvas.height / SCALE;

// --- Physics world ---
const world = new planck.World({ gravity: new planck.Vec2(0, 40) });

// --- Walls (invisible boundaries) ---
const wallDefs = [
  { x: W / 2, y: H + WALL_THICKNESS, hw: W / 2 + WALL_THICKNESS, hh: WALL_THICKNESS }, // bottom
  { x: W / 2, y: -WALL_THICKNESS, hw: W / 2 + WALL_THICKNESS, hh: WALL_THICKNESS },    // top
  { x: -WALL_THICKNESS, y: H / 2, hw: WALL_THICKNESS, hh: H / 2 + WALL_THICKNESS },    // left
  { x: W + WALL_THICKNESS, y: H / 2, hw: WALL_THICKNESS, hh: H / 2 + WALL_THICKNESS }, // right
];

for (const wd of wallDefs) {
  const body = world.createBody({ type: 'static', position: new planck.Vec2(wd.x, wd.y) });
  body.createFixture(new planck.Box(wd.hw, wd.hh), { friction: 0.6 });
  body.setUserData({ isWall: true });
}

// --- Floating green ground platform ---
const GROUND_Y = H * 0.85;
const GROUND_HW = W * 0.45;
const GROUND_HH = 1;
const groundBody = world.createBody({ type: 'static', position: new planck.Vec2(W / 2, GROUND_Y) });
groundBody.createFixture(new planck.Box(GROUND_HW, GROUND_HH), { friction: 0.8 });
groundBody.setUserData({ isGround: true });

// --- Objects tracking ---
const objects = [];
const updaters = [];

function registerObject(obj) {
  obj.spawned = true;
  objects.push(obj);
}

function unregisterObject(obj) {
  const i = objects.indexOf(obj);
  if (i !== -1) objects.splice(i, 1);
}

// --- Clear all spawned objects ---
function clearAllObjects() {
  updaters.length = 0;

  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    try {
      world.destroyBody(obj.body);
    } catch (e) { /* already destroyed */ }
  }
  objects.length = 0;

  // Also destroy any untracked dynamic bodies
  const toDestroy = [];
  for (let body = world.getBodyList(); body; body = body.getNext()) {
    const ud = body.getUserData();
    if (ud?.isWall || ud?.isGround) continue;
    if (body.getType() !== 'static') {
      toDestroy.push(body);
    }
  }
  for (const body of toDestroy) {
    try {
      world.destroyBody(body);
    } catch (e) { /* already destroyed */ }
  }
}

// --- Executor ---
const MAX_EPHEMERAL = 400;
const ephemeral = [];

function execute(code, spawnX, spawnY) {
  let inUpdate = false;

  function wrappedRegister(obj) {
    obj.spawned = true;
    objects.push(obj);
    if (inUpdate) {
      obj.ephemeral = true;
      const ud = obj.body.getUserData() || {};
      ud.isEphemeral = true;
      obj.body.setUserData(ud);
      ephemeral.push(obj);
      if (ephemeral.length > MAX_EPHEMERAL) {
        const old = ephemeral.shift();
        unregisterObject(old);
        world.destroyBody(old.body);
      }
    }
  }

  let fn;
  try {
    fn = new Function(
      'planck', 'world', 'registerObject', 'W', 'H', 'spawnX', 'spawnY',
      code,
    );
  } catch (e) {
    console.error('Syntax error:', e);
    return;
  }

  let result;
  try {
    result = fn(planck, world, wrappedRegister, W, H, spawnX, spawnY);
  } catch (e) {
    console.error('Runtime error:', e);
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
}

// --- Search bar handling ---
const searchInput = document.getElementById('searchInput');
const clearBtn = document.getElementById('clearBtn');
const generateBtn = document.getElementById('generateBtn');
let isGenerating = false;

function setGenerating(loading, message = '') {
  isGenerating = loading;
  searchInput.disabled = loading;
  generateBtn.disabled = loading;
  if (message) searchInput.value = message;
}

// Generate both - wait for Flash API, then show both at the same time
async function generateBoth() {
  const text = searchInput.value.trim();
  if (!text || isGenerating) return;

  const textLower = text.toLowerCase();

  // Find matching cached object for Pro
  const cacheKey = Object.keys(CURATED_OBJECTS).find(k =>
    k === textLower || k.includes(textLower) || textLower.includes(k)
  );

  if (!cacheKey) {
    alert(`No cached object found for "${text}". Try: ${Object.keys(CURATED_OBJECTS).join(', ')}`);
    return;
  }

  // Clear previous objects before generating new ones
  clearAllObjects();

  setGenerating(true, 'Generating...');

  // Call Flash API first, wait for it
  try {
    const apiCode = await generateWithGemini(text);

    // Now spawn both at the same time
    const spawnY = GROUND_Y - GROUND_HH - 10;

    // Spawn Flash API result on the left (Gemini 2 Flash)
    const apiSpawnX = W * 0.40;
    execute(apiCode, apiSpawnX, spawnY);
    console.log('[Gemini 2 Flash - API] generated');

    // Spawn cache version on the right (Gemini 3 Pro)
    const cacheCode = CURATED_OBJECTS[cacheKey];
    const cacheSpawnX = W * 0.60;
    execute(cacheCode, cacheSpawnX, spawnY);
    console.log('[Gemini 3 Pro - Cache]', cacheKey);

    searchInput.value = '';
  } catch (err) {
    console.error('Flash API failed:', err);
    searchInput.value = text;
    alert('Flash API Error: ' + err.message);
  } finally {
    setGenerating(false);
    searchInput.focus();
  }
}

generateBtn.addEventListener('click', generateBoth);

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !isGenerating) {
    generateBoth();
  }
});

clearBtn.addEventListener('click', () => {
  clearAllObjects();
  searchInput.value = '';
  searchInput.focus();
});

// --- OOB cleanup ---
function cleanupOOB() {
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

// --- Renderer ---
function draw() {
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  // Background
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  // Draw green ground platform
  ctx.fillStyle = '#0F9D58';
  ctx.fillRect(
    (W / 2 - GROUND_HW) * SCALE,
    (GROUND_Y - GROUND_HH) * SCALE,
    GROUND_HW * 2 * SCALE,
    GROUND_HH * 2 * SCALE
  );

  // Draw all objects
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
          }
        }
      }
    }

    ctx.restore();
  }

  // Draw untracked bodies (created directly by generated code)
  const trackedBodies = new Set(objects.map(o => o.body));
  for (let body = world.getBodyList(); body; body = body.getNext()) {
    if (body.getUserData()?.isWall || body.getUserData()?.isGround) continue;
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
