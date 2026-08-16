// main.js — app bootstrap: route table + router startup.
//
// Screen modules are always loaded lazily via dynamic import() inside a
// route's `load` handler so a missing file never breaks the whole app
// during incremental builds. Routes without a real screen yet still
// render a "coming soon" placeholder.
//
// Task 2: every route is now gated on store.getActiveProfile(). If there
// is no active profile, whatever route was requested renders the
// profiles screen's content instead (the address bar is left alone —
// we only force what's rendered, not the URL) — the user can't reach
// any other screen until they have (or pick) a profile. #/profiles
// itself is never gated.

import { start } from './router.js';
import * as store from './store.js';
import * as gamification from './gamification.js';

function placeholder(label) {
  return {
    mount(el) {
      el.innerHTML = `
        <div class="empty-state">
          <p class="empty-state-emoji" aria-hidden="true">🚧</p>
          <h2>${label}</h2>
          <p>בקרוב…</p>
        </div>
      `;
    },
    unmount() {},
  };
}

function loadProfilesScreen() {
  return import('./screens/profiles.js');
}

// Wraps a route's real `load` so it's skipped in favor of the profiles
// screen whenever there is no active profile. This also doubles as the
// router's central "a route resolved and there IS an active profile"
// checkpoint: it runs exactly once per navigation (once per call to the
// route's `load`, from router.js's resolve()), so it's the single spot to
// touch the daily streak — never once per screen mount.
function guarded(load) {
  return async (params) => {
    const profile = store.getActiveProfile();
    if (!profile) {
      return loadProfilesScreen();
    }
    gamification.touchDaily(profile.id);
    return load(params);
  };
}

const routes = [
  { path: '/profiles', load: async () => loadProfilesScreen() },
  { path: '/map', load: guarded(async () => import('./screens/map.js')) },
  { path: '/world/:worldId', load: guarded(async () => import('./screens/world.js')) },
  { path: '/lesson/:worldId/:lessonId', load: guarded(async () => import('./screens/lesson.js')) },
  { path: '/quiz/:worldId', load: guarded(async () => import('./screens/quiz-screen.js')) },
  { path: '/tools', load: guarded(async () => placeholder('כלים')) },
  { path: '/tools/:toolId', load: guarded(async () => placeholder('כלי')) },
  { path: '/portfolio', load: guarded(async () => placeholder('תיק')) },
  { path: '/leaderboard', load: guarded(async () => placeholder('שיאים')) },
];

start(routes, '/map');
