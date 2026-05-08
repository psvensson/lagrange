# Core Topology Control-Plane Rewrite Requirements

## Purpose

Define the requirements for a Phase 0.1 rewrite of the AGPL topology control
plane. The rewrite covers boot, join, rejoin, partitioning, rebalancing,
projection, and readiness. It does not add user-facing partition management or
paid-edition behavior.

## Requirements

### Requirement 1: Four Semantic Owners

The control plane must expose exactly four mutation owners for core topology
state:

1. Topology membership owner.
2. Topology placement owner.
3. Topology operation owner.
4. Topology publication owner.

Each owner must declare canonical evidence inputs, state vocabulary, emitted
outcomes, allowed consumers, and forbidden reinterpretations.

### Requirement 2: Membership Owns Boot Join Rejoin

Boot, join, and rejoin flows must consume one membership owner contract for node
identity, incarnation, admission, join session, rejoin session, and handoff
state. Phase-local timers, seed contact state, cache visibility, or transport
reachability must not promote a node to admitted, active, repair-eligible, or
serve-eligible state outside that owner.

### Requirement 3: Placement Owns Intent

Partition assignment, replica intent, split intent, move intent, and placement
policy must be owned by the placement owner. Rebalancer and recovery paths may
request placement decisions, but must not mutate or infer placement intent
through independent policy branches.

### Requirement 4: Operation Owns Actuation

Durable topology operation lifecycle, workflow progress, retry, resume,
terminal outcome, and operation-level pressure handling must be owned by the
operation owner. Participants may execute owner-issued steps and report
outcomes, but must not persist owner-managed phase transitions directly.

### Requirement 5: Publication Owns Visibility

Canonical topology projection publication, acknowledgements, freshness, and
watch/resume visibility must be owned by the publication owner. Cache
visibility, SQL fallback reads, or diagnostics-only views must not complete
publication or acknowledge convergence on their own.

### Requirement 6: Projection Readiness Is A Consumer Contract

Projection/readiness must consume owner outcomes and publish named internal,
repair, and serve readiness states. It must not become another mutation owner.
Consumers must not combine raw cache, SQL, transport, timer, or phase evidence
to recreate readiness decisions locally.

### Requirement 7: Runtime Work Is Sequenced

The first package creates specs, roadmap truth, sprint/package tracking, and
current-blocker handoff only. Runtime/source-code changes must wait for
successor packages with explicit owner boundaries and proof ladders.
