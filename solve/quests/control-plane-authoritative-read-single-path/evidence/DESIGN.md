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
