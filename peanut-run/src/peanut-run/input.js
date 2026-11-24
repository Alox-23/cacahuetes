/**
 * Keyboard + pointer handling. attachInput() returns a detach function that
 * removes every listener it added.
 */

const JUMP_CODES = new Set(['Space', 'ArrowUp', 'KeyW']);
const PREVENT_CODES = new Set(['Space', 'ArrowUp']);

function isJumpKey(e) {
  return JUMP_CODES.has(e.code) || e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W';
}

function isInteractive(el) {
  return !!el && el.closest && !!el.closest('button, a, input, select, textarea, [contenteditable="true"]');
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.root      game root (focusable)
 * @param {HTMLElement} opts.playfield element that receives taps (the canvas)
 * @param {() => void} opts.onPress    jump pressed (fires once per physical press)
 * @param {() => void} opts.onRelease  jump released
 * @returns {() => void} detach
 */
export function attachInput({ root, playfield, onPress, onRelease }) {
  let hovering = false;
  let pointerDown = false;
  let keysDown = 0;
  const pressedCodes = new Set();

  const isActive = () => hovering || root.contains(document.activeElement);

  const onKeyDown = (e) => {
    if (!isJumpKey(e)) return;
    // Let buttons (the dialog) handle Space/Enter natively.
    if (isInteractive(e.target) && root.contains(e.target)) return;
    if (!isActive()) return;
    if (PREVENT_CODES.has(e.code) || e.key === ' ' || e.key === 'ArrowUp') e.preventDefault();
    if (e.repeat || pressedCodes.has(e.code)) return;
    pressedCodes.add(e.code);
    keysDown = pressedCodes.size;
    onPress();
  };

  const onKeyUp = (e) => {
    if (!pressedCodes.has(e.code)) return;
    pressedCodes.delete(e.code);
    keysDown = pressedCodes.size;
    if (keysDown === 0 && !pointerDown) onRelease();
  };

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    // Taps on the dialog / end card are not jumps.
    if (e.target && e.target.closest && e.target.closest('[data-peanut-run-ui]')) return;
    pointerDown = true;
    try {
      root.focus({ preventScroll: true });
    } catch (_) {
      /* ignore */
    }
    e.preventDefault();
    onPress();
  };

  const onPointerUp = () => {
    if (!pointerDown) return;
    pointerDown = false;
    if (keysDown === 0) onRelease();
  };

  const onEnter = () => {
    hovering = true;
  };
  const onLeave = () => {
    hovering = false;
  };

  // When focus leaves the window, forget held keys so the jump is not stuck "held".
  const onBlur = () => {
    pressedCodes.clear();
    keysDown = 0;
    pointerDown = false;
    onRelease();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('blur', onBlur);
  playfield.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointerenter', onEnter);
  root.addEventListener('pointerleave', onLeave);

  return function detach() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('blur', onBlur);
    playfield.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('pointerenter', onEnter);
    root.removeEventListener('pointerleave', onLeave);
  };
}
