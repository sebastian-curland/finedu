// gamification.js — XP, levels, badges, and streak rules.
//
// Owns every gamification rule (XP amounts, level thresholds, badge award
// conditions) and drives them by calling store.js's setters
// (addXp/addBadge/bumpStreak/markLessonRead). This module never touches
// localStorage directly, and never reimplements logic store.js already
// owns (e.g. streak date math lives in store.bumpStreak — touchDaily just
// calls it and layers the streak-7 badge check on top).

import * as store from './store.js';
import { loadWorld } from '../content/index.js';

/** 10-level XP table, in ascending order. */
export const LEVELS = [
  { level: 1, name: 'חוסך מתחיל', minXp: 0 },
  { level: 2, name: 'חוסך זהיר', minXp: 100 },
  { level: 3, name: 'חוסך חכם', minXp: 250 },
  { level: 4, name: 'משקיע מתחיל', minXp: 450 },
  { level: 5, name: 'משקיע צעיר', minXp: 700 },
  { level: 6, name: 'משקיע מתקדם', minXp: 1000 },
  { level: 7, name: 'אלוף התקציב', minXp: 1400 },
  { level: 8, name: 'גאון הריבית', minXp: 1900 },
  { level: 9, name: 'איש כספים', minXp: 2500 },
  { level: 10, name: 'משקיע מומחה', minXp: 3200 },
];

// --- XP constants -----------------------------------------------------
export const LESSON_READ_XP = 10;
export const CORRECT_ANSWER_XP = 15;
export const PERFECT_QUIZ_BONUS = 50;

// --- Special badges (in addition to each world's own `badge`) ---------
export const BADGES = {
  STREAK_7: { id: 'streak-7', title: 'רצף של 7 ימים', emoji: '🔥' },
  NO_MISTAKES: { id: 'no-mistakes', title: 'בלי טעויות', emoji: '✅' },
  SCAM_HUNTER: { id: 'scam-hunter', title: 'ציד ההונאות', emoji: '🕵️' },
};

const PASS_THRESHOLD = 0.7;
const FRAUD_WORLD_ID = 'fraud'; // world 12's id (content lands in Task 16) — do not deviate

/**
 * @param {number} xp
 * @returns {{level:number, name:string, minXp:number, xpIntoLevel:number, xpForNext:number|null}}
 *   the highest level whose minXp <= xp, plus how far into that level `xp`
 *   is (`xpIntoLevel`) and how much more xp is needed to reach the next
 *   level (`xpForNext`, null at level 10 — there is no next level).
 */
export function levelFor(xp) {
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (lvl.minXp <= xp) current = lvl;
    else break;
  }
  const idx = LEVELS.indexOf(current);
  const next = LEVELS[idx + 1] || null;
  return {
    level: current.level,
    name: current.name,
    minXp: current.minXp,
    xpIntoLevel: xp - current.minXp,
    xpForNext: next ? next.minXp - xp : null,
  };
}

/**
 * Call this from lesson.js's mount instead of store.markLessonRead
 * directly. Awards LESSON_READ_XP only the first time this profile reads
 * this lesson (checked BEFORE marking it read, so a remount/reload of an
 * already-read lesson never double-awards XP), then always marks the
 * lesson read (store.markLessonRead is itself idempotent).
 */
export function onLessonRead(profileId, lessonId) {
  const profile = store.getActiveProfile();
  const alreadyRead = Boolean(profile && profile.lessonsRead.includes(lessonId));
  if (!alreadyRead) {
    store.addXp(profileId, LESSON_READ_XP);
  }
  store.markLessonRead(profileId, lessonId);
}

