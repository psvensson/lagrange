> Method kernel — portable. Keep the mechanism; this file is domain-neutral.

# Quest Store Schema

## Document Role

The **Quest store** lives at `solve/` (created on first `solve new`). A Quest is the bounded unit of non-trivial
work: one sealed goal, an append-only event log of measured attempts, durable
findings, and a terminal report. This file documents the shape of a Quest draft
and the lifecycle commands that drive it.

The store ships **empty** — only this schema and a `.gitkeep`. A new project
authors its own Quests; no quest data is carried over from the origin project.

## Store Layout

The Solver engine under [`../tooling/solve/`](../tooling/solve/) reads and writes
a small set of sibling directories rooted at the data dir (`solve/` by default;
see `SOLVE_DATA_DIR` in `../tooling/solve/constants.js`):

| Path | Contents | Tracked? |
| --- | --- | --- |
| `quests/<id>.json` | The sealed Quest draft. | Yes — authored input |
| `log/<id>.ndjson` | Append-only event log: attempts, findings, theories, parks, terminal state. | Yes — durable source of truth |
| `report/<id>.*` | Generated terminal/in-progress report projection. | Yes — explains committed work |
| `state/<id>.json` | Projected state: a pure fold over the log. | No — regenerable cache |

The log is the source of truth. State is a fold over the log and may be deleted
and rebuilt at any time, which keeps the Solver crash-safe and auditable. Never
treat `state/` as durable memory.

A quest id becomes a filename, so it must be a single safe path segment: letters,
digits, `.`, `_`, `-`, with no path separators and no `..` (enforced by
`assertSafeQuestId` in `../tooling/solve/store.js`).

## Quest Draft Fields

A draft is authored with:

```sh
node tooling/solve.js new --id <id> --statement "<sealed result>"
```

The generated `quests/<id>.json` carries these fields (see `questTemplate` in
[`../tooling/solve.js`](../tooling/solve.js)):

| Field | Meaning |
| --- | --- |
| `id` | Stable quest id; also the store filename. |
| `statement` | One-line description of the terminal success condition. |
| `priority` | Scheduling priority among quests (lower number = higher priority). |
| `class` | `"product"` (default) or `"process"`. A product goal must be MEASURED against a real artifact probe; a process goal is a scaffolding/decision record and may legitimately close on a hand-authored oracle. This drives report closure-strength labeling and the audit closure-mismatch warning. |
| `doneWhen` | The binary, artifact-bound success predicate. **Sealed** once declared. It is a `{probe, args}` pair — e.g. a `scenario-harness` probe requiring N `consecutive` clean runs on a metric. Only `doneWhen` can close the Quest. |
| `frontiers[]` | Independent attack surfaces. Each frontier has its own `id`, `priority`, and a lower-is-better `metric` (`{probe, args}`) that is the progress gradient. The scheduler picks among open frontiers. |
| `constraints[]` | Optional hard limits the work must preserve, each an `{id, statement}` pair (e.g. "spawn a subagent verifier before audit and handoff"). |

Keep `metric` and `doneWhen` separate. A metric is a gradient the strategy ladder
steers on; only `doneWhen` can declare victory. Do not invent fields beyond these
— the engine reads exactly this shape.

## Sealed Goalposts

`doneWhen` is sealed once declared. Do not move goalposts in place: if the goal is
wrong, record a finding explaining why and author a new Quest with the corrected
`doneWhen`. A frontier metric may be *sharpened* to a stricter gradient
refinement (see the engine's gradient-refinement guard) without tripping the
goalpost seal, but the closure predicate itself never changes mid-Quest.

## Lifecycle Commands

| Command | Effect |
| --- | --- |
| `node tooling/solve.js new --id <id> --statement "..."` | Scaffold a Quest draft into the store. Edit it to seal `doneWhen`, frontiers, and constraints. |
| `node tooling/solve.js step --id <id> --changeRef diff:<path> --summary "..."` | One supervised attempt: measure, validate honesty, update the strategy ladder, append the event. |
| `node tooling/solve.js run --id <id>` | Drive the autonomous Quest loop to a terminal or a recoverable gate. |
| `node tooling/solve.js status --id <id>` | Print projected state — frontiers, rungs, metrics, current blocker. |
| `node tooling/solve.js report --id <id>` | The closure projection: a pure read of the log and derived state. |

`changeRef` is an evidence pointer for one attempt and must resolve to a patch
artifact (`diff:<path>`). A commit SHA is not Solver truth — it says where code
landed, not which measured attempt moved the metric.

## Terminal States

Only two outcomes close a Quest; every other stop is a recoverable gate that
leaves the Quest open and resumable:

- **SOLVED** (terminal): `doneWhen` is satisfied against live evidence. Reports
  label it `SOLVED (MEASURED)` or `SOLVED (DECISION)` per the closure-strength
  provenance.
- **EXHAUSTED** (terminal): every frontier is parked and no honest remaining move
  exists. A park is `exhausted` if it had at least one honestly-measured sample,
  or `cannot_measure` if every sample failed to measure (fix the harness, then
  reopen) — the two are kept distinct so a broken measurement apparatus never
  masquerades as solution-space exhaustion.

Non-terminal stops (`MAX_CYCLES`, `THEORY_REQUIRED`, `BLOCKED`) are recoverable
gates: they record an actionable next move and never close the Quest.
