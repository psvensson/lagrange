---
source: operator-directive#reuse-comparison-visible
---

Every fix design and quest report MUST carry a visible REUSED vs EXTENDED vs NEW comparison: which existing mechanism each piece rides, and for anything NEW, evidence that no existing mechanism already covers it.

Parallel or duplicated machinery discovered on contact MUST be recorded as a consolidation candidate, never silently worked around.

Why (operator directive 2026-07-05): the codebase demonstrably carries parallel-machinery debt — e.g. 8 retry-timer registries in one owner class — so the reuse comparison belongs in the deliverable itself, not implicit in the process. "Half-built" counts as existing: verify whether found machinery is wired before building a rival.
