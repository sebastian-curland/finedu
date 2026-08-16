// main.js — app bootstrap: route table + router startup.
//
// Task 1: no store, no screens exist yet. Every route below renders a
// "coming soon" placeholder. Screen modules are always loaded lazily via
// dynamic import() inside a route's `load` handler (once they exist) so a
// missing file never breaks the whole app during incremental builds.
//
// Task 2 replaces the routing logic in this file with a real
// store.getActiveProfile() check (no active profile -> redirect to
// #/profiles); later tasks replace individual placeholders with real
// dynamic imports as their screens land.

import { start } from './router.js';

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

const routes = [
  { path: '/profiles', load: async () => placeholder('פרופיל') },
  { path: '/map', load: async () => placeholder('מפה') },
  { path: '/world/:worldId', load: async () => placeholder('עולם') },
  { path: '/lesson/:worldId/:lessonId', load: async () => placeholder('שיעור') },
  { path: '/quiz/:worldId', load: async () => placeholder('חידון') },
  { path: '/tools', load: async () => placeholder('כלים') },
  { path: '/tools/:toolId', load: async () => placeholder('כלי') },
  { path: '/portfolio', load: async () => placeholder('תיק') },
  { path: '/leaderboard', load: async () => placeholder('שיאים') },
];

// No store yet, so always land on #/profiles for now.
start(routes, '/profiles');
