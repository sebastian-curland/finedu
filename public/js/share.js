// share.js — pure encode/decode for a leaderboard "comparison code".
//
// Knows nothing about store.js, gamification.js, or the DOM — it only
// deals with the plain shape { name, xp, level, badgeCount } that the
// leaderboard screen builds from a profile before calling encode(), and
// hands back after decode(). Never touches localStorage or persists
// anything; it's a stateless string <-> object codec.
//
// Format: base64 of the UTF-8 bytes of a small JSON blob (TextEncoder/
// TextDecoder round-trip so Hebrew names survive intact). decode() never
// throws — any malformed/truncated/non-base64/wrong-shape input yields
// null.

/**
 * @param {{name: string, xp: number, level: string, badgeCount: number}} profile
 * @returns {string} a compact, URL-safe-ish shareable code.
 */
export function encode(profile) {
  const data = {
    name: String((profile && profile.name) ?? ''),
    xp: Number.isFinite(profile && profile.xp) ? profile.xp : 0,
    level: String((profile && profile.level) ?? ''),
    badgeCount: Number.isFinite(profile && profile.badgeCount) ? profile.badgeCount : 0,
  };
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * @param {string} code
 * @returns {{name: string, xp: number, level: string, badgeCount: number}|null}
 *   the decoded object, or null on ANY malformed input. Never throws.
 */
export function decode(code) {
  try {
    const binary = atob(String(code));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;

    const { name, xp, level, badgeCount } = parsed;
    if (typeof name !== 'string') return null;
    if (typeof level !== 'string') return null;
    if (typeof xp !== 'number' || !Number.isFinite(xp)) return null;
    if (typeof badgeCount !== 'number' || !Number.isFinite(badgeCount)) return null;

    return { name, xp, level, badgeCount };
  } catch (err) {
    return null;
  }
}
