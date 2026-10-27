# Snapshot lifecycle staging boundary -- WIP design

Owner/input and all seven dispositions are in
../../epics/raft-rs-full-cutover/ownership-audit-disposition-20261012.md.
The current snapshot reconstructStagedRaftRsState owns validated CREATE intent,
receiver identity, private staging, native reconstruction and atomic publication.
The NEW prepareReplicaLifecycleForSnapshot operation in the EXISTING lifecycle
owner owns row creation, exact incarnation reuse and typed refusal. No lifecycle
class, runtime, registry entry or retirement capability crosses the boundary.

Matching ACTIVE identity returns frozen CORE_OK with the current incarnation.
Conflicting identity, retirement and surviving native history without lifecycle
refuse through the existing owner. Storage failure propagates; it never creates
success. The snapshot caller checks the answer before native reconstruction.
There is no new cache, retry driver, durable store or install permission.

The boundary checker permits only that static named import at snapshot-install;
namespace, dynamic, mixed, re-export, old class and unrelated-caller imports stay
refused. Positive and negative tests, source-only consumer revert and the real
native snapshot authorization regression are required. This is static confinement,
not a claim of protection against arbitrary trusted-host code. Independent review
must attack invalid identity, refusal propagation in the full installer, failed
staging writes/cleanup and marker recovery. Unmeasured clauses remain open. No
sealed receipt or approving verification is fabricated from a passing unit set.
