import planck from 'planck';
import { SCALE, WALL_THICKNESS, CAT_WALL } from './constants.js';

/**
 * Create the Box2D world with gravity and four rigid boundary walls
 * sized to the current window dimensions.
 */
export function createWorld() {
  const world = new planck.World({ gravity: new planck.Vec2(0, 40) });

  const W = window.innerWidth / SCALE;
  const H = window.innerHeight / SCALE;
  const t = WALL_THICKNESS;

  const wallDefs = [
    { x: W / 2, y: H + t, hw: W / 2 + t, hh: t },   // bottom
    { x: W / 2, y: -t, hw: W / 2 + t, hh: t },   // top
    { x: -t, y: H / 2, hw: t, hh: H / 2 + t },   // left
    { x: W + t, y: H / 2, hw: t, hh: H / 2 + t },   // right
  ];

  for (const w of wallDefs) {
    const body = world.createBody({
      type: 'static',
      position: new planck.Vec2(w.x, w.y),
    });
    body.createFixture(new planck.Box(w.hw, w.hh), {
      friction: 0.6,
      filterCategoryBits: CAT_WALL,
      filterMaskBits: 0xFFFF, // collide with everything by default
    });
  }

  return world;
}
