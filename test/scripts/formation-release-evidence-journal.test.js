import {test} from '../../src/test-helpers/tap.js';
import {mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createFormationReleaseEvidenceJournal,
} from '../../scripts/checks/formation-release-handoff-evidence-journal.js';
import {ClusterLifecycleBase} from
  '../distributed/harness/cluster-class-lifecycle-base.js';
import {projectFormationReleaseEvidenceJournalEntries} from
  '../../scripts/checks/formation-release-handoff-gcp-analysis.js';
import {
  analyzeFormationReleaseEvents,
  projectLiveLogEntriesToEvents,
} from '../../scripts/checks/formation-release-handoff-gcp-analysis.js';
import {buildPassingEvents, FINGERPRINT} from
  './formation-release-handoff-gcp-fixture.js';

const BOOT_MESSAGE = Object.freeze({
  time: '2026-08-26T00:00:00.000Z',
  nodeId: 'node-a',
  msg: 'STARTING',
  srcFingerprintMatches: true,
  bootedSrcFingerprint: '0123456789abcdef',
  expectedSrcFingerprint: '0123456789abcdef',
});

test('formation evidence journal retains selected raw payloads without ' +
  'inventing a logs-table authority', (t) => {
  const journal = createFormationReleaseEvidenceJournal();
  journal.accept({nodeId: 'node-a', payload: JSON.stringify({msg: 'noise'})});
  journal.accept({nodeId: 'node-a', payload: JSON.stringify(BOOT_MESSAGE)});

  const snapshot = journal.snapshot();
  t.equal(snapshot.healthy, true);
  t.equal(snapshot.entryCount, 1);
  t.same(
    projectFormationReleaseEvidenceJournalEntries(snapshot.entries).events,
    [BOOT_MESSAGE],
  );
  t.same(snapshot.observedNodeIds, ['node-a']);
  t.end();
});

test('formation evidence journal never evicts and fails closed on capacity',
  (t) => {
    const journal = createFormationReleaseEvidenceJournal({
      maxEntries: 1,
      maxBytes: 4096,
    });
    journal.accept({nodeId: 'node-a', payload: JSON.stringify(BOOT_MESSAGE)});
    journal.accept({
      nodeId: 'node-b',
      payload: JSON.stringify({...BOOT_MESSAGE, nodeId: 'node-b'}),
    });

    const snapshot = journal.snapshot();
    t.equal(snapshot.healthy, false);
    t.equal(snapshot.overflowed, true);
    t.equal(snapshot.entryCount, 1, 'the first proof is retained, never evicted');
    t.match(snapshot.failure, /capacity/);
    t.end();
  });

test('formation evidence journal rejects a relevant payload from the wrong ' +
  'node and records sink failures', (t) => {
  const mismatch = createFormationReleaseEvidenceJournal();
  mismatch.accept({
    nodeId: 'node-b',
    payload: JSON.stringify(BOOT_MESSAGE),
  });
  const failed = createFormationReleaseEvidenceJournal();
  failed.fail(new Error('stream unavailable'));

  t.equal(mismatch.snapshot().healthy, false);
  t.match(mismatch.snapshot().failure, /node identity mismatch/);
  t.equal(failed.snapshot().healthy, false);
  t.match(failed.snapshot().failure, /stream unavailable/);
  t.end();
});

test('formation evidence journal ignores malformed noise but rejects ' +
  'malformed claimed formation evidence', (t) => {
  const noise = createFormationReleaseEvidenceJournal();
  noise.accept({nodeId: 'node-a', payload: 'ordinary non-json output'});
  const malformed = createFormationReleaseEvidenceJournal();
  malformed.accept({
    nodeId: 'node-a',
    payload: JSON.stringify({
      nodeId: 'node-a',
      msg: 'Formation release handoff authority transition',
      formationReleaseHandoffState: 'active',
    }),
  });

  t.equal(noise.snapshot().healthy, true);
  t.equal(noise.snapshot().entryCount, 0);
  t.equal(malformed.snapshot().healthy, false);
  t.match(malformed.snapshot().failure, /malformed formation evidence/);
  t.end();
});

