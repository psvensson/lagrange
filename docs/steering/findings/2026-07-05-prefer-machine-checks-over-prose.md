---
source: operator-directive#checks-over-prose
---

Any steering rule that can be enforced by a machine check (lint rule, ratchet, guard script, probe) MUST become one, wired into an existing gate (`test:static`, pre-commit, `steering:check`), with the prose demoted to a pointer at the check. Prose steering is reserved for judgment calls a check cannot express (altitude reflection, value-targeting, gate-last discipline). A prose rule that keeps being violated is a missing check, not a compliance problem.
