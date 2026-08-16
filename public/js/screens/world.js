// screens/world.js — a single world's lesson list (`#/world/:worldId`).
//
// Simple screen: world title/emoji, a progress bar, and a tappable list
// of the world's lessons (title + read/unread indicator sourced from the
// active profile's `lessonsRead`), each linking into
// `#/lesson/:worldId/:lessonId`. Map/world-grid itself is Task 5's
// concern — this screen only lists the lessons *inside* one world.

import * as store from '../store.js';
import { loadWorld } from '../../content/index.js';

let root = null;
let mountToken = 0; // guards against a stale async load writing after unmount/remount

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderNotFound() {
  root.innerHTML = `
    <div class="empty-state">
      <p class="empty-state-emoji" aria-hidden="true">🔍</p>
      <h2>העולם לא נמצא</h2>
      <a class="btn btn-secondary" href="#/map">חזרה למפה</a>
    </div>
  `;
}

function renderLessonItem(lesson, isRead, world) {
  return `
    <li class="card world-lesson-item">
      <a class="world-lesson-link" href="#/lesson/${encodeURIComponent(world.id)}/${encodeURIComponent(lesson.id)}">
        <span class="world-lesson-status" aria-hidden="true">${isRead ? '✅' : '⬜'}</span>
        <span class="world-lesson-title">${escapeHtml(lesson.title)}</span>
      </a>
    </li>
  `;
}

async function load(worldId, token) {
  const world = await loadWorld(worldId);
  if (token !== mountToken || !root) return; // unmounted/remounted while loading

  if (!world) {
    renderNotFound();
    return;
  }

  const profile = store.getActiveProfile();
  const lessonsRead = profile ? profile.lessonsRead : [];
  const readCount = world.lessons.filter((l) => lessonsRead.includes(l.id)).length;
  const total = world.lessons.length;
  const pct = total ? Math.round((readCount / total) * 100) : 0;

  root.innerHTML = `
    <div class="screen-world">
      <h1>${world.emoji} ${escapeHtml(world.title)}</h1>
      <p class="world-progress-label">${readCount} מתוך ${total} שיעורים הושלמו</p>
      <div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div>
      <ul class="world-lesson-list">
        ${world.lessons.map((l) => renderLessonItem(l, lessonsRead.includes(l.id), world)).join('')}
      </ul>
    </div>
  `;
}

export function mount(el, params) {
  root = el;
  mountToken += 1;
  const token = mountToken;

  root.innerHTML = `
    <div class="empty-state">
      <p class="empty-state-emoji" aria-hidden="true">⏳</p>
      <p>טוען עולם…</p>
    </div>
  `;

  load(params.worldId, token);
}

export function unmount() {
  mountToken += 1; // invalidate any in-flight load()
  root = null;
}
