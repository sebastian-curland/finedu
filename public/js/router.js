// router.js — hash-based router.
//
// Route table entries: { path: '/lesson/:worldId/:lessonId', load: async (params) => module }
// `load` must resolve to a "screen module": an object with `mount(el, params)`
// and (optionally) `unmount()`. The router calls `unmount()` on the outgoing
// screen before `mount()` on the incoming one.
//
// `notFoundRoute` is a path string (e.g. '/profiles') that the router
// redirects to whenever the current hash is empty or matches no route in
// the table. The redirect is done via `location.hash =`, so it round-trips
// through a normal `hashchange` event.

let currentModule = null;

function parseHash() {
  const raw = location.hash.slice(1); // drop leading '#'
  return raw === '' ? '/' : raw;
}

function splitPath(path) {
  return path.split('/').filter(Boolean);
}

function matchRoute(routes, path) {
  const pathSegs = splitPath(path);
  for (const route of routes) {
    const routeSegs = splitPath(route.path);
    if (routeSegs.length !== pathSegs.length) continue;

    const params = {};
    let matched = true;
    for (let i = 0; i < routeSegs.length; i++) {
      const routeSeg = routeSegs[i];
      const pathSeg = pathSegs[i];
      if (routeSeg.startsWith(':')) {
        params[routeSeg.slice(1)] = decodeURIComponent(pathSeg);
      } else if (routeSeg !== pathSeg) {
        matched = false;
        break;
      }
    }
    if (matched) return { route, params };
  }
  return null;
}

function updateActiveTab(path) {
  const currentBase = splitPath(path)[0] || '';
  const links = document.querySelectorAll('#tabbar a');
  links.forEach((link) => {
    const href = link.getAttribute('href') || '';
    const linkPath = href.replace(/^#/, '');
    const linkBase = splitPath(linkPath)[0] || '';
    link.classList.toggle('active', linkBase !== '' && linkBase === currentBase);
  });
}

async function resolve(routes, notFoundRoute) {
  const path = parseHash();
  const match = matchRoute(routes, path);

  if (!match) {
    if (notFoundRoute && path !== notFoundRoute) {
      location.hash = `#${notFoundRoute}`;
      return; // the hashchange this triggers will call resolve() again
    }
    return; // no route matches and we're already at notFoundRoute — nothing to render
  }

  const app = document.getElementById('app');

  if (currentModule && typeof currentModule.unmount === 'function') {
    try {
      currentModule.unmount();
    } catch (err) {
      console.error('[router] unmount failed', err);
    }
  }
  currentModule = null;
  if (app) app.textContent = '';

  let mod;
  try {
    mod = await match.route.load(match.params);
  } catch (err) {
    console.error('[router] failed to load route module', match.route.path, err);
    return;
  }

  if (mod && typeof mod.mount === 'function' && app) {
    mod.mount(app, match.params);
    currentModule = mod;
  }

  updateActiveTab(path);
}

export function start(routes, notFoundRoute) {
  const handler = () => resolve(routes, notFoundRoute);
  window.addEventListener('hashchange', handler);
  handler();
}
