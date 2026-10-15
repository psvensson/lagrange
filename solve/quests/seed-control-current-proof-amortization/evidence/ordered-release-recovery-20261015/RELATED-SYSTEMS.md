# Relevant precedents, not imported authority

Primary sources inspected 2026-10-15. These supply narrow design hints; none
certifies Lagrange's proposed mechanism or replaces its owner contracts.

* RIFL/RAMCloud stores completion metadata atomically with an operation's
  effects and carries it with the owning data. Its retirement rules also
  prevent an expired identity from silently executing again. This supports
  keeping release effects, exact outcomes and replay protection at one owned
  application boundary. RIFL uses client leases/acknowledgments; Lagrange has
  not adopted that service or its perpetual-answer assumptions. The selected
  generation frontier must return unavailable history explicitly.
  [SOSP 2015 paper, sections 3–4](https://web.stanford.edu/~ouster/cgi-bin/papers/rifl.pdf)

* etcd/raft separates leader uncommitted-entry limits, committed apply batches
  and per-peer in-flight replication limits. Its leader uncommitted estimate
  resets on term changes; its documentation separately describes snapshot
  catch-up. This is a useful warning against treating a leader quota as durable
  custody or a follower-history bound. Lagrange must extend its existing
  runtime/store/snapshot owners rather than copy a counter and call recovery
  bounded. These are live upstream examples, not changes to the pinned
  raft-rs dependency.
  [raft configuration and accounting](https://github.com/etcd-io/raft/blob/main/raft.go),
  [replication flow control](https://github.com/etcd-io/raft/blob/main/design.md)

Inference for this packet: use one existing atomic application transaction to
retire history and decide the carried request. This is our selected Lagrange
composition, not an assertion that either precedent implements this exact
RETIRE_AND_APPROVE command. Keep custody, result retention, replication flow and
snapshot recovery as separate contracts with one owner each.
