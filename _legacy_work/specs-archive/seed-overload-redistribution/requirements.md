# Requirements Document

## Introduction

This specification defines the next control-plane stabilization pass after the
March 16, 2026 harness reruns removed the earlier architecture violations but
left several distributed scenarios failing.

The remaining failure shape is consistent:

1. critical system-partition `REPLACE` workflows stall,
2. replacement learners leave learner state and campaign,
3. Raft log persistence is inconsistent across write paths and can surface
   `null.command` failures during append retry,
4. seed-hosted system partitions remain concentrated because the stalled
   replacement workflow never completes.

The goal of this spec is to restore deterministic replica replacement and Raft
durability so the control plane can redistribute system partitions instead of
timing out under restart and join stress.

## Problem Statement

Recent harness reruns still fail `rolling-restart`, `seed-restart-under-load`,
`node-join-under-load`, `sustained-write-throughput`, and related scenarios.
Investigation of the March 16, 2026 reports and the current code shows three
direct causes in the active owner paths:

1. `PartitionService.checkLearnerPromotion()` forbids the temporary
   above-target promotion window for critical partitions.
2. `RebalanceCoordinator.getSafetyError()` refuses critical `REPLACE` remove
   progression until the replacement replica is already voter-ready.
3. `SQLiteLogAdapter` persists incompatible entry shapes in `_raft_log.command`,
   and local append-fail retry logic assumes the recovered entry is always
   non-null and well-formed.

These defects violate the system requirements around deterministic topology
progression, one canonical owner path, and durability under restart.

## Scope

In scope:

1. critical partition replacement progression,
2. learner promotion and campaign suppression while joining an existing group,
3. SQLite-backed Raft log persistence and append-fail recovery hardening,
4. focused owner-path regressions and targeted distributed reruns.

Out of scope:

1. redesigning bootstrap to seed only one system replica per partition,
2. broad readiness/discovery throttling changes,
3. replacing liferaft with another Raft implementation.

## Glossary

- **Critical Partition**: A system partition in `CRITICAL_SYSTEM_PARTITION_IDS`
  whose quorum must remain available during topology changes.
- **Replacement Window**: The bounded period during a `REPLACE` workflow where
  one temporary extra voter may exist before the source replica is removed.
- **Joining Learner**: A replica created with `isJoiningExistingGroup = true`
  that must remain non-voting until the owner path explicitly promotes it.
- **Voter-Ready**: A replica that is non-learner, routable, and ACTIVE for
  safety checks and control-plane progression.
- **Canonical Log Entry Shape**: One persisted JSON structure for
  `_raft_log.command` regardless of whether the entry was written by `put()`,
  `saveCommand()`, or an acknowledgement update.

## Requirements

### Requirement 1: Critical `REPLACE` Must Progress Deterministically

**User Story:** As the control-plane owner, I need critical partition
replacement to complete without deadlocking so seed-hosted system partitions can
redistribute after joins and restarts.

#### Acceptance Criteria

1. WHEN a critical partition executes a `REPLACE` workflow, THE system SHALL
   allow exactly one temporary replacement voter above target replica count.
2. THE replacement window SHALL remain bounded to one in-flight replacement
   learner per partition.
3. WHEN the replacement learner becomes voter-ready, THE coordinator SHALL
   continue the remove phase through the existing `REPLACE` owner path.
4. THE system SHALL keep the minimum voter-ready quorum guard for critical
   partitions during remove execution.
5. A critical `REPLACE` workflow SHALL NOT stall solely because the replacement
   voter would temporarily exceed target replica count by one.

### Requirement 2: Joining Learners Must Not Campaign Before Promotion

**User Story:** As a maintainer, I need joining learners to stay in learner
   state until the owner path promotes them so replacement safety is not
   undermined by autonomous elections.

#### Acceptance Criteria

1. WHEN a replica starts with `isJoiningExistingGroup = true`, THE replica
   SHALL remain in learner role until `checkLearnerPromotion()` explicitly
   promotes it.
2. WHILE a replica remains a joining learner, THE system SHALL suppress
   candidate and follower demotion persistence from raw liferaft events.
3. WHILE a replica remains a joining learner, THE system SHALL keep election
   timers disabled.
4. WHEN learner promotion occurs, THE replica SHALL begin normal follower
   behavior and election timing from that point forward only.
5. A joining learner SHALL NOT persist `raft_role = candidate` before explicit
   promotion.

### Requirement 3: SQLite Raft Log Persistence Must Use One Entry Shape

**User Story:** As a durability owner, I need the SQLite log adapter to persist
one canonical entry shape so restart recovery and append retry operate on valid
Raft entries.

#### Acceptance Criteria

1. THE SQLite log adapter SHALL persist the same JSON entry shape for
   `put()`, `saveCommand()`, and acknowledgement updates.
2. `get()` and `getRange()` SHALL return full entry objects consistent with the
   canonical persisted shape.
3. `commandAck()` SHALL update acknowledgements without changing the persisted
   entry format.
4. The adapter SHALL remain backward-safe for empty-log behavior and non-open
   databases.
5. Property and contract tests SHALL prove that persisted entries round-trip
   across all supported write paths.

### Requirement 4: Append-Fail Recovery Must Fail Closed, Not Crash

**User Story:** As an operator, I need append-fail retry to tolerate missing or
malformed recovered entries so a single persistence inconsistency does not crash
the node.

#### Acceptance Criteria

1. WHEN append-fail retry cannot recover a prior log entry, THE retry path
   SHALL stop safely without dereferencing `null`.
2. WHEN a recovered entry is malformed, THE retry path SHALL ignore it and
   emit a typed diagnostic or log event instead of throwing.
3. THE implementation SHALL keep one append-fail recovery path; it SHALL NOT
   add a fallback Raft transport or duplicate retry mechanism.
4. Regression coverage SHALL prove append-fail recovery tolerates null or
   malformed entries without process crash.

### Requirement 5: Regression and Harness Verification Must Be Owner-Path Based

**User Story:** As a release owner, I need deterministic regression coverage so
these fixes are proven through the canonical progression path rather than by
accidental convergence.

#### Acceptance Criteria

1. Each code fix SHALL be preceded or accompanied by a regression in the
   owning test suite.
2. Control-plane tests SHALL assert owner-path behavior, not only eventual
   convergence.
3. Targeted raft and rebalance suites SHALL pass before distributed reruns.
4. The failing distributed harness scenarios SHALL be rerun after the targeted
   fixes land.
