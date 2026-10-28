import { grade, isDue, accuracy, DAY, MISS, PARTLY, RIGHT } from './srs.js';

const KEY = 'ds-two-track-v1';
const WEEKS = 13;
const CHECKPOINTS = { 4: 30, 8: 40, 12: 50 };
const REVIEW_CAP = 30;

// ---------- state ----------
const blank = () => ({ start: null, weekOverride: 0, cards: {}, ex: {}, days: {}, cp: {} });
function load() {
  try { return { ...blank(), ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return blank(); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode: progress lives for this tab only */ }
}
let S = load();

// ---------- content ----------
let W = [];                 // week objects in order
const CARD = {}, UNIT = {}; // by id
const unitCards = {};       // unit id -> [card]

async function loadContent() {
  W = await Promise.all(Array.from({ length: WEEKS }, (_, i) =>
    fetch(`data/w${String(i + 1).padStart(2, '0')}.json`).then(r => r.json())));
  for (const w of W) {
    for (const u of w.units) { UNIT[u.id] = { ...u, week: w.week }; unitCards[u.id] = []; }
    for (const c of w.cards) { CARD[c.id] = c; unitCards[c.unit].push(c); }
  }
}

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const ymd = d => d.toLocaleDateString('en-CA'); // local YYYY-MM-DD
const today = () => ymd(new Date());
const daysSinceStart = () => S.start ? Math.floor((Date.parse(today()) - Date.parse(S.start)) / DAY) : 0;
const currentWeek = () => S.weekOverride || Math.min(WEEKS, Math.max(1, Math.floor(daysSinceStart() / 7) + 1));
const dayOfWeek = () => ((daysSinceStart() % 7) + 7) % 7 + 1;
const unitStats = id => {
  const cs = unitCards[id], st = cs.map(c => S.cards[c.id]).filter(Boolean);
  const seen = st.reduce((n, s) => n + s.seen, 0), right = st.reduce((n, s) => n + s.right, 0);
  return { total: cs.length, started: st.length, mastered: st.filter(s => s.mastered).length, acc: seen ? right / seen : null };
};

// ---------- session builders ----------
function todaySession() {
  const now = Date.now();
  const due = Object.keys(S.cards).filter(id => CARD[id] && isDue(S.cards[id], now))
    .sort((a, b) => S.cards[a].due - S.cards[b].due).slice(0, REVIEW_CAP).map(id => CARD[id]);
  // Next units with unseen cards, weeks up to the current one, alternating A/B.
  const open = W.filter(w => w.week <= currentWeek()).flatMap(w => w.units)
    .filter(u => unitCards[u.id].some(c => !S.cards[c.id]));
  const a = open.filter(u => u.track === 'A'), b = open.filter(u => u.track === 'B');
  const units = [a[0], b[0], a[1], b[1]].filter(Boolean);
  while (units.length < 4 && (a.length + b.length) > units.length) {
    const extra = [...a, ...b].find(u => !units.includes(u)); if (!extra) break; units.push(extra);
  }
  const fresh = units.slice(0, 4).flatMap(u => unitCards[u.id].filter(c => !S.cards[c.id]));
  return { due, fresh, units: units.slice(0, 4) };
}

function weekReview() {
  const wk = currentWeek();
  const ids = new Set(W[wk - 1].cards.filter(c => S.cards[c.id] && !S.cards[c.id].mastered).map(c => c.id));
  for (const [id, st] of Object.entries(S.cards)) if (st.last === MISS && CARD[id]) ids.add(id);
  return shuffle([...ids].map(id => CARD[id]));
}

// Weighted sample without replacement (Efraimidis–Spirakis).
const wsample = (items, weight, n) => items.map(x => [Math.random() ** (1 / weight(x)), x])
  .sort((p, q) => q[0] - p[0]).slice(0, n).map(p => p[1]);

function checkpointCards(wk) {
  const n = CHECKPOINTS[wk];
  const pool = W.filter(w => w.week < wk || (wk !== 12 && w.week === wk)).flatMap(w => w.cards);
  if (wk === 4) return shuffle(pool).slice(0, n);
  if (wk === 8) return wsample(pool, c => (UNIT[c.unit].week >= 5 ? 2 : 1), n);
  // Week 12: lowest-accuracy cards from weeks 1–11 (unseen counts as 0), random tiebreak.
  return shuffle(pool).sort((x, y) => accuracy(S.cards[x.id]) - accuracy(S.cards[y.id])).slice(0, n);
}

// ---------- quiz runner ----------
function runQuiz(cards, title, onDone) {
  const results = [];
  let i = 0;
  const record = (c, g) => {
    S.cards[c.id] = grade(S.cards[c.id], g);
    S.days[today()] = (S.days[today()] || 0) + 1;
    results.push({ id: c.id, g });
    save();
  };
  const next = () => (++i < cards.length ? show() : onDone(results));
  const feedback = (el, c, ok, extra = '') => {
    el.querySelector('.fb').innerHTML =
      `<p class="${ok ? 'ok' : 'bad'}">${ok ? 'Correct' : 'Not quite'}</p>${extra}` +
      (c.explain ? `<p class="explain">${esc(c.explain)}</p>` : '') +
      `<button class="primary next">Next</button>`;
    el.querySelector('.next').onclick = next;
    el.querySelector('.next').focus();
  };

  function show() {
    const c = cards[i], u = UNIT[c.unit];
    const el = $('#main');
    el.innerHTML = `<div class="quiz">
      <div class="qhead"><span class="tag t${u.track}">${esc(c.unit)}</span> ${esc(u.title)}
        <span class="count">${i + 1}/${cards.length} · ${esc(title)}</span></div>
      <p class="q">${esc(c.q)}</p><div class="ans"></div><div class="fb" aria-live="polite"></div>
      <button class="link quit">End session</button></div>`;
    el.querySelector('.quit').onclick = () => onDone(results);
    const ans = el.querySelector('.ans');

    if (c.type === 'mcq') {
      for (const k of shuffle(c.choices.map((_, k) => k))) {
        const b = document.createElement('button');
        b.className = 'choice'; b.textContent = c.choices[k]; b.dataset.k = k;
        b.onclick = () => {
          const ok = k === c.answer;
          ans.querySelectorAll('button').forEach(x => (x.disabled = true));
          b.classList.add(ok ? 'right' : 'wrong');
          if (!ok) ans.querySelector(`[data-k="${c.answer}"]`).classList.add('right');
          record(c, ok ? RIGHT : MISS); feedback(el, c, ok);
        };
        ans.append(b);
      }
    } else if (c.type === 'numeric') {
      ans.innerHTML = `<form><input type="number" step="any" inputmode="decimal" required aria-label="Answer">
        <button class="primary">Check</button></form>`;
      const f = ans.querySelector('form');
      f.querySelector('input').focus();
      f.onsubmit = e => {
        e.preventDefault();
        const x = parseFloat(f.querySelector('input').value);
        const ok = Math.abs(x - c.answer) <= c.tol;
        f.querySelectorAll('input,button').forEach(x => (x.disabled = true));
        record(c, ok ? RIGHT : MISS);
        feedback(el, c, ok, `<p>Answer: <b>${c.answer}</b> (±${c.tol})</p>`);
      };
    } else if (c.type === 'order') {
      const picked = [];
      const draw = () => {
        ans.innerHTML = `<p class="hint">Tap in the correct order. Tap a numbered step to undo.</p>
          <ol class="picked">${picked.map(t => `<li><button class="choice">${esc(t)}</button></li>`).join('')}</ol>
          <div class="pool"></div><button class="primary check" ${picked.length < c.items.length ? 'disabled' : ''}>Check</button>`;
        ans.querySelectorAll('.picked button').forEach((b, k) => (b.onclick = () => { picked.splice(k, 1); draw(); }));
        for (const t of order.filter(t => !picked.includes(t))) {
          const b = document.createElement('button'); b.className = 'choice'; b.textContent = t;
          b.onclick = () => { picked.push(t); draw(); };
          ans.querySelector('.pool').append(b);
        }
        ans.querySelector('.check').onclick = () => {
          const ok = picked.every((t, k) => t === c.items[k]);
          ans.querySelectorAll('button').forEach(x => (x.disabled = true));
          record(c, ok ? RIGHT : MISS);
          feedback(el, c, ok, ok ? '' : `<ol class="solution">${c.items.map(t => `<li>${esc(t)}</li>`).join('')}</ol>`);
        };
      };
      const order = shuffle(c.items);
      draw();
    } else { // text: self-grade against rubric
      ans.innerHTML = `<textarea rows="4" placeholder="Write or say your answer, then reveal."></textarea>
        <button class="primary reveal">Reveal answer</button>`;
      ans.querySelector('.reveal').onclick = () => {
        ans.querySelector('.reveal').remove();
        el.querySelector('.fb').innerHTML = `<div class="model"><p><b>Model answer:</b> ${esc(c.answer)}</p>
          ${c.rubric ? `<p><b>Rubric</b></p><ul>${c.rubric.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}</div>
          <div class="self"><button data-g="${MISS}" class="bad">Missed</button><button data-g="${PARTLY}">Partly</button>
          <button data-g="${RIGHT}" class="ok">Got it</button></div>`;
        el.querySelectorAll('.self button').forEach(b => (b.onclick = () => { record(c, +b.dataset.g); next(); }));
      };
    }
  }
  if (!cards.length) return onDone(results);
  show();
}

function summary(results, title, back) {
  const right = results.filter(r => r.g === RIGHT).length + results.filter(r => r.g === PARTLY).length / 2;
  $('#main').innerHTML = `<h2>${esc(title)} done</h2>
    <p class="big">${results.length ? Math.round(100 * right / results.length) : 0}%</p>
    <p>${results.length} cards answered.</p><button class="primary">Back</button>`;
  $('#main button').onclick = back;
}

// ---------- views ----------
function viewToday() {
  if (!S.start) {
    $('#main').innerHTML = `<h2>Welcome</h2><p>Pick the day you start Week 1. The app works out your current week from it.</p>
      <form class="row"><input type="date" required value="${today()}" aria-label="Start date"><button class="primary">Start</button></form>`;
    $('#main form').onsubmit = e => { e.preventDefault(); S.start = $('#main input').value; save(); viewToday(); };
    return;
  }
  const wk = currentWeek(), w = W[wk - 1], s = todaySession(), rev = weekReview();
  const day = dayOfWeek();
  $('#main').innerHTML = `<h2>Week ${wk}: ${esc(w.title)}</h2>
    <p class="muted">Day ${S.weekOverride ? '–' : day} of 7 · ${streak()} day streak</p>
    ${day === 7 && !S.weekOverride ? `<p class="note">Day 7: do the week review.</p>` : ''}
    <div class="card">
      <h3>Today's session</h3>
      <p>${s.due.length} reviews due · ${s.fresh.length} new cards</p>
      <ul class="units">${s.units.map(u => `<li><span class="tag t${u.track}">${u.id}</span> ${esc(u.title)}</li>`).join('') || '<li>No new units left up to this week.</li>'}</ul>
      <button class="primary go" ${s.due.length + s.fresh.length ? '' : 'disabled'}>Start</button>
    </div>
    <div class="card"><h3>Week review</h3><p>${rev.length} cards: this week's unmastered cards and anything you last missed.</p>
      <button class="rev" ${rev.length ? '' : 'disabled'}>Review</button></div>
    ${CHECKPOINTS[wk] ? `<div class="card"><h3>Checkpoint ${Object.keys(CHECKPOINTS).indexOf(String(wk)) + 1} this week</h3>
      <button class="cpgo">Open checkpoints</button></div>` : ''}
    <div class="card"><h3>Weekend build</h3><p>${esc(w.exercise)}</p>
      <label class="row"><input type="checkbox" class="exd" ${S.ex[wk] ? 'checked' : ''}> Done</label></div>`;
  $('#main .go').onclick = () => runQuiz([...s.due, ...s.fresh], 'Today', r => summary(r, 'Session', viewToday));
  $('#main .rev').onclick = () => runQuiz(rev, 'Week review', r => summary(r, 'Week review', viewToday));
  $('#main .exd').onchange = e => { S.ex[wk] = e.target.checked; save(); };
  const cp = $('#main .cpgo'); if (cp) cp.onclick = () => nav('checkpoint');
}

function viewCurriculum() {
  const wk = currentWeek();
  $('#main').innerHTML = W.map(w => `<details ${w.week === wk ? 'open' : ''}>
    <summary><b>W${w.week}</b> ${esc(w.title)} ${S.ex[w.week] ? '✓' : ''}</summary>
    <p>${esc(w.objectives)}</p>
    ${w.units.map(u => { const st = unitStats(u.id); return `<div class="unit">
      <span class="tag t${u.track}">${u.id}</span> ${esc(u.title)}
      <div class="bar"><i style="width:${100 * st.started / st.total}%"></i></div>
      <small>${st.started}/${st.total} started · ${st.mastered} mastered${st.acc !== null ? ` · ${Math.round(st.acc * 100)}%` : ''}</small>
      ${u.concepts ? `<small class="muted">${esc(u.concepts)}</small>` : ''}
      <button class="study" data-u="${u.id}">Study</button></div>`; }).join('')}
    <p><b>Weekend build:</b> ${esc(w.exercise)}</p>
    <label class="row"><input type="checkbox" data-w="${w.week}" ${S.ex[w.week] ? 'checked' : ''}> Build done</label>
    ${w.resources?.length ? `<p><b>Resources</b></p><ul>${w.resources.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
  </details>`).join('');
  $('#main').querySelectorAll('.study').forEach(b => (b.onclick = () =>
    runQuiz(unitCards[b.dataset.u], b.dataset.u, r => summary(r, b.dataset.u, viewCurriculum))));
  $('#main').querySelectorAll('input[data-w]').forEach(x => (x.onchange = () => { S.ex[x.dataset.w] = x.checked; save(); }));
}

function viewCheckpoint() {
  $('#main').innerHTML = `<h2>Checkpoints</h2><p class="muted">Mixed quizzes. Any unit under 80% gets re-queued: its cards go back to box 0, due now.</p>` +
    Object.entries(CHECKPOINTS).map(([wk, n], k) => `<div class="card"><h3>Checkpoint ${k + 1} · Week ${wk}</h3>
      <p>${n} cards · ${wk === '4' ? 'Weeks 1–4' : wk === '8' ? 'Weeks 1–8, weighted to 5–8' : 'Your weakest cards from Weeks 1–11'}</p>
      ${S.cp[wk] ? `<p>Last: <b>${S.cp[wk].score}%</b> on ${S.cp[wk].date}</p>` : ''}
      <button data-wk="${wk}">Start</button></div>`).join('');
  $('#main').querySelectorAll('button[data-wk]').forEach(b => (b.onclick = () => {
    const wk = b.dataset.wk;
    runQuiz(checkpointCards(+wk), `Checkpoint W${wk}`, r => checkpointResult(wk, r));
  }));
}

function checkpointResult(wk, results) {
  const byUnit = {};
  for (const { id, g } of results) {
    const u = (byUnit[CARD[id].unit] ||= { n: 0, s: 0 });
    u.n++; u.s += g === RIGHT ? 1 : g === PARTLY ? 0.5 : 0;
  }
  const total = results.reduce((n, r) => n + (r.g === RIGHT ? 1 : r.g === PARTLY ? 0.5 : 0), 0);
  const score = results.length ? Math.round(100 * total / results.length) : 0;
  const weak = Object.entries(byUnit).filter(([, u]) => u.s / u.n < 0.8).map(([id]) => id);
  const now = Date.now();
  for (const id of weak) for (const c of unitCards[id]) {
    const st = S.cards[c.id];
    if (st) S.cards[c.id] = { ...st, box: 0, streak: 0, mastered: false, due: now };
  }
  if (results.length) S.cp[wk] = { score, date: today() };
  save();
  $('#main').innerHTML = `<h2>Checkpoint W${wk}</h2><p class="big">${score}%</p>
    <p>${weak.length ? `Re-queued ${weak.length} unit(s) under 80% (shown in red).` : 'No units under 80%.'}</p>
    <ul>${Object.entries(byUnit).sort().map(([id, u]) => `<li class="${weak.includes(id) ? 'bad' : ''}">${id} ${esc(UNIT[id].title)}: ${u.s}/${u.n}</li>`).join('')}</ul>
    <button class="primary">Back</button>`;
  $('#main button').onclick = viewCheckpoint;
}

function streak() {
  let n = 0;
  for (let d = new Date(); S.days[ymd(d)]; d = new Date(d - DAY)) n++;
  return n;
}

function viewStats() {
  const agg = cards => {
    let seen = 0, right = 0;
    for (const c of cards) { const s = S.cards[c.id]; if (s) { seen += s.seen; right += s.right; } }
    return seen ? `${Math.round(100 * right / seen)}%` : '–';
  };
  const all = W.flatMap(w => w.cards);
  const mastered = all.filter(c => S.cards[c.id]?.mastered).length;
  const weakest = Object.keys(UNIT).map(id => [id, unitStats(id).acc]).filter(x => x[1] !== null)
    .sort((a, b) => a[1] - b[1]).slice(0, 5);
  $('#main').innerHTML = `<h2>Stats</h2>
    <div class="grid"><div class="stat"><b>${streak()}</b>day streak</div>
      <div class="stat"><b>${mastered}/${all.length}</b>mastered</div>
      <div class="stat"><b>${agg(all.filter(c => UNIT[c.unit].track === 'A'))}</b>Track A</div>
      <div class="stat"><b>${agg(all.filter(c => UNIT[c.unit].track === 'B'))}</b>Track B</div></div>
    <h3>By week</h3><table>${W.map(w => `<tr><td>W${w.week}</td><td>${esc(w.title)}</td><td>${agg(w.cards)}</td></tr>`).join('')}</table>
    <h3>Weakest units</h3><ul>${weakest.map(([id, a]) => `<li>${id} ${esc(UNIT[id].title)}: ${Math.round(a * 100)}%</li>`).join('') || '<li>Nothing answered yet.</li>'}</ul>
    <h3>Settings</h3>
    <label class="row">Start date <input type="date" class="sd" value="${S.start || ''}"></label>
    <label class="row">Week override <select class="wo"><option value="0">Auto (from date)</option>
      ${W.map(w => `<option value="${w.week}" ${S.weekOverride === w.week ? 'selected' : ''}>Week ${w.week}</option>`).join('')}</select></label>
    <div class="row"><button class="exp">Export progress</button><label class="btn">Import<input type="file" accept="application/json" class="imp" hidden></label>
      <button class="rst bad">Reset all</button></div>`;
  $('#main .sd').onchange = e => { S.start = e.target.value || null; save(); };
  $('#main .wo').onchange = e => { S.weekOverride = +e.target.value; save(); };
  $('#main .exp').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' }));
    a.download = `ds-progress-${today()}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  $('#main .imp').onchange = async e => {
    try {
      const data = JSON.parse(await e.target.files[0].text());
      if (typeof data !== 'object' || typeof data.cards !== 'object') throw new Error('not a progress file');
      if (!confirm('Replace current progress with this file?')) return;
      S = { ...blank(), ...data }; save(); viewStats();
    } catch (err) { alert(`Import failed: ${err.message}`); }
  };
  $('#main .rst').onclick = () => { if (confirm('Delete all progress? Export first if unsure.')) { S = blank(); save(); nav('today'); } };
}

// ---------- nav ----------
const VIEWS = { today: viewToday, curriculum: viewCurriculum, checkpoint: viewCheckpoint, stats: viewStats };
function nav(v) {
  document.querySelectorAll('nav button').forEach(b => b.setAttribute('aria-current', b.dataset.v === v));
  VIEWS[v](); window.scrollTo(0, 0);
}
document.querySelectorAll('nav button').forEach(b => (b.onclick = () => nav(b.dataset.v)));

loadContent().then(() => nav('today')).catch(e => {
  $('#main').innerHTML = `<p class="bad">Could not load course content: ${esc(e.message)}</p>`;
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
