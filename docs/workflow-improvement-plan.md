# Workflow Improvement Plan — Linking Planning Layers & Closing the Memory Loop

Status: VERIFIED (subagent-checked 2026-06-17; corrections applied inline)
Date: 2026-06-17
Theme: add thin linking fields + generated indices, not new ceremony. Make
existing artifacts point at each other so durable memory replaces chat context.

This plan implements five items. Each item is independently shippable and ordered
by dependency. All changes are additive; no existing quest, report, or pack
breaks. Recommended tracking: one **process-class** Quest
(`workflow-linking-and-memory-loop`) with an oracle `doneWhen`, since the work is
decision/structure rather than a measured convergence metric.

---

## Integration map (verified entry points)

| Concern | File | Anchor |
| --- | --- | --- |
| Command dispatch | `scripts/solve.js` | `COMMANDS` object map (~L524–545); `main()` (~L547–579) |
| Quest template | `scripts/solve.js` | `questTemplate()` (~L83–116); `cmdNew()` (~L118–129) |
| Quest I/O + ID guard | `scripts/solve/store.js` | `loadQuest`/`saveQuest`; `assertSafeQuestId()` (~L50–58); `appendFinding()` (~L404–414) |
| Report projection | `scripts/solve/report.js` | `buildReport()` (~L126–180); `findingLines()` (~L43–53); `reportFilePath()` (~L28–31) |
| Frontier view (REUSE) | `scripts/solve/frontier.js` | `buildFrontier()` (~L59–68); `renderFrontier()` (~L70–79); `runFrontierCommand()` (~L82–84) |
| Closure-ledger parse + generated sibling | `scripts/closure-ledger-state.js` | `parseRecords()` (~L98–100); writes `closure-ledger.generated.md` |
| Steering pack config | `.kiro/steering/llm-pack.config.json` | `sources[]` (~L10–110), entry = `{file, domain, priority}` |
| Steering pack generator | `scripts/generate-steering-llm-pack.js` | source loop (~L1189–1198) — literal paths, **no glob today** |

There is currently **no** inter-quest / quest→spec / quest→CL reference field, and
the frontier renderer only writes to stdout. Both are greenfield.

---

## Item 1 — Quest `links` field + `solve.js trace` (foundational)

**Goal.** Make a Quest declare what it serves, so the five planning layers become a
navigable graph. Declarative only — no enforcement in v1.

**Schema (additive).** Add to `questTemplate()` in `scripts/solve.js`:

```js
links: {
  roadmapRow: null,      // e.g. "0.1a-item-3" or null
  specRef: null,         // e.g. "membership-lifecycle-placement-hard-cutover#task-7"
  closesCL: [],          // e.g. ["CL-039","CL-001"]
  parentQuest: null,     // e.g. "rolling-restart-core-stability" or null
}
```

Existing quests omit `links`; all readers must treat it as optional
(`quest.links ?? {}`). No event-log changes — `links` lives in the sealed quest
file, not the log.

**Changes.**
1. `scripts/solve.js` `questTemplate()` — add the `links` block with null/empty
   defaults.
2. `scripts/solve/report.js` `buildReport()` — after the `## Findings` section, add
   `## Links` rendering `roadmapRow`, `specRef`, `closesCL[]`, `parentQuest` (skip
   the section entirely when `links` is absent/empty, so old reports are unchanged).
3. New `cmdTrace(root, args)` in `scripts/solve.js` + `COMMANDS['trace']`:
   - `node scripts/solve.js trace --row <id>` → list quests whose
     `links.roadmapRow === id`, with each quest's class/outcome/open-or-closed
     (reuse the portfolio projection in `scripts/solve/portfolio.js`).
   - `--cl <CL-###>` → quests with the CL in `links.closesCL`.
   - `--spec <ref>` → quests matching `links.specRef` prefix.
   - `--quest <id>` → reverse view: this quest's links + children
     (`parentQuest === id`).
   - Implementation: **export `listQuestIds(root)`** from
     `scripts/solve/portfolio.js:34` (currently module-local) or add a shared
     `loadAllQuests(root)` helper. `buildPortfolio()` does **not** carry `links`
     (it only projects class/outcome/attempts), so `trace` must `loadQuest(root,id)`
     each quest to read its `links` block. Use `buildPortfolio().rows` for the id
     list + class/outcome, then `loadQuest` for `links`. No new storage.

