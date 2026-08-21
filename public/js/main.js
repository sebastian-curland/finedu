// main.js — app bootstrap: route table + router startup.
//
// Screen modules are always loaded lazily via dynamic import() inside a
// route's `load` handler so a missing file never breaks the whole app
// during incremental builds. Every route below is now wired to a real
// screen module (as of Task 17, all of Tasks 5/7/9/10's routes included)
// — there is no "coming soon" placeholder left anywhere in the app.
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

function loadProfilesScreen() {
  return import('./screens/profiles.js');
}

// Wraps a route's real `load` so it's skipped in favor of the profiles
// screen whenever there is no active profile.
function guarded(load) {
  return async (params) => {
    if (!store.getActiveProfile()) {
      return loadProfilesScreen();
    }
    return load(params);
  };
}

const routes = [
  { path: '/profiles', load: async () => loadProfilesScreen() },
  { path: '/map', load: guarded(async () => import('./screens/map.js')) },
  { path: '/world/:worldId', load: guarded(async () => import('./screens/world.js')) },
  { path: '/lesson/:worldId/:lessonId', load: guarded(async () => import('./screens/lesson.js')) },
  { path: '/quiz/:worldId', load: guarded(async () => import('./screens/quiz-screen.js')) },
  { path: '/tools', load: guarded(async () => import('./tools.js')) },
  { path: '/tools/:toolId', load: guarded(async () => import('./tools.js')) },
  { path: '/portfolio', load: guarded(async () => import('./screens/portfolio.js')) },
  { path: '/leaderboard', load: guarded(async () => import('./screens/leaderboard.js')) },
];

// Central "a route resolved and there IS an active profile" hook, passed
// into router.js so it fires once per successful screen mount for EVERY
// route — including '/profiles', which guarded() never wraps. router.js
// stays store.js-agnostic; this is where the profile check + streak touch
// actually happen.
function onRouteResolved() {
  const profile = store.getActiveProfile();
  if (profile) {
    gamification.touchDaily(profile.id);
  }
}

start(routes, '/map', onRouteResolved);
