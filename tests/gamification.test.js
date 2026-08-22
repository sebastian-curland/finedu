import test from 'node:test';
import assert from 'node:assert/strict';

import { computeQuizOutcome, BADGES } from '../public/js/gamification.js';

const badgeCatalog = {
  [BADGES.NO_MISTAKES.id]: BADGES.NO_MISTAKES,
  [BADGES.SCAM_HUNTER.id]: BADGES.SCAM_HUNTER,
  'money-master': { title: 'מומחה הכסף', emoji: '🪙' },
};

test('computeQuizOutcome: perfect score awards the no-mistakes badge', () => {
  const outcome = computeQuizOutcome({
    perfect: true,
    passed: true,
    xpBefore: 50,
    xpAfter: 65,
    badgesBefore: [],
    badgesAfter: [BADGES.NO_MISTAKES.id],
    badgeCatalog,
  });

  assert.equal(outcome.perfect, true);
  assert.equal(outcome.passed, true);
  assert.deepEqual(outcome.newBadges, [
    { id: BADGES.NO_MISTAKES.id, title: BADGES.NO_MISTAKES.title, emoji: BADGES.NO_MISTAKES.emoji },
  ]);
});

test('computeQuizOutcome: passing but not perfect awards the world badge, no no-mistakes badge', () => {
  const outcome = computeQuizOutcome({
    perfect: false,
    passed: true,
    xpBefore: 20,
    xpAfter: 65,
    badgesBefore: [],
    badgesAfter: ['money-master'],
    badgeCatalog,
  });

  assert.equal(outcome.perfect, false);
  assert.equal(outcome.passed, true);
  assert.deepEqual(outcome.newBadges, [
    { id: 'money-master', title: 'מומחה הכסף', emoji: '🪙' },
  ]);
  assert.equal(outcome.leveledUp, false);
});

test('computeQuizOutcome: failing score awards no badges and never levels up', () => {
  const outcome = computeQuizOutcome({
    perfect: false,
    passed: false,
    xpBefore: 30,
    xpAfter: 30,
    badgesBefore: ['money-master'],
    badgesAfter: ['money-master'],
    badgeCatalog,
  });

  assert.equal(outcome.perfect, false);
  assert.equal(outcome.passed, false);
  assert.deepEqual(outcome.newBadges, []);
  assert.equal(outcome.leveledUp, false);
  assert.equal(outcome.levelBefore.level, outcome.levelAfter.level);
});

test('computeQuizOutcome: xp total crossing a level boundary sets leveledUp', () => {
  // Level 2 starts at minXp 100 (see LEVELS in gamification.js).
  const outcome = computeQuizOutcome({
    perfect: false,
    passed: true,
    xpBefore: 90,
    xpAfter: 105,
    badgesBefore: [],
    badgesAfter: [],
    badgeCatalog,
  });

  assert.equal(outcome.levelBefore.level, 1);
  assert.equal(outcome.levelAfter.level, 2);
  assert.equal(outcome.leveledUp, true);
});

test('computeQuizOutcome: xp increase within the same level does not level up', () => {
  const outcome = computeQuizOutcome({
    perfect: false,
    passed: true,
    xpBefore: 50,
    xpAfter: 90,
    badgesBefore: [],
    badgesAfter: [],
    badgeCatalog,
  });

  assert.equal(outcome.levelBefore.level, 1);
  assert.equal(outcome.levelAfter.level, 1);
  assert.equal(outcome.leveledUp, false);
});
