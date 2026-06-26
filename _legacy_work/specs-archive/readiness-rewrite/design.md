# Design Document: Readiness Rewrite

## Overview

The rewrite introduces one explicit readiness model with two levels:

1. node readiness
2. service readiness

That separation is the key design move. A node may be known, repair-eligible,
or serve-eligible. A service may be registered, activated, and routable. The
system must stop collapsing those into one optimistic concept.

## Goals

1. Remove stale-routing optimism during restart windows.
2. Make `active` mean routable by construction.
3. Let repair/admission paths stay stricter and clearer than traffic paths.
4. Prove the model with deterministic tests before rerunning broad harness
   scenarios.

## Non-Goals

1. No redesign of the broader control-plane architecture in this slice.
2. No attempt to solve all restart failures through readiness alone.
3. No permanent coexistence of two independent readiness implementations.

## 1. Readiness Lattice

### 1.1 Node Readiness

Node readiness remains the owner of node-level participation decisions.

The node snapshot answers:

1. is the process alive
2. is the cluster member healthy
3. is the node repair-eligible
4. is the node serve-eligible

`repairEligible` and `serveEligible` are not interchangeable:

1. `repairEligible` is for control-plane, convergence, and join work
2. `serveEligible` is for user/admin traffic routing safety

### 1.2 Service Readiness

Service readiness is the new routing contract.

The service snapshot answers:

1. is the row registered
2. is the handler registered locally
3. is the endpoint/address published
4. is the runtime actually able to receive messages
5. is the service externally routable

Key invariant:

`routable => active`

and operationally:

`active` must only be published once routable is true.

## 2. Evidence Precedence

### 2.1 Positive Evidence

Positive evidence sources, in descending confidence:

1. local handler registration / live runtime state
2. live router connected state
3. valid ready lease with fresh heartbeat
4. cached row state

### 2.2 Negative Evidence

Explicit negative live evidence must outrank stale optimistic metadata for
traffic-serving decisions.

If the router currently reports a peer as disconnected, then:

1. stale `nodes.connection_state=connected` cannot keep the peer
   `serveEligible`
2. stale `services.status=active` cannot keep the peer routable by itself

This is intentionally fail-closed for serving traffic.

### 2.3 Grace Rule

Row-based grace remains allowed only when the router has no current evidence
for the peer.

That preserves short cache lag tolerance without ignoring explicit disconnect
signals.

## 3. Publication State Model

### 3.1 Service Row Ownership

Each service row keeps one lifecycle owner.

Required pattern:

1. registration creates the canonical row in a non-routable state
2. activation flips the lifecycle fields once handler and address are ready
3. steady-state lifecycle changes remain partial updates only

### 3.2 Activation Sequence

Activation must be ordered:

1. local runtime initialized
2. handler registered
3. endpoint/address published
4. service row promoted to `active`

Any other ordering recreates the current restart bug family.

### 3.3 Partition Services

Partition services currently appear to have a weaker activation contract than
message-group services. This rewrite aligns them.

Partition services should follow the same rule:

1. register first in a non-routable state
2. activate only after handler reality exists

## 4. Consumer Model

### 4.1 Query Routing

`QueryExecutor` and `SQLQueryEngine` must consume service routability, not raw
service rows plus node optimism.

A partition replica is a valid routing target only when:

1. its service row is active
2. its node is serve-eligible
3. its local handler reality is consistent with that state

### 4.2 Control-Plane Gating

Join and repair flows should consume node repair eligibility rather than
serve-eligibility.

That keeps traffic safety and repair eligibility separate while still failing
closed on explicit transport negatives where required.

## 5. Proof Program

### 5.1 Deterministic Proofs

The rewrite must first be proven with focused tests:

1. explicit router disconnect outranks stale row optimism
2. row grace remains valid when router has no evidence
3. service cannot become active before handler readiness
4. query routing ignores non-routable replicas

### 5.2 Acceptance Gate

Only after deterministic proofs are green should the harness be rerun:

1. `rolling-restart`
2. `seed-restart-under-load`
3. `partition-kill-heal-under-load`

The harness is an acceptance gate for the new contract, not the discovery tool
for it.

## Why This Model Is Better

This rewrite is better because it removes one ambiguity at the root:

1. node participation and service routability no longer share one overloaded
   meaning
2. explicit live negative evidence becomes authoritative for traffic safety
3. `active` regains a strict meaning instead of "probably ready soon"
4. failures can be described as contract violations, not retry path noise
