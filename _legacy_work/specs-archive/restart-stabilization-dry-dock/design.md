# Design

## Overview

The current restart/join work has reached the point where full distributed
scenario reruns are producing signal, but not enough control. The next step is
to stabilize the boundary through a dry-dock program:

1. define a small failure taxonomy
2. define restart invariants
3. replace broad reproduction with deterministic owner-path tests
4. use the distributed harness only as an acceptance gate

## Failure Taxonomy

### 1. Ingress Unavailable

The control-plane or message-group ingress path cannot be reached from a
restarting node. Symptoms include repeated `leader unknown` or control-plane
CDC failures.

Primary owner boundary:
- message-group leader routing
- control-plane ingress ownership

### 2. Stale Reconnect Address

The router continues to trust an address that is no longer routable after
restart, typically surfacing as repeated `ENOTFOUND` or connection refusal.

Primary owner boundary:
- `MessageRouter` reconnect-address ownership

### 3. Handler Not Active

Cluster metadata exposes a target before the local handler is actually
registered and serving.

Primary owner boundary:
- activation ordering
- service-row publication owner

### 4. Authoritative Partition Unavailable

Join progress fails because writes or queries against authoritative system
partitions fail during restart pressure.

Primary owner boundary:
- partition availability
- control-plane/system-partition query path

## Restart Invariants

### Invariant 1: Control-Plane Ingress Must Be Reachable

A restarting node must have at least one viable control-plane ingress path.
Once all locally known ingress targets are exhausted, the operation should fail
fast with typed diagnostics instead of silently burning retries.

### Invariant 2: Reconnect Addresses Must Be Fresh

Reconnect-address ownership belongs to the router. Observed addresses are
preferred while healthy, but a hard DNS-style failure invalidates the address as
an authority for subsequent deliveries.

### Invariant 3: `ACTIVE` Means Locally Routable

No service row should become `ACTIVE` before the local handler is registered
and serving.

### Invariant 4: Join Must Not Depend On Non-Critical Repair

Join completion should require only discovery-critical state. Opportunistic
repair must stay behind activation.

## Deterministic Reproducer Program

### Reproducer A: Stale Reconnect Address Invalidates After DNS Failure

This is the first reproducer in the dry-dock track because:

1. it still appears in the latest `rolling-restart` logs
2. it has a small owner boundary
3. it can be reproduced in `MessageRouter` unit scope

Test shape:

1. Seed a disconnected router entry with a stale reconnect address.
2. Make the first reconnect attempt fail with `ENOTFOUND`.
3. Allow the resolver-owned fallback address to succeed.
4. Verify the next delivery starts from the fresh resolver-owned address rather
   than the stale one.

### Reproducer B: Exhausted Leader Target Set Fails Without Retry Storm

This reproducer already exists in the message-group/raft regression surface and
proves that an empty effective leader-target set should not keep consuming the
outer retry budget.

### Reproducer C: Join Registration During Seed Restart

This should be added later as a narrow bootstrap/control-plane integration test
instead of being discovered first through `rolling-restart`.

## Acceptance Strategy

1. Land deterministic reproductions first.
2. Fix product code only through the owner under test.
3. Re-run focused unit/integration tests.
4. Use `rolling-restart` only to confirm whether the failure class has moved.
