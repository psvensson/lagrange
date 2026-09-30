# Track: MG removal CAS / cache delete ordering / Raft registry (I10) / cleanup token (I2,I3)
Fingerprint after track: labwt porcelain empty, tree 05eaef5c. Scratch worktrees wt-cache, wt-cache-base removed. Falsifiers kept in verify/falsifiers/.

Witnesses run green on candidate: cache lifecycle-delete-ordering 6/6, cdc-delete-cache-absence-convergence 28/28, MG row owner 39/39, lifecycle-registry-runtime-generation 6/6, replica-cleanup-token-authority 31/31, tombstone-time-authority pass.

C1 cache LWW without HLC pair (falsifiers/cache-reuse-falsifier.test.js): A1/A1b/A2/A3b red on candidate AND base (identical 4/9 pass). Needs no HLC pair + clock skew. Known mechanism, non-blocking. HLC-stamped CDC (production partition CDC) orders correctly (A1c green). Suggest bounded correction at row-merge: a delete predicate naming created_at != existing created_at is another generation -> superseded.
C2 reservePeerIdentity current-name (falsifiers/reservation-current-name.test.js): red by construction; reaches G2 durable identity map; deterministic peer id + idempotent append -> benign. Non-blocking new shape.
C3 REMOVE_REPLICA (partition + MG) not generation-bound at request level; MG stop by name; MG create does not refuse while REMOVING; localReplicas clobber. Base-identical. Non-blocking, operation-contract owner.
Clean: MG removal predicate; created_at mint; registry WeakMap exact; retire captured port; RSM timeouts exact snapshot+revision; removal completion in serialized lane; cleanup token reread before each unlink/rmdir; G2 insert blocked by marker PK; release classifies replacement.
