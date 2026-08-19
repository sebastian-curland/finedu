// screens/leaderboard.js — the leaderboard + score sharing screen (`#/leaderboard`).
//
// mount(el): lists every local profile (store.listProfiles()) ranked by
// XP descending (ties broken by name, so ordering is stable), showing
// avatar, name, level name (gamification.levelFor), XP, and badge count.
//
// Below the list, a "קוד השוואה" section shows the active profile's
// share.encode(...) output as selectable read-only text (no clipboard
// API dependency — the user selects and copies it manually) plus a
// paste-input that decodes a pasted code via share.decode and, if valid,
// renders it as an extra comparison row merged into the ranking and
// clearly marked "לא מקומי" (not a local profile).
//
// The decoded guest row is held only in this module's in-memory state —
// it is never written to store.js, so it's genuinely ephemeral: it
// disappears on unmount/remount or a page reload.

import * as store from '../store.js';
import * as gamification from '../gamification.js';
import * as share from '../share.js';

let root = null;
let guestRow = null; // decoded {name,xp,level,badgeCount} from a pasted code, or null
let pasteError = '';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Builds the ranked row list: every local profile, plus the ephemeral guest row if present. */
function buildRows() {
  const profiles = store.listProfiles();
  const activeId = store.getActiveProfileId();

  const rows = profiles.map((p) => ({
    isGuest: false,
    isActive: p.id === activeId,
    avatar: p.avatar,
    name: p.name,
    xp: p.xp || 0,
    level: gamification.levelFor(p.xp || 0).name,
    badgeCount: (p.badges || []).length,
  }));

  if (guestRow) {
    rows.push({
      isGuest: true,
      isActive: false,
      avatar: '👤',
      name: guestRow.name,
      xp: guestRow.xp,
      level: guestRow.level,
      badgeCount: guestRow.badgeCount,
    });
  }

  rows.sort((a, b) => {
    if (b.xp !== a.xp) return b.xp - a.xp;
    return a.name.localeCompare(b.name, 'he');
  });

  return rows;
}

function renderRow(row, index) {
  const rank = index + 1;
  const classes = ['leaderboard-row', row.isActive ? 'is-active' : '', row.isGuest ? 'is-guest' : '']
    .filter(Boolean)
    .join(' ');
  return `
    <li class="${classes}">
      <span class="leaderboard-rank">${rank}</span>
      <span class="leaderboard-avatar" aria-hidden="true">${escapeHtml(row.avatar)}</span>
      <span class="leaderboard-info">
        <strong>${escapeHtml(row.name)}</strong>
        <span class="leaderboard-meta">${escapeHtml(row.level)} · ${row.badgeCount} תגים</span>
      </span>
      <span class="leaderboard-xp">${row.xp} נק'</span>
      ${row.isGuest ? '<span class="badge-chip leaderboard-guest-chip">לא מקומי</span>' : ''}
    </li>
  `;
}

function render() {
  if (!root) return;

  const active = store.getActiveProfile();
  const rows = buildRows();
  const rowsHtml = rows.map(renderRow).join('');

  const shareCode = active
    ? share.encode({
        name: active.name,
        xp: active.xp || 0,
        level: gamification.levelFor(active.xp || 0).name,
        badgeCount: (active.badges || []).length,
      })
    : '';

  root.innerHTML = `
    <div class="screen-leaderboard">
      <h1>שיאים</h1>

      <div class="card leaderboard-list-card">
        ${rows.length
          ? `<ol class="leaderboard-list">${rowsHtml}</ol>`
          : '<p class="leaderboard-empty">אין עדיין פרופילים להשוואה.</p>'}
      </div>

      <div class="card leaderboard-share-card">
        <h2>קוד השוואה</h2>
        <div class="field">
          <label class="label" for="leaderboard-my-code">הקוד שלך — סמנו והעתיקו כדי לשתף</label>
          <input class="input" id="leaderboard-my-code" type="text" dir="ltr" readonly value="${escapeHtml(shareCode)}">
        </div>

        <form class="tool-form" id="leaderboard-paste-form">
          <div class="field">
            <label class="label" for="leaderboard-paste-input">הדביקו כאן קוד ששיתפו איתכם</label>
            <input class="input" id="leaderboard-paste-input" type="text" dir="ltr" placeholder="קוד השוואה">
          </div>
          ${pasteError ? `<p class="tool-inline-error">${escapeHtml(pasteError)}</p>` : ''}
          <div class="leaderboard-share-actions">
            <button type="submit" class="btn btn-primary">השוואה</button>
            ${guestRow ? '<button type="button" class="btn btn-secondary" data-action="clear-guest">הסר השוואה</button>' : ''}
          </div>
        </form>
      </div>
    </div>
  `;

  const myCodeInput = root.querySelector('#leaderboard-my-code');
  if (myCodeInput) {
    myCodeInput.addEventListener('focus', () => myCodeInput.select());
  }
}

function onClick(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  if (target.dataset.action === 'clear-guest') {
    guestRow = null;
    pasteError = '';
    render();
  }
}

function onSubmit(e) {
  const form = e.target.closest('#leaderboard-paste-form');
  if (!form) return;
  e.preventDefault();

  const input = root.querySelector('#leaderboard-paste-input');
  const code = input ? input.value.trim() : '';

  if (!code) {
    pasteError = 'נא להדביק קוד השוואה';
    guestRow = null;
    render();
    return;
  }

  const decoded = share.decode(code);
  if (!decoded) {
    pasteError = 'קוד לא תקין — בדקו שהעתקתם אותו במלואו ונסו שוב';
    guestRow = null;
    render();
    return;
  }

  guestRow = decoded;
  pasteError = '';
  render();
}

export function mount(el) {
  root = el;
  guestRow = null;
  pasteError = '';

  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);

  render();
}

export function unmount() {
  if (root) {
    root.removeEventListener('click', onClick);
    root.removeEventListener('submit', onSubmit);
  }
  root = null;
  guestRow = null; // in-memory only — never persisted, so it's gone on unmount
  pasteError = '';
}
