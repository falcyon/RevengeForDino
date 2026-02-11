const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
// Primary: gemini-3-pro-preview for code generation
const PRIMARY_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${API_KEY}`;
// Fallback: gemini-2.5-pro if primary fails
const FALLBACK_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${API_KEY}`;
// Flash for normalization (cheap, fast)
const FLASH_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

const SYSTEM_PROMPT = `You generate planck.js code for a Box2D physics game. The objective is to create objects that destroy the enemy. Return ONLY executable JS — no markdown, no comments, no blank lines.
Machine-executed only. Maximize conciseness: single-letter vars, inline everything, only create a variable if referenced more than once.

Available: planck, world, registerObject(obj), W, H, spawnX, spawnY, getTarget()
getTarget() returns {x,y} of enemy position for aiming. Use it for homing/aiming.
Gravity: (0, 40), positive Y = down. World ~320×180m.
AIMING TIP: Bullets drop due to gravity! For accurate hits, compensate: flightTime=dist/speed, drop=0.5*40*flightTime^2, aim at (target.y - drop).
LEFT-FACING BARRELS: Since objects face LEFT, barrels should extend LEFT from pivot. For such barrels: (1) aiming angle = atan2(dy,dx) - Math.PI, (2) bullet velocity = (-cos(angle)*speed, -sin(angle)*speed), (3) spawn bullet from getWorldPoint with negative X offset.
Register circles: registerObject({body,type:'circle',radius,color})
Register rects: registerObject({body,type:'rect',hw,hh,color})
Colors: hex strings. Use varied colors for different parts.
Joints: RevoluteJoint, WeldJoint, DistanceJoint, PrismaticJoint
For continuous behavior: return {update:function(){}} (called 60fps).
Objects spawn RIGHT side, should FACE and MOVE LEFT.
IMPORTANT - Densities: Use VERY LOW densities (0.5-1.5 typical, max 3). Projectiles should be especially light (density 1-2).
IMPORTANT - Bullet velocities: Use moderate speeds (70-100 typical). Balance speed with physics feel.
If input is gibberish: throw new Error("Cannot understand request");
Be CREATIVE — use multiple bodies + joints. Don't just make a single shape. Include bullets and projectiles if plausible.

EXAMPLES:
User: "ball"
var b=world.createBody({type:'dynamic',position:planck.Vec2(spawnX,spawnY)});b.createFixture(planck.Circle(2),{density:1.2,friction:.3,restitution:.9});registerObject({body:b,type:'circle',radius:2,color:'#e94560'});

User: "car"
var c=spawnX,d=spawnY,a=world.createBody({type:'dynamic',position:planck.Vec2(c,d)});a.createFixture(planck.Box(5,1.2),{density:1.2,friction:.3,restitution:.1});registerObject({body:a,type:'rect',hw:5,hh:1.2,color:'#e74c3c'});var b=world.createBody({type:'dynamic',position:planck.Vec2(c-.5,d-2)});b.createFixture(planck.Box(3,1),{density:.5,friction:.3,restitution:.1});registerObject({body:b,type:'rect',hw:3,hh:1,color:'#c0392b'});world.createJoint(new planck.WeldJoint({},a,b,planck.Vec2(c-.5,d-1.2)));var e=world.createBody({type:'dynamic',position:planck.Vec2(c-3.5,d+2)});e.createFixture(planck.Circle(1.3),{density:1.8,friction:.9,restitution:.05});registerObject({body:e,type:'circle',radius:1.3,color:'#2c3e50'});world.createJoint(new planck.RevoluteJoint({enableMotor:true,motorSpeed:20,maxMotorTorque:4000},a,e,planck.Vec2(c-3.5,d+2)));var f=world.createBody({type:'dynamic',position:planck.Vec2(c+3.5,d+2)});f.createFixture(planck.Circle(1.3),{density:1.8,friction:.9,restitution:.05});registerObject({body:f,type:'circle',radius:1.3,color:'#2c3e50'});world.createJoint(new planck.RevoluteJoint({enableMotor:true,motorSpeed:20,maxMotorTorque:4000},a,f,planck.Vec2(c+3.5,d+2)));

User: "tank"
var c=spawnX,d=spawnY,G=40,SPD=80,a=world.createBody({type:'dynamic',position:planck.Vec2(c,d)});a.createFixture(planck.Box(5,1.5),{density:1.8,friction:.5});registerObject({body:a,type:'rect',hw:5,hh:1.5,color:'#4a5d23'});var wOpts={enableMotor:true,motorSpeed:-8,maxMotorTorque:1800};[-3.5,0,3.5].forEach(function(o){var wh=world.createBody({type:'dynamic',position:planck.Vec2(c+o,d+2.2)});wh.createFixture(planck.Circle(1.3),{density:1.2,friction:1.5});registerObject({body:wh,type:'circle',radius:1.3,color:'#2d2d2d'});world.createJoint(new planck.RevoluteJoint(wOpts,a,wh,wh.getPosition()))});var tb=world.createBody({type:'dynamic',position:planck.Vec2(c-1,d-2.2)});tb.createFixture(planck.Box(2,.8),{density:0.6});registerObject({body:tb,type:'rect',hw:2,hh:.8,color:'#3d4a1f'});world.createJoint(new planck.WeldJoint({},a,tb,planck.Vec2(c-1,d-1.5)));var br=world.createBody({type:'dynamic',position:planck.Vec2(c-4,d-2.2)});br.createFixture(planck.Box(3,.35),{density:.3});registerObject({body:br,type:'rect',hw:3,hh:.35,color:'#2a3515'});var tj=world.createJoint(new planck.RevoluteJoint({enableMotor:true,maxMotorTorque:500,motorSpeed:0},tb,br,planck.Vec2(c-1,d-2.2))),t=0;return{update:function(){t++;var tg=getTarget();if(tg){var bp=br.getPosition(),dx=tg.x-bp.x,dy=tg.y-bp.y,dist=Math.sqrt(dx*dx+dy*dy),ft=dist/SPD,drop=0.5*G*ft*ft,ang=Math.atan2(tg.y-drop-bp.y,dx)-Math.PI,cur=br.getAngle(),diff=ang-cur;while(diff>Math.PI)diff-=2*Math.PI;while(diff<-Math.PI)diff+=2*Math.PI;tj.setMotorSpeed(diff*5)}if(t%60==0){var ba=br.getAngle(),tip=br.getWorldPoint(planck.Vec2(-3,0)),bl=world.createBody({type:'dynamic',position:tip,bullet:true});bl.createFixture(planck.Circle(.5),{density:1.5,restitution:.2});bl.setLinearVelocity(planck.Vec2(-Math.cos(ba)*SPD,-Math.sin(ba)*SPD));registerObject({body:bl,type:'circle',radius:.5,color:'#e74c3c'})}}};

User: "asdfghjk"
throw new Error("Cannot understand request");
`;

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // ms
const FETCH_TIMEOUT = 60000; // 60 seconds timeout

