// --- The Crash: tuning constants ---

// Entity visual
export const CRASH_INITIAL_RADIUS = 12;      // meters — visual radius when fully entered
export const CRASH_MAX_RADIUS = 80;           // meters — game over (fills screen)
export const CRASH_GROW_RATE = 0.08;          // meters/sec base growth
export const CRASH_SPAWN_DELAY = 4000;        // ms after intro completes before Crash enters
export const CRASH_ENTRY_SPEED = 3;           // m/s horizontal entry from the left

// Void core (physics)
export const VOID_BODY_RADIUS = 2;            // meters — tiny sensor body

// Eye (physics)
export const EYE_RADIUS_FRAC = 0.2;           // eye radius = visual radius * this (grows with orb)
export const EYE_MIN_RADIUS = 3;              // meters — minimum eye size
export const EYE_RESTITUTION = 0.8;           // objects bounce off the eye
export const EYE_MOMENTUM_SCALE = 0.005;       // damage = momentum * this
export const EYE_ROAM_SPEED = 0.3;            // radians/sec — how fast the eye drifts along the edge

// Suction (inverse-square: force = strength / dist^2)
export const SUCTION_STRENGTH = 300;        // base gravitational pull (N·m²)
export const SUCTION_GROWTH = 200;           // additional pull per meter of radius growth

// Auto-detach
export const DETACH_FORCE_THRESHOLD = 15;     // force at which static page elements break free
