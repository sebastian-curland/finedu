// celebrate.js — screen-agnostic confetti + toast presentation layer.
//
// Pure DOM + CSS, zero dependencies: never imports store.js or
// gamification.js. Callers pass primitive data only (emoji/title/subtitle
// strings, counts, booleans) — this module owns no app state and makes no
// decisions about *when* to celebrate, only *how*.
//
// Two lazily-created fixed layers are appended to <body> the first time
// they're needed and then reused: #confetti-layer and #toast-layer.
// Confetti pieces remove themselves purely via their own `animationend`
// ({once: true}) — no timers involved, so nothing to leak even under rapid
// repeated bursts. Toasts use a `duration`-driven setTimeout (an explicit,
// caller-controlled display time, not incidental cleanup plumbing) and
// then remove themselves the same way — via `animationend` normally, or
// immediately when reduced motion skips the leave animation.

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const CONFETTI_COLORS = ['#6C5CE7', '#00B894', '#FDCB6E', '#E74C3C', '#0984E3', '#FD79A8'];

function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getLayer(id) {
  let layer = document.getElementById(id);
  if (!layer) {
    layer = document.createElement('div');
    layer.id = id;
    document.body.appendChild(layer);
  }
  return layer;
}

/**
 * Bursts `count` small colored confetti pieces from `originEl` (or the
 * viewport's horizontal center when omitted). No-ops entirely (no DOM
 * created) when the user has requested reduced motion. Each piece removes
 * itself from the DOM when its own fall animation ends.
 * @param {{count?: number, originEl?: Element|null}} [options]
 */
export function confettiBurst({ count = 24, originEl = null } = {}) {
  if (prefersReducedMotion()) return;

  const layer = getLayer('confetti-layer');
  const origin = originEl ? originEl.getBoundingClientRect() : null;
  const originX = origin ? origin.left + origin.width / 2 : window.innerWidth / 2;
  const originY = origin ? origin.top + origin.height / 2 : window.innerHeight / 3;

  for (let i = 0; i < count; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    const angle = Math.random() * Math.PI * 2;
    const distance = 40 + Math.random() * 80;
    const drift = Math.cos(angle) * distance;
    const rise = Math.sin(angle) * distance * 0.5 - 20;
    const rotation = Math.random() * 360;
    const fallDuration = 900 + Math.random() * 700;

    piece.style.setProperty('--confetti-x', `${originX}px`);
    piece.style.setProperty('--confetti-y', `${originY}px`);
    piece.style.setProperty('--confetti-drift', `${drift}px`);
    piece.style.setProperty('--confetti-rise', `${rise}px`);
    piece.style.setProperty('--confetti-rotation', `${rotation}deg`);
    piece.style.animationDuration = `${fallDuration}ms`;
    piece.style.backgroundColor = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];

    piece.addEventListener('animationend', () => piece.remove(), { once: true });
    layer.appendChild(piece);
  }
}

/**
 * Shows a single stackable toast card (e.g. a badge-earned or level-up
 * notice). Multiple toasts shown in quick succession stack in #toast-layer.
 * Auto-dismisses itself after `duration` ms; falls back to an instant
 * opacity swap (no slide animation) under reduced motion.
 * @param {{emoji: string, title: string, subtitle?: string, duration?: number}} options
 */
export function showToast({ emoji, title, subtitle = '', duration = 3200 } = {}) {
  const layer = getLayer('toast-layer');
  const reduced = prefersReducedMotion();

  const toast = document.createElement('div');
  toast.className = 'celebrate-toast';
  if (reduced) toast.classList.add('is-reduced-motion');

  const emojiEl = document.createElement('span');
  emojiEl.className = 'celebrate-toast-emoji';
  emojiEl.textContent = emoji;
  emojiEl.setAttribute('aria-hidden', 'true');
  toast.appendChild(emojiEl);

  const body = document.createElement('div');
  body.className = 'celebrate-toast-body';
  const titleEl = document.createElement('div');
  titleEl.className = 'celebrate-toast-title';
  titleEl.textContent = title;
  body.appendChild(titleEl);
  if (subtitle) {
    const subtitleEl = document.createElement('div');
    subtitleEl.className = 'celebrate-toast-subtitle';
    subtitleEl.textContent = subtitle;
    body.appendChild(subtitleEl);
  }
  toast.appendChild(body);

  layer.appendChild(toast);

  const remove = () => toast.remove();

  if (reduced) {
    // No slide-out animation to wait for — just remove after `duration`.
    setTimeout(remove, duration);
    return;
  }

  setTimeout(() => {
    toast.classList.add('is-leaving');
    toast.addEventListener('animationend', remove, { once: true });
  }, duration);
}

/**
 * Convenience wrapper: fires a confetti burst (unless `confetti` is false)
 * and shows one toast per entry in `toasts`, in order.
 * @param {{toasts?: Array<{emoji: string, title: string, subtitle?: string, duration?: number}>, confetti?: boolean}} [options]
 */
export function celebrate({ toasts = [], confetti = true } = {}) {
  if (confetti) confettiBurst();
  for (const toast of toasts) showToast(toast);
}