/**
 * Pure diffing/derivation helper for onQuizCompleted, factored out so it
 * can be unit-tested without a store.js/localStorage shim. Takes plain
 * before/after values only — no store.js calls in here.
 * `badgeCatalog` maps badge id -> {title, emoji} for every badge that
 * could have newly appeared in `badgesAfter` (BADGES.* plus, when
 * relevant, the world's own `badge`), so newBadges can carry display
 * info regardless of which of those two shapes a given badge came from.
 * @param {{perfect:boolean, passed:boolean, xpBefore:number, xpAfter:number,
 *   badgesBefore:string[], badgesAfter:string[],
 *   badgeCatalog?:Record<string,{title:string, emoji:string}>}} input
 * @returns {{perfect:boolean, passed:boolean, levelBefore:object,
 *   levelAfter:object, leveledUp:boolean,
 *   newBadges:Array<{id:string, title:string, emoji:string}>}}
 */
export function computeQuizOutcome({
  perfect,
  passed,
  xpBefore,
  xpAfter,
  badgesBefore,
  badgesAfter,
  badgeCatalog = {},
}) {
  const levelBefore = levelFor(xpBefore);
  const levelAfter = levelFor(xpAfter);
  const leveledUp = levelAfter.level > levelBefore.level;

  const newBadges = badgesAfter
    .filter((id) => !badgesBefore.includes(id))
    .map((id) => {
      const meta = badgeCatalog[id];
      return { id, title: meta ? meta.title : id, emoji: meta ? meta.emoji : '🏅' };
    });

  return { perfect, passed, levelBefore, levelAfter, leveledUp, newBadges };
}

/**
 * Call this from quiz-screen.js's onComplete, alongside (not instead of)
 * store.recordCompletion — that records the raw score, this awards XP and
 * badges for it.
 *
 * Return-value contract: this has exactly one call site in the whole app
 * today (public/js/screens/quiz-screen.js) — if a second caller is ever
 * added, double-check it actually wants/handles this return shape.
 *
 * @param {string} profileId
 * @param {string} worldId
 * @param {{score:number, of:number}} result
 * @returns {Promise<{perfect:boolean, passed:boolean, levelBefore:object,
 *   levelAfter:object, leveledUp:boolean,
 *   newBadges:Array<{id:string, title:string, emoji:string}>}>}
 */
export async function onQuizCompleted(profileId, worldId, { score, of }) {
  const before = store.getActiveProfile();
  const xpBefore = before ? before.xp || 0 : 0;
  const badgesBefore = before ? before.badges.slice() : [];

  store.addXp(profileId, CORRECT_ANSWER_XP * score);

  const perfect = of > 0 && score === of;
  if (perfect) {
    store.addXp(profileId, PERFECT_QUIZ_BONUS);
    store.addBadge(profileId, BADGES.NO_MISTAKES.id);
  }

  const passed = of > 0 && score / of >= PASS_THRESHOLD;
  let worldBadge = null;
  if (passed) {
    const world = await loadWorld(worldId);
    if (world && world.badge) {
      worldBadge = world.badge;
      store.addBadge(profileId, world.badge.id);
    }
    if (worldId === FRAUD_WORLD_ID) {
      store.addBadge(profileId, BADGES.SCAM_HUNTER.id);
    }
  }

  const after = store.getActiveProfile();
  const xpAfter = after ? after.xp || 0 : xpBefore;
  const badgesAfter = after ? after.badges : badgesBefore;

  const badgeCatalog = {
    [BADGES.NO_MISTAKES.id]: BADGES.NO_MISTAKES,
    [BADGES.SCAM_HUNTER.id]: BADGES.SCAM_HUNTER,
    ...(worldBadge ? { [worldBadge.id]: worldBadge } : {}),
  };

  return computeQuizOutcome({
    perfect,
    passed,
    xpBefore,
    xpAfter,
    badgesBefore,
    badgesAfter,
    badgeCatalog,
  });
}

/**
 * Call once per navigation/activity for the active profile. Bumps the
 * daily streak (store.bumpStreak already no-ops on a repeat same-day
 * call) and awards the streak-7 badge once the streak count reaches 7.
 */
export function touchDaily(profileId) {
  store.bumpStreak(profileId);
  const profile = store.getActiveProfile();
  if (profile && profile.streak && profile.streak.count >= 7) {
    store.addBadge(profileId, BADGES.STREAK_7.id);
  }
}
