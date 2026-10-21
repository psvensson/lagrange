---
audience: development
documentClass: current
---

# Dependency construction is not a truth read

The existing audit's mixed-cache-and-SQL check flags every identifier whose
spelling contains cache and SQL/DB/query/execute in the same function tree.
In SeedRuntimeBridgeOwner.acquireSqlQueryEngine this mistakes constructor
names, option labels, cached resource handles and publication setter names
for two competing truth sources. The caller acquires dependencies and
publishes one exact SQL engine; no data is read from that engine here.

The guideline-audits owner will repair operation evidence in its existing
classifier. This is an audit unit separate from the cleanup Quest and from
the seed release retry ownership judgment. No runtime behavior changes.

Distinguish syntax that merely names or passes a dependency from evaluated
data access. Continue inspecting all arguments, computed expressions and
nested callback bodies. Do not exempt whole constructors, setter calls,
functions or named paths. Keep the actual cache.get plus db.query negative
and each single-source positive. Add mixed reads inside construction,
publication, computed member/callee expressions and callbacks, and after a
construction/publishing sequence. Add the exact current bridge source and
an equivalent renamed fixture as construction positives.

The checker remains a bounded syntactic audit, not a whole-program proof of
dynamic JavaScript effects. Its before/after complete finding identity delta
must be independently reviewed; unexplained loss of real evidence is a
rejection. Existing other-kind behavior and baseline ceilings do not change.
Freeze and measure the new witness against the old classifier before repair,
then measure that identical witness on the candidate through the locked lab.
