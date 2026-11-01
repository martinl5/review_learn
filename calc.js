// Tiny expression evaluator for numeric answers: + - * / ^ ( ), sqrt exp ln log, pi e.
// No eval/Function. Returns NaN on anything it can't parse.
const FN = { sqrt: Math.sqrt, exp: Math.exp, ln: Math.log, log: Math.log10 };
const CONST = { pi: Math.PI, e: Math.E };

export function calc(src) {
  const s = String(src).toLowerCase().replace(/\*\*/g, '^').replace(/×/g, '*').replace(/÷/g, '/')
    .replace(/[−–]/g, '-').replace(/,/g, '').replace(/\s+/g, '');
  let i = 0;
  const peek = () => s[i];
  const fail = () => { throw 0; };
  const expr = () => {
    let v = term();
    while (peek() === '+' || peek() === '-') v = s[i++] === '+' ? v + term() : v - term();
    return v;
  };
  const term = () => {
    let v = unary();
    while (peek() === '*' || peek() === '/') v = s[i++] === '*' ? v * unary() : v / unary();
    return v;
  };
  const unary = () => (peek() === '-' ? (i++, -unary()) : peek() === '+' ? (i++, unary()) : power());
  const power = () => { const b = atom(); return peek() === '^' ? (i++, b ** unary()) : b; }; // right-assoc, -2^2 = -4
  const atom = () => {
    const m = s.slice(i).match(/^(\d+\.?\d*(e[+-]?\d+)?|\.\d+(e[+-]?\d+)?|[a-z]+)/);
    if (peek() === '(') { i++; const v = expr(); if (s[i++] !== ')') fail(); return v; }
    if (!m) fail();
    i += m[0].length;
    if (m[0] in FN) { if (s[i++] !== '(') fail(); const v = expr(); if (s[i++] !== ')') fail(); return FN[m[0]](v); }
    if (m[0] in CONST) return CONST[m[0]];
    const n = Number(m[0]);
    return Number.isNaN(n) ? fail() : n;
  };
  try { const v = expr(); return i === s.length && s ? v : NaN; } catch { return NaN; }
}
