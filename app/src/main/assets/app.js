(function () {
  'use strict';
  const D = window.CLUE_DATA;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const letters = s => norm(s).replace(/[^a-z]/g, '').split('').sort().join('');
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };
  const DIFFS = ['easy', 'medium', 'hard', 'elite', 'master'];
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';

  // ---------------------------------------------------------------------------
  // "Ask Claude": hands a ready-made question to the Claude app (via the Android
  // bridge), or copies it and opens claude.ai when running in a plain browser.
  // ---------------------------------------------------------------------------
  const ASK_TAIL = '\n\nMy question: ';
  function askClaude(text) {
    const msg = 'I\'m doing a RuneScape 3 (RS3) Treasure Trail.\n\n' + text.trim() + ASK_TAIL;
    if (window.Android && window.Android.askClaude) { window.Android.askClaude(msg); return; }
    const open = () => window.open('https://claude.ai/new', '_blank');
    try { navigator.clipboard.writeText(msg).then(open, open); } catch (e) { open(); }
  }
  const askBtn = (label) => `<button class="btn ask" data-ask>✨ ${label || 'Ask Claude'}</button>`;

  // ---------------------------------------------------------------------------
  // Tabs + back handling
  // ---------------------------------------------------------------------------
  let currentTab = 'clues';
  function showTab(name) {
    currentTab = name;
    $$('nav.bottom button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
    $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
    $('main').scrollTop = 0;
  }
  $$('nav.bottom button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // Called by the Android activity on hardware back. Returns true if handled.
  window.appBack = function () {
    if (currentTab === 'scans' && !$('#scan-detail').hidden) { closeScan(); return true; }
    if (currentTab === 'puzzles' && slide.stage !== 'pick' && currentPuzzle === 'slide') { slide.back(); return true; }
    if (currentTab !== 'clues') { showTab('clues'); return true; }
    if ($('#q').value) { $('#q').value = ''; renderResults(); return true; }
    return false;
  };

  // ---------------------------------------------------------------------------
  // Clue index
  // ---------------------------------------------------------------------------
  const TYPES = [
    ['all', 'All'], ['anagram', 'Anagrams'], ['cryptic', 'Cryptics'], ['emote', 'Emotes'],
    ['map', 'Maps'], ['coord', 'Coords'], ['challenge', 'Challenges'], ['riddle', 'Skill riddles'],
  ];
  const entries = [];
  const add = e => { e.hay = norm([e.title, e.answer, e.search || ''].join(' ')); entries.push(e); };

  D.anagrams.forEach(a => add({
    type: 'anagram', d: a.d, title: a.clue, answer: 'Speak to ' + a.npc, letters: letters(a.clue), img: a.img,
    details: [['Location', a.loc], ['Challenge', a.x.Challenge], ['Travel', a.travel]],
  }));
  D.cryptics.forEach(c => add({
    type: 'cryptic', d: c.d, title: c.clue, answer: c.sol, img: c.img, search: c.loc,
    details: [['Location', c.loc], [c.x.Challenge && /^key/i.test(c.x.Challenge) ? 'Key' : 'Challenge', c.x.Challenge], ['Travel', c.travel]],
  }));
  D.emotes.forEach(e => add({
    type: 'emote', d: e.d, title: e.clue, answer: (e.emote || '').replace(/\n/g, ' → '), img: e.img, items: e.items,
    search: (e.items || []).join(' ') + ' ' + (e.hole || ''),
    details: [['Requirements', e.req], ['Hidey-hole', e.hole], ['Fight', e.fight !== 'None' ? e.fight : ''], ['Travel', e.travel]],
  }));
  D.maps.forEach(m => add({
    type: 'map', d: m.d, title: '', answer: m.sol, map: m.map, img: m.img,
    details: [['Travel', m.travel]],
  }));
  D.coords.forEach(c => add({
    type: 'coord', d: c.d, title: c.clue, answer: c.loc, img: c.img,
    search: `${c.c[0]} ${c.c[1]} ${c.c[3]} ${c.c[4]}`,
    details: [['Requirements', c.x.Requirements], ['Fight', c.x['Fight?']], ['Travel', c.travel]],
  }));
  D.challenges.forEach(c => add({
    type: 'challenge', d: c.d, title: c.q, answer: 'Answer: ' + c.a, search: c.npc,
    details: [['Asked by', c.npc]],
  }));
  D.riddles.forEach(r => add({
    type: 'riddle', d: '', title: r.q, answer: r.a,
    details: [['Requirements', r.req]],
  }));

  let typeFilter = store.get('typeFilter', 'all');
  let diffFilter = 'all';

  function renderChips() {
    $('#type-chips').innerHTML = TYPES.map(([k, l]) => `<button data-k="${k}" class="${k === typeFilter ? 'on' : ''}">${l}</button>`).join('');
    $('#diff-chips').innerHTML = ['all'].concat(DIFFS).map(k => `<button data-k="${k}" class="${k === diffFilter ? 'on' : ''}">${k === 'all' ? 'Any tier' : cap(k)}</button>`).join('');
  }
  $('#type-chips').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    typeFilter = b.dataset.k; store.set('typeFilter', typeFilter); renderChips(); renderResults();
  });
  $('#diff-chips').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    diffFilter = b.dataset.k; renderChips(); renderResults();
  });

  const typeLabel = { anagram: 'Anagram', cryptic: 'Cryptic', emote: 'Emote', map: 'Map', coord: 'Coordinate', challenge: 'Challenge', riddle: 'Skill riddle' };

  function cardHtml(e, i) {
    const det = e.details.filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
    const items = e.items && e.items.length ? `<dt>Equip</dt><dd><div class="items">${e.items.map(x => `<span>${esc(x)}</span>`).join('')}</div></dd>` : '';
    return `<div class="card tap" data-i="${i}">
      <div class="meta"><span class="tag">${typeLabel[e.type]}</span>${e.d ? `<span class="tag ${e.d}">${cap(e.d)}</span>` : ''}<span class="chev">▾</span></div>
      ${e.map ? `<img class="map" loading="lazy" src="${esc(e.map)}" alt="Map clue">` : ''}
      ${e.title ? `<div class="clue">${esc(e.title)}</div>` : ''}
      <div class="answer">${esc(e.answer)}</div>
      <div class="details"><dl>${items}${det}</dl><div class="pic"></div>${askBtn()}</div>
    </div>`;
  }

  function search(q) {
    const nq = norm(q);
    const toks = nq.split(' ').filter(Boolean);
    const lq = letters(q);
    const out = [];
    entries.forEach((e, i) => {
      if (typeFilter !== 'all' && e.type !== typeFilter) return;
      if (diffFilter !== 'all' && e.d !== diffFilter) return;
      if (!toks.length) { out.push([0, i]); return; }
      let score = 0;
      if (e.letters && lq.length >= 4 && e.letters === lq) score += 100;
      const allTok = toks.every(t => e.hay.includes(t));
      if (!allTok && !score) return;
      const nt = norm(e.title);
      if (nt.startsWith(nq)) score += 50;
      else if (nt.includes(nq)) score += 30;
      else if (e.hay.includes(nq)) score += 15;
      toks.forEach(t => { if (nt.includes(t)) score += 2; });
      out.push([score, i]);
    });
    out.sort((a, b) => b[0] - a[0]);
    return out.map(x => x[1]);
  }

  const LIMIT = 80;
  function renderResults() {
    const q = $('#q').value;
    const ids = search(q);
    const shown = ids.slice(0, LIMIT);
    $('#results').innerHTML =
      `<div class="count">${ids.length} match${ids.length === 1 ? '' : 'es'}${ids.length > LIMIT ? ` · showing ${LIMIT}, keep typing to narrow` : ''}</div>` +
      (shown.length ? shown.map(i => cardHtml(entries[i], i)).join('') : '<div class="empty">No clues match. Try fewer words, or a distinctive word from the scroll.</div>');
    if (shown.length === 1) openCard($('#results .card'));
  }

  function openCard(card) {
    card.classList.toggle('open');
    const e = entries[+card.dataset.i];
    const pic = $('.pic', card);
    if (card.classList.contains('open') && e.img && !pic.firstChild) {
      pic.innerHTML = `<img class="photo" loading="lazy" src="${esc(e.img)}" alt="Solution location">`;
      const im = $('img', pic);
      im.onerror = () => im.remove();
    }
  }
  function askAboutEntry(e) {
    const lines = [`Clue type: ${typeLabel[e.type]}${e.d ? ` (${e.d} clue)` : ''}`];
    if (e.title) lines.push(`Clue text: ${e.title}`);
    if (e.type === 'map') lines.push('(It\'s a map clue.)');
    lines.push(`My solver app says the answer is: ${e.answer}`);
    if (e.items && e.items.length) lines.push(`Items to equip: ${e.items.join(', ')}`);
    e.details.filter(([, v]) => v).forEach(([k, v]) => lines.push(`${k}: ${v}`));
    askClaude(lines.join('\n'));
  }
  function cardClick(ev) {
    const c = ev.target.closest('.card'); if (!c) return;
    if (ev.target.closest('[data-ask]')) return askAboutEntry(entries[+c.dataset.i]);
    openCard(c);
  }
  $('#results').addEventListener('click', cardClick);

  let qTimer;
  $('#q').addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(renderResults, 120); });
  $('#q-clear').addEventListener('click', () => { $('#q').value = ''; renderResults(); $('#q').focus(); });

  renderChips();
  renderResults();

  // ---------------------------------------------------------------------------
  // Coordinates
  // ---------------------------------------------------------------------------
  const cState = { ns: 'N', ew: 'E' };
  function bindToggle(id, key) {
    $(id).addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      cState[key] = b.dataset.v;
      $$('button', $(id)).forEach(x => x.classList.toggle('on', x === b));
      renderCoords();
    });
  }
  bindToggle('#c-ns', 'ns');
  bindToggle('#c-ew', 'ew');
  ['#c-d1', '#c-m1', '#c-d2', '#c-m2'].forEach((id, i, arr) => {
    $(id).addEventListener('input', () => {
      const v = $(id).value;
      // jump to the next box once two digits are typed
      if (v.length >= 2 && i < arr.length - 1) $(arr[i + 1]).focus();
      renderCoords();
    });
  });

  function renderCoords() {
    const vals = ['#c-d1', '#c-m1', '#c-d2', '#c-m2'].map(id => $(id).value);
    const out = $('#coord-results');
    if (vals.every(v => v === '')) {
      out.innerHTML = '<div class="empty">Example: “05 degrees 13 minutes south, 01 degrees 13 minutes east” → 5, 13, S, 1, 13, E</div>';
      return;
    }
    const n = vals.map(v => (v === '' ? null : +v));
    const lat = n[0] == null ? null : (n[0] * 60 + (n[1] || 0)) * (cState.ns === 'N' ? 1 : -1);
    const lon = n[2] == null ? null : (n[2] * 60 + (n[3] || 0)) * (cState.ew === 'E' ? 1 : -1);
    const scored = D.coords.map((c, i) => {
      const clat = (c.c[0] * 60 + c.c[1]) * (c.c[2] === 'N' ? 1 : -1);
      const clon = (c.c[3] * 60 + c.c[4]) * (c.c[5] === 'E' ? 1 : -1);
      const d = (lat == null ? 0 : Math.abs(clat - lat)) + (lon == null ? 0 : Math.abs(clon - lon));
      return [d, i];
    }).sort((a, b) => a[0] - b[0]).slice(0, 8);
    const base = entries.findIndex(e => e.type === 'coord');
    out.innerHTML = scored.map(([d, i]) => {
      const html = cardHtml(entries[base + i], base + i);
      return d === 0 && lat != null && lon != null ? html.replace('class="card tap"', 'class="card tap exact"') : html;
    }).join('');
    const first = $('.card.exact', out);
    if (first) openCard(first);
  }
  $('#coord-results').addEventListener('click', cardClick);
  renderCoords();

  // ---------------------------------------------------------------------------
  // Scans
  // ---------------------------------------------------------------------------
  function renderScanList() {
    $('#scan-list').innerHTML = '<p class="hint">Pick the area named on your scroll. Tap dig spots to cross them off as you eliminate them.</p>' +
      D.scans.map((s, i) => `<div class="card tap" data-s="${i}">
        <div class="meta"><span class="tag ${s.d}">${cap(s.d)}</span>${s.range ? `<span class="tag">Range ${s.range} paces</span>` : ''}<span class="tag">${s.spots.length} spots</span></div>
        <div class="answer">${esc(s.region)}</div>
        <div class="clue">“${esc(s.wording)}”</div>
      </div>`).join('');
  }
  let openScan = -1;
  function showScan(i) {
    openScan = i;
    const s = D.scans[i];
    const done = store.get('scan-' + s.region, []);
    const showImgs = store.get('scanImgs', true);
    $('#scan-list').hidden = true;
    const det = $('#scan-detail');
    det.hidden = false;
    det.innerHTML = `<button class="back">‹ All scan areas</button>
      <h2 style="margin:0;color:var(--gold);font-size:18px">${esc(s.region)}</h2>
      <p class="hint">Orb scan range: <b>${s.range || '?'}</b> paces (+5 with a meerkats familiar). ${s.spots.length} possible spots.</p>
      <div class="row-actions">
        <button class="btn" data-act="imgs">${showImgs ? 'Hide' : 'Show'} pictures</button>
        <button class="btn" data-act="reset">Reset crossed-off</button>
        ${askBtn()}
      </div>
      <div class="list">${s.spots.map((p, j) => `<div class="card spot ${done.includes(j) ? 'done' : ''}" data-j="${j}">
        <div class="num">${j + 1}</div>
        <div class="body"><div class="t">${esc(p.t)}</div>${showImgs && p.img ? `<img loading="lazy" src="${esc(p.img)}" alt="" onerror="this.remove()">` : ''}</div>
      </div>`).join('')}</div>`;
    $('main').scrollTop = 0;
  }
  function closeScan() {
    openScan = -1;
    $('#scan-detail').hidden = true;
    $('#scan-list').hidden = false;
  }
  $('#scan-list').addEventListener('click', e => {
    const c = e.target.closest('.card'); if (c) showScan(+c.dataset.s);
  });
  $('#scan-detail').addEventListener('click', e => {
    const s = D.scans[openScan];
    if (e.target.closest('.back')) return closeScan();
    if (e.target.closest('[data-ask]')) {
      const done = store.get('scan-' + s.region, []);
      const left = s.spots.map((p, j) => (done.includes(j) ? null : `${j + 1}. ${p.t}`)).filter(Boolean);
      return askClaude(`I have ${s.d === 'elite' ? 'an' : 'a'} ${s.d} scan clue: "${s.wording}" (${s.region}). Orb scan range: ${s.range || '?'} paces.\n` +
        `Dig spots I haven't ruled out yet (${left.length} of ${s.spots.length}):\n${left.join('\n')}`);
    }
    const act = e.target.closest('[data-act]');
    if (act) {
      if (act.dataset.act === 'imgs') store.set('scanImgs', !store.get('scanImgs', true));
      if (act.dataset.act === 'reset') store.set('scan-' + s.region, []);
      return showScan(openScan);
    }
    const sp = e.target.closest('.spot');
    if (sp) {
      const j = +sp.dataset.j;
      let done = store.get('scan-' + s.region, []);
      done = done.includes(j) ? done.filter(x => x !== j) : done.concat(j);
      store.set('scan-' + s.region, done);
      sp.classList.toggle('done');
    }
  });
  renderScanList();

  // ---------------------------------------------------------------------------
  // Puzzles: segmented control
  // ---------------------------------------------------------------------------
  let currentPuzzle = 'slide';
  $('#puzzle-ask').addEventListener('click', () => {
    const iconName = v => ICONS[v][2];
    const rows = (g, f) => [0, 1, 2, 3, 4].map(r => g.slice(r * 5, r * 5 + 5).map(f).join(' ')).join('\n');
    if (currentPuzzle === 'slide') {
      const txt = slide.stage === 'solve'
        ? `I'm solving a puzzle box (5x5 sliding puzzle)${slide.img ? ` with the ${slide.img.replace(/_/g, ' ')} picture` : ''}. My solver app gave me ${slide.clicks.length} moves and I'm on move ${slide.step + 1}.`
        : `I'm stuck on a puzzle box (5x5 sliding tile puzzle)${slide.img ? ` with the ${slide.img.replace(/_/g, ' ')} picture` : ''}.`;
      return askClaude(txt);
    }
    if (currentPuzzle === 'lockbox') {
      return askClaude(`I'm solving a master clue lockbox (5x5 grid of melee/ranged/magic icons; clicking a square cycles it and its 4 neighbours). My current grid:\n${rows(lock.grid, iconName)}`);
    }
    if (currentPuzzle === 'towers') {
      const f = a => a.map(v => v || '-').join(' ');
      return askClaude(`I'm solving a master clue towers puzzle (5x5, heights 1-5, edge numbers = towers visible).\nTop: ${f(tw.top)}\nBottom: ${f(tw.bottom)}\nLeft (top to bottom): ${f(tw.left)}\nRight (top to bottom): ${f(tw.right)}` +
        (tw.sol ? `\nMy solver app's answer:\n${tw.sol.map(r => r.join(' ')).join('\n')}` : ''));
    }
    askClaude('I need help with a celtic knot or compass clue.');
  });
  $('#puzzle-seg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    currentPuzzle = b.dataset.p;
    $$('#puzzle-seg button').forEach(x => x.classList.toggle('on', x === b));
    $$('.puzzle').forEach(p => { p.hidden = p.id !== 'puzzle-' + currentPuzzle; });
  });

  // ---------------------------------------------------------------------------
  // Puzzle box (slider)
  // ---------------------------------------------------------------------------
  const PUZZLES = [
    ['Adventurer', 'Hamid'], ['Archers', 'Wizard Frumscone'], ['Araxxor', 'Fairy Nuff'], ['Bridge', "Riki the sculptor's model"],
    ['Castle', 'Shiratti the Custodian'], ['Clan_Citadel', 'Willough'], ['Drakan_bloodveld', ''], ['Elves', 'Lord Iorwerth'],
    ['Gregorovic', 'Heckle Funch'], ['Helwyr', 'Trader Stan'], ['Ice_strykewyrm', 'Cam the Camel'], ['Menaphos_Pharaoh', 'General Bentnoze'],
    ['Nomad', 'Captain Ninto'], ['Nymora', 'Uglug Nar'], ['Sword_of_Edicts', 'Odd Old Man'], ['Tree', 'Ramara du Croissant'],
    ['Troll', 'Professor Onglewip'], ['Tuska', 'Captain Bleemadge'], ['V', 'Examiner'], ['Vanstrom_Klause', 'Oziach'],
    ['Werewolf', 'Queen Sigrid'], ['Wizard', 'Zenesha'], ['Wyvern', ''], ['Black_dragon', ''], ['Corporeal_Beast', ''], ['General_Graardor', ''],
  ];
  const slide = {
    stage: 'pick', img: null, cells: [], cursor: 0, history: [], board: null, clicks: [], step: 0,
    back() {
      if (this.stage === 'solve') this.stage = 'input';
      else this.stage = 'pick';
      renderSlide();
    },
  };
  const tileStyle = n => {
    if (!slide.img || n === 0) return '';
    const h = n - 1, r = Math.floor(h / 5), c = h % 5;
    return `background-image:url('puzzles/${slide.img}.jpg');background-position:${c * 25}% ${r * 25}%`;
  };
  const tileHtml = (n, cls, extra) => `<div class="cell ${n === 0 ? 'gap' : ''} ${cls || ''}" style="${tileStyle(n)}" ${extra || ''}>${n === 0 ? '' : slide.img ? `<span class="lbl">${n}</span>` : n}</div>`;

  function renderSlide() {
    const el = $('#puzzle-slide');
    if (slide.stage === 'pick') {
      el.innerHTML = `<p class="hint">Pick the picture on your puzzle box (the NPC is listed under each). Every tile is then entered by tapping the matching piece.</p>
        <div class="pick-grid">
          <button data-img=""><div class="numbers">1‑24</div>Numbers only</button>
          ${PUZZLES.map(([n, npc]) => `<button data-img="${n}"><img src="puzzles/${n}.jpg" alt="">${esc(n.replace(/_/g, ' '))}${npc ? `<br><small>${esc(npc)}</small>` : ''}</button>`).join('')}
        </div>`;
      return;
    }
    if (slide.stage === 'input') {
      const used = new Set(slide.cells.filter(v => v != null));
      const full = slide.cells.every(v => v != null);
      el.innerHTML = `<p class="hint">${full ? 'All tiles entered. Check it matches your game, then tap <b>Solve</b>.' :
        `Look at the <b>highlighted square</b> in your game and tap the matching piece below. ${slide.img ? '' : 'Number pieces by where they belong when solved (1 = top-left, 24 = next to the gap).'}`}</p>
        <div class="board" id="sl-board">${slide.cells.map((v, i) =>
          v == null ? `<div class="cell ${i === slide.cursor ? 'cursor' : ''}" data-i="${i}"></div>` : tileHtml(v, i === slide.cursor ? 'cursor' : '', `data-i="${i}"`)).join('')}</div>
        <div class="row-actions" style="justify-content:center">
          <button class="btn" data-act="undo" ${slide.history.length ? '' : 'disabled'}>Undo</button>
          <button class="btn" data-act="clear">Clear</button>
          <button class="btn" data-act="pick">Change picture</button>
          <button class="btn primary" data-act="solve" ${full ? '' : 'disabled'}>Solve</button>
        </div>
        <div class="msg" id="sl-msg"></div>
        ${full ? '' : `<p class="hint" style="text-align:center">Pieces (as in the solved picture):</p>
        <div class="palette" id="sl-pal">${Array.from({ length: 25 }, (_, h) => {
          const n = h === 24 ? 0 : h + 1;
          return `<div class="cell ${n === 0 ? 'gap' : ''} ${used.has(n) ? 'used' : ''}" data-n="${n}" style="${tileStyle(n)}">${n === 0 ? 'gap' : slide.img ? `<span class="lbl">${n}</span>` : n}</div>`;
        }).join('')}</div>`}`;
      return;
    }
    // solve stage
    const b = slide.board;
    const target = slide.step < slide.clicks.length ? slide.clicks[slide.step] : null;
    let dir = '';
    if (target != null) {
      const g = b.indexOf(0), p = b.indexOf(target);
      dir = p === g - 5 ? 'down' : p === g + 5 ? 'up' : p === g - 1 ? 'right' : 'left';
    }
    el.innerHTML = `<div class="step-info">${target == null ? '<span class="big">Solved! 🎉</span>' :
        `<span class="big">Move ${slide.step + 1} of ${slide.clicks.length}</span><br>Click the <b style="color:var(--green)">flashing</b> tile (slides ${dir}) — or tap it here to advance.`}</div>
      <div class="board" id="sl-play">${b.map(v => tileHtml(v, v === target && v !== 0 ? 'target' : '', `data-n="${v}"`)).join('')}</div>
      <div class="row-actions" style="justify-content:center">
        <button class="btn" data-act="prev" ${slide.step ? '' : 'disabled'}>‹ Back</button>
        <button class="btn primary" data-act="next" ${target == null ? 'disabled' : ''}>Next ›</button>
        <button class="btn" data-act="edit">Edit tiles</button>
      </div>
      <div class="moves">${slide.clicks.map((n, i) => `<span class="${i < slide.step ? 'past' : i === slide.step ? 'cur' : ''}">${n}</span>`).join('')}</div>`;
    const cur = $('.moves .cur', el);
    if (cur && cur.scrollIntoViewIfNeeded) cur.scrollIntoViewIfNeeded();
  }

  function slideApply(n) {
    const b = slide.board, g = b.indexOf(0), p = b.indexOf(n);
    b[g] = n; b[p] = 0;
  }

  $('#puzzle-slide').addEventListener('click', e => {
    const pick = e.target.closest('[data-img]');
    if (slide.stage === 'pick' && pick) {
      slide.img = pick.dataset.img || null;
      slide.cells = new Array(25).fill(null); slide.cursor = 0; slide.history = [];
      slide.stage = 'input';
      return renderSlide();
    }
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'pick') slide.stage = 'pick';
      if (a === 'clear') { slide.cells = new Array(25).fill(null); slide.cursor = 0; slide.history = []; }
      if (a === 'undo') {
        const h = slide.history.pop();
        if (h) { slide.cells[h.i] = h.prev; slide.cursor = h.i; }
      }
      if (a === 'solve') {
        const board = slide.cells.slice();
        if (!Solvers.slideSolvable(board)) {
          renderSlide();
          $('#sl-msg').className = 'msg err';
          $('#sl-msg').textContent = 'That layout can’t be solved — two pieces are probably swapped. Double-check against your game.';
          return;
        }
        slide.clicks = Solvers.solveSlide(board) || [];
        slide.board = board.slice(); slide.step = 0; slide.stage = 'solve';
      }
      if (a === 'next' && slide.step < slide.clicks.length) { slideApply(slide.clicks[slide.step]); slide.step++; }
      if (a === 'prev' && slide.step > 0) {
        slide.step--;
        // undo: the tile we moved is now where the gap was; move it back
        const n = slide.clicks[slide.step];
        slideApply(n);
      }
      if (a === 'edit') { slide.stage = 'input'; slide.cursor = 0; }
      return renderSlide();
    }
    if (slide.stage === 'input') {
      const cell = e.target.closest('#sl-board .cell');
      if (cell) {
        const i = +cell.dataset.i;
        if (slide.cells[i] != null) { slide.history.push({ i, prev: slide.cells[i] }); slide.cells[i] = null; }
        slide.cursor = i;
        return renderSlide();
      }
      const pc = e.target.closest('#sl-pal .cell');
      if (pc && !pc.classList.contains('used')) {
        const n = +pc.dataset.n;
        slide.history.push({ i: slide.cursor, prev: slide.cells[slide.cursor] });
        slide.cells[slide.cursor] = n;
        // auto-fill the final piece
        const empty = slide.cells.map((v, i) => (v == null ? i : -1)).filter(i => i >= 0);
        if (empty.length === 1) {
          const used = new Set(slide.cells);
          const last = [...Array(25).keys()].find(v => !used.has(v));
          slide.cells[empty[0]] = last;
        }
        const next = slide.cells.findIndex((v, i) => v == null && i > slide.cursor);
        slide.cursor = next >= 0 ? next : slide.cells.findIndex(v => v == null);
        if (slide.cursor < 0) slide.cursor = 25;
        return renderSlide();
      }
    }
    if (slide.stage === 'solve') {
      const cell = e.target.closest('#sl-play .cell.target');
      if (cell) { slideApply(slide.clicks[slide.step]); slide.step++; renderSlide(); }
    }
  });
  renderSlide();

  // ---------------------------------------------------------------------------
  // Lockbox
  // ---------------------------------------------------------------------------
  const ICONS = [['melee', '⚔️', 'Melee'], ['ranged', '🏹', 'Ranged'], ['magic', '🔮', 'Magic']];
  const lock = { grid: new Array(25).fill(0), sol: null, order: store.get('lockOrder', 'mrm') };
  // order 'mrm' = melee→ranged→magic→melee ; 'mmr' = melee→magic→ranged→melee
  const nextIcon = v => (lock.order === 'mrm' ? (v + 1) % 3 : (v + 2) % 3);

  function renderLock(msg, cls) {
    const el = $('#puzzle-lockbox');
    el.innerHTML = `<p class="hint">Tap each square until it shows the same symbol as your lockbox, then tap <b>Solve</b>. The numbers show how many times to click each square in-game (in any order).</p>
      <div class="legend">${ICONS.map(i => `<span>${i[1]} ${i[2]}</span>`).join('')}</div>
      <div class="board lock" id="lk">${lock.grid.map((v, i) => `<div class="cell ${ICONS[v][0]}" data-i="${i}">${ICONS[v][1]}${lock.sol ? `<span class="clicks ${lock.sol[i] ? '' : 'z'}">${lock.sol[i]}</span>` : ''}</div>`).join('')}</div>
      <div class="msg ${cls || ''}">${msg || (lock.sol ? 'Tap a numbered square here as you click it in-game to keep track.' : '')}</div>
      <div class="row-actions" style="justify-content:center">
        <button class="btn" data-act="reset">Reset</button>
        <button class="btn primary" data-act="solve">Solve</button>
      </div>
      <p class="hint">In-game, clicking a square cycles it and the 4 squares next to it. Cycle order:</p>
      <div class="seg" id="lk-order">
        <button data-o="mrm" class="${lock.order === 'mrm' ? 'on' : ''}">⚔️→🏹→🔮</button>
        <button data-o="mmr" class="${lock.order === 'mmr' ? 'on' : ''}">⚔️→🔮→🏹</button>
      </div>
      <p class="hint">If your layout isn’t solvable with the chosen order, the solver automatically tries the other one.</p>`;
  }
  function lockSolve() {
    const tryOrder = order => {
      // map icons to "steps from melee" in the given cycle order
      const g = lock.grid.map(v => (order === 'mrm' ? v : (3 - v) % 3));
      return Solvers.solveLockbox(g);
    };
    let s = tryOrder(lock.order), note = '';
    if (!s) {
      const other = lock.order === 'mrm' ? 'mmr' : 'mrm';
      s = tryOrder(other);
      if (s) { lock.order = other; store.set('lockOrder', other); note = ' (switched cycle order to match your box)'; }
    }
    if (!s) return renderLock('No solution — please re-check the symbols you entered.', 'err');
    lock.sol = s.clicks;
    renderLock(`${s.total} clicks total${note}.`, 'ok');
  }
  $('#puzzle-lockbox').addEventListener('click', e => {
    const o = e.target.closest('[data-o]');
    if (o) { lock.order = o.dataset.o; store.set('lockOrder', lock.order); lock.sol = null; return renderLock(); }
    const act = e.target.closest('[data-act]');
    if (act) {
      if (act.dataset.act === 'reset') { lock.grid.fill(0); lock.sol = null; renderLock(); }
      else lockSolve();
      return;
    }
    const c = e.target.closest('#lk .cell'); if (!c) return;
    const i = +c.dataset.i;
    if (lock.sol) {
      // follow-along mode: simulate one in-game click on this square
      if (!lock.sol[i]) return;
      lock.sol[i]--;
      for (const j of [i, i - 5, i + 5, i % 5 ? i - 1 : -1, i % 5 < 4 ? i + 1 : -1]) if (j >= 0 && j < 25) lock.grid[j] = nextIcon(lock.grid[j]);
      const left = lock.sol.reduce((a, b) => a + b, 0);
      if (!left) lock.sol = null;
      return renderLock(left ? `${left} clicks left.` : 'Solved! 🎉', 'ok');
    }
    lock.grid[i] = (lock.grid[i] + 1) % 3; // input order is just for convenience
    renderLock();
  });
  renderLock();

  // ---------------------------------------------------------------------------
  // Towers
  // ---------------------------------------------------------------------------
  const tw = { top: [0, 0, 0, 0, 0], bottom: [0, 0, 0, 0, 0], left: [0, 0, 0, 0, 0], right: [0, 0, 0, 0, 0], given: [...Array(5)].map(() => [0, 0, 0, 0, 0]), sol: null };
  function renderTowers(msg, cls) {
    const el = $('#puzzle-towers');
    let h = '';
    const clue = (side, i) => `<div class="cell clue ${tw[side][i] ? '' : 'blank'}" data-side="${side}" data-i="${i}">${tw[side][i] || '·'}</div>`;
    for (let r = -1; r <= 5; r++) {
      for (let c = -1; c <= 5; c++) {
        if ((r === -1 || r === 5) && (c === -1 || c === 5)) h += '<div class="cell corner"></div>';
        else if (r === -1) h += clue('top', c);
        else if (r === 5) h += clue('bottom', c);
        else if (c === -1) h += clue('left', r);
        else if (c === 5) h += clue('right', r);
        else {
          const g = tw.given[r][c], v = g || (tw.sol ? tw.sol[r][c] : '');
          h += `<div class="cell in ${g ? 'given' : ''}" data-r="${r}" data-c="${c}">${v || ''}</div>`;
        }
      }
    }
    el.innerHTML = `<p class="hint">Tap the edge squares to enter the numbers around your towers puzzle (tap again to count up, past 5 clears). Leave blanks if there’s no number. Optionally tap inner squares to add towers you already know.</p>
      <div class="towers">${h}</div>
      <div class="msg ${cls || ''}">${msg || ''}</div>
      <div class="row-actions" style="justify-content:center">
        <button class="btn" data-act="reset">Reset</button>
        <button class="btn primary" data-act="solve">Solve</button>
      </div>`;
  }
  $('#puzzle-towers').addEventListener('click', e => {
    const act = e.target.closest('[data-act]');
    if (act) {
      if (act.dataset.act === 'reset') {
        ['top', 'bottom', 'left', 'right'].forEach(s => tw[s].fill(0));
        tw.given.forEach(r => r.fill(0)); tw.sol = null; return renderTowers();
      }
      const res = Solvers.solveTowers(tw, tw.given);
      if (!res) { tw.sol = null; return renderTowers('No solution — check the numbers you entered.', 'err'); }
      tw.sol = res.grid;
      return renderTowers(res.unique ? 'Solved! Enter these heights in-game.' : 'Solved (more than one answer fits — any of them works).', 'ok');
    }
    const c = e.target.closest('.cell');
    if (!c) return;
    tw.sol = null;
    if (c.dataset.side) { const s = c.dataset.side, i = +c.dataset.i; tw[s][i] = (tw[s][i] + 1) % 6; }
    else if (c.dataset.r != null) { const r = +c.dataset.r, k = +c.dataset.c; tw.given[r][k] = (tw.given[r][k] + 1) % 6; }
    renderTowers();
  });
  renderTowers();

  // ---------------------------------------------------------------------------
  // Tips: celtic knots + compass
  // ---------------------------------------------------------------------------
  $('#puzzle-tips').innerHTML = `<div class="tips">
    <h3>Celtic knots (elite)</h3>
    <p>Goal: every place two loops cross must show the same rune on both loops (green ring). Use “flip” to see runes hidden under crossings.</p>
    <ol>
      <li>Pick two loops. Rotate the second until one shared crossing matches.</li>
      <li>If the other crossings between those two loops don’t also match, rotate the first loop one step and repeat.</li>
      <li>Once those two loops fully match, rotate the third (and fourth) loop until everything is green, then click <b>Unlock</b>.</li>
    </ol>
    <p>Tip: compare the gap (number of runes) between two crossings on each loop — loops can only line up where those gaps agree.</p>
    <h3>Compass clues (elite / master)</h3>
    <ol>
      <li>Teleport somewhere and note the arrow direction.</li>
      <li>Teleport somewhere far off to the side of that line and note the new direction.</li>
      <li>The dig spot is where the two lines cross. The closer you are, the faster the arrow swings.</li>
      <li>A spinning arrow means you’re on the wrong floor/plane.</li>
    </ol>
    <p>Master compass clues only appear in the Arc. <a href="https://runescape.wiki/w/Treasure_Trails/Guide/Compass">Full compass spot list (wiki)</a></p>
    <h3>Scan clues</h3>
    <p>See the <b>Scans</b> tab. Orb colours: “glows” = in range, brighter = closer; “try a different level” = wrong floor.</p>
  </div>
  <p class="foot">Clue data from the <a href="https://runescape.wiki/w/Treasure_Trails">RuneScape Wiki</a> (CC BY-NC-SA 3.0). Pictures load from the wiki when you’re online. Not affiliated with Jagex.</p>`;
})();
