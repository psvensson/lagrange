---
name: ready-owner-at-durable-nodes-boundary
description: BINDING owner direction 2026-09-28 - one semantic READY owner at the durable NODES lifecycle boundary; Heartbeat and ReplicaDispatch are ingress adapters; READY must never need a message-group leader
metadata:
  type: feedback
---
Owner decision 2026-09-28 (option A, corrected) for quest replica-lifecycle-durable-generation:
- Making ReplicaDispatchService / message-group machinery the READY owner was the wrong boundary: a transiently leaderless message group blocked a joiner's READY (preflight residual). Publishing node readiness must NOT require a healthy message-group leader; needing the NODES partition leader is fine (durable DB authority).
- The old direct Heartbeat write was wrong only as a second weakly fenced semantic publisher, not for using the system-table gateway.
- One canonical NODES lifecycle publication operation owns: exact (node_id, boot_incarnation) identity, source state (JOINING), existing generation fence, lease via the existing lease authority, the final CAS, zero-row/outcome classification, authoritative readback after lost/unknown ack. Gateway = persistence/routing, not policy. Heartbeat (ordinary join, immediate tick stays the level-triggered wake) and ReplicaDispatch (durable/reporter ingress, rejoin) are adapters calling the same operation.
- No timeouts, registration-mutation retries, direct test writes, compatibility branches.
- First confirm whether the ~15 s mg-1 leaderless interval exists at base; if so record as pre-existing formation fact, not a lifecycle prerequisite.
- Do not fix the five candidate-only reds individually; rerun after the owner move, then classify survivors.
- The 02:33 verifier findings (full-identity replica CAS; activation batch preflight before any mutation) must be proven against the final tree and logged before any freeze.
- The message-group double-envelope fix is a SEPARATE bounded transport quest/commit; lifecycle certification must not depend on it.
- Independent verifier model (owner, corrected 2026-09-28): Claude models only - Opus 5.5 subagents are fine while Fable is out of credit; no Codex/GPT references.
**Why:** formation must not depend on unrelated group leadership; clean causality between epics.
**How to apply:** tree is back in architectural repair, not pre-freeze; no closure attempts until the boundary is corrected. Related: [[replace-quest-checkpoint-2026-09-26]], [[systemic-not-local-fixes]].
