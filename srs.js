// Leitner spaced repetition. Shared by app.js and check.mjs.
export const BOXES = [1, 3, 7, 16, 35]; // review interval in days per box
export const MAINTENANCE_DAYS = 60;      // interval once a card is mastered
export const DAY = 864e5;
export const MISS = 0, PARTLY = 1, RIGHT = 2;

// st: previous card state (undefined for a new card); g: MISS | PARTLY | RIGHT.
export function grade(st, g, now = Date.now()) {
  const p = st || { box: 0, streak: 0, right: 0, seen: 0 };
  const s = { ...p, seen: p.seen + 1, last: g };
  if (g === RIGHT) {
    s.box = Math.min(p.box + 1, BOXES.length - 1);
    s.streak = p.streak + 1;
    s.right = p.right + 1;
  } else if (g === PARTLY) {
    s.streak = 0;
    s.right = p.right + 0.5;
  } else {
    s.box = 0;
    s.streak = 0;
  }
  // "3 consecutive correct answers at expanding intervals": box >= 2 means the
  // streak spanned at least two growing gaps.
  s.mastered = s.streak >= 3 && s.box >= 2;
  s.due = now + (s.mastered ? MAINTENANCE_DAYS : BOXES[s.box]) * DAY;
  return s;
}

export const isDue = (st, now = Date.now()) => !!st && st.due <= now;
export const accuracy = st => (st && st.seen ? st.right / st.seen : 0);
