// screens/profiles.js — the "פרופיל" tab and profile management screen.
//
// Dual role:
//  1. When a profile is active, shows it prominently (avatar, name, tier,
//     xp) with a "החלף פרופיל" affordance to reveal the switch/manage UI.
//  2. Profile management: a tappable card list of every profile (switch
//     on tap), a "פרופיל חדש" creation form, and a confirm-gated delete
//     per non-active card. With zero profiles, only the creation form
//     shows (there is nothing to list or make active yet).
//
// Switching a profile just re-renders this same screen with the new
// active profile highlighted — there is no #/map to navigate to until
// Task 5 lands.

import * as store from '../store.js';

const AVATARS = ['🦁', '🐼', '🦊', '🐸', '🐧', '🦄', '🐢', '🐬'];
const TIER_LABELS = { 1: 'צעיר', 2: 'בוגר' };

let root = null;
let switcherOpen = false;
let confirmingDeleteId = null;
let formState = { name: '', avatar: AVATARS[0], tier: null };
let formError = '';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderActiveCard(active) {
  return `
    <section class="card profile-active-card">
      <div class="profile-active-avatar" aria-hidden="true">${active.avatar}</div>
      <h2>${escapeHtml(active.name)}</h2>
      <p class="profile-active-meta">${TIER_LABELS[active.tier] || ''} · ${active.xp} נק' נסיון</p>
      <button type="button" class="btn btn-secondary btn-block" data-action="toggle-switch">
        ${switcherOpen ? 'סגור' : 'החלף פרופיל'}
      </button>
    </section>
  `;
}

function renderDeleteControls(id) {
  if (confirmingDeleteId === id) {
    return `
      <div class="profile-delete-confirm">
        <span>למחוק את הפרופיל?</span>
        <button type="button" class="btn btn-danger" data-action="confirm-delete" data-id="${id}">כן, מחק</button>
        <button type="button" class="btn btn-secondary" data-action="cancel-delete" data-id="${id}">ביטול</button>
      </div>
    `;
  }
  return `<button type="button" class="btn btn-secondary" data-action="ask-delete" data-id="${id}">מחק פרופיל</button>`;
}

function renderProfileList(profiles, activeId) {
  if (profiles.length === 0) return '';
  const items = profiles
    .map((p) => `
      <li class="card profile-list-item${p.id === activeId ? ' is-active' : ''}">
        <button type="button" class="profile-list-item-main" data-action="switch" data-id="${p.id}">
          <span class="profile-avatar" aria-hidden="true">${p.avatar}</span>
          <span class="profile-list-item-info">
            <strong>${escapeHtml(p.name)}</strong>
            <span>${TIER_LABELS[p.tier] || ''} · XP ${p.xp}</span>
          </span>
          ${p.id === activeId ? '<span class="badge-chip">פעיל</span>' : ''}
        </button>
        ${p.id !== activeId ? renderDeleteControls(p.id) : ''}
      </li>
    `)
    .join('');
  return `
    <section>
      <h3>כל הפרופילים</h3>
      <ul class="profile-list">${items}</ul>
    </section>
  `;
}

function renderCreateForm() {
  return `
    <section class="card profile-create-card">
      <h3>פרופיל חדש</h3>
      <form data-form="create-profile">
        <div class="field">
          <label class="label" for="profile-name-input">שם</label>
          <input class="input" id="profile-name-input" name="name" type="text" maxlength="20" value="${escapeHtml(formState.name)}" placeholder="איך קוראים לך?">
        </div>
        <div class="field">
          <span class="label">אווטאר</span>
          <div class="avatar-picker">
            ${AVATARS.map(
              (a) => `
              <button type="button" class="avatar-picker-btn${a === formState.avatar ? ' is-selected' : ''}" data-action="select-avatar" data-avatar="${a}" aria-pressed="${a === formState.avatar}">${a}</button>
            `
            ).join('')}
          </div>
        </div>
        <div class="field">
          <span class="label">רמה</span>
          <div class="tier-picker">
            <button type="button" class="btn ${formState.tier === 1 ? 'btn-primary' : 'btn-secondary'}" data-action="select-tier" data-tier="1">צעיר</button>
            <button type="button" class="btn ${formState.tier === 2 ? 'btn-primary' : 'btn-secondary'}" data-action="select-tier" data-tier="2">בוגר</button>
          </div>
        </div>
        ${formError ? `<p class="form-error">${escapeHtml(formError)}</p>` : ''}
        <button type="submit" class="btn btn-primary btn-block">צור פרופיל</button>
      </form>
    </section>
  `;
}

function render() {
  if (!root) return;

  const profiles = store.listProfiles();
  const activeId = store.getActiveProfileId();
  const active = store.getActiveProfile();
  const showManagement = !active || switcherOpen;

  root.innerHTML = `
    <div class="screen-profiles">
      <h1>פרופיל</h1>
      ${active ? renderActiveCard(active) : ''}
      ${showManagement ? renderProfileList(profiles, activeId) : ''}
      ${showManagement ? renderCreateForm() : ''}
    </div>
  `;
}

function onClick(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  if (action === 'toggle-switch') {
    switcherOpen = !switcherOpen;
    render();
    return;
  }

  if (action === 'switch') {
    store.setActiveProfile(target.dataset.id);
    switcherOpen = false;
    confirmingDeleteId = null;
    render();
    return;
  }

  if (action === 'select-avatar') {
    formState.avatar = target.dataset.avatar;
    render();
    return;
  }

  if (action === 'select-tier') {
    formState.tier = Number(target.dataset.tier);
    render();
    return;
  }

  if (action === 'ask-delete') {
    confirmingDeleteId = target.dataset.id;
    render();
    return;
  }

  if (action === 'cancel-delete') {
    confirmingDeleteId = null;
    render();
    return;
  }

  if (action === 'confirm-delete') {
    store.deleteProfile(target.dataset.id);
    confirmingDeleteId = null;
    render();
    return;
  }
}

function onInput(e) {
  if (e.target && e.target.name === 'name') {
    formState.name = e.target.value;
  }
}

function onSubmit(e) {
  const form = e.target.closest('[data-form="create-profile"]');
  if (!form) return;
  e.preventDefault();

  const name = formState.name.trim();
  if (!name) {
    formError = 'נא להזין שם';
    render();
    return;
  }
  if (!formState.tier) {
    formError = 'נא לבחור רמה';
    render();
    return;
  }

  const id = store.createProfile({ name, avatar: formState.avatar, tier: formState.tier });
  store.setActiveProfile(id);

  formState = { name: '', avatar: AVATARS[0], tier: null };
  formError = '';
  switcherOpen = false;
  confirmingDeleteId = null;
  render();
}

export function mount(el) {
  root = el;
  switcherOpen = false;
  confirmingDeleteId = null;
  formState = { name: '', avatar: AVATARS[0], tier: null };
  formError = '';

  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('submit', onSubmit);

  render();
}

export function unmount() {
  if (root) {
    root.removeEventListener('click', onClick);
    root.removeEventListener('input', onInput);
    root.removeEventListener('submit', onSubmit);
  }
  root = null;
}