**Acceptance.**
- `node scripts/solve.js new --id tmp-link-test` produces a quest JSON containing an
  empty `links` block; `node scripts/solve.js report --id tmp-link-test` runs clean.
- Hand-add `links.closesCL:["CL-039"]` to an existing quest →
  `node scripts/solve.js trace --cl CL-039` lists it.
- All existing `solve.js report` / `status` / `portfolio` invocations still pass
  (no reader assumes `links` exists). Run the solver unit/integration tests.

**Risk.** Low. Pure additive read path. Main risk is a reader that spreads the whole
quest object into a strict schema — grep for any ajv/zod validation of quest shape
(verifier confirmed none today; re-check before merge).

---

## Item 2 — Generated `solve/FRONTIER.md` (reuse existing frontier command)

**Goal.** A durable, regenerable board of all open Quests + their binding CL + last
metric + next honest move, read once at session start instead of reconstructing
state from chat handoff notes.

**Key finding.** `scripts/solve/frontier.js` already fuses closure-ledger + quest
portfolio and renders markdown to stdout. We only need to (a) persist it and (b)
enrich rows with `links` + last-metric.

**Changes.**
1. `scripts/solve/frontier.js`:
   - Add `writeFrontier(root, markdown)` that writes `solve/FRONTIER.generated.md`
     (mirror the `closure-ledger.generated.md` convention — the `.generated.`
     infix signals "do not hand-edit").
   - Enrich `buildFrontier()` rows with: quest `links.closesCL`, the latest metric
     value from the event log (reuse the projection that `status`/`report` already
     compute), and the current frontier/blocker label.
2. `scripts/solve.js` `cmdFrontier()` (`solve.js:516`) — change signature to
   `cmdFrontier(root, args)` (`main()` already dispatches `handler(root, args)`) and
   add a `--write` flag that calls `writeFrontier()` in addition to stdout (default
   stays stdout-only, so no behavior change for existing callers).
3. `package.json` — add `"frontier:write": "node scripts/solve.js frontier --write"`
   for discoverability.

**Determinism (verified).** `buildFrontier()`/`renderFrontier()` embed **no**
wall-clock time — no `new Date()`/`Date.now()` in the chain; `latestGate` comes from
record gate-timestamps (deterministic content). The generated file is byte-stable as
long as new code keeps it that way. **Note:** unlike what an earlier draft implied,
`closure-ledger.generated.md` is **not** CI-gated — `npm run audit:closure-ledger`
runs `--check-state` (STATE-block drift), not the generated-file freshness `--check`.
So a `git diff --quiet solve/FRONTIER.generated.md` drift gate would be **net-new**,
not parity with an existing gate. Defer that gate; ship the `--write` flag first.

**Acceptance.**
- `node scripts/solve.js frontier --write` creates `solve/FRONTIER.generated.md`
  listing the 3 open quests (rolling-restart-core-stability,
  membership-publication-drain-determinism, non-docker-validation-green) with their
  binding CL and last metric.
- Re-running with no state change produces a byte-identical file (the current
  renderer is already wall-clock-free — keep it that way in the enrichment).

**Risk.** Low. The renderer is verified deterministic today; the only hazard is the
enrichment introducing a timestamp. Reuses an existing, tested renderer.

---

## Item 3 — Lightweight epic/planning tier above specs

**Goal.** A one-page place to discuss intent/options/open-questions *before* a spec's
sealed `doneWhen` exists — so half-formed planning lives in a versioned doc, not
chat context.

**Decision: don't add tooling.** This is a convention + template, intentionally
schema-light to stay LLM-cheap.

**Changes.**
1. New dir `.kiro/epics/` with `README.md` describing the tier (one level above
   `.kiro/specs/`; an epic graduates to a spec when intent is sharp enough for a
   sealed doneWhen).
2. `.kiro/epics/_template.md` with fixed front-matter:
   ```
   ---
   id: <kebab>
   roadmapRow: <id|null>
   status: discussing | sharpening | graduated | dropped
   graduatesTo: <spec-name|null>
   ---
   # <title>
   ## Intent (why now)
   ## Options under discussion
   ## Open questions
   ## Decision log (dated bullets)
   ```
