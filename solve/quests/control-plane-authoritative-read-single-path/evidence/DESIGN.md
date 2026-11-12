# Authoritative read path closure

## Decision and ownership

The gateway owns the frozen authority token. A request selects either the explicit
local owner or the owner RPC lane; consumers execute exactly that path. The four
local-first/RPC-preferred/confirm-empty/SQL-fallback modes and their duplicated
boolean policy contract are removed with every caller. Unknown explicit modes are
rejected. Missing mode receives the gateway's declared strategy/profile default;
all authoritative profile defaults select RPC_REQUIRED. Explicit local-only
bootstrap and formation reads remain explicit. Existing leader-required witness
validation stays intact; this does not rename every owner-local observation as a
linearizable read.

The local path consumes one declared local consistency. It never weakens a leader
read to a follower on failure. The RPC path does not first probe local storage,
does not call routed SQL on failure, and cannot install a routing overlay from a
list of connected nodes. Routing recovery remains owned by existing routing and
formation owners. The ordinary caller or its existing reconciliation loop can
retry this same read when that owner becomes available; this adds no timer.

The query adapter must retain a claimed authoritative failure instead of returning
null to another execution path. Structural eligibility of a query shape remains
separate from dependency availability. Caller migration includes planning,
readiness, topology, policy, operation repositories, transactions, read adapters,
coalescing identities and diagnostics. Retired fallback options and result fields
are removed from their live producer/consumer closure. Historical sealed records
and deliberately invalid regression inputs are preserved.

## Source custody

Root owns the read contract/constants/dispatch, CDC read-flow/owner-RPC/delegates,
query/rebalancer/policy/repository/readiness caller closure, and its tests.
The CDC image/effect author owns gateway read-strategies (including deletion of its
SQL branch), cache reconciliation, cache visibility repair and catchup. That author
will consume only the two modes and no deleted boolean contract. This is one
interaction composed from disjoint writers, not two competing implementations.

## Prior mechanisms

The current authority constructor explicitly records the 2026-07-18 leader-pin
incidents: rebuilding the token in an adapter erased its policy. The retained
formation-schema-operation-collision-leader-read-closure Quest sealed at 8e07211f
requires matching durable operation identity from the canonical leader after an
ambiguous INSERT. operation-ledger-quorum-authoritative-release sealed at 8eb615a
requires a complete cache-bypassing owner observation before releasing a hold.
Those bounded fixes did not remove generic fallback modes. Git history identifies
ce7be3c74 (2026-05-24 extraction) and d29c7d8c8 (2026-08-21 contract refactor) for the
present SQL-fallback vocabulary. The read-side overlay helper appears in the
9d1f063bb (2026-05-19) extraction. These are earliest entries in the current file
history, not claims of the original introduction across renames.

The old query adapter also documents a 2026-07-18 primary-key-less projection
being merged into an empty result. Its later confirm-empty RPC mode masked one
manifestation while retaining two read paths. Current changes must remove that
source switch without restoring row-dropping or changing which query shapes the
adapter claims accidentally. The new proof starts at source-identical ebb1b35db.

## External design comparison

etcd documents its weaker serializable reads as an explicit request consistency
choice; normal KV guarantees and watch guarantees are distinct. This supports
preserving the requested read contract instead of silently weakening it after a
failure. It is inspiration, not proof of Lagrange's consistency:
https://etcd.io/docs/v3.6/learning/api_guarantees/

Kubernetes controllers repeatedly act through the resource API they own to move
observed state toward desired state. We reuse Lagrange's existing reconciliation
owners for finite recovery rather than giving the read adapter another repair
algorithm: https://kubernetes.io/docs/concepts/architecture/controller/

## Discriminating proof

The new authoritative-read-single-path test uses the production gateway and CDC
read flow with controlled downstream local and RPC answers. Plausible SQL/local
answers remain available while the chosen owner fails. It checks refusal,
unchanged source choice, normal recovery through the same gateway after the owner
heals, released single-flight custody, exact local-only selection, no fabricated
routing overlay, and invalid-mode rejection. It does not claim native Raft or
multi-machine service proof. The old source must fail these assertions before
implementation is accepted. Adjacent profile, query projection, readiness,
transaction, owner-RPC and terminal-gate tests plus the canonical affected cone
and scoped/static checks remain mandatory on physical lab.

## Additional verified boundaries, 2026-11-12