test('cluster lifetime raw-stream owner forwards accepted node payloads into ' +
  'the scenario journal before observation', async (t) => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'formation-journal-'));
  let resolveAttached;
  const attached = new Promise((resolve) => {
    resolveAttached = resolve;
  });
  const journal = createFormationReleaseEvidenceJournal();
  const cluster = new ClusterLifecycleBase({
    outputDir,
    rawLogEvidenceSink: journal,
    scenarioName: 'formation-journal',
  }, [], []);
  cluster._beginNodeLogStream('node-a', {
    containerId: 'container-a',
    _dockerProvider: {
      followContainerLogStream(_containerId, options) {
        resolveAttached(options);
        return {stop() {}};
      },
    },
  });
  const stream = await attached;
  stream.onLine(
    '2026-08-26T00:00:00.000Z',
    JSON.stringify(BOOT_MESSAGE),
  );
  await cluster._nodeLogStreamers.get('node-a').stop();

  t.equal(journal.snapshot().healthy, true);
  t.same(
    projectFormationReleaseEvidenceJournalEntries(
      journal.snapshot().entries,
    ).events,
    [BOOT_MESSAGE],
  );
  await rm(outputDir, {recursive: true, force: true});
  t.end();
});

test('cluster raw-stream owner fails the journal closed when streaming is ' +
  'unsupported or unavailable', (t) => {
  const unsupported = createFormationReleaseEvidenceJournal();
  const fileCluster = new ClusterLifecycleBase({
    outputDir: '/tmp/formation-journal-file-mode',
    rawLogEvidenceSink: unsupported,
  }, [], []);
  fileCluster._isFileLoggingEnabled = () => true;
  fileCluster._beginNodeLogStream('node-a', {
    containerId: 'container-a',
    _dockerProvider: {},
  });
  const unavailable = createFormationReleaseEvidenceJournal();
  const missingCluster = new ClusterLifecycleBase({
    outputDir: '/tmp/formation-journal-missing-stream',
    rawLogEvidenceSink: unavailable,
  }, [], []);
  missingCluster._beginNodeLogStream('node-a', {});

  t.equal(unsupported.snapshot().healthy, false);
  t.match(unsupported.snapshot().failure, /file-logging mode/);
  t.equal(unavailable.snapshot().healthy, false);
  t.match(unavailable.snapshot().failure, /prerequisites/);
  t.end();
});

test('bounded logs-table eviction and seed-only evidence cannot substitute ' +
  'for the complete multi-node raw journal', (t) => {
  const events = buildPassingEvents();
  const journal = createFormationReleaseEvidenceJournal();
  for (let index = 0; index < events.length; index += 1) {
    journal.accept({
      nodeId: events[index].nodeId,
      payload: JSON.stringify(events[index]),
    });
  }
  const boundedLogsTable = events.map((event, index) => ({
    log_id: `formation-${index}`,
    node_id: event.nodeId,
    message: event.msg,
    metadata: JSON.stringify(event),
    timestamp: Date.parse(event.time),
  }));
  for (let index = 0; index < 1_000; index += 1) {
    boundedLogsTable.push({
      log_id: `noise-${index}`,
      node_id: 'seed',
      message: 'readiness noise',
      metadata: '{}',
      timestamp: index,
    });
  }
  const evictedProjection = projectLiveLogEntriesToEvents(
    boundedLogsTable.slice(-1_000),
  );
  const seedOnly = events.filter((event) =>
    event.nodeId === 'seed' ||
    Object.hasOwn(event, 'srcFingerprintMatches'));
  const rawProjection = projectFormationReleaseEvidenceJournalEntries(
    journal.snapshot().entries,
  );

  t.equal(
    analyzeFormationReleaseEvents(evictedProjection, FINGERPRINT).closurePassed,
    false,
    'the exact bounded table shape loses every early formation proof',
  );
  t.equal(
    analyzeFormationReleaseEvents(seedOnly, FINGERPRINT).closurePassed,
    false,
    'seed authority without both joiner consumers is not closure evidence',
  );
  t.equal(rawProjection.invalidEntryCount, 0);
  t.equal(
    analyzeFormationReleaseEvents(rawProjection.events, FINGERPRINT).closurePassed,
    true,
    'the pre-start multi-node raw journal retains the complete witness',
  );
  t.end();
});
