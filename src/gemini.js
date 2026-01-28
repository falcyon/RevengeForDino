const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
// Using gemini-2.0-flash for code generation (faster, more reliable)
const API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;
const FLASH_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

const SYSTEM_PROMPT = `You generate planck.js code for a Box2D physics game. Return ONLY executable JS — no markdown, no comments, no blank lines.
Machine-executed only. Maximize conciseness: single-letter vars, inline everything, only create a variable if referenced more than once.

Available: planck, world, registerObject(obj), W, H, spawnX, spawnY
Gravity: (0, 100), positive Y = down. World ~320×180m.
Register circles: registerObject({body,type:'circle',radius,color})
Register rects: registerObject({body,type:'rect',hw,hh,color})
Colors: hex strings. Use varied colors for different parts.
Joints: RevoluteJoint, WeldJoint, DistanceJoint, PrismaticJoint
For continuous behavior: return {update:function(){}} (called 60fps).
Objects spawn RIGHT side, should FACE and MOVE LEFT.
If input is gibberish: throw new Error("Cannot understand request");
Be CREATIVE — use multiple bodies + joints. Don't just make a single shape.

EXAMPLES:
User: "ball"
var b=world.createBody({type:'dynamic',position:planck.Vec2(spawnX,spawnY)});b.createFixture(planck.Circle(2),{density:2,friction:.3,restitution:.9});registerObject({body:b,type:'circle',radius:2,color:'#e94560'});

User: "car"
var c=spawnX,d=spawnY,a=world.createBody({type:'dynamic',position:planck.Vec2(c,d)});a.createFixture(planck.Box(5,1.2),{density:2,friction:.3,restitution:.1});registerObject({body:a,type:'rect',hw:5,hh:1.2,color:'#e74c3c'});var b=world.createBody({type:'dynamic',position:planck.Vec2(c-.5,d-2)});b.createFixture(planck.Box(3,1),{density:.8,friction:.3,restitution:.1});registerObject({body:b,type:'rect',hw:3,hh:1,color:'#c0392b'});world.createJoint(new planck.WeldJoint({},a,b,planck.Vec2(c-.5,d-1.2)));var e=world.createBody({type:'dynamic',position:planck.Vec2(c-3.5,d+2)});e.createFixture(planck.Circle(1.3),{density:3,friction:.9,restitution:.05});registerObject({body:e,type:'circle',radius:1.3,color:'#2c3e50'});world.createJoint(new planck.RevoluteJoint({enableMotor:true,motorSpeed:20,maxMotorTorque:8000},a,e,planck.Vec2(c-3.5,d+2)));var f=world.createBody({type:'dynamic',position:planck.Vec2(c+3.5,d+2)});f.createFixture(planck.Circle(1.3),{density:3,friction:.9,restitution:.05});registerObject({body:f,type:'circle',radius:1.3,color:'#2c3e50'});world.createJoint(new planck.RevoluteJoint({enableMotor:true,motorSpeed:20,maxMotorTorque:8000},a,f,planck.Vec2(c+3.5,d+2)));

User: "turret"
var c=spawnX,d=spawnY,a=world.createBody({type:'dynamic',position:planck.Vec2(c,d)});a.createFixture(planck.Box(3,2),{density:8,friction:.7,restitution:.05});registerObject({body:a,type:'rect',hw:3,hh:2,color:'#556b2f'});var b=world.createBody({type:'dynamic',position:planck.Vec2(c,d-4.5)});b.createFixture(planck.Box(.6,3),{density:3,friction:.3,restitution:.1});registerObject({body:b,type:'rect',hw:.6,hh:3,color:'#3b3b3b'});var j=world.createJoint(new planck.RevoluteJoint({enableMotor:true,motorSpeed:0,maxMotorTorque:20000,enableLimit:true,lowerAngle:-1.2,upperAngle:1.2},a,b,planck.Vec2(c,d-2))),t=0,s=1;return{update:function(){var g=j.getJointAngle();if(g>1)s=-1;if(g<-1)s=1;j.setMotorSpeed(s*2);if(--t<=0){t=45;var p=b.getPosition(),r=b.getAngle(),x=p.x-Math.sin(r)*4,y=p.y-Math.cos(r)*4,u=world.createBody({type:'dynamic',position:planck.Vec2(x,y),bullet:true});u.createFixture(planck.Circle(.35),{density:10,friction:.2,restitution:.3});u.setLinearVelocity(planck.Vec2(-Math.sin(r)*120,-Math.cos(r)*120));registerObject({body:u,type:'circle',radius:.35,color:'#ffd700'});}}};

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
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options);
      if (response.ok) return response;
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
  return fetchWithTimeout(url, options); // final attempt
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

/**
 * Cheap Gemini Flash call to normalize any user prompt into a 1-2 word
 * lowercase cache key (e.g. "give me something that creates rain" → "rain").
 */
export async function normalizePrompt(userPrompt) {
  const response = await fetchWithRetry(FLASH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [{ text: `Reduce this to a 1-2 word object name. Lowercase, no punctuation. Reply with ONLY the word(s), nothing else.\n\n"${userPrompt}"` }],
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

  const response = await fetchWithRetry(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: conversationHistory,
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 16384,
      },
    }),
  });

  if (!response.ok) {
    conversationHistory.pop();
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

  console.log('[Gemini raw response]', text);

  conversationHistory.push({
    role: 'model',
    parts: [{ text }],
  });

  const code = stripCodeFences(text);
  console.log('[Gemini stripped code]', code);
  return { code };
}
