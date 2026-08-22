// screens/quiz-screen.js — a world's quiz (`#/quiz/:worldId`).
//
// mount(el, {worldId}):
//  - loads the world via content/index.js, hands its `quiz` array off to
//    quiz.js's renderQuiz() (tier filtering happens inside quiz.js).
//  - on completion, records the result to the active profile via
//    store.recordCompletion(profileId, `quiz:${worldId}`, {score, of})
//    and swaps the screen to a results summary (score, pass/fail against
//    the 0.7 threshold, a button back to #/map).

import * as store from '../store.js';
import * as gamification from '../gamification.js';
import * as celebrate from '../celebrate.js';
import { loadWorld } from '../../content/index.js';
import { renderQuiz } from '../quiz.js';

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

function renderNotFound() {
  root.innerHTML = `
    <div class="empty-state">
      <p class="empty-state-emoji" aria-hidden="true">🔍</p>
      <h2>העולם לא נמצא</h2>
      <a class="btn btn-secondary" href="#/map">חזרה למפה</a>
    </div>
  `;
}

function renderResults({ world, score, of, passed }) {
  root.innerHTML = `
    <div class="screen-quiz-results">
      <div class="card quiz-results-card">
        <p class="quiz-results-emoji" aria-hidden="true">${passed ? '🎉' : '📚'}</p>
        <h1>${passed ? 'עברתם בהצלחה!' : 'כמעט הצלחתם'}</h1>
        <p class="quiz-results-score">${score} מתוך ${of} תשובות נכונות</p>
        <p class="quiz-results-message">
          ${passed
            ? `כל הכבוד! סיימתם את החידון של "${escapeHtml(world.title)}" בהצלחה.`
            : `כדאי לחזור על השיעורים של "${escapeHtml(world.title)}" ולנסות שוב.`}
        </p>
        <a class="btn btn-primary btn-block" href="#/map">חזרה למפה</a>
      </div>
    </div>
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
  const tier = profile ? profile.tier : 1;

  root.innerHTML = `
    <div class="screen-quiz-intro">
      <a class="lesson-back" href="#/world/${encodeURIComponent(world.id)}">${world.emoji} ${escapeHtml(world.title)}</a>
      <div id="quiz-root"></div>
    </div>
  `;
  const quizRoot = root.querySelector('#quiz-root');

  renderQuiz(quizRoot, world.quiz, {
    tier,
    onComplete: async ({ score, of }) => {
      if (token !== mountToken || !root) return; // unmounted/remounted mid-quiz
      let outcome = null;
      if (profile) {
        store.recordCompletion(profile.id, `quiz:${world.id}`, { score, of });
        // Awaited (not fire-and-forget) so the XP/badge writes are
        // guaranteed to have landed in store.js before the results
        // screen renders below — otherwise a synchronous read of
        // store.badges right after this resolves could race the async
        // badge-award write by a microtask/tick.
        try {
          outcome = await gamification.onQuizCompleted(profile.id, world.id, { score, of });
        } catch (err) {
          console.error('[quiz-screen] onQuizCompleted failed', err);
        }
        if (token !== mountToken || !root) return; // unmounted/remounted while awaiting
      }
      const passed = of > 0 && score / of >= PASS_THRESHOLD;
      renderResults({ world, score, of, passed });

      // Celebration is purely cosmetic and runs after the results screen
      // is already on-screen — a failure here (or in celebrate.js itself)
      // must never prevent the results from rendering above.
      try {
        if (outcome) {
          const toasts = [];
          if (outcome.leveledUp) {
            toasts.push({
              emoji: '⭐',
              title: 'עלייה ברמה!',
              subtitle: outcome.levelAfter.name,
            });
          }
          for (const badge of outcome.newBadges) {
            toasts.push({
              emoji: badge.emoji,
              title: 'תג חדש!',
              subtitle: badge.title,
            });
          }
          celebrate.celebrate({
            toasts,
            confetti: outcome.passed || outcome.perfect,
          });
        }
      } catch (err) {
        console.error('[quiz-screen] celebrate failed', err);
      }
    },
  });
}

export function mount(el, params) {
  root = el;
  mountToken += 1;
  const token = mountToken;

  root.innerHTML = `
    <div class="empty-state">
      <p class="empty-state-emoji" aria-hidden="true">⏳</p>
      <p>טוען חידון…</p>
    </div>
  `;

  load(params.worldId, token);
}

export function unmount() {
  mountToken += 1; // invalidate any in-flight load()
  root = null;
}
