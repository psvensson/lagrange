---
audience: development
documentClass: current
---

# Additive census alias correction and next handoff witness

Lab #634 retained a real guard implementation defect: the source already has
an immutable local alias in lifecycleVerdictsOf. This correction follows const
object aliases, keeps renamed imports, and still refuses missing runtime,
mutable/escaped bindings and unchecked dynamic calls. The original five
runtime-generation cases are unchanged. No runtime source is changed here.

The next bounded handoff boundary is uncertain partition SERVICES registration.
The current row owner accepts any safe-integer created_at and does not compare
create_attempt_token. The new 12-case owner-level witness uses actual SQLite
for retained answers and the real registerReplica and authoritative-read
adapter, with fault injection at its gateway dependency. It is not a native
Raft or public startup proof. Exact thrown/returned uncertainty must reconcile
without another INSERT; foreign birth/token must fail, while unavailable,
absent or duplicate observations retain CREATE_OWNER_DEFERRED.

Source remains unchanged for the witness baseline. Self-review only. No
independent verdict, sealed receipt, static gate or landing follows.
