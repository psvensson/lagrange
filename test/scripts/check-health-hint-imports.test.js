/**
 * The health-hint import guard is an allow-list: every src module that
 * reaches a hint module (node health buffer, node health collection,
 * resource diagnostics sampler) is named with the names it may take. The
 * planted trees put one violation of each reference form in an otherwise
 * clean tree and require the command to fail on each.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {test} from '../../src/test-helpers/tap.js';
import {
  ALLOWED_ROLE,
  HEALTH_HINT_ALLOWED_IMPORTS,
  HEALTH_HINT_MODULE,
  VIOLATION_KIND,
  auditHealthHintImports,
} from '../../scripts/checks/check-health-hint-imports.js';

const CHECKER_PATH = fileURLToPath(new URL(
  '../../scripts/checks/check-health-hint-imports.js', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

// The hint modules, reduced to their export surface.
const HINT_MODULES = Object.freeze({
  [HEALTH_HINT_MODULE.BUFFER]: 'export const NODE_HEALTH_SERIES = {};\n' +
    'export function recordNodeHealthSample() {}\n' +
    'export const sharedNodeHealthBuffer = {};\n',
  [HEALTH_HINT_MODULE.COLLECTION]:
    'import {sharedNodeHealthBuffer} from \'./node-health-buffer.js\';\n' +
    'export function collectNodeHealth() { return sharedNodeHealthBuffer; }\n',
  [HEALTH_HINT_MODULE.RESOURCE_SAMPLER]: 'export class ResourceDiagnosticsSampler {}\n',
});

const PRODUCER_IMPORT = 'import {NODE_HEALTH_SERIES, recordNodeHealthSample} from ' +
  '\'../diagnostics/node-health-buffer.js\';\n';

// Every allow-list entry, importing exactly what it is allowed.
const ALLOWED_TREE = Object.freeze({
  ...HINT_MODULES,
  'src/admin/admin-websocket-diagnostics-route-methods.js':
    'import {collectNodeHealth} from \'../diagnostics/node-health-collection.js\';\n' +
    '// node-health-buffer.js is a hint; this comment is no reference.\n',
  'src/diagnostics/event-loop-delay-sampler.js':
    'import {sharedNodeHealthBuffer} from \'./node-health-buffer.js\';\n',
  'src/message-group/cdc-handler-apply-diagnostics.js': PRODUCER_IMPORT,
  'src/topology/cdc-group-propagation-wave-diagnostics.js': PRODUCER_IMPORT,
  'src/transport/message-router-peer-traffic-diagnostics.js': PRODUCER_IMPORT +
    'export function reportRouterPeerTraffic() { recordNodeHealthSample(NODE_HEALTH_SERIES); }\n',
  'src/entrypoint-runtime-admin-composition.js': 'import {ResourceDiagnosticsSampler} from ' +
    '\'./diagnostics/resource-diagnostics-sampler.js\';\n',
  'src/config/raft-adaptive-timing-controller.js': 'import {ResourceDiagnosticsSampler} from ' +
    '\'../diagnostics/resource-diagnostics-sampler.js\';\n',
  'src/diagnostics/index.js': 'export {startEventLoopDelaySampling} from ' +
    '\'./event-loop-delay-sampler.js\';\n',
  'src/rebalancer/planner.js': 'import {reportRouterPeerTraffic} from ' +
    '\'../transport/message-router-peer-traffic-diagnostics.js\';\n',
});

// One planted violation per reference form, each with the violation it must
// produce: [path, kind, module].
const PLANTED = Object.freeze([
  {name: 'a static import in a module no rule scoped before',
    files: {'src/control-plane/heartbeat-service.js':
      'import {collectNodeHealth} from \'../diagnostics/node-health-collection.js\';\n'},
    expected: [['src/control-plane/heartbeat-service.js', VIOLATION_KIND.UNLISTED_IMPORT,
      HEALTH_HINT_MODULE.COLLECTION]]},
  {name: 'a createRequire\'d require()',
    files: {'src/node/node-service.js': 'import {createRequire} from \'node:module\';\n' +
      'const require = createRequire(import.meta.url);\n' +
      'const health = require(\'../diagnostics/node-health-buffer.js\');\n'},
    expected: [['src/node/node-service.js', VIOLATION_KIND.UNLISTED_IMPORT,
      HEALTH_HINT_MODULE.BUFFER]]},
  {name: 'an extensionless dynamic import()',
    files: {'src/admin/admin-other.js':
      'export const load = () => import(`../diagnostics/node-health-buffer`);\n'},
    expected: [['src/admin/admin-other.js', VIOLATION_KIND.UNLISTED_IMPORT,
      HEALTH_HINT_MODULE.BUFFER]]},
  {name: 'an index re-export and its importer',
    files: {
      'src/diagnostics/index.js': 'export * from \'./node-health-buffer.js\';\n' +
        'export {startEventLoopDelaySampling} from \'./event-loop-delay-sampler.js\';\n',
      'src/query/router.js':
        'import {sharedNodeHealthBuffer} from \'../diagnostics/index.js\';\n',
      // An importer of a name the index does not relay is not judged.
      'src/query/other.js':
        'import {startEventLoopDelaySampling} from \'../diagnostics/index.js\';\n',
    },
    expected: [
      ['src/diagnostics/index.js', VIOLATION_KIND.UNLISTED_IMPORT, HEALTH_HINT_MODULE.BUFFER],
      ['src/diagnostics/index.js', VIOLATION_KIND.RELAY, HEALTH_HINT_MODULE.BUFFER],
      ['src/query/router.js', VIOLATION_KIND.UNLISTED_IMPORT, 'src/diagnostics/index.js'],
    ]},
  {name: 'a transitive relay through an allowed producer',
    files: {
      'src/transport/message-router-peer-traffic-diagnostics.js': PRODUCER_IMPORT +
        'export {recordNodeHealthSample as relayed};\n',
      'src/rebalancer/planner.js': 'import {relayed} from ' +
        '\'../transport/message-router-peer-traffic-diagnostics.js\';\n',
    },
    expected: [
      ['src/transport/message-router-peer-traffic-diagnostics.js', VIOLATION_KIND.RELAY,
        HEALTH_HINT_MODULE.BUFFER],
      ['src/rebalancer/planner.js', VIOLATION_KIND.UNLISTED_IMPORT,
        'src/transport/message-router-peer-traffic-diagnostics.js'],
    ]},
  {name: 'a producer taking the read handle',
    files: {'src/message-group/cdc-handler-apply-diagnostics.js':
      'import {sharedNodeHealthBuffer} from \'../diagnostics/node-health-buffer.js\';\n'},
    expected: [['src/message-group/cdc-handler-apply-diagnostics.js',
      VIOLATION_KIND.NAME_NOT_ALLOWED, HEALTH_HINT_MODULE.BUFFER]]},
  {name: 'an allow-list entry that no longer imports',
    files: {'src/config/raft-adaptive-timing-controller.js': 'export const settings = {};\n'},
    expected: [['src/config/raft-adaptive-timing-controller.js',
      VIOLATION_KIND.STALE_ALLOW_ENTRY, HEALTH_HINT_MODULE.RESOURCE_SAMPLER]]},
]);

function asFiles(tree) {
  return Object.entries(tree).map(([filePath, text]) => ({path: filePath, text}));
}

function writeTree(t, tree) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'health-hint-imports-'));
  t.teardown(() => fs.rmSync(directory, {recursive: true, force: true}));
  for (const [filePath, text] of Object.entries(tree)) {
    fs.mkdirSync(path.dirname(path.join(directory, filePath)), {recursive: true});
    fs.writeFileSync(path.join(directory, filePath), text);
  }
  return directory;
}

function runChecker(root) {
  return spawnSync(process.execPath, [CHECKER_PATH, '--root', root], {encoding: 'utf8'});
}

test('every allow-listed reader, producer and recorded debt passes', async (t) => {
  const result = auditHealthHintImports(asFiles(ALLOWED_TREE), {wholeTree: true});
  t.same(result.violations, []);
  t.equal(result.hintReachingModules, 7);
  t.equal(runChecker(writeTree(t, ALLOWED_TREE)).status, 0);
});

test('the Raft timing controller is named as recorded debt, and nothing else is', async (t) => {
  const debt = HEALTH_HINT_ALLOWED_IMPORTS.filter(
    (entry) => entry.role === ALLOWED_ROLE.RECORDED_DEBT);
  t.same(debt.map((entry) => entry.importer), ['src/config/raft-adaptive-timing-controller.js']);
  t.match(debt[0].reason, /getReport\(\)/);
});

for (const planted of PLANTED) {
  test(`a planted violation fails the command: ${planted.name}`, async (t) => {
    const tree = {...ALLOWED_TREE, ...planted.files};
    const result = auditHealthHintImports(asFiles(tree), {wholeTree: true});
    t.same(result.violations.map((violation) =>
      [violation.path, violation.kind, violation.module]), planted.expected);
    const run = runChecker(writeTree(t, tree));
    t.equal(run.status, 1, run.stdout);
    for (const [violationPath] of planted.expected) {
      t.match(run.stderr, violationPath);
    }
  });
}

test('no module in this repository reaches node health outside the allow-list', async (t) => {
  const run = spawnSync(process.execPath, [CHECKER_PATH], {cwd: REPO_ROOT, encoding: 'utf8'});
  t.equal(run.status, 0, run.stderr);
  t.match(run.stdout, /0 violation\(s\); [1-9]\d* module\(s\) reach a hint module/u);
  t.match(run.stdout, /1 recorded debt/u);
});
