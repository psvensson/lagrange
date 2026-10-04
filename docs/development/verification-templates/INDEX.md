# Verification Templates

Attack-surface checklists for adversarial verification subagents (and human
reviewers). When a change touches one of these categories, the verification
prompt MUST include that template's checklist — filled in with the change's
specifics — so review quality does not depend on the prompt author
remembering each classic failure mode.

Every checklist item cites the closure record or quest finding that put it on
the list. Every item demands an EVIDENCE PATH (file:line, log line, test
name), never a yes/no. **Anti-theater rule:** if a template item "passes"
review and the same defect class still ships twice, the item is either
promoted to a machine check (guideline audit / guard test) or deleted — a
checklist entry that catches nothing is noise.

| Change category | Template |
| --- | --- |
| Admission / gating / hold predicates | [admission-gating.md](admission-gating.md) |
| Retry / re-drive / follow-up loops | [retry-loops.md](retry-loops.md) |
| Transport / delivery / wake semantics | [transport-delivery.md](transport-delivery.md) |
| Sweep / timer / periodic enforcement | [sweep-timer.md](sweep-timer.md) |
| Recovery / replay / reconciliation | [recovery-replay.md](recovery-replay.md) |
| Concurrency / locking / single-flight | [concurrency-serialization.md](concurrency-serialization.md) |
| Formation-vs-steady-state circularity | [formation-circularity.md](formation-circularity.md) |
| Test-harness / fixture fidelity | [harness-fidelity.md](harness-fidelity.md) |
| Registered cross-owner / coupled interaction | [owner-interaction.md](owner-interaction.md) |
| Guard/contract modules validating hostile input | [adversarial-js-intrinsics.md](adversarial-js-intrinsics.md) |

Usage in a verification prompt: paste the relevant checklist, replace each
placeholder with the change's specifics, and require the verifier to return
a verdict per item with an evidence path. For a cross-category diff, include the
union of every matching template in the verifier's initial prompt and deduplicate
overlapping questions. Do not include unrelated templates merely to make the
checklist longer, and do not defer an already-applicable template until after the
first verdict.

## The verification record (enforced by `land`)

An approval of a quest whose change set touches `src/` is an approval only
with a record: `note --verification "<summary>" --verifier subagent:<id>
--verdict approve --evidence <record.json>` embeds the JSON in the log entry,
and `land` refuses, naming what is missing, until it holds. A quest touching
no `src/` path needs no record; a rejection needs none. The template ids are
the front-matter `categories` of the files here; the table above only links
them. A template's `evidence: [...]` names fields its entry must carry, and its
`trigger:` pattern, matched against the `src/` lines the change adds, makes
it required.

```json
{"templates": [{"id": "<category>", "whatChanged": "<when the template demands it>",
  "redOnRevert": {"reverted": "src/<path in the change>", "what": "<the fix undone>",
    "witness": "<test file in the change or its receipts>",
    "assertion": "<the behavioural assertion that failed>",
    "evidence": "<tree path or path:line of the reverted run naming that assertion>"}}],
 "sampled": {"census": ["<author census rows re-checked>"],
   "history": ["<history rows re-checked>"], "found": "<what the sample showed>"}}
```

`sampled` may instead be `"local": {"proof": "<why no sibling exists>",
"census": "<tree path>"}`. Evidence is a path in the tree the verdict lands
with, never a scratch path: record the reverted run's output as a finding
(`note --finding "<output>" --kind evidence`) and cite
`solve/quests/<id>/log.ndjson:<line>`. The check reads only the quest log, the
change set and that tree, so `land` and the main admission judge the same
record (once the admission calls this check). `land` checks that each id
exists, each demanded field is present, the reverted path is in the quest's
`src/` change, the witness exists and is in the change or its receipts, and
the evidence exists and names the assertion (on the cited line, if one is
cited). It cannot check that the revert was run, or that the run reached the
assertion through the intended path (harness-fidelity item 1): that is the
verifier's to prove.
Closed quests are not re-judged; a quest in flight lands only on a record.

**Category-complete rounds:** a verifier must enumerate ALL findings and group
them by category; a rejection round must be category-complete — never stop at
the first defect. One defect per round turned an 11-item checklist into 11
full attempt-verify cycles on `comparative-efficiency-opportunity-calculator`
(2026-07-27).

**Sealed bars:** a quest may declare `verificationTemplates: [<category>, ...]`
in its sealed declaration — that list becomes the rejection bar, bounding the
NUMBER of rounds the way category-complete bounds each round's yield. Rejection
findings are recorded per category (`--finding "<category>: <summary>"`); a
category outside the bar passes once as `out-of-bar:<slug>`, and repeating it
requires a `verification-bar-expansion` amendment. Category-complete rounds
alone did not converge when the bar itself was open-ended (4 further rounds on
`benchmark-statistical-capacity-protocol`, 2026-07-27, each surfacing new
requirement categories).

Design-time counterpart: [design-note-template.md](design-note-template.md)
structures a Quest design note before the design-vet subagent runs, covering
the four refutation categories that recurred on every rung of the S1–S6
snapshot epic (uncited consumed surfaces, untyped failure edges, stale
cached views, unanchored identity).
