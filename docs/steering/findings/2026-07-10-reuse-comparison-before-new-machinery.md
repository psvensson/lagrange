---
source: operator-directive#reuse-comparison-visible
---

Every fix design and every quest report MUST carry an explicit, visible REUSED vs EXTENDED vs NEW comparison — which existing mechanism each piece rides, and for anything NEW, the evidence that no existing mechanism (wired or half-built) already covers it; parallel or duplicated machinery discovered on contact MUST be recorded as a consolidation candidate, never silently worked around. (Operator directive 2026-07-05: the codebase demonstrably carries parallel-machinery debt — e.g. 8 retry-timer registries in one owner class — so the reuse comparison must be visible in the deliverable, not implicit in the process.)