3. Cross-link: an epic's `roadmapRow` matches Item 1's `links.roadmapRow`, so
   `trace --row` can later join roadmap → epic → quest. Document this in the README;
   no code in v1.
4. `AGENTS.md` "Where Do I Look?" table — add one row pointing at `.kiro/epics/`.
   Regenerate packs (Item 4's pipeline) so steering reflects the new tier.

**Acceptance.** Authoring `.kiro/epics/<x>.md` from the template requires no tool and
no regeneration to be useful; the AGENTS.md row points to it.

**Risk.** Minimal (docs only). Risk is disuse — mitigated by making it the first step
the next roadmap row goes through.

---

## Item 4 — `promote-finding`: close the findings→steering loop

**Goal.** Turn a Quest finding into a versioned source-steering file in one command,
so durable rules come from execution evidence instead of silent external memory.

**Generator constraints (verified — these drive the design).** The pack generator
**ignores** front-matter `domain` and `strength`:
- `parseMarkdownCandidates` sets every candidate's `domain` from the **config
  entry's** `domain` (`generate-steering-llm-pack.js:544,614`), never from the file.
  So one glob entry forces ALL findings into ONE domain — mixed-domain findings under
  a single `findings/**/*.md` entry is **impossible** today.
- `inferStrength` derives strength from the rule **text** keywords
  (MUST/SHOULD/MAY/NEVER, `:242`); a finding body without a normative keyword is
  dropped to `info` (`:395-397`). The template's `strength:` field is decorative.
- There is **no** glob dependency in the repo and no `glob`/`fast-glob`/`globby`
  require anywhere; the source loop reads literal paths (`:1190`).

Consequence: the **per-file config-entry approach is the primary path**, not a
fallback. The glob approach is dead-on-arrival without a generator rewrite that adds
front-matter parsing — out of scope for v1.

**Changes.**
1. New `.kiro/steering/findings/` source dir + `_template.md`:
   ```
   ---
   source: quest:<id>#<frontier>
   ---
   <one NORMATIVE sentence — MUST contain MUST / MUST NOT / SHOULD / NEVER so the
   generator's inferStrength lifts it as a rule, not info. domain is set by the
   config entry promote-finding appends, NOT here.>
   ```
2. New `cmdPromoteFinding(root, args)` + `COMMANDS['promote-finding']` in
   `scripts/solve.js`:
   - Addressing (CORRECTED): `node scripts/solve.js promote-finding --id <quest>
     --frontier <f> [--match <substr> | --ts <iso>] --domain <architecture|testing|
     governance|style>`. Findings have **no key/id field** — `readFindings(root,
     questId, frontierId)` (`store.js:417`) requires a `frontier` and returns
     `{claim, evidence, rulesOut, ts}`. Disambiguate multiple findings on one
     frontier by `--match` (claim substring) or `--ts`. `--domain` is required
     because the generator can't infer it from the file.
   - Writes `.kiro/steering/findings/<date>-<quest>-<slug>.md` from the template,
     using the finding's `claim` as the body and `source: quest:<id>#<frontier>`.
     If the claim isn't already normative, the command warns the author to edit it
     into a MUST/SHOULD sentence before regenerating.
   - **Appends a `sources[]` entry** to `.kiro/steering/llm-pack.config.json`:
     `{file: "findings/<date>-<quest>-<slug>.md", domain: <--domain>, priority:
     100}` — this is how per-file domain is carried (the only working path).
   - Prints a reminder to run `npm run steering:llm:pack && npm run steering:check`
     (do NOT auto-regenerate inside the command — keep the human-decides gate).
3. Keep the conservative gate: promotion is an explicit human act; the command only
   stages the source file + config entry. Regeneration + commit is a separate,
   reviewed step.

**Acceptance.**
- `promote-finding --id <q> --frontier <f> --domain governance` on an existing
  logged finding creates a well-formed file under `.kiro/steering/findings/` AND
  appends a matching `sources[]` entry to `llm-pack.config.json`.
- After `npm run steering:llm:pack`, the rule is in `rules.json` and queryable via
  `npm run rule -- --id <id>` with a source citation back to the findings file
  (confirm it's NOT classified `info` — i.e. the body was normative). It surfaces in
  the *compact* domain pack only if its score clears the domain's `maxRules` cap
  (priority-100 findings may stay query-only in a crowded domain — raise priority to
  force compact-pack inclusion). `npm run steering:check` is green after commit.

**Risk.** Low–medium — but NOT for the reason an earlier draft assumed. No generator
change is needed (per-file config entries avoid it entirely). The real hazard is
authoring: a promoted finding whose body isn't a normative sentence silently lands as
`info` and never becomes a rule. Mitigate with the command's normative-sentence warning.

---

## Item 5 — Define the MEMORY-A / MEMORY-B boundary; kill the duplication

**Goal.** Stop the same operational truth living in three places and drifting.

**Findings to act on.**
- The six "Operational Ground Truth" traps are duplicated between `AGENTS.md` and the
  external auto-memory (`~/.claude/.../MEMORY.md`).
- In-repo packs were last regenerated 2026-06-09 (≈8 days stale vs. recent source
  edits / DT6 work).

**Changes.**
1. Write `.kiro/steering/memory-boundary.md` (source steering) stating roles:
   - **In-repo steering** = durable, shared, CI-gated *rules* (executable guardrails).
   - **External auto-memory** = transient, single-user *narrative + current frontier*
     (handoffs, live blocker state).
   - Rule: anything that should bind future work for everyone belongs in-repo via
     Item 4; anything session/narrative stays external.
2. De-duplicate the six traps: keep the canonical copy in source steering (so it
   flows into the packs), and have `AGENTS.md`'s "Operational Ground Truth" section
   either (a) shrink to a pointer at the pack section, or (b) be generated from the
   same source. Pick (a) for v1 to avoid generator coupling.
3. Regenerate: `npm run steering:llm:pack` to clear the 8-day staleness; confirm
   `npm run steering:check` is green (catches any drift between source and packs).
4. Add a pre-commit hook running `npm run steering:check` when `.kiro/steering/**`
   changes, so packs can't silently lag source again. **Verified: there is NO
   existing hook** — `.husky/` is empty, `.git/hooks/` has only samples, no
   husky/lefthook/simple-git-hooks dep, and `steering:check` is **not** in
   `test:static`. So packs are currently un-gated (consistent with the 8-day
   staleness). Any hook here is net-new; pick husky or a simple `.git/hooks`
   script, or add `steering:check` to `test:static` for a CI-only gate.

**Acceptance.**
- Each of the six traps has exactly one canonical home; AGENTS.md points rather than
  restates.
- `npm run steering:check` green; packs no longer stale.
- Editing a source steering file without regenerating fails the check/hook.

**Risk.** Low. Mostly doc consolidation + a regeneration. Hook addition is optional
and reversible.

---

## Sequencing & rollout

1. **Item 1** (links + trace) — foundational; everything else can reference it.
2. **Item 2** (FRONTIER.generated.md) — consumes Item 1's `links`; high daily value.
3. **Item 4** (promote-finding) — closes the memory loop; touches the generator.
4. **Item 3** (epics tier) — docs/convention; can land anytime, pairs with Item 1's
   `roadmapRow`.
5. **Item 5** (memory boundary + dedup) — consolidation + regeneration; do last so it
   captures Items 3–4's new surfaces in one pack regen.

Each item: one commit, scope-safe, with the acceptance checks above run before
handoff. Items 1–2 are pure tooling and reversible; Items 3–5 are docs/config with
**no generator change** (Item 4 uses per-file config entries, avoiding the generator
entirely). Land the `listQuestIds`/`loadAllQuests` export in Item 1 so Item 2's
row-enrichment reuses it rather than re-reading the quests dir.

## Explicitly out of scope (v1)

- Enforcement/validation of `links` (start declarative; let usage prove the shape).
- A roadmap-audit CI gate ("✅ row with open quest") — nothing to audit until `links`
  is populated across quests.
- Merging MEMORY-A and MEMORY-B — they serve different cognitive jobs; keep separate.
- Auto-regenerating packs inside `promote-finding` — preserve the human-decides gate.
- Glob support / front-matter parsing in the steering generator — Item 4 uses
  per-file config entries instead; revisit only if findings volume makes explicit
  entries unwieldy.
