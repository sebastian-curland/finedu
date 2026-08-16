// store.js — the ONLY module in this app allowed to touch localStorage.
//
// Owns all persisted app state under a single localStorage key
// (`finedu.v1`): profile records (xp, badges, lesson/quiz completion,
// streak, portfolio) plus a small generic TTL cache. Every other module
// (screens, future tasks) must go through the functions exported here —
// never call localStorage directly anywhere else in the app.
//
// Reads/writes are always wrapped in try/catch: a corrupted or
// version-mismatched stored value never throws, it just falls back to a
// fresh empty state.

const STORAGE_KEY = 'finedu.v1';
const SCHEMA_VERSION = 1;

/** @returns {object} a brand-new, empty top-level state object. */
function freshState() {
  return {
    version: SCHEMA_VERSION,
    activeProfile: null,
    profiles: {},
    cache: {},
  };
}

/** Reads and parses the persisted state, falling back to fresh state on any problem. */
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || parsed.version !== SCHEMA_VERSION) {
      return freshState();
    }
    // Defensive defaults in case of a hand-edited/partial value.
    return {
      version: SCHEMA_VERSION,
      activeProfile: parsed.activeProfile ?? null,
      profiles: parsed.profiles && typeof parsed.profiles === 'object' ? parsed.profiles : {},
      cache: parsed.cache && typeof parsed.cache === 'object' ? parsed.cache : {},
    };
  } catch (err) {
    return freshState();
  }
}

/** Persists the given state object, swallowing any write failure (quota, privacy mode, etc). */
function save(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    // Nothing we can do about a failed write (quota exceeded, private
    // browsing, etc) — the in-memory caller already has the up-to-date
    // value for this turn, so we just drop persistence silently.
  }
}

function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback id generator (good enough for local, non-cryptographic use).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** YYYY-MM-DD for the local calendar day, used by bumpStreak(). */
function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whole-day difference between two YYYY-MM-DD keys (b - a). */
function dayDiff(aKey, bKey) {
  const a = new Date(`${aKey}T00:00:00`);
  const b = new Date(`${bKey}T00:00:00`);
  return Math.round((b - a) / 86400000);
}

// --- Whole-state access ----------------------------------------------------

/** @returns {object} the full persisted state (read fresh from localStorage). */
export function getState() {
  return load();
}

// --- Profile listing / active profile --------------------------------------

/** @returns {object[]} every profile, as full profile objects. */
export function listProfiles() {
  const state = load();
  return Object.values(state.profiles);
}

/** @returns {string|null} the active profile's id, or null if none is set. */
export function getActiveProfileId() {
  const state = load();
  return state.activeProfile ?? null;
}

/** @returns {object|null} the full active profile object, or null. */
export function getActiveProfile() {
  const state = load();
  const id = state.activeProfile;
  if (!id || !state.profiles[id]) return null;
  return state.profiles[id];
}

/** Sets the active profile. No-ops if `id` isn't null and doesn't exist. */
export function setActiveProfile(id) {
  const state = load();
  if (id !== null && !state.profiles[id]) return;
  state.activeProfile = id;
  save(state);
}

// --- Profile CRUD ------------------------------------------------------

/**
 * Creates a new profile with every schema field at its documented default.
 * @param {{name: string, avatar: string, tier: 1|2}} fields
 * @returns {string} the new profile's id.
 */
export function createProfile({ name, avatar, tier }) {
  const state = load();
  const id = uuid();
  state.profiles[id] = {
    id,
    name,
    avatar,
    tier,
    xp: 0,
    badges: [],
    lessonsRead: [],
    completed: {},
    streak: { count: 0, lastDay: null },
    portfolio: { cash: 10000, holdings: {}, history: [] },
  };
  save(state);
  return id;
}

/** Deletes a profile. If it was the active profile, clears activeProfile. */
export function deleteProfile(id) {
  const state = load();
  if (!state.profiles[id]) return;
  delete state.profiles[id];
  if (state.activeProfile === id) {
    state.activeProfile = null;
  }
  save(state);
}

/** Shallow-merges `patch` into the profile at `id`. */
export function updateProfile(id, patch) {
  const state = load();
  const profile = state.profiles[id];
  if (!profile) return null;
  Object.assign(profile, patch);
  save(state);
  return profile;
}

// --- Progress: xp / badges / completion / reading / streak -----------------

/** Adds `amount` xp to the profile's total. @returns {number} the new total. */
export function addXp(id, amount) {
  const state = load();
  const profile = state.profiles[id];
  if (!profile) return 0;
  profile.xp = (profile.xp || 0) + amount;
  save(state);
  return profile.xp;
}

/** Idempotently adds a badge id to the profile's badge list. */
export function addBadge(id, badgeId) {
  const state = load();
  const profile = state.profiles[id];
  if (!profile) return;
  if (!profile.badges.includes(badgeId)) {
    profile.badges.push(badgeId);
    save(state);
  }
}

/**
 * Records completion of a lesson/quiz keyed entry.
 * Lesson keys are the lesson's own id; world quizzes key as `quiz:${world.id}`.
 */
export function recordCompletion(id, key, { score, of }) {
  const state = load();
  const profile = state.profiles[id];
  if (!profile) return;
  profile.completed[key] = { score, of, at: new Date().toISOString() };
  save(state);
}

/** Idempotently marks a lesson as read. */
export function markLessonRead(id, lessonId) {
  const state = load();
  const profile = state.profiles[id];
  if (!profile) return;
  if (!profile.lessonsRead.includes(lessonId)) {
    profile.lessonsRead.push(lessonId);
    save(state);
  }
}

/**
 * Advances the daily streak counter for a profile.
 * Same calendar day as last bump: no-op on the count. Exactly one day
 * after: count+1. Any bigger gap (or first-ever bump): count resets to 1.
 * `streak.lastDay` is always set to today afterward.
 */
export function bumpStreak(id) {
  const state = load();
  const profile = state.profiles[id];
  if (!profile) return;
  const today = todayKey();
  const last = profile.streak.lastDay;
  if (last === today) {
    // same day: count unchanged
  } else if (last && dayDiff(last, today) === 1) {
    profile.streak.count += 1;
  } else {
    profile.streak.count = 1;
  }
  profile.streak.lastDay = today;
  save(state);
}

// --- Portfolio ---------------------------------------------------------

/** @returns {object|null} the profile's portfolio ({cash, holdings, history}). */
export function getPortfolio(id) {
  const state = load();
  const profile = state.profiles[id];
  return profile ? profile.portfolio : null;
}

/** Shallow-merges `patch` into the profile's portfolio. */
export function updatePortfolio(id, patch) {
  const state = load();
  const profile = state.profiles[id];
  if (!profile) return null;
  Object.assign(profile.portfolio, patch);
  save(state);
  return profile.portfolio;
}

// --- Generic TTL cache (not per-profile) --------------------------------

/** @returns {*} the cached value for `key`, or null if missing/expired. */
export function cacheGet(key, ttlMs) {
  const state = load();
  const entry = state.cache[key];
  if (!entry) return null;
  if (Date.now() - entry.at > ttlMs) return null;
  return entry.value;
}

/** Stores `value` under `key` with the current timestamp. */
export function cacheSet(key, value) {
  const state = load();
  state.cache[key] = { value, at: Date.now() };
  save(state);
}
