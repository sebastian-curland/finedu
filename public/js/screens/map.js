// screens/map.js — the home screen (`#/map`).
//
// mount(el): shows the active profile's level name, XP, and streak count
// at the top, then a vertical scrolling path of world nodes built from
// content/index.js's manifest (in `num` order).
//
// A world node is unlocked if it's world 1, or the *previous* world's
// `quiz:${prevId}` completion recorded on the active profile passed the
// 0.7 threshold (same threshold quiz-screen.js uses for pass/fail).
// Locked nodes show 🔒 and aren't tappable. Unlocked nodes link to
// `#/world/:worldId`; a passed world also shows its earned badge and a
// checkmark.

import * as store from '../store.js';
import * as gamification from '../gamification.js';
import { worlds as worldMetas, loadWorld } from '../../content/index.js';

const PASS_THRESHOLD = 0.7;

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

/** Whether `completed[key]` exists and scored >= PASS_THRESHOLD. */
function isPassed(completed, key) {
  const entry = completed[key];
  return Boolean(entry) && entry.of > 0 && entry.score / entry.of >= PASS_THRESHOLD;
}

function renderHeader(profile) {
  const lvl = gamification.levelFor(profile.xp);
  return `
    <div class="card map-header">
      <span class="map-header-avatar" aria-hidden="true">${profile.avatar}</span>
      <div class="map-header-info">
        <strong>${escapeHtml(profile.name)}</strong>
        <span class="map-header-level">רמה ${lvl.level} · ${escapeHtml(lvl.name)}</span>
        <span class="map-header-xp">${profile.xp} נק' נסיון</span>
      </div>
      <div class="map-header-streak" aria-hidden="true">🔥 ${profile.streak.count}</div>
    </div>
  `;
}

function renderNode(world, { unlocked, passed }) {
  const classes = ['card', 'map-node', unlocked ? 'is-unlocked' : 'is-locked', passed ? 'is-passed' : '']
    .filter(Boolean)
    .join(' ');
  const inner = `
    <span class="map-node-emoji" aria-hidden="true">${unlocked ? world.emoji : '🔒'}</span>
    <span class="map-node-info">
      <strong class="map-node-title">${escapeHtml(world.title)}</strong>
      ${passed ? `<span class="map-node-badge">${world.badge.emoji} ${escapeHtml(world.badge.title)}</span>` : ''}
    </span>
    ${passed ? '<span class="map-node-check" aria-hidden="true">✅</span>' : ''}
  `;
  if (unlocked) {
    return `<li><a class="${classes}" href="#/world/${encodeURIComponent(world.id)}">${inner}</a></li>`;
  }
  return `<li><div class="${classes}" aria-disabled="true">${inner}</div></li>`;
}

async function load(token) {
  const profile = store.getActiveProfile();
  if (!profile || !root) return; // main.js's route guard should prevent this, but be defensive

  const orderedMetas = [...worldMetas].sort((a, b) => a.num - b.num);
  const loadedWorlds = await Promise.all(orderedMetas.map((meta) => loadWorld(meta.id)));
  if (token !== mountToken || !root) return; // unmounted/remounted while loading

  const completed = profile.completed || {};
  const itemsHtml = loadedWorlds
    .map((world, i) => {
      if (!world) return '';
      const prevMeta = i > 0 ? orderedMetas[i - 1] : null;
      const unlocked = i === 0 || isPassed(completed, `quiz:${prevMeta.id}`);
      const passed = isPassed(completed, `quiz:${world.id}`);
      return renderNode(world, { unlocked, passed });
    })
    .join('');

  root.innerHTML = `
    <div class="screen-map">
      ${renderHeader(profile)}
      <ul class="map-path">${itemsHtml}</ul>
    </div>
  `;
}

export function mount(el) {
  root = el;
  mountToken += 1;
  const token = mountToken;

  root.innerHTML = `
    <div class="empty-state">
      <p class="empty-state-emoji" aria-hidden="true">⏳</p>
      <p>טוען מפה…</p>
    </div>
  `;

  load(token);
}

export function unmount() {
  mountToken += 1; // invalidate any in-flight load()
  root = null;
}
