// Puzzle solvers for RS3 Treasure Trails: puzzle box (5x5 slider), lockbox, towers.
(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Slide puzzle (puzzle box). Board: 25 entries, tile n (1..24) belongs at
  // index n-1, 0 is the gap which belongs at index 24.
  // Solved in stages: top row, left column, second row, second column, then the
  // remaining 3x3 with A*. Each stage is a BFS over the gap + the stage's tiles
  // with already-placed tiles locked, so it stays tiny but gives short paths.
  // ---------------------------------------------------------------------------
  const N = 5;
  const nb = [];
  for (let i = 0; i < 25; i++) {
    const r = Math.floor(i / N), c = i % N, l = [];
    if (r > 0) l.push(i - N);
    if (r < N - 1) l.push(i + N);
    if (c > 0) l.push(i - 1);
    if (c < N - 1) l.push(i + 1);
    nb.push(l);
  }

  function slideSolvable(board) {
    const seen = new Set();
    for (const v of board) {
      if (v < 0 || v > 24 || seen.has(v)) return false;
      seen.add(v);
    }
    if (seen.size !== 25) return false;
    let inv = 0;
    const t = board.filter(v => v !== 0);
    for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) if (t[i] > t[j]) inv++;
    // Odd width: solvable iff inversion count is even.
    return inv % 2 === 0;
  }

  // BFS moving `tiles` to their home cells. Returns list of gap positions visited.
  function stageBfs(board, tiles, locked) {
    const gap = board.indexOf(0);
    const pos = tiles.map(t => board.indexOf(t));
    const goal = tiles.map(t => t - 1);
    const key = (g, p) => p.reduce((k, x) => k * 25 + x, g);
    const done = p => p.every((x, i) => x === goal[i]);
    if (done(pos)) return [];
    const startK = key(gap, pos);
    const prev = new Map([[startK, null]]);
    let q = [[gap, pos]];
    while (q.length) {
      const nq = [];
      for (const [g, p] of q) {
        const k = key(g, p);
        for (const n of nb[g]) {
          if (locked[n]) continue;
          const np = p.map(x => (x === n ? g : x));
          const nk = key(n, np);
          if (prev.has(nk)) continue;
          prev.set(nk, [k, n]);
          if (done(np)) {
            const path = [];
            let cur = nk;
            while (prev.get(cur)) {
              const [pk, mv] = prev.get(cur);
              path.push(mv);
              cur = pk;
            }
            return path.reverse();
          }
          nq.push([n, np]);
        }
      }
      q = nq;
    }
    return null;
  }

  // A* for the bottom-right 3x3 (cells with row,col >= 2).
  function solve3x3(board, locked) {
    const cells = [];
    for (let i = 0; i < 25; i++) if (!locked[i]) cells.push(i);
    const local = new Map(cells.map((c, i) => [c, i]));
    const lnb = cells.map(c => nb[c].filter(n => !locked[n]).map(n => local.get(n)));
    const start = cells.map(c => board[c]);
    const target = cells.map(c => (c === 24 ? 0 : c + 1));
    const tKey = target.join(',');
    const homeOf = new Map(target.map((v, i) => [v, i]));
    const h = s => {
      let d = 0;
      for (let i = 0; i < s.length; i++) {
        if (s[i] === 0) continue;
        const j = homeOf.get(s[i]);
        d += Math.abs(Math.floor(i / 3) - Math.floor(j / 3)) + Math.abs((i % 3) - (j % 3));
      }
      return d;
    };
    const startKey = start.join(',');
    if (startKey === tKey) return [];
    const open = [[h(start), 0, start]];
    const prev = new Map([[startKey, null]]);
    const gBest = new Map([[startKey, 0]]);
    while (open.length) {
      // small open set: linear-scan priority queue is fine
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, g, s] = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      const sk = s.join(',');
      if (sk === tKey) {
        const path = [];
        let cur = sk;
        while (prev.get(cur)) {
          const [pk, mv] = prev.get(cur);
          path.push(cells[mv]);
          cur = pk;
        }
        return path.reverse();
      }
      if (g > gBest.get(sk)) continue;
      const z = s.indexOf(0);
      for (const n of lnb[z]) {
        const ns = s.slice();
        ns[z] = ns[n];
        ns[n] = 0;
        const nk = ns.join(',');
        if (gBest.has(nk) && gBest.get(nk) <= g + 1) continue;
        gBest.set(nk, g + 1);
        prev.set(nk, [sk, n]);
        open.push([g + 1 + h(ns), g + 1, ns]);
      }
    }
    return null;
  }

  // Returns array of tile numbers to click, in order (each moves one tile into the gap).
  function solveSlide(input) {
    const board = input.slice();
    if (!slideSolvable(board)) return null;
    const locked = new Array(25).fill(false);
    const clicks = [];
    const apply = gapPath => {
      for (const n of gapPath) {
        const g = board.indexOf(0);
        clicks.push(board[n]);
        board[g] = board[n];
        board[n] = 0;
      }
    };
    const stages = [[1], [2], [3], [4, 5], [6], [11], [16, 21], [7], [8], [9, 10], [12], [17, 22]];
    for (const st of stages) {
      const path = stageBfs(board, st, locked);
      if (path === null) return null;
      apply(path);
      for (const t of st) locked[t - 1] = true;
    }
    const rest = solve3x3(board, locked);
    if (rest === null) return null;
    apply(rest);
    return clicks;
  }

  // ---------------------------------------------------------------------------
  // Lockbox: 5x5 grid of 3 states. Clicking a cell advances it and its
  // orthogonal neighbours by one step (mod 3). Goal: every cell equal.
  // Solved exactly over GF(3) with Gaussian elimination; free variables (if any)
  // are enumerated to find the fewest total clicks.
  // ---------------------------------------------------------------------------
  function solveLockbox(grid) {
    const size = 25;
    let best = null;
    for (let target = 0; target < 3; target++) {
      const A = [];
      for (let i = 0; i < size; i++) {
        const row = new Array(size + 1).fill(0);
        row[i] = 1;
        for (const n of nb[i]) row[n] = 1;
        row[size] = (((target - grid[i]) % 3) + 3) % 3;
        A.push(row);
      }
      // Each row i lists the clicks that affect cell i (matrix is symmetric).
      const pivCol = [];
      let r = 0;
      for (let c = 0; c < size && r < size; c++) {
        let p = -1;
        for (let k = r; k < size; k++) if (A[k][c]) { p = k; break; }
        if (p < 0) continue;
        [A[r], A[p]] = [A[p], A[r]];
        const inv = A[r][c] === 1 ? 1 : 2; // inverse mod 3
        for (let j = c; j <= size; j++) A[r][j] = (A[r][j] * inv) % 3;
        for (let k = 0; k < size; k++) {
          if (k === r || !A[k][c]) continue;
          const f = A[k][c];
          for (let j = c; j <= size; j++) A[k][j] = (((A[k][j] - f * A[r][j]) % 3) + 3) % 3;
        }
        pivCol.push(c);
        r++;
      }
      let ok = true;
      for (let k = r; k < size; k++) if (A[k][size]) ok = false;
      if (!ok) continue;
      const isPiv = new Set(pivCol);
      const free = [];
      for (let c = 0; c < size; c++) if (!isPiv.has(c)) free.push(c);
      const combos = Math.pow(3, free.length);
      for (let m = 0; m < combos; m++) {
        const x = new Array(size).fill(0);
        let mm = m;
        for (const f of free) { x[f] = mm % 3; mm = Math.floor(mm / 3); }
        for (let k = 0; k < r; k++) {
          let v = A[k][size];
          for (const f of free) v -= A[k][f] * x[f];
          x[pivCol[k]] = ((v % 3) + 3) % 3;
        }
        const total = x.reduce((a, b) => a + b, 0);
        if (!best || total < best.total) best = { clicks: x, total, target };
      }
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Towers: 5x5 latin square (heights 1-5); clues give how many towers are
  // visible from each edge. clues = {top:[5], bottom:[5], left:[5], right:[5]},
  // 0 meaning "no clue". Returns 5x5 array or null.
  // ---------------------------------------------------------------------------
  function visible(line) {
    let m = 0, c = 0;
    for (const v of line) if (v > m) { m = v; c++; }
    return c;
  }

  function perms(arr) {
    if (arr.length <= 1) return [arr.slice()];
    const out = [];
    arr.forEach((v, i) => {
      for (const p of perms(arr.slice(0, i).concat(arr.slice(i + 1)))) out.push([v].concat(p));
    });
    return out;
  }
  const ALL = perms([1, 2, 3, 4, 5]);

  function solveTowers(clues, fixed) {
    const okLine = (line, a, b) =>
      (!a || visible(line) === a) && (!b || visible(line.slice().reverse()) === b);
    const rowCands = [];
    for (let r = 0; r < 5; r++) {
      rowCands.push(ALL.filter(p =>
        okLine(p, clues.left[r], clues.right[r]) &&
        (!fixed || p.every((v, c) => !fixed[r][c] || fixed[r][c] === v))));
    }
    const grid = [];
    const colUsed = [0, 0, 0, 0, 0].map(() => new Set());
    const solutions = [];
    function rec(r) {
      if (solutions.length > 1) return;
      if (r === 5) {
        for (let c = 0; c < 5; c++) {
          const col = grid.map(row => row[c]);
          if (!okLine(col, clues.top[c], clues.bottom[c])) return;
        }
        solutions.push(grid.map(x => x.slice()));
        return;
      }
      for (const p of rowCands[r]) {
        if (p.some((v, c) => colUsed[c].has(v))) continue;
        // prune using top clue on partial columns: visible count can't exceed clue
        let bad = false;
        for (let c = 0; c < 5 && !bad; c++) {
          if (clues.top[c]) {
            const col = grid.map(row => row[c]).concat(p[c]);
            if (visible(col) > clues.top[c]) bad = true;
          }
        }
        if (bad) continue;
        grid.push(p);
        p.forEach((v, c) => colUsed[c].add(v));
        rec(r + 1);
        p.forEach((v, c) => colUsed[c].delete(v));
        grid.pop();
      }
    }
    rec(0);
    if (!solutions.length) return null;
    return { grid: solutions[0], unique: solutions.length === 1 };
  }

  const api = { solveSlide, slideSolvable, solveLockbox, solveTowers, visible };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Solvers = api;
})(this);
