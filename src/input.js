import planck from 'planck';
import { SCALE } from './constants.js';

/**
 * Sets up mouse and touch input so the user can click-drag dynamic bodies
 * using a Box2D MouseJoint.
 */
export function setupInput(canvas, world) {
  const groundBody = world.createBody(); // static anchor for the mouse joint
  let mouseJoint = null;
  let mouseTarget = null;
  let pendingBody = null;  // static body waiting for drag to become dynamic
  let pendingPoint = null;
  let clickedBody = null;  // the body clicked on this press (for focus tracking)
  let cursorX = -100;
  let cursorY = -100;
  let didDrag = false;     // true if mouse moved while pressed
  let clickCallbacks = []; // { body, callback } pairs for click detection

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
      if (body.getUserData()?.isCursor) return true; // skip cursor body
      const isDynamic = body.getType() === 'dynamic';
      const isDraggable = body.getUserData()?.draggable;
      if ((isDynamic || isDraggable) && fixture.testPoint(pt)) {
        found = body;
        return false; // stop
      }
      return true;
    });
    return found;
  }

  function createJointFor(body, wp) {
    mouseJoint = world.createJoint(
      new planck.MouseJoint(
        { maxForce: 1500 * body.getMass(), frequencyHz: 8, dampingRatio: 0.5 },
        groundBody,
        body,
        wp,
      ),
    );
    mouseTarget = wp;
  }

  // --- Pointer handlers ---

  function onDown(px, py) {
    if (mouseJoint || pendingBody) return;
    didDrag = false;
    const wp = toWorld(px, py);
    const body = findBodyAt(wp);
    if (!body) {
      clickedBody = null;
      return;
    }

    clickedBody = body;

    // Static draggable bodies: defer conversion until actual drag
    if (body.getType() === 'static' && body.getUserData()?.draggable) {
      pendingBody = body;
      pendingPoint = wp;
      return;
    }

    createJointFor(body, wp);
  }

  function onMove(px, py) {
    didDrag = true;
    // Promote pending static body to dynamic on first drag movement
    if (pendingBody) {
      pendingBody.setType('dynamic');
      createJointFor(pendingBody, pendingPoint);
      pendingBody = null;
      pendingPoint = null;
    }
    if (!mouseJoint) return;
    mouseTarget = toWorld(px, py);
    mouseJoint.setTarget(mouseTarget);
  }

  function onUp() {
    // Check for click (not drag) on registered bodies
    if (clickedBody && !didDrag) {
      for (const { body, callback } of clickCallbacks) {
        if (clickedBody === body) {
          callback();
          break;
        }
      }
    }

    pendingBody = null;
    pendingPoint = null;
    clickedBody = null;
    if (!mouseJoint) return;
    world.destroyJoint(mouseJoint);
    mouseJoint = null;
    mouseTarget = null;
  }

  // Mouse
  canvas.addEventListener('mousedown', (e) => { cursorX = e.clientX; cursorY = e.clientY; onDown(e.clientX, e.clientY); });
  canvas.addEventListener('mousemove', (e) => { cursorX = e.clientX; cursorY = e.clientY; onMove(e.clientX, e.clientY); });
  canvas.addEventListener('mouseup', onUp);
  canvas.addEventListener('mouseleave', () => { cursorX = -100; cursorY = -100; onUp(); });

  // Touch
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
  canvas.addEventListener('touchmove',  (e) => { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
  canvas.addEventListener('touchend',   (e) => { e.preventDefault(); onUp(); }, { passive: false });

  function onClickBody(body, callback) {
    clickCallbacks.push({ body, callback });
  }

  // Expose for renderer
  return {
    getMouseTarget() { return mouseTarget; },
    getMouseJoint()  { return mouseJoint; },
    getCursorPos()   { return { x: cursorX, y: cursorY }; },
    onClickBody,
  };
}