async function fetchWithTimeout(url, options, timeout = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithRetry(url, options) {
  let lastStatus = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options);
      if (response.ok) return response;
      lastStatus = response.status;
      if (response.status === 503 || response.status === 429) {
        console.warn(`API overloaded (${response.status}), retry ${attempt + 1}/${MAX_RETRIES}...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY * (attempt + 1)));
        continue;
      }
      return response; // non-retryable error
    } catch (e) {
      if (e.name === 'AbortError') {
        console.warn(`Request timeout, retry ${attempt + 1}/${MAX_RETRIES}...`);
        if (attempt === MAX_RETRIES - 1) throw new Error('Request timed out after multiple attempts');
        continue;
      }
      throw e;
    }
  }
  // After all retries exhausted for 503/429, throw a clear error
  if (lastStatus === 503 || lastStatus === 429) {
    const msg = lastStatus === 429
      ? 'Gemini API rate limit exceeded. Try again in a moment.'
      : 'Gemini API is overloaded. Try again in a moment.';
    throw new Error(msg);
  }
  return fetchWithTimeout(url, options); // final attempt for other cases
}

const conversationHistory = [];

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

// Known curated cache keys - normalizer should prefer these exact terms
const CURATED_KEYS = [
  'catapult', 'helicopter', 'rain', 'cloud', 'train', 'tank', 'ball', 'car',
  'cannon', 'rocket', 'bomb', 'boulder', 'missile', 'turret', 'wrecking ball', 'meteor',
  'butterfly', 'robot', 'virus'
];

/**
 * Cheap Gemini Flash call to normalize any user prompt into a 1-2 word
 * lowercase cache key (e.g. "give me something that creates rain" → "rain").
 * Prefers curated cache keys when the input matches or is a synonym.
 */
export async function normalizePrompt(userPrompt) {
  const keysList = CURATED_KEYS.join(', ');
  const response = await fetchWithRetry(FLASH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [{ text: `Reduce this to a 1-2 word object name. Lowercase, no punctuation. Reply with ONLY the word(s), nothing else.

If the input is a TYPO or DIRECT SYNONYM of one of these keys, return that key: ${keysList}
Otherwise, return the actual object name the user asked for.

ONLY map to curated keys for true equivalents:
- "trian" → "train" (typo)
- "locomotive" → "train" (same thing)
- "chopper" → "helicopter" (same thing)
- "heli" → "helicopter" (abbreviation)
- "armored vehicle" → "tank" (same thing)

Do NOT force unrelated things to curated keys:
- "butterfly" → "butterfly" (NOT "ball")
- "dragon" → "dragon" (NOT any curated key)
- "spaceship" → "spaceship" (NOT "rocket")

"${userPrompt}"` }],
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 16 },
    }),
  });

  if (!response.ok) {
    // Fall back to simple lowercase trim if the API fails
    return userPrompt.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return userPrompt.trim().toLowerCase();
  return text.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
}

export async function generateObject(userPrompt) {
  if (conversationHistory.length === 0) {
    conversationHistory.push({
      role: 'user',
      parts: [{ text: SYSTEM_PROMPT + '\n\nReply with only "ready".' }],
    });
    conversationHistory.push({
      role: 'model',
      parts: [{ text: 'ready' }],
    });
  }

  conversationHistory.push({
    role: 'user',
    parts: [{ text: `Create: "${userPrompt}"` }],
  });

  const requestBody = JSON.stringify({
    contents: conversationHistory,
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 16384,
    },
  });

  const requestOptions = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: requestBody,
  };

  // Try primary model first (gemini-3-pro-preview), fall back to gemini-2.5-pro
  let response;
  let usedFallback = false;

  try {
    response = await fetchWithRetry(PRIMARY_URL, requestOptions);
    if (!response.ok) {
      throw new Error(`Primary model HTTP ${response.status}`);
    }
  } catch (primaryErr) {
    console.warn(`Primary model failed: ${primaryErr.message}, trying fallback (gemini-2.5-pro)...`);
    usedFallback = true;
    try {
      response = await fetchWithRetry(FALLBACK_URL, requestOptions);
    } catch (fallbackErr) {
      conversationHistory.pop();
      throw new Error('Both Gemini models failed. Try again in a moment.');
    }
  }

  if (!response.ok) {
    conversationHistory.pop();
    if (response.status === 429) {
      throw new Error('Gemini API rate limit exceeded. Try again in a moment.');
    }
    if (response.status === 503) {
      throw new Error('Gemini API is overloaded. Try again in a moment.');
    }
    const err = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) {
    conversationHistory.pop();
    throw new Error('Gemini returned empty response');
  }

  if (candidate.finishReason === 'MAX_TOKENS') {
    conversationHistory.pop();
    throw new Error('Gemini response was truncated (code too long). Try a simpler request.');
  }

  const modelUsed = usedFallback ? 'gemini-2.5-pro (fallback)' : 'gemini-3-pro-preview';
  console.log(`[Gemini raw response - ${modelUsed}]`, text);

  conversationHistory.push({
    role: 'model',
    parts: [{ text }],
  });

  const code = stripCodeFences(text);
  console.log('[Gemini stripped code]', code);
  return { code, usedFallback };
}
