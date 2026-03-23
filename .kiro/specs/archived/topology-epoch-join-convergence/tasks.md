# Tasks

## Phase 1: Spec And Regressions

- [x] 1. Add failing bootstrap snapshot envelope tests
  - Cover the published topology metadata and bootstrap response fields.
  - _Requirements: 1.1, 1.2, 1.3, 4.1_

- [x] 2. Add failing join hydration/readiness tests
  - Cover bootstrap epoch application to `SystemTableCache`.
  - Cover snapshot-metadata-based readiness diagnostics and required node IDs.
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.2, 4.3_

## Phase 2: Owner Implementation

- [x] 3. Implement the bootstrap topology snapshot owner
  - Add the shared builder that produces `systemTableSnapshots` plus
    `topologySnapshotMeta`.
  - Wire `BootstrapAPI` to publish the new envelope.
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 4. Implement join-side bootstrap topology hydration state
  - Apply the published bootstrap epoch to the local cache watermark.
  - Retain published topology snapshot metadata on the joining service.
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 5. Update canonical join readiness to consume snapshot metadata
  - Use bootstrap topology snapshot metadata for fallback required-node and
    mesh-membership diagnostics.
  - Publish topology snapshot epoch and applied topology epoch diagnostics.
  - _Requirements: 3.1, 3.2, 3.3_

## Phase 3: Verification

- [x] 6. Run focused bootstrap/join suites
  - _Requirements: 4.1, 4.2, 4.3_
