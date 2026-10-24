// Run with: node tests/solvers.test.js
const assert = require('assert');
const S = require('../app/src/main/assets/solvers.js');

function rnd(seed) { return () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648; }

// --- slide puzzle: scramble by random legal moves, solve, replay ---------------
const r = rnd(42);
let maxLen = 0, totalMs = 0;
for (let trial = 0; trial < 200; trial++) {
  const b = [...Array(24).keys()].map(i => i + 1).concat(0);
  for (let k = 0; k < 2000; k++) {
    const g = b.indexOf(0), rr = Math.floor(g / 5), c = g % 5, n = [];
    if (rr) n.push(g - 5); if (rr < 4) n.push(g + 5); if (c) n.push(g - 1); if (c < 4) n.push(g + 1);
    const m = n[Math.floor(r() * n.length)]; b[g] = b[m]; b[m] = 0;
  }
  const t0 = Date.now();
  const clicks = S.solveSlide(b);
  totalMs += Date.now() - t0;
  assert(clicks, 'slide solvable');
  const s = b.slice();
  for (const t of clicks) {
    const g = s.indexOf(0), p = s.indexOf(t);
    assert([1, 5].includes(Math.abs(g - p)) && !(Math.abs(g - p) === 1 && Math.floor(g / 5) !== Math.floor(p / 5)), 'adjacent');
    s[g] = t; s[p] = 0;
  }
  assert.deepStrictEqual(s, [...Array(24).keys()].map(i => i + 1).concat(0));
  maxLen = Math.max(maxLen, clicks.length);
}
console.log(`slide ok: max ${maxLen} moves, avg ${(totalMs / 200).toFixed(1)} ms`);
const unsolv = [...Array(24).keys()].map(i => i + 1).concat(0); [unsolv[0], unsolv[1]] = [unsolv[1], unsolv[0]];
assert.strictEqual(S.solveSlide(unsolv), null);

// --- lockbox -----------------------------------------------------------------
for (let trial = 0; trial < 300; trial++) {
  // Real lockboxes are scrambled by clicks, so only those states are reachable.
  const g = Array(25).fill(Math.floor(r() * 3));
  for (let k = 0; k < 40; k++) {
    const i = Math.floor(r() * 25);
    for (const j of [i, i - 5, i + 5, (i % 5) ? i - 1 : -1, (i % 5) < 4 ? i + 1 : -1]) if (j >= 0 && j < 25) g[j] = (g[j] + 1) % 3;
  }
  const sol = S.solveLockbox(g);
  assert(sol, 'lockbox solvable');
  const s = g.slice();
  sol.clicks.forEach((k, i) => {
    for (const j of [i, i - 5, i + 5, (i % 5) ? i - 1 : -1, (i % 5) < 4 ? i + 1 : -1]) if (j >= 0 && j < 25) s[j] = (s[j] + k) % 3;
  });
  assert(s.every(v => v === s[0]), 'lockbox uniform');
}
console.log('lockbox ok');

// --- towers ------------------------------------------------------------------
const sol = [[1, 2, 3, 4, 5], [2, 3, 4, 5, 1], [3, 4, 5, 1, 2], [4, 5, 1, 2, 3], [5, 1, 2, 3, 4]];
const col = c => sol.map(x => x[c]);
const clues = {
  top: [0, 1, 2, 3, 4].map(c => S.visible(col(c))), bottom: [0, 1, 2, 3, 4].map(c => S.visible(col(c).reverse())),
  left: sol.map(x => S.visible(x)), right: sol.map(x => S.visible(x.slice().reverse())),
};
const t = S.solveTowers(clues);
assert(t);
for (let i = 0; i < 5; i++) {
  assert.strictEqual(S.visible(t.grid[i]), clues.left[i]);
  assert.strictEqual(S.visible(t.grid.map(x => x[i])), clues.top[i]);
}
console.log('towers ok, unique =', t.unique);