The complete-table original at job 2882 is a valid red after the separate job 2853
ESM-import fixture failure. Job 2882 executed the corrected original source and
reported 119 assertions: explicit LOCAL, weak-leader and preferLeader:false
requests were silently rewritten; absent defaults did not require the RPC owner
and an unwitnessed result could succeed. The final witness-positive identity
assertion was not reached on that original. The full worker SHA256 is
64079e6ef50deae0efea62b5ec77f3cf0c11b51204633f6a33caf5b3ea4cf14a,
56,407 bytes. Source remains 68d6941a23079defeaac3099c1df3687eb0233a1.

Job 2894 on the same source produced a verified 63,932-byte stream,
SHA256 1d1a0e9770c09bf2078f863476148b9b3bae6347dad64e55b3d847c16fe3a30a,
with two failed roots and 108 classified assertions. The view admitted all four
invalid tokens before rejecting none; frozen invalid tokens were also serialized.
A failed SERVICES read became successful empty PARTITIONS evidence, lost its
error, and reached actual gateway partition reconciliation. Exact valid-token,
answered-empty and later real cache-repair positives passed. Repository controls
showed local confirmation replacing owner unavailability, terminal mutation or
adoption from local evidence, and premature clearing of a retained repair. The
later retained-healing continuation is not established by this red.

The added completeness-custody root enters actual CDC LOCAL and RPC reads with
controlled owner evidence and a serving-leader witness. It checks absent/false
completeness, partial answers, and both arrays and counts for failedPartitions,
partitionErrors and participantFailures. Each control subsequently supplies a
complete answer through the same owner. This isolates duplicate leaf classifiers;
it does not prove native serving, transport, or whole recipient reclamation. Its
first lab result is still owed. The recipient controller's separately sealed
controls own the actual detach/reclaim consequence. One canonical classifier must
inspect the original answer before a normalizer drops any failure evidence.

Job 2935 independently measured the expanded gateway/view controls at ac8e2389:
two failed roots, 148 classified assertions, full 68,517-byte stream SHA256
a409ee7137b53cff8beac22ed70a163f1f57334c28ca8325bbcbb84303f16425.
Both valid supplied tokens were replaced and their required-leader intent was
lost. Invalid and contradictory supplied tokens reached identity and admission;
crossing the declared strategy could invoke the owner or projection cache. The
view dropped errorCode, deferRetry and retryAfterMs; its same-owner healing
positive passed. This is separate from job 2894's original controls.

Further tests-only controls now retain the exact repository witness cell across
held reads and post-read observers, require that cell for deletion, and expose
the inner read retry under the existing outer confirmation cadence. A previous
answered mismatch cannot turn later owner unavailability into absence. The
public witness snapshot remains a clone. Gateway strategy controls also reject
flat RPC-required requests at projection ingress and exercise the same canonical
relation for cache, bootstrap-snapshot and owner-local strategies; their normal
declared local defaults remain valid. These controls still require first lab
measurement before candidate acceptance. No production source is staged in this
tests-only seal.

## Independent core review and consumer closure

Independent review of the seven-file root patch with SHA256
d648b61f52b8df624e50b9f8592275b5377ab257d8e30d64df506d2bb564b570
required three further corrections before source approval. A generic valid cache
or bootstrap token can still enter direct view, CDC and SQL owner-read APIs. An
empty incomplete SERVICES result still manufactures dependent partition absence,
and the evidence reconciler confirms emptiness from the RPC source label alone.
An explicitly selected token on an unsupported SQL projection is discarded when
the adapter returns null to ordinary planning. These are the same authority
boundary across consumers, so they remain within this interaction.

New tests-only controls exercise those three actual public ingresses, the real
view/reconciler/cache composition for nine incomplete empty-result shapes, and
the public SQL unsupported projection. They retain positive explicit owner-local
non-propagated reads, complete-empty recovery through the same owner, supported
SQL with the same token, and the existing untokenized ordinary projection. The
earlier CDC timeout fixture now names the canonical transport timeout constant;
the historical first-red bytes are retained. No new control has been executed
locally or accepted without its physical-lab result.

## Original reply classification and selected-token custody

Job 2953 is fully verified on exact f8ab785c/source68d: 23,241 bytes,
SHA256 82e70c7788f18efc024f8c9a51c80abc480f66eee0af574e08c24149f29703be,
198 classified assertions. Nine failures occur at the completeness assertion:
LOCAL accepts all three positive numeric failure counts; RPC accepts all three
failure arrays and all three counts. Missing/false completeness, explicit partial
answers and LOCAL failure arrays are already refused. The later same-owner
complete-answer controls execute and pass. This supports one classifier of the
original result before either leaf or the view loses failure fields. It does not
establish a recipient-retirement or catchup-sweep fix by itself.

