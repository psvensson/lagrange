# Follow-on #5 — Memory graft (honest scope)

**Status: bounded deliverable shipped; external Letta/Mem0 integration intentionally NOT built.**

## The recommendation was "skip the external graft"

The deep-research scan (`continuous-ai-workflow-landscape.md`) found memory layers (Letta/Mem0)
"solve memory but model no goal closure" — a substrate, not the capability. This project already
has the durable substrate: the **Solver event log** (invariant status is a fold over it — never
lost), the file-based external memory, and steering files. A new external memory service would be
(a) a runtime dependency I cannot provision in this environment, and (b) a second store — the
project's repeatedly-bitten parallel-store / projection-of-a-projection antipattern. So a literal
Letta/Mem0 graft is **declined on purpose**, not skipped by omission.

## What was built instead (serves the intent, no new store, no external dep)

The intent behind a memory graft is *cross-session persistence of invariant state, re-read at
decision points*. Two pieces already deliver that:

1. **Decision-point recall** — `altitudeInvariantDigest` surfaces non-HELD invariants into the
   altitude (framing) reflection (follow-on #2). Drift is re-read exactly when the agent steps
   back to reconsider the frame.
2. **Cross-session board** — `solve invariants --export` writes `solve/invariant-status.generated.md`,
   a durable, human/agent-readable **projection** (the same pattern as `FRONTIER.generated.md` /
   `OVERVIEW.generated.md`), so the next session can read current coverage/coherence/worklist
   without re-running anything. It is gitignored (a per-run projection of local evaluation state,
   unlike the Quest-state boards), and the authoritative source stays the event log.

## The pluggable seam (if a real external memory is ever wanted)

`scoreInvariants()` / `renderInvariantBoard()` are pure producers of the invariant state object.
A real Letta/Mem0 backend would be a thin sink consuming that object (e.g. writing memory blocks
keyed by invariant id) — no change to the producers. That is the entire graft surface. Wiring it
needs: an external Letta server or a Mem0 API key, a backend module implementing `persist(state)`,
and a decision that the cross-session benefit outweighs the new dependency. None of that is
justified today given the event log already provides durable, queryable persistence.

**Verdict:** the cross-session-recall *value* is delivered with existing machinery; the external
*dependency* is the part declined. Revisit only if a concrete recall gap appears that the event
log + board + altitude feed cannot cover.
