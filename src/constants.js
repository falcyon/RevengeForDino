// Debug mode — toggle hitboxes, mass labels, suction lines
export const DEBUG = true;

// Pixels per meter — controls how large the physics world appears on screen
export const SCALE = 6;

// Wall half-thickness in meters
export const WALL_THICKNESS = 0.5;

// Rectangle half-dimensions in meters (full size: 2 × 10)
export const RECT_HALF_WIDTH = 1;
export const RECT_HALF_HEIGHT = 5;

// Collision filter categories (bitmask)
export const CAT_ENVIRONMENT = 0x0001; // Default for static things (Google page, etc.)
export const CAT_WALL        = 0x0002;
export const CAT_STICKMAN    = 0x0004;
export const CAT_CURSOR      = 0x0008;
export const CAT_GEMINI      = 0x0010;
export const CAT_DINO        = 0x0020;
export const CAT_CRASH       = 0x0040;
export const CAT_DEFAULT     = CAT_ENVIRONMENT; // Alias for backward compat if needed

// Object colors
export const COLORS = {
  ball1: '#e94560',
  ball2: '#4ecdc4',
  rectStandalone: '#45b7d1',
  rectJointA: '#f9ca24',
  rectJointB: '#f0932b',
  wall: '#e8e8e8',
  background: '#ffffff',
  jointDot: '#ffffff',

  // Stickman
  head: '#e43e2b',
  torso: '#e43e2b',
  leftArm: '#efb401',
  rightArm: '#3b7ded',
  leg: '#2ba24c',

  // Search bar
  searchBar: '#ffffff',
  searchBarBorder: '#dfe1e5',
  searchBarText: '#9aa0a6',

  // The Crash
  crashVoid: '#0a0a0a',
  crashEdge: '#ff0040',
  crashGlitch: '#00ff41',
  crashEye: '#ff2020',
  crashEyePupil: '#ffffff',
};
