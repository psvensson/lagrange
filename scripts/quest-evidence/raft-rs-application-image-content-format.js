#!/usr/bin/env node
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';
import {runQuestEvidenceHarness} from './harness-runtime.js';

refuseUnderProbe('the application image content evidence harness');

runQuestEvidenceHarness({
  questId: 'raft-rs-application-image-content-format',
  outputFile: 'test-output/solve/raft-rs-application-image-content-format.receipt.json',
  receipts: [
    {
      id: 'direct-v2-content-format',
      testFile: 'test/raft/raft-rs-backend/partition-snapshot-content-format-future.test.js',
      detail: 'Direct checkpoint owner seals and validates exact v2 M/D/C/N content.',
    },
    {
      id: 'production-paths-remain-inactive',
      testFile: 'test/raft/raft-rs-backend/partition-snapshot-content-no-activation.test.js',
      detail: 'The registered callback and cadence do not activate v2 publication.',
    },
    {
      id: 'registered-callback-no-seal-no-dial',
      testFile: 'test/raft/raft-rs-backend/partition-snapshot-content-no-live-activation.test.js',
      testNamePattern: '^dependency A registered callback cannot seal or dial v2$',
      detail: 'Real registered callback reaches typed content refusal with no seal or socket lookup.',
    },
    {
      id: 'legacy-v1-create-remains-supported',
      testFile: 'test/raft/raft-rs-backend/replica-image-checkpoint-transfer.test.js',
      detail: 'Existing v1 CREATE admission/install behavior remains green.',
    },
  ],
});
