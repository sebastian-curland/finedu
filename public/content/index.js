// content/index.js — content manifest.
//
// Lists every world's content module, in `num` (play) order. Each entry's
// `load()` dynamically imports the world module lazily — nothing about a
// world's lessons/quiz is fetched until it's actually needed.
//
// Later world tasks append their entry to `worlds` below, in `num` order.
// This file itself shouldn't otherwise need to change as worlds are added.

export const worlds = [
  { id: 'money', num: 1, load: () => import('./world-01-money.js') },
  { id: 'budget', num: 2, load: () => import('./world-02-budget.js') },
  { id: 'saving', num: 3, load: () => import('./world-03-saving.js') },
  { id: 'compound', num: 4, load: () => import('./world-04-compound.js') },
  { id: 'inflation', num: 5, load: () => import('./world-05-inflation.js') },
  { id: 'stocks', num: 6, load: () => import('./world-06-stocks.js') },
  { id: 'indices', num: 7, load: () => import('./world-07-indices.js') },
  { id: 'bonds', num: 8, load: () => import('./world-08-bonds.js') },
  { id: 'psychology', num: 9, load: () => import('./world-09-psychology.js') },
];

/** @returns {{id:string,num:number,load:Function}|null} the manifest entry for `worldId`, or null. */
export function getWorldMeta(worldId) {
  return worlds.find((w) => w.id === worldId) || null;
}

/**
 * Dynamically imports and returns a world's `world` content object.
 * @returns {Promise<object|null>} the world object, or null if `worldId` is unknown.
 */
export async function loadWorld(worldId) {
  const meta = getWorldMeta(worldId);
  if (!meta) return null;
  const mod = await meta.load();
  return mod.world;
}
