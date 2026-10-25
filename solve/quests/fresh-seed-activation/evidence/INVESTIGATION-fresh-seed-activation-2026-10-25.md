---
audience: development
documentClass: evidence
---

# Fresh-seed activation causal census and research

Base: `af8a0381be10bebbb3daf78bd331f7aa3fcacbbf`. Isolated branch:
`work/codex-fresh-seed-activation-20261025`. Rules revision 4, ported onto
this lineage by `a544288fc`; current review stamp `be968204d`. The sealed Quest and the
owner's decisions of 2026-10-26 remain unchanged.

The historical opening work (`4512b564c`, `7766ccafb`, `7fa4d79ae`) binds
native construction to an exact process-local original opening. The later
retained inspection (`cb822d6fc`, `68633168e`) is deliberately observation
only. Q1-Q5 (`d0ee2fe00`, `4121eb8c2`) now make the lifecycle owner the sole
allocation-field writer. They do not call `transitionOriginalRight` from
production. `assertOriginalSeedContinuation` still unconditionally holds.

The first causal divergence in the sealed child witness is the continuation
hold before deferred elections, not failed transport or a missing fixture.
Simply deleting it would also bypass the public-admission hold. The complete
interaction therefore includes mode/exact-opening activation, registration
right consumption and public admission. Registration currently remints
SERVICES birth timestamps/tokens and cluster identity instead of consuming
the prepared declaration. Those identities belong to the same repair.

The intended transition is: the live issuer validates the admitted and
consumed opening; the declaration supplies the exact birth; the lifecycle
owner commits UNUSED -> SUBMITTED before the one INSERT; the existing
authoritative read gateway observes the same committed value/generation;
only then does the lifecycle owner commit SUBMITTED -> TRANSFERRED. An
unavailable answer retains SUBMITTED. A repeated live call may observe the
same outcome but never submit again. Cold inspection retains its existing
hold. Public ingress consumes one preparation-owned all-rights decision.

External primary sources inform the failure cases, not the architecture:

- [etcd API guarantees](https://etcd.io/docs/v3.6/learning/api_guarantees/)
  distinguishes durable completed operations and linearizable reads from
  weaker observation paths. Applied here: the readback must use the actual
  authoritative leader read, never SystemTableCache or acknowledgement alone.
- [Apache ZooKeeper recipes](https://zookeeper.apache.org/doc/r3.9.4/recipes.html)
  describes create succeeding before the response is lost and identifying
  that creation by its prechosen GUID. Applied here: the already declared
  create token, incarnation and cluster ID identify a submitted operation;
  a missing response is not permission to mint another identity or INSERT.

No etcd/ZooKeeper storage or workflow abstraction is introduced. Existing
preparation, lifecycle, SERVICES row, mutation/read and ingress owners carry
their current responsibilities. Fresh-seed service, typed restart outcome,
independent verification, canonical lab receipts and final cutover acceptance
remain separate evidence obligations.
