# Implementation Plan: Test Run Playback Visualization

## Overview

Implement playback in five ordered phases: spec-driven recorder foundation, cluster integration, report plumbing, viewer, and validation.

## Tasks

- [x] 1. Create playback constants and recorder scaffolding
  - [x] 1.1 Add playback constants to `test/distributed/harness/constants.js`
    - Event/snapshot/sample filenames
    - Default polling intervals
    - Event type constants
    - _Requirements: 1.2, 7.1_

  - [x] 1.2 Implement `test/distributed/harness/playback-recorder.js`
    - Recorder lifecycle: `start()`, `stop()`, `recordEvent()`
    - NDJSON append writers for events, samples, snapshots
    - Manifest generation
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 7.2_

- [x] 2. Implement topology snapshot polling and diff-derived events
  - [x] 2.1 Add periodic snapshot queries (`nodes`, `partitions`, `services`)
    - Persist snapshots to `snapshots.ndjson`
    - _Requirements: 4.1, 4.3_

  - [x] 2.2 Implement topology diff engine
    - Partition create/remove events
    - Replica create/remove/move events
    - Split/merge heuristic events
    - _Requirements: 2.3, 2.4, 4.2_

  - [x]* 2.3 Add unit tests for diff logic
    - Replica move detection
    - Partition split/merge inference
    - _Requirements: 2.4, 4.2_

- [x] 3. Implement resource telemetry capture via Docker stats
  - [x] 3.1 Add `getContainerStats(containerId)` to DockerProvider
    - Parse cpu/memory/network metrics from docker stats payload
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 3.2 Add recorder sampling loop for per-node resource samples
    - Continue on per-node failures and record warnings
    - _Requirements: 3.1, 3.4, 7.3_

  - [x]* 3.3 Add unit tests for stats parsing
    - Validate cpu percent and network byte extraction
    - _Requirements: 3.2_

- [x] 4. Integrate recorder with Cluster and runner/report pipeline
  - [x] 4.1 Wire PlaybackRecorder into `Cluster`
    - Start/stop with cluster lifecycle
    - Record node/chaos/load high-level events
    - _Requirements: 2.1, 2.2, 6.1_

  - [x] 4.2 Surface playback metadata in scenario result and report
    - Add `playback` section to report entries
    - _Requirements: 6.2_

- [x] 5. Add static playback viewer
  - [x] 5.1 Create `test/distributed/harness/playback-viewer.html`
    - Timeline list
    - Step controls (prev/next/start/end)
    - Topology panel and node load panel
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 5.2 Add usage notes in docs
    - How to open viewer against scenario output
    - _Requirements: 5.1_

- [x] 6. Verification checkpoint
  - [x] 6.1 Run targeted harness tests
  - [x] 6.2 Run one distributed scenario and confirm playback artifacts are produced

## Notes

- Tasks marked with `*` are optional for initial MVP but recommended.
- Capture failures must not fail scenario correctness checks.
