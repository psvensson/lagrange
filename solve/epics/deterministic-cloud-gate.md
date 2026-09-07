---
id: deterministic-cloud-gate
status: open
proof: deterministic
roadmapRow: null
graduatesTo: null
quests:
  - restore-deterministic-cloud-gate-nondeterminism-defects
  - restore-deterministic-cloud-gate-resource-sensitive-execution-contract
  - restore-deterministic-cloud-gate-hosted-gate-repeatably-green
  - restore-deterministic-cloud-gate
authorizes:
  - scripts/checks
  - .github/workflows
  - test/shards
  - scripts
doneWhen:
  probe: script
  args:
    command: node scripts/checks/hosted-gate-repeatability.js --metric
---

# Deterministic cloud gate

The GitHub-hosted blocking gate is repeatably green with every failure class understood.

Derived by the solve-v2 migration from the quests listed above (amendment 7).
The operator seals `doneWhen` and `authorizes` before new quests start here;
until then the epic is `legacy: true` and its scope is unenforced.

## Sealed acceptance

Sealed 2026-09-07 from the derived-epic packet in
`solve/epics/solve-v2/derived-epic-sealing-packets.md`.

`doneWhen` measures how far the current head is from the bar the hosted-gate
check already holds: the same source SHA passing the complete hosted blocking
gate three times, with any failed run on that SHA failing outright. The check
computed that verdict before; it now also states it as a number a probe can
read, which is the same verdict rather than a second one.

A pass means one identical published head passed the whole hosted blocking gate
three times, so its greenness is a property of the tree rather than of a lucky
run.

**What this does not demonstrate.** The other half of the sentence above, that
every failure class is understood. Counting green runs cannot show that each
historical failure has an owned cause and regression coverage. That half was
carried by the two receipt frontiers under this epic, both of which closed on
2026-09-07 as pre-existing satisfaction, each proven at the frozen baseline
`b8ee3a055` with zero implementation delta.

**Known lifecycle tension.** This epic's evidence cannot exist before a
publication, while landing requires a terminal state. The parent quest recorded
that circularity and it is not resolved by this seal.
