import planck from 'planck';
import { SCALE } from './constants.js';
import { registerObject, unregisterObject } from './objects.js';

const MAX_EPHEMERAL = 400;

export function createExecutor(world) {
  const updaters = [];
  const ephemeral = []; // global ring buffer for bodies created during update()

  const W = window.innerWidth / SCALE;
  const H = window.innerHeight / SCALE;

  // Default getTarget returns null (no target)
  let targetProvider = () => null;

  function setTargetProvider(fn) {
    targetProvider = fn;
  }

  function execute(code, spawnX, spawnY, targetX = null, targetY = null) {
    let inUpdate = false;
    const rootBodies = []; // non-ephemeral bodies created by this execute() call

    function wrappedRegister(obj) {
      obj.spawned = true;
      registerObject(obj);
      if (inUpdate) {
        obj.ephemeral = true;
        // Tag the body so suction can skip particles
        const ud = obj.body.getUserData() || {};
        ud.isEphemeral = true;
        obj.body.setUserData(ud);
        ephemeral.push(obj);
        if (ephemeral.length > MAX_EPHEMERAL) {
          const old = ephemeral.shift();
          unregisterObject(old);
          world.destroyBody(old.body);
        }
      } else {
        rootBodies.push(obj.body);
      }
    }

    // getTarget returns current enemy position (dynamic)
    function getTarget() {
      return targetProvider();
    }

    let fn;
    try {
      fn = new Function(
        'planck', 'world', 'registerObject', 'W', 'H', 'spawnX', 'spawnY', 'targetX', 'targetY', 'getTarget',
        code,
      );
    } catch (e) {
      throw new Error(`Syntax error in generated code: ${e.message}`);
    }

    let result;
    try {
      result = fn(planck, world, wrappedRegister, W, H, spawnX, spawnY, targetX, targetY, getTarget);
    } catch (e) {
      throw new Error(`Runtime error in generated code: ${e.message}`);
    }

    if (result && typeof result.update === 'function') {
      const origUpdate = result.update;
      updaters.push({
        dead: false,
        rootBodies,
        update() {
          // Stop if all root bodies have been destroyed
          if (rootBodies.length > 0 && rootBodies.every(b => !b.isActive())) {
            this.dead = true;
            return;
          }
          inUpdate = true;
          origUpdate();
          inUpdate = false;
        },
      });
    }
  }

  function getUpdaters() {
    return updaters;
  }

  return { execute, getUpdaters, setTargetProvider };
}
