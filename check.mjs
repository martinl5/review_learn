// Self-check: content integrity, recomputed numeric answers, SRS logic.
// Run: node check.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { grade, isDue, BOXES, MAINTENANCE_DAYS, DAY, MISS, PARTLY, RIGHT } from './srs.js';

// ---- content ----
const weeks = Array.from({ length: 13 }, (_, i) =>
  JSON.parse(readFileSync(new URL(`data/w${String(i + 1).padStart(2, '0')}.json`, import.meta.url))));
const units = new Map(), cards = new Map();
for (const [i, w] of weeks.entries()) {
  assert.equal(w.week, i + 1, `week number in w${i + 1}`);
  for (const k of ['title', 'objectives', 'exercise']) assert.ok(w[k], `W${w.week} missing ${k}`);
  for (const u of w.units) {
    assert.match(u.id, new RegExp(`^W${w.week}-[AB]\\d$`), `unit id ${u.id}`);
    assert.equal(u.track, u.id.split('-')[1][0], `track of ${u.id}`);
    assert.ok(!units.has(u.id), `duplicate unit ${u.id}`);
    units.set(u.id, { ...u, n: 0 });
  }
  for (const c of w.cards) {
    assert.ok(!cards.has(c.id), `duplicate card ${c.id}`);
    assert.ok(units.has(c.unit), `${c.id}: unknown unit ${c.unit}`);
    assert.ok(c.id.startsWith(c.unit + '-'), `${c.id} not under ${c.unit}`);
    assert.ok(c.q, `${c.id}: no question`);
    if (c.type === 'mcq') {
      assert.ok(c.choices?.length >= 2 && Number.isInteger(c.answer) && c.answer >= 0 && c.answer < c.choices.length, `${c.id}: bad mcq`);
      assert.equal(new Set(c.choices).size, c.choices.length, `${c.id}: duplicate choices`);
    } else if (c.type === 'numeric') {
      assert.ok(Number.isFinite(c.answer) && c.tol >= 0, `${c.id}: bad numeric`);
    } else if (c.type === 'order') {
      assert.ok(c.items?.length >= 3 && new Set(c.items).size === c.items.length, `${c.id}: bad order`);
    } else if (c.type === 'text') {
      assert.ok(c.answer && Array.isArray(c.rubric) && c.rubric.length, `${c.id}: text needs answer + rubric`);
    } else assert.fail(`${c.id}: unknown type ${c.type}`);
    cards.set(c.id, c);
    units.get(c.unit).n++;
  }
}
assert.equal(units.size, 96, 'unit count');
for (const [id, u] of units) assert.ok(u.n >= 4, `${id} has only ${u.n} cards`);

// ---- recompute numeric answers ----
const Phi = z => { // standard normal CDF (Abramowitz–Stegun 7.1.26 via erf)
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
  return 0.5 * (1 + Math.sign(z) * erf);
};
const prod = (n, f) => Array.from({ length: n }, (_, k) => f(k)).reduce((a, b) => a * b, 1);
const expected = {
  'W1-A1-1': 100 * 0.99 * 0.01 / (0.99 * 0.01 + 0.05 * 0.99),
  'W1-A1-4': 1 / 3,
  'W1-A2-3': 1 / 0.2,
  'W1-A2-4': Math.exp(-2),
  'W1-A3-3': 100 * (2 * Phi(1.96) - 1),
  'W1-A4-3': 6 * [1, 2, 3, 4, 5, 6].reduce((s, k) => s + 1 / k, 0),
  'W1-A4-4': 100 * (1 - prod(23, k => (365 - k) / 365)),
  'W2-A1-5': 2 * (1 - Phi(2.5)),
  'W2-A2-3': 2 * 0.09 * (1.959964 + 0.841621) ** 2 / 0.01 ** 2,
  'W2-A3-2': 100 * (1 - 0.95 ** 20),
  'W2-B1-4': 0.25,
  'W3-B4-3': 2 * 32 * 8 * 128 * 2 / 1024,
  'W4-A2-2': 1 + 99 * 0.05,
  'W4-A3-2': (() => { const a = 821588, b = 815482, e = (a + b) / 2; return ((a - e) ** 2 + (b - e) ** 2) / e; })(),
  'W4-B1-4': Math.exp(2.3026),
  'W5-A1-1': 100 * 0.7 ** 2,
  'W5-A1-6': 100 * (1 - 0.7 ** 2),
  'W5-A1-5': 1 - 0.7 ** 2,
  'W6-B1-3': 1 / Math.SQRT2,
  'W8-A2-1': Math.exp(0.7),
  'W8-A4-3': 2 * 0.25 * 0.5 / 0.75,
  'W8-B2-1': 2 * 4096 * 16,
  'W12-A1-2': 100 - 45 ** 2 / 60,
  'W12-A1-3': 1 - 0.6 ** 2,
  'W13-A2-2': 100 * (1 - 0.8 ** 2),
};
for (const [id, v] of Object.entries(expected)) {
  const c = cards.get(id);
  assert.ok(c, `missing card ${id}`);
  assert.ok(Math.abs(c.answer - v) <= c.tol, `${id}: stored ${c.answer} ± ${c.tol}, computed ${v}`);
}
// SRM p-value claim (p < 1/500k): chi-square 1 df upper tail = 2(1 − Φ(√χ²)).
assert.ok(2 * (1 - Phi(Math.sqrt(expected['W4-A3-2']))) < 1 / 500000, 'SRM p-value claim');

// ---- SRS ----
const t0 = 0;
let s = grade(undefined, RIGHT, t0);
assert.deepEqual([s.box, s.streak, s.seen, s.right, s.mastered], [1, 1, 1, 1, false]);
assert.equal(s.due, t0 + BOXES[1] * DAY);
s = grade(s, RIGHT, t0); s = grade(s, RIGHT, t0);
assert.equal(s.box, 3); assert.ok(s.mastered, 'mastered after 3 straight correct');
assert.equal(s.due, t0 + MAINTENANCE_DAYS * DAY);
s = grade(s, MISS, t0);
assert.deepEqual([s.box, s.streak, s.mastered], [0, 0, false]);
assert.equal(s.due, t0 + BOXES[0] * DAY);
s = grade(s, PARTLY, t0);
assert.deepEqual([s.box, s.streak, s.right], [0, 0, 3.5]);
for (let k = 0; k < 10; k++) s = grade(s, RIGHT, t0);
assert.equal(s.box, BOXES.length - 1, 'box capped');
assert.ok(isDue({ due: 5 }, 5) && !isDue({ due: 6 }, 5) && !isDue(undefined, 5));

const byType = [...cards.values()].reduce((m, c) => ((m[c.type] = (m[c.type] || 0) + 1), m), {});
console.log(`OK: ${weeks.length} weeks, ${units.size} units, ${cards.size} cards`, byType);
