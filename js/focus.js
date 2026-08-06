/**
 * NOSTRA TV - Spatial Navigation & WebOS Remote Control Engine
 * Compatible with LG webOS 6.x Magic Remote and D-Pad
 */

class FocusEngine {
  constructor() {
    this.currentFocusedElement = null;
    this.onBackCallbacks = [];
    this.onColorKeyCallbacks = {};

    // LG webOS keyCode map
    this.keyMap = {
      37: 'LEFT', 38: 'UP', 39: 'RIGHT', 40: 'DOWN',
      13: 'ENTER', 10009: 'BACK', 461: 'BACK', 27: 'BACK', 8: 'BACK',
      403: 'RED', 404: 'GREEN', 405: 'YELLOW', 406: 'BLUE',
      415: 'PLAY', 19: 'PAUSE', 10252: 'PLAY_PAUSE',
      412: 'REWIND', 417: 'FAST_FORWARD'
    };
  }

  init() {
    // Capture at both window and document level with highest priority
    const keydownHandler = (e) => this.handleKeyDown(e);
    window.addEventListener('keydown', keydownHandler, true);
    document.addEventListener('keydown', keydownHandler, true);

    // webOS-specific back event on both window and document
    const backHandler = (e) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
      if (isInput) {
        activeEl.blur();
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      e.preventDefault();
      e.stopPropagation();
      this._fireBack();
      return false;
    };
    window.addEventListener('webOSBack', backHandler, true);
    document.addEventListener('webOSBack', backHandler, true);

    // Prevent default for all remote keys unless typing
    const keyupHandler = (e) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
      if (isInput) return;
      
      const key = this.keyMap[e.keyCode];
      if (key) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('keyup', keyupHandler, true);
    document.addEventListener('keyup', keyupHandler, true);

    window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.updateFocusables();
  }

  _fireBack() {
    if (this.onBackCallbacks.length > 0) {
      const cb = this.onBackCallbacks[this.onBackCallbacks.length - 1];
      cb();
    }
  }

  handleKeyDown(e) {
    const activeEl = document.activeElement;
    const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

    if (isInput && e.keyCode === 8) {
      return; // Allow standard backspace in inputs
    }

    const key = this.keyMap[e.keyCode];
    if (!key) return;

    if (isInput) {
      if (key === 'LEFT' || key === 'RIGHT' || key === 'UP' || key === 'DOWN' || key === 'ENTER') {
        return; // Allow D-pad and Enter inside inputs for keyboard navigation
      }
    }

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (key === 'BACK') {
      if (isInput) {
        activeEl.blur();
        return false;
      }
      this._fireBack();
      return false;
    }

    if (['RED', 'GREEN', 'YELLOW', 'BLUE'].includes(key)) {
      if (this.onColorKeyCallbacks[key]) this.onColorKeyCallbacks[key]();
      return false;
    }

    if (['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(key)) {
      this.navigateSpatial(key);
      return false;
    }

    if (key === 'ENTER' && this.currentFocusedElement) {
      this.currentFocusedElement.click();
      return false;
    }

    return false;
  }

  handleMouseMove(e) {
    const target = e.target.closest('.focusable, [data-focusable]');
    if (target && target !== this.currentFocusedElement) {
      this.focusElement(target);
    }
  }

  getVisibleFocusables() {
    return Array.from(document.querySelectorAll('.focusable')).filter(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      
      let n = el;
      while (n && n !== document.body) {
        const s = window.getComputedStyle(n);
        if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0' || n.classList.contains('hidden')) return false;
        n = n.parentElement;
      }
      return true;
    });
  }

  focusElement(el) {
    if (!el) return;
    if (this.currentFocusedElement) this.currentFocusedElement.classList.remove('focused');
    this.currentFocusedElement = el;
    el.classList.add('focused');
    try { el.focus({ preventScroll: true }); } catch(e) {}
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }

  updateFocusables() {
    const focusables = this.getVisibleFocusables();
    if (focusables.length > 0 && (!this.currentFocusedElement || !this.currentFocusedElement.offsetParent)) {
      this.focusElement(focusables[0]);
    }
  }

  navigateSpatial(direction) {
    const focusables = this.getVisibleFocusables();
    if (!focusables.length) return;
    if (!this.currentFocusedElement) { this.focusElement(focusables[0]); return; }

    const cr = this.currentFocusedElement.getBoundingClientRect();
    const cx = cr.left + cr.width / 2;
    const cy = cr.top + cr.height / 2;

    let best = null, bestScore = Infinity;

    for (const el of focusables) {
      if (el === this.currentFocusedElement) continue;
      const r = el.getBoundingClientRect();
      const ex = r.left + r.width / 2;
      const ey = r.top + r.height / 2;
      const dx = ex - cx, dy = ey - cy;

      let valid = false;
      if (direction === 'UP' && dy < -5) valid = true;
      if (direction === 'DOWN' && dy > 5) valid = true;
      if (direction === 'LEFT' && dx < -5) valid = true;
      if (direction === 'RIGHT' && dx > 5) valid = true;
      if (!valid) continue;

      const dist = Math.hypot(dx, dy);
      const offAxis = (direction === 'UP' || direction === 'DOWN') ? Math.abs(dx) : Math.abs(dy);
      const score = dist + offAxis * 1.5;

      if (score < bestScore) { bestScore = score; best = el; }
    }

    if (best) this.focusElement(best);
  }

  pushBackHandler(cb) { this.onBackCallbacks.push(cb); }
  popBackHandler() { this.onBackCallbacks.pop(); }
  setColorKeyHandler(color, cb) { this.onColorKeyCallbacks[color] = cb; }
  triggerBack() { this._fireBack(); }
}

window.focusEngine = new FocusEngine();
