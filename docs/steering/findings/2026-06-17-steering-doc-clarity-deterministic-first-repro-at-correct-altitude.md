---
source: quest:steering-doc-clarity#framing-and-vocab
---

A convergence-bug repro MUST exercise the layer where the invariant is produced or violated (the owner write, commit edge, or election), and MUST NOT assert only a downstream projection such as a readiness snapshot or settled cache — a green repro at the wrong altitude never exercises the broken mechanism and is a primary cause of land-correct-but-recur. Reproduce deterministically in-process BEFORE changing code; the non-deterministic docker statistical gate is last-resort certification of a landed fix, never the iteration loop.
