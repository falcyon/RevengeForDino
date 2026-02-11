import planck from 'planck';
import { SCALE, COLORS, CAT_ENVIRONMENT } from './constants.js';
import { registerObject } from './objects.js';

// Dimensions in meters (half-sizes)
const HW = 40;
const HH = 3;
const MASS = 10;

// Animated placeholder suggestions
const PLACEHOLDER_SUGGESTIONS = [
  'build me a tank, please',
  'let there be acid rain',
  'summon a bouncy ball',
  'create a catapult',
  'make it rain anvils',
];

/**
 * Creates a Google-style search bar.
 * Starts as a **static** body pinned in place.
 * When the user first drags it, input.js flips it to dynamic so gravity takes over.
 * Keyboard input anywhere on the page is captured and displayed inside the bar.
 * Pressing Enter resets to the default placeholder text.
 */
export function createSearchBar(world, x, y, onSubmit) {
  // Store original position for victory restoration
  const originalX = x;
  const originalY = y;

  const body = world.createBody({
    type: 'static',
    position: new planck.Vec2(x, y),
  });

  // Mark so input.js knows this static body is draggable
  body.setUserData({ draggable: true });

  body.createFixture(new planck.Box(HW, HH), {
    density: MASS / (4 * HW * HH),
    friction: 0.4,
    restitution: 0.15,
    filterCategoryBits: CAT_ENVIRONMENT,
  });

  const obj = {
    body,
    type: 'searchbar',
    hw: HW,
    hh: HH,
    color: COLORS.searchBar,
    borderColor: COLORS.searchBarBorder,
    text: '',           // live user input; empty = show placeholder
    focused: false,
    loading: false,
    // Animated placeholder state
    animatedPlaceholder: '',
    animatedPlaceholderEnabled: false,
  };

  registerObject(obj);

  // --- Animated placeholder cycling ---
  let currentSuggestionIdx = 0;
  let currentCharIdx = 0;
  let isDeleting = false;
  let animationInterval = null;
  let pauseTimeout = null;

  function animatePlaceholder() {
    if (!obj.animatedPlaceholderEnabled || obj.text || obj.loading) {
      obj.animatedPlaceholder = '';
      return;
    }

    const currentSuggestion = PLACEHOLDER_SUGGESTIONS[currentSuggestionIdx];

    if (!isDeleting) {
      // Typing forward
      currentCharIdx++;
      obj.animatedPlaceholder = currentSuggestion.substring(0, currentCharIdx);

      if (currentCharIdx >= currentSuggestion.length) {
        // Pause at full text before deleting
        clearInterval(animationInterval);
        pauseTimeout = setTimeout(() => {
          isDeleting = true;
          animationInterval = setInterval(animatePlaceholder, 40); // Faster delete
        }, 1500);
      }
    } else {
      // Deleting
      currentCharIdx--;
      obj.animatedPlaceholder = currentSuggestion.substring(0, currentCharIdx);

      if (currentCharIdx <= 0) {
        // Move to next suggestion
        isDeleting = false;
        currentSuggestionIdx = (currentSuggestionIdx + 1) % PLACEHOLDER_SUGGESTIONS.length;
        clearInterval(animationInterval);
        pauseTimeout = setTimeout(() => {
          animationInterval = setInterval(animatePlaceholder, 70); // Normal typing speed
        }, 300);
      }
    }
  }

  function startAnimatedPlaceholder() {
    obj.animatedPlaceholderEnabled = true;
    currentSuggestionIdx = 0;
    currentCharIdx = 0;
    isDeleting = false;
    obj.animatedPlaceholder = '';
    animationInterval = setInterval(animatePlaceholder, 70);
  }

  function stopAnimatedPlaceholder() {
    obj.animatedPlaceholderEnabled = false;
    obj.animatedPlaceholder = '';
    if (animationInterval) clearInterval(animationInterval);
    if (pauseTimeout) clearTimeout(pauseTimeout);
  }

  // --- Click-to-focus ---
  window.addEventListener('mousedown', (e) => {
    const wx = e.clientX / SCALE;
    const wy = e.clientY / SCALE;
    const pos = body.getPosition();
    obj.focused =
      Math.abs(wx - pos.x) <= HW &&
      Math.abs(wy - pos.y) <= HH;
  });

  // --- Keyboard input ---
  window.addEventListener('keydown', (e) => {
    // Block input while generating
    if (obj.loading) return;

    if (e.key === 'Enter') {
      if (obj.text && onSubmit) {
        onSubmit(obj.text, body);
      }
      obj.text = '';
    } else if (e.key === 'Backspace') {
      obj.text = obj.text.slice(0, -1);
    } else if (e.key.length === 1) {
      // Single printable character
      obj.text += e.key;
    }
  });

  // End screen restoration: move back to center, reset to static, show playground message
  function restoreForVictory() {
    // Reset position
    body.setTransform(new planck.Vec2(originalX, originalY), 0);
    body.setLinearVelocity(new planck.Vec2(0, 0));
    body.setAngularVelocity(0);

    // Reset to static so it doesn't fall
    body.setType('static');

    // Clear any text and show end screen placeholder
    obj.text = '';
    obj.loading = false;
    obj.victoryPlaceholder = 'Keep creating things. This is a playground!';

    // Stop animated placeholder
    stopAnimatedPlaceholder();
  }

  return {
    body,
    obj,
    setLoading(v) { obj.loading = v; },
    startAnimatedPlaceholder,
    stopAnimatedPlaceholder,
    restoreForVictory,
  };
}
