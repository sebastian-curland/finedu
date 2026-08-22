// screens/lesson.js — renders a single lesson's content, one block ("card")
// at a time.
//
// mount(el, {worldId, lessonId}):
//  - dynamically loads the world module via content/index.js's manifest,
//    finds the lesson by id inside it, and renders its `blocks` one at a
//    time through a small hand-written markdown-subset renderer
//    (paragraphs, **bold**, and `- ` bullet lists only — no library).
//  - `deep` blocks render only for a tier:2 ("בוגר") active profile, and
//    carry a "✨ בונוס" chip to read as optional asides.
//  - `tool` blocks dynamically import ../tools.js (Task 7) and hand off
//    rendering to its `renderInline(tool, container)` — that module
//    doesn't exist yet, so this path is inert (caught + logged) until
//    Task 7 lands, but the wiring itself is exercised end to end later.
//  - marks the lesson read for the active profile on mount (once, not
//    per-card — see load()).
//  - ends with "next lesson" navigation, or "התחל את המבחן" on the last
//    lesson of the world, once the last card is reached.

import * as store from '../store.js';
import * as gamification from '../gamification.js';
import { loadWorld } from '../../content/index.js';

let root = null;
let mountToken = 0; // guards against a stale async load writing after unmount/remount

// In-screen pagination state (mirrors profiles.js's module-level-let
// pattern) — reset in mount(), populated by load() once the lesson
// resolves, advanced only by the delegated click handler below.
let currentBlocks = [];
let currentWorld = null;
let currentLesson = null;
let currentLessonIndex = -1;
let cardIndex = 0;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Inline-level markdown subset: escapes HTML, then applies **bold**. */
function renderInlineMd(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/**
 * Small hand-written markdown-subset renderer.
 * Supports only: paragraphs (blank-line separated), **bold**, and `- `
 * bullet lists. Anything else is treated as plain paragraph text.
 */
function renderMarkdown(md) {
  const lines = String(md || '').trim().split('\n');
  const parts = [];
  let paragraphLines = [];
  let listItems = [];

  const flushParagraph = () => {
    if (paragraphLines.length) {
      parts.push(`<p>${renderInlineMd(paragraphLines.join(' '))}</p>`);
      paragraphLines = [];
    }
  };
  const flushList = () => {
    if (listItems.length) {
      parts.push(`<ul>${listItems.map((li) => `<li>${renderInlineMd(li)}</li>`).join('')}</ul>`);
      listItems = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '') {
      flushParagraph();
      flushList();
      continue;
    }
    if (line.startsWith('- ')) {
      flushParagraph();
      listItems.push(line.slice(2));
      continue;
    }
    flushList();
    paragraphLines.push(line);
  }
  flushParagraph();
  flushList();

  return parts.join('');
}

const CALLOUT_ICONS = { tip: '💡', warning: '⚠️', fact: '📌' };

function renderBlock(block) {
  if (block.type === 'text') {
    return `<div class="lesson-block lesson-block-text">${renderMarkdown(block.md)}</div>`;
  }
  if (block.type === 'example') {
    return `
      <div class="lesson-block lesson-block-example">
        <div class="lesson-block-label">דוגמה</div>
        ${renderMarkdown(block.md)}
      </div>
    `;
  }
  if (block.type === 'callout') {
    const tone = CALLOUT_ICONS[block.tone] ? block.tone : 'tip';
    return `
      <div class="lesson-block callout callout-${tone}">
        <div class="callout-icon" aria-hidden="true">${CALLOUT_ICONS[tone]}</div>
        <div class="callout-body">${renderMarkdown(block.md)}</div>
      </div>
    `;
  }
  if (block.type === 'deep') {
    // UI-chrome only — the chip is prepended here so `deep` blocks read as
    // an optional bonus aside; the underlying `md` text is untouched.
    return `
      <div class="lesson-block lesson-block-deep">
        <div class="lesson-bonus-chip">✨ בונוס</div>
        <div class="lesson-block-label">🔎 להעמקה</div>
        ${renderMarkdown(block.md)}
      </div>
    `;
  }
  if (block.type === 'tool') {
    // Rendered async after innerHTML is set — see wireToolBlocks().
    return `<div class="lesson-block lesson-block-tool" data-tool="${escapeHtml(block.tool)}"></div>`;
  }
  return '';
}

/** Finds every tool-block placeholder in the current DOM and hands it off to tools.js. */
function wireToolBlocks() {
  if (!root) return;
  root.querySelectorAll('[data-tool]').forEach((container) => {
    const tool = container.dataset.tool;
    import('../tools.js')
      .then((m) => m.renderInline(tool, container))
      .catch((err) => {
        console.error('[lesson] failed to load tools.js for block', tool, err);
      });
  });
}

function renderNav({ world, lesson, lessonIndex }) {
  const isLast = lessonIndex === world.lessons.length - 1;
  if (isLast) {
    return `
      <div class="lesson-nav">
        <a class="btn btn-primary btn-block" href="#/quiz/${encodeURIComponent(world.id)}">התחל את המבחן</a>
      </div>
    `;
  }
  const next = world.lessons[lessonIndex + 1];
  return `
    <div class="lesson-nav">
      <a class="btn btn-primary btn-block" href="#/lesson/${encodeURIComponent(world.id)}/${encodeURIComponent(next.id)}">
        השיעור הבא: ${escapeHtml(next.title)}
      </a>
    </div>
  `;
}

/** Progress dots: filled up through the current card, current dot slightly larger. */
function renderProgressDots(total, index) {
  const dots = [];
  for (let i = 0; i < total; i++) {
    const classes = ['lesson-dot'];
    if (i <= index) classes.push('is-filled');
    if (i === index) classes.push('is-current');
    dots.push(`<span class="${classes.join(' ')}" aria-hidden="true">●</span>`);
  }
  return `<div class="lesson-progress-dots">${dots.join('')}</div>`;
}

/**
 * "הקודם" (or an empty placeholder on card 1, so "הבא" stays pinned to the
 * same side) + "הבא ⟶". On the last card, "הבא" disappears and the
 * existing bottom lesson nav (next-lesson / start-quiz) appears instead.
 */
function renderCardNav({ world, lesson, lessonIndex, isFirst, isLast }) {
  const prevHtml = isFirst
    ? '<span class="lesson-card-nav-placeholder"></span>'
    : '<button type="button" class="btn btn-secondary" data-action="prev-card">הקודם</button>';

  if (isLast) {
    return `
      <div class="lesson-card-nav">
        ${prevHtml}
      </div>
      ${renderNav({ world, lesson, lessonIndex })}
    `;
  }

  return `
    <div class="lesson-card-nav">
      ${prevHtml}
      <button type="button" class="btn btn-primary" data-action="next-card">הבא ⟶</button>
    </div>
  `;
}

function renderNotFound(label) {
  root.innerHTML = `
    <div class="empty-state">
      <p class="empty-state-emoji" aria-hidden="true">🔍</p>
      <h2>${escapeHtml(label)}</h2>
      <a class="btn btn-secondary" href="#/map">חזרה למפה</a>
    </div>
  `;
}

/** Redraws the whole `.screen-lesson` for the current cardIndex. */
function renderCard() {
  if (!root || !currentWorld || !currentLesson) return;
  const world = currentWorld;
  const lesson = currentLesson;
  const lessonIndex = currentLessonIndex;
  const blocks = currentBlocks;

  const header = `
    <a class="lesson-back" href="#/world/${encodeURIComponent(world.id)}">${world.emoji} ${escapeHtml(world.title)}</a>
    <h1>${escapeHtml(lesson.title)}</h1>
  `;

  if (blocks.length === 0) {
    root.innerHTML = `
      <div class="screen-lesson">
        ${header}
        ${renderNav({ world, lesson, lessonIndex })}
      </div>
    `;
    return;
  }

  const block = blocks[cardIndex];
  const isFirst = cardIndex === 0;
  const isLast = cardIndex === blocks.length - 1;
  const isBonus = block.type === 'deep';

  root.innerHTML = `
    <div class="screen-lesson">
      ${header}
      ${renderProgressDots(blocks.length, cardIndex)}
      <div class="card lesson-card${isBonus ? ' is-bonus' : ''}">${renderBlock(block)}</div>
      ${renderCardNav({ world, lesson, lessonIndex, isFirst, isLast })}
    </div>
  `;

  wireToolBlocks();
}

async function load(worldId, lessonId, token) {
  const world = await loadWorld(worldId);
  if (token !== mountToken || !root) return; // unmounted/remounted while loading

  if (!world) {
    renderNotFound('העולם לא נמצא');
    return;
  }
  const lessonIndex = world.lessons.findIndex((l) => l.id === lessonId);
  if (lessonIndex === -1) {
    renderNotFound('השיעור לא נמצא');
    return;
  }
  const lesson = world.lessons[lessonIndex];

  const profile = store.getActiveProfile();
  const tier = profile ? profile.tier : 1;

  currentWorld = world;
  currentLesson = lesson;
  currentLessonIndex = lessonIndex;
  currentBlocks = lesson.blocks.filter((b) => b.type !== 'deep' || tier === 2);

  renderCard();

  if (profile) {
    gamification.onLessonRead(profile.id, lesson.id);
  }
}

function onClick(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  if (action === 'next-card') {
    if (cardIndex < currentBlocks.length - 1) {
      cardIndex += 1;
      renderCard();
      // In-screen state change, not a route change — router.js's own
      // scroll reset (see router.js's resolve()) never runs for this, so
      // mirror it explicitly here.
      window.scrollTo(0, 0);
    }
    return;
  }

  if (action === 'prev-card') {
    if (cardIndex > 0) {
      cardIndex -= 1;
      renderCard();
      window.scrollTo(0, 0);
    }
    return;
  }
}

export function mount(el, params) {
  root = el;
  mountToken += 1;
  const token = mountToken;

  currentBlocks = [];
  currentWorld = null;
  currentLesson = null;
  currentLessonIndex = -1;
  cardIndex = 0;

  root.innerHTML = `
    <div class="empty-state">
      <p class="empty-state-emoji" aria-hidden="true">⏳</p>
      <p>טוען שיעור…</p>
    </div>
  `;

  root.addEventListener('click', onClick);

  load(params.worldId, params.lessonId, token);
}

export function unmount() {
  mountToken += 1; // invalidate any in-flight load()
  if (root) {
    root.removeEventListener('click', onClick);
  }
  root = null;
}
