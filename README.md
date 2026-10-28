# DS Two-Track

This is an offline-first microlearning PWA for a 13-week, two-track data science curriculum:
- **Track A** covers the interview core: probability, inference, SQL, A/B testing, causal inference, product sense, ML theory and ML system design.
- **Track B** covers LLM and modern skills: data tooling, transformers, RAG, evals, fine-tuning, agents, MCP and MLOps.

## Contents

- 96 units (`W{week}-{track}{n}`) with 484 cards. Every quiz item in the curriculum is included, plus about 4 extra cards per unit.
- Card types:
  - multiple choice ("spot the bug" items are MCQ);
  - numeric with a tolerance;
  - ordering (tap the steps in order);
  - free text, which you self-grade against a rubric (Missed / Partly / Got it).
- **Today** builds each day's session: due reviews first, then the next 4 units, alternating Track A and Track B. On Day 7 it suggests a week review, and it shows the weekend build with a done checkbox.
- **Checkpoints**:
  - Week 4: 30 cards from Weeks 1–4.
  - Week 8: 40 cards from Weeks 1–8, weighted toward Weeks 5–8.
  - Week 12: your 50 weakest cards.
  
  Any unit that scores under 80% is re-queued.
- **Spaced repetition** uses Leitner boxes with intervals of 1, 3, 7, 16 and 35 days. A card is *mastered* after 3 consecutive correct answers at expanding intervals. Mastered cards move to a 60-day maintenance cycle.
- **Stats** shows your streak, mastered count, accuracy by track and by week, and your 5 weakest units.

Progress is stored only in your browser's `localStorage`. Nothing is sent anywhere. Use **Stats → Export progress** to back up, or to move to another device with **Import**.

## Run locally

```bash
python3 -m http.server 8000
```

Open http://localhost:8000. The page has to be served over HTTP rather than opened as a `file://` path, because it uses ES modules and a service worker.

## Put it on your phone (GitHub Pages)

1. In the repo, go to **Settings → Pages → Build and deployment**. Set Source to *Deploy from a branch*, then pick the branch and `/ (root)`.
2. Open the Pages URL on your phone.
3. On iOS, tap Share → *Add to Home Screen*. On Android, open the ⋮ menu → *Install app*.

After the first load, the app works offline.

## Add or edit cards

The cards live in `data/wNN.json`. Each card looks like one of these:

```json
{ "id": "W5-A1-7", "unit": "W5-A1", "type": "mcq", "q": "…", "choices": ["right", "wrong"], "answer": 0, "explain": "…" }
{ "id": "W5-A1-8", "unit": "W5-A1", "type": "numeric", "q": "…", "answer": 0.51, "tol": 0.01 }
{ "id": "W5-A1-9", "unit": "W5-A1", "type": "order", "q": "…", "items": ["first", "second", "third"] }
{ "id": "W5-A1-10", "unit": "W5-A1", "type": "text", "q": "…", "answer": "model answer", "rubric": ["point 1", "point 2"] }
```

- MCQ choices are shuffled when shown, so `answer` is the index in the file.
- Order `items` are listed in the correct order.

Then run the self-check. It validates the content, recomputes the numeric answers and tests the SRS logic:

```bash
node check.mjs
```

If you edit files after installing, bump `VERSION` in `sw.js`. The service worker is network-first, so online visits pick up changes anyway.

## Files

| File | Purpose |
|---|---|
| `index.html`, `style.css` | App shell and mobile-first styles (light and dark) |
| `app.js` | Views, session builder, quiz runner, checkpoints, storage |
| `srs.js` | Spaced-repetition scheduling, shared with `check.mjs` |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Offline caching and home-screen install |
| `data/w01.json` … `w13.json` | Curriculum content |
| `check.mjs` | Content and logic self-check |
