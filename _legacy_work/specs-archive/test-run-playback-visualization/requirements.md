# Requirements Document

## Introduction

This feature adds a high-level playback surface for distributed test runs. Each scenario run should produce structured artifacts that capture what happened over time: node lifecycle transitions, partition and replica topology changes, split/merge activity, and component resource load (CPU, memory, bandwidth). The artifacts must support a step-through visualization where operators can move forward and backward through the run timeline.

## Glossary

- **Playback_Bundle**: The set of structured run artifacts written per scenario (`events.ndjson`, `samples.ndjson`, `snapshots.ndjson`, and `manifest.json`)
- **Playback_Event**: A timestamped high-level event representing cluster lifecycle, topology change, chaos action, or load action
- **Topology_Snapshot**: A point-in-time view of cluster topology (nodes, partitions, replica placement)
- **Resource_Sample**: A point-in-time measurement of component load (CPU, memory, network rx/tx)
- **Playback_Viewer**: A static HTML viewer that can load a Playback_Bundle and step timeline state forward/backward
- **Scenario_Step**: A logical point in the run timeline corresponding to one event and nearest telemetry snapshot

## Requirements

### Requirement 1: Structured Playback Artifacts

**User Story:** As an operator, I want each scenario to emit a standardized playback bundle so that I can inspect runs without parsing raw logs.

#### Acceptance Criteria

1. WHEN a scenario run completes, THE harness SHALL write a Playback_Bundle under `test-output/{scenario}/`
2. THE Playback_Bundle SHALL include `events.ndjson`, `samples.ndjson`, `snapshots.ndjson`, and `playback-manifest.json`
3. THE manifest SHALL include scenario name, run start/end timestamps, and file references
4. IF a scenario fails, THEN THE Playback_Bundle SHALL still be written with all data captured up to failure

### Requirement 2: High-Level Event Capture

**User Story:** As an operator, I want high-level events (node creation, partition changes, replica changes, load actions) so that I can understand system behavior quickly.

#### Acceptance Criteria

1. WHEN cluster lifecycle actions occur, THE harness SHALL emit Playback_Events for cluster start/ready/stop and node create/start/stop/remove
2. WHEN chaos or load actions occur, THE harness SHALL emit Playback_Events for action start/completion and key parameters
3. WHEN topology changes are detected from system tables, THE harness SHALL emit Playback_Events for partition create/remove, replica create/remove/move
4. WHEN partition topology indicates split or merge patterns, THE harness SHALL emit split/merge Playback_Events with inferred source/target partition IDs
5. THE event schema SHALL include at minimum: `timestamp`, `type`, `scope`, `entityId`, and `details`

### Requirement 3: Resource Telemetry Capture

**User Story:** As an operator, I want per-step CPU/memory/bandwidth load so that I can correlate topology changes with system pressure.

#### Acceptance Criteria

1. WHILE a scenario is running, THE harness SHALL sample per-node container stats at a configurable interval
2. EACH Resource_Sample SHALL include CPU utilization percent, memory usage bytes, memory limit bytes, rx bytes, and tx bytes
3. THE sampling pipeline SHALL tag each sample with node ID, container ID, and timestamp
4. IF stats collection fails for a node at a sample tick, THEN THE harness SHALL record an error field for that node and continue sampling other nodes

### Requirement 4: Topology Snapshot and Diff

**User Story:** As an operator, I want consistent topology snapshots and event diffs so that the viewer can reconstruct cluster state at any step.

#### Acceptance Criteria

1. WHILE a scenario is running, THE harness SHALL periodically query `nodes`, `partitions`, and `services` system tables to build Topology_Snapshots
2. THE harness SHALL compute diffs between successive snapshots to derive topology Playback_Events
3. EACH snapshot SHALL include enough data to render node list, partition list, and replica placement map
4. IF a snapshot query fails, THEN THE harness SHALL emit a warning event and resume on next interval

### Requirement 5: Step-Through Playback Viewer

**User Story:** As an operator, I want a timeline UI with forward/back controls and a topology diagram so that I can inspect test evolution step by step.

#### Acceptance Criteria

1. THE system SHALL provide a static `playback-viewer.html` that loads Playback_Bundle files from the scenario output directory
2. THE viewer SHALL show a timeline of Playback_Events ordered by timestamp
3. THE viewer SHALL provide step controls: previous event, next event, jump to start, jump to end
4. AT each step, THE viewer SHALL render current topology state and nearest Resource_Sample summary per node
5. THE viewer SHALL highlight event type and impacted entities for the selected step

### Requirement 6: CLI and Report Integration

**User Story:** As a test author, I want playback outputs integrated into existing runner/report flow so that the feature works automatically for all scenarios.

#### Acceptance Criteria

1. WHEN `test/distributed/run.js` executes a scenario, THE harness SHALL automatically start playback capture at scenario start and stop capture at scenario end
2. THE existing JSON report entry SHALL include a `playback` section with manifest path and artifact file paths when available
3. IF playback capture initialization fails, THEN scenario execution SHALL continue and report SHALL include a playback warning

### Requirement 7: Low-Overhead Operation

**User Story:** As a test author, I want playback capture to be lightweight enough for sustained tests.

#### Acceptance Criteria

1. THE playback sampler and snapshot pollers SHALL use configurable intervals with sane defaults
2. THE capture pipeline SHALL stream artifacts incrementally to disk to avoid unbounded in-memory growth
3. THE harness SHALL isolate playback errors from scenario correctness assertions
