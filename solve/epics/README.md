# Epics — the lightweight planning tier above specs

An **epic** is a one-page place to think out loud about a roadmap row *before* it is
sharp enough to become a spec with a sealed `doneWhen`. It is deliberately
schema-light and tool-free: just a markdown file from `_template.md`.

## Where it sits

```
roadmap row            (roadmap.md — aspirational sequence)
   ↓  discuss intent / options / open questions HERE
EPIC  (solve/epics/<id>.md)        ← this tier
   ↓  graduate when intent is sharp enough for a sealed doneWhen
SPEC  (solve/specs/<name>/...)     (design + requirements + tasks)
   ↓
QUEST (solve/quests/<id>.json)     (the only MEASURED layer)
```

Specs are heavy (design + requirements + tasks). Quests are sealed and
execution-grade. The epic tier fills the gap: a versioned home for half-formed
planning so that discussion lives in a file under git, not in chat context.

## Lifecycle

`status` in the front-matter moves through:

- `discussing` — capturing intent, options, and open questions.
- `sharpening` — converging on one approach; doneWhen is becoming expressible.
- `graduated` — a spec (and/or quests) now exists; set `graduatesTo`. The epic
  stays as the rationale record.
- `dropped` — decided not to pursue; keep the file as a decision record.

## Conventions

- `roadmapRow` in an epic's front-matter matches the `links.roadmapRow` field on
  quests (see `solve/quests/*.json`). That shared key lets
  `node scripts/solve.js trace --row <id>` join roadmap → epic → quest once quests
  carry the link. No tooling enforces this in v1; it is a convention.
- One epic per roadmap row (or per cohesive theme). Keep it to roughly one screen;
  if it grows past that, it is ready to graduate to a spec.
- Epics are NOT a closure surface. Measured truth lives in quests and the
  closure-ledger; an epic only records intent and the decision trail.

Start every new roadmap row here. Copy `_template.md` and fill it in.
