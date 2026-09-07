/**
 * What the deterministic-cloud-gate frontiers each sealed.
 *
 * The migration copied one receipt file into three sibling quest directories,
 * so two quests whose own claims all pass were held red by the third quest's
 * hosted-gate entry. This table is the split: each frontier's receipt ids and
 * the file behind each, exactly as the shared receipt already carried them.
 * Nothing about any claim or its acceptance changes here.
 *
 * The hosted-gate frontier is deliberately absent. Its evidence is three hosted
 * runs on one published head, which no test file can stand in for.
 */

const RUNNER = 'node scripts/run-test-files.js --jobs=1 ';
const QUEST_DIRECTORY = Object.freeze(['solve', 'quests']);
const EVIDENCE_SEGMENTS = Object.freeze(['evidence', 'receipt.json']);
const PATH_JOINER = '/';

const arrayMap = Function.call.bind(Array.prototype.map);

const NONDETERMINISM_DEFECTS = Object.freeze([
  ['check-operation-dispatch-completion-owner-determinism',
    'test/scripts/check-operation-dispatch-completion-owner.test.js',
    'the shifting subtest identity was the tap cap expiring mid-file, not a race'],
  ['impact-proof-cone-consumers-determinism',
    'test/scripts/impact-proof-cone-consumers.test.js',
    'the live-census selector agrees with the classifier under repeated runs'],
]);

const RESOURCE_SENSITIVE_EXECUTION_CONTRACT = Object.freeze([
  ['cdc-current-epoch-propagation',
    'test/cdc/current-epoch-propagation.integration.test.js',
    'the integration-classified cdc test passes in its serial lane'],
  ['cli-service-init-wasm-scaffold',
    'test/cli/service-init-wasm-scaffold.test.js',
    'the wizer missing-directory cascade is gone once the 300s declaration is honoured'],
  ['dt6-cpu-saturation-missed-budget-spike',
    'test/convergence/dt6-cpu-saturation-missed-budget-spike.test.js',
    'the heaviest dt6 scenario completes within its declared watchdog'],
  ['dt6-rebalancer-timeout-detection-network',
    'test/convergence/dt6-rebalancer-timeout-detection-network.test.js',
    'virtual-clock detection assertions hold with an honest wall-clock watchdog'],
  ['dt6-rebalancer-timeout-orchestration-network',
    'test/convergence/dt6-rebalancer-timeout-orchestration-network.test.js',
    'virtual-time backoff assertions hold with an honest wall-clock watchdog'],
  ['minimal-deployment-request-cell-runtime-readiness',
    'test/runtime/minimal-deployment-request-cell-runtime-readiness.test.js',
    'happy-path invocation no longer races a 100ms shared wall budget, while wall exhaustion is still proved by controlled delay'],
  ['service-cell-bridge-roundtrip',
    'test/runtime/service-cell-bridge-roundtrip.test.js',
    'component startup succeeds inside the serial toolchain lane'],
  ['service-cell-worker-modes',
    'test/runtime/service-cell-worker-modes.test.js',
    'request and call mode cells start within the product startup timeout'],
  ['service-cell-world-abi',
    'test/wasm-service/service-cell-world-abi.test.js',
    'the world ABI suite completes under its own declared timeout'],
  ['service-compiler-editor-typings',
    'test/service/service-compiler-editor-typings.test.js',
    'the folded TOOLCHAIN_TIMEOUT_MS * 2 declaration is honoured'],
  ['service-compiler-module-shape-spike',
    'test/wasm-service/service-compiler-module-shape-spike.test.js',
    'the module-shape spike completes under its own declared timeout'],
]);

/**
 * The receipts a frontier seals, in the order this table declares them.
 * @param {Array} sealed
 * @return {Object[]}
 */
function receiptsFor(sealed) {
  return Object.freeze(arrayMap(sealed, ([id, file, detail]) =>
    Object.freeze({id, command: `${RUNNER}${file}`, detail})));
}

/**
 * Where a quest's receipt is written.
 * @param {string} questId
 * @return {string}
 */
function receiptPath(questId) {
  return [...QUEST_DIRECTORY, questId, ...EVIDENCE_SEGMENTS].join(PATH_JOINER);
}

export {
  NONDETERMINISM_DEFECTS, RESOURCE_SENSITIVE_EXECUTION_CONTRACT,
  receiptPath, receiptsFor,
};
