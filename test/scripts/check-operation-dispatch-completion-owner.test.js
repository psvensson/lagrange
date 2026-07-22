import {test} from '../../src/test-helpers/tap.js';
import {
  collectOperationDispatchCompletionViolations,
  loadSourceByPath,
} from '../../scripts/check-operation-dispatch-completion-owner.js';

const DISPATCH_PATH =
  'src/rebalancer/operation-workflow-dispatch-response-reconcile.js';
const OWNER_PATH =
  'src/rebalancer/operation-workflow-observed-progress-retention.js';
const RECOVERY_PATH =
  'src/rebalancer/operation-workflow-recovery-status-reconcile.js';
const TRANSITION_PATH =
  'src/rebalancer/operation-workflow-transition-persistence.js';

function mutateSource(sourceByPath, filePath, mutate) {
  const mutated = new Map(sourceByPath);
  const source = mutated.get(filePath);
  const nextSource = mutate(source);
  if (nextSource === source) {
    throw new Error(`mutation did not change ${filePath}`);
  }
  mutated.set(filePath, nextSource);
  return mutated;
}

function violationKinds(sourceByPath) {
  return new Set(
    collectOperationDispatchCompletionViolations(sourceByPath)
      .map((violation) => violation.kind),
  );
}

test('operation dispatch completion owner census is green on source',
  async (t) => {
    const sourceByPath = await loadSourceByPath();
    t.same(
      collectOperationDispatchCompletionViolations(sourceByPath),
      [],
      'the checked-in owner cutover has zero structural violations',
    );
  });

test('census rejects a delivered success that skips owner retention',
  async (t) => {
    const sourceByPath = await loadSourceByPath();
    const mutated = mutateSource(sourceByPath, DISPATCH_PATH, (source) =>
      source.replace(
        'this.retainDeliveredCreateProgress',
        'this.ownerRetentionRemoved',
      ),
    );
    const kinds = violationKinds(mutated);
    t.ok(kinds.has('delivered_create_owner_submission_census'));
    t.ok(kinds.has('delivered_create_owner_dominance'));
  });

test('census rejects a caller-local target-progress scheduler', async (t) => {
  const sourceByPath = await loadSourceByPath();
  const mutated = mutateSource(sourceByPath, DISPATCH_PATH, (source) =>
    `${source}\nservice.scheduleRuntimeTargetProgressDispatchVerification();\n`,
  );
  t.ok(
    violationKinds(mutated).has('caller_local_retention_site'),
    'a caller-local scheduler must increase the metric',
  );
});

test('census rejects create-success response coverage drift', async (t) => {
  const sourceByPath = await loadSourceByPath();
  const mutated = mutateSource(sourceByPath, OWNER_PATH, (source) =>
    source.replace(
      'ReplicaOperationResponseStatus.COMPLETED,',
      'ReplicaOperationResponseStatus.ERROR,',
    ),
  );
  t.ok(
    violationKinds(mutated).has('create_success_status_coverage'),
    'status-table drift must increase the metric',
  );
});

test('census rejects missing terminal cleanup', async (t) => {
  const sourceByPath = await loadSourceByPath();
  const mutated = mutateSource(sourceByPath, TRANSITION_PATH, (source) =>
    source.replaceAll(
      '    this.clearObservedProgressRetry(operation?.operationId, {\n' +
      '      includeDeliveredCreateProgress: true,\n' +
      '    });\n',
      '',
    ),
  );
  t.ok(
    violationKinds(mutated).has('terminal_retention_cleanup'),
    'terminal cleanup removal must increase the metric',
  );
});

test('census rejects weak terminal cleanup', async (t) => {
  const sourceByPath = await loadSourceByPath();
  const mutated = mutateSource(sourceByPath, TRANSITION_PATH, (source) =>
    source.replaceAll(
      'includeDeliveredCreateProgress: true',
      'includeDeliveredCreateProgress: false',
    ),
  );
  t.ok(
    violationKinds(mutated).has('terminal_retention_cleanup'),
    'terminal cleanup must explicitly consume delivered-create retention',
  );
});

test('census rejects missing REPLACE target-active cleanup', async (t) => {
  const sourceByPath = await loadSourceByPath();
  const mutated = mutateSource(sourceByPath, RECOVERY_PATH, (source) =>
    source.replace(
      '        this.clearObservedProgressRetry(operation.operationId, {\n' +
      '          includeDeliveredCreateProgress: true,\n' +
      '        });\n',
      '',
    ),
  );
  t.ok(
    violationKinds(mutated).has('replace_target_active_retention_cleanup'),
    'durable REPLACE target progress must consume owner retention',
  );
});

test('census rejects weak REPLACE target-active cleanup', async (t) => {
  const sourceByPath = await loadSourceByPath();
  const mutated = mutateSource(sourceByPath, RECOVERY_PATH, (source) =>
    source.replace(
      'includeDeliveredCreateProgress: true',
      'includeDeliveredCreateProgress: false',
    ),
  );
  t.ok(
    violationKinds(mutated).has('replace_target_active_retention_cleanup'),
    'REPLACE target completion must explicitly consume delivered-create retention',
  );
});

test('census rejects a second CREATE delivery sink', async (t) => {
  const sourceByPath = await loadSourceByPath();
  const mutated = mutateSource(sourceByPath, DISPATCH_PATH, (source) =>
    `${source}\nowner.deliverReplicaOperationRequest();\n`,
  );
  t.ok(
    violationKinds(mutated).has('create_delivery_sink_census'),
    'a second transport sink must increase the metric',
  );
});

test('census rejects a parallel delivered-create registry', async (t) => {
  const sourceByPath = await loadSourceByPath();
  const mutated = mutateSource(sourceByPath, OWNER_PATH, (source) =>
    `${source}\nthis.operationDeliveredCreateProgress = new Map();\n`,
  );
  t.ok(
    violationKinds(mutated).has('parallel_retention_registry'),
    'a parallel map must increase the metric',
  );
});