Independent review of R2 (patch SHA256
8d5e154658e4be74422c88dd5da747eb3c096207bc0d1c2463a6308a5a2ee566)
found the three R1 gaps closed, but required two further corrections. Runtime
validation still depended on replaceable array iteration, and LOCAL with a
required-leader token could use any-replica consistency or return unwitnessed
rows. The indexed traversal precedent is the retained-seed original handoff
review's V4 committed-vector finding, recorded 2026-10-23. The July 18 structural
token commit 3a9c5bd41 also documents the earlier lost leader-pin family. These
are shared authority obligations, not local caller exceptions.

Tests-only seal 4641db16 retains source68d and adds actual gateway/view ingress
controls for frozen accessors, inherited mutable fields, proxies, serialization
hooks, nonenumerable or missing fields and invalid leader values. Ordinary and
null-prototype complete data tokens must retain exact identity. Seal f46c89cf
adds targeted mutable iterator/every/some controls and actual CDC LOCAL leader
obligations, with same-owner witnessed healing and ordinary any-replica follower
success retained. Both seals were independently reviewed before lab submission;
no passing candidate result is claimed here.

R3 uses indexed canonical-field and failure-vector traversal. LOCAL+REQUIRED
requires explicit local-leader consistency, and the existing witness owner now
enforces required-leader evidence for each local leaf before aggregation as well
as for the RPC answer. The private local helper consumes the selected token; its
unused public delegate/export is removed, and its sole leaf-test probe enters
the canonical execution function with the same token and assertions. The frozen
R3 patch SHA256 is
ad12d75543a2f54366f8bbcf1b573d6e0275376fec0024460a2a707620dda7a3.
Independent source review and physical candidate evidence remain required.

The local producer still has an existing multi-port dispatcher and a secondary
buildRemoteReadAuthorityWitness call when the read result omits a witness. R3's
controlled partition-answer tests do not close those native producer contracts.
Direct owner-RPC helper exports also require a complete caller/boundary review.
The CDC catchup audit separately found that destructive sweeping and complete
freshness could ignore a correctly normalized incomplete result; its own real
cache controls and same-owner complete continuation remain in progress. No
whole-codebase absence of fallback logic or full-epic acceptance is asserted.

## Retained confirmation ownership, expanded original

Job 2989 is fully verified on f263b9a4/source68d: two failed roots, 196
classified assertions (gateway 100, repository 96), 119,190 bytes, SHA256
46d07ea031e336687adf46f550a94c1b1a19135e1aea19e05a8a742db0e3519c.
The original deletes a replacement witness after a held read and a witness
installed by the final observer. Both unavailable-confirmation cases preserve
the thrown mutation cause but delete their retained witness cell. Missing or
cloned expected cells authorize deletion; a zero-budget outer confirmation
starts an inner delay and performs two reads; a prior mismatch converts later
unavailability to missing. The unchanged held witness positive passes.

The same run measures flat RPC plus projection intent executing the cache, and
all three nonauthoritative-strategy constructors fail the refusal controls.
The staged design keeps one canonical strategy relation, one RPC observation per
outer confirmation attempt, and exact-cell cleanup only after positive owner
confirmation. These source changes have independent review, but their candidate
lab proof and full caller/static closure remain outstanding.

## Source checkpoint after independent R3 review

Independent review approves the bounded R3 source: indexed validation, one
leader-witness enforcement owner for RPC and every local leaf, and canonical
local helper custody. A final caller census found a raw-draft erasure boundary:
the gateway could replace an invalid original strategy or empty consistency
before the constructor examined it. Tests-only seal 8cca61d4/source68d adds five
actual ingress controls, including direct executeRead, with same-gateway default
recovery. The follow-up source reuses the same draft assertion on both original
intent and options after supplied-token validation and before normalization.
The shared assertion/export and readiness's direct canonical mode imports also
have independent review. The unused copied readiness mode vocabulary is removed.

This source checkpoint includes the independently reviewed repository custody
correction and mode caller migrations. It is WIP transport, not acceptance. The
terminal relister fixture migration depends on the CDC resource composition;
the isolated authority candidate must not claim that consumer is already green.
Complete physical original streams, selected candidate roots, affected callers,
generated metadata, scoped static gates and integration remain required. Native
local producer fallback removal and the direct RPC helper boundary are still
separate open source obligations.
