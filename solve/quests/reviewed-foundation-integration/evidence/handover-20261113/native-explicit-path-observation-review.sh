set -eu
if [ "$LAB_HOST" != local-workstation ]; then
  printf 'HOST_ASSIGNMENT_MISMATCH expected=local-workstation actual=%s\n' "$LAB_HOST"
  exit 96
fi
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
unset NODE_OPTIONS NODE_TEST_CONTEXT LAGRANGE_RETRY_FAILED_ONCE
test "$(node --version)" = v22.23.2
printf 'LAB_HOST=%s\n' "$LAB_HOST"
node --version
node --input-type=module - <<'LAGRANGE_EXPLICIT_ROUTE_OBSERVATION'
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, realpath} from 'node:fs/promises';
import {execGit} from './scripts/checks/git-invocation.js';
import {gitProcessEnvironment} from './scripts/checks/git-process-environment.js';
import {discoverFleet, fleetRequirement} from './scripts/lab/fleet-discovery.js';
import {loadState, statePath} from './scripts/lab/state.js';

const sourceSha = '__FINAL_CANDIDATE_REMOTE_SHA__';
const sourceTree = '__FINAL_CANDIDATE_TREE__';
const sourceSrcTree = '__FINAL_CANDIDATE_SRC_TREE__';
const expectedInventoryHash = 'd10bc1b11c2724a157b45d21c07496b93192f32787b390387d23a5595df7ae80';
const candidatePath = '/home/peter/projects/lagrange';
const peerNames = ['tv-dator', 'adams-gamla'];
const names = ['(controller)', ...peerNames];
const shaPattern = /^[0-9a-f]{40}$/u;
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const emit = (name, value) => console.log(name + '=' + JSON.stringify(value));
// The canonical capability shell uses ordinary git -C; its inherited
// environment must already exclude repository pointers, through their owner.
const cleanEnvironment = gitProcessEnvironment();
for (const name of Object.keys(process.env)) {
  if (!Object.hasOwn(cleanEnvironment, name)) delete process.env[name];
}
const root = await realpath(process.cwd());
const git = (args) => execGit(args,
  {cwd: root, env: gitProcessEnvironment(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
const sourceGuard = () => {
  assert.equal(git(['rev-parse', 'HEAD']), sourceSha, 'source HEAD');
  assert.equal(git(['rev-parse', 'HEAD^{tree}']), sourceTree, 'source tree');
  assert.equal(git(['rev-parse', 'HEAD:src']), sourceSrcTree, 'source src tree');
  git(['diff', '--quiet']);
  git(['diff', '--cached', '--quiet']);
  assert.equal(git(['status', '--porcelain']), '', 'clean source checkout');
};
let firstFailure;
let failureObserved = false;
let normalPath;
let originalBytes;
const fail = (stage, error) => {
  if (!failureObserved) {
    failureObserved = true;
    firstFailure = {stage, error};
  }
  emit('EXPLICIT_ROUTE_UNAVAILABLE', {stage, name: error?.name ?? null,
    code: error?.code ?? null, message: error?.message ?? String(error)});
};
emit('EXPLICIT_ROUTE_SCOPE', 'one fresh read-only observation of two explicitly named candidate paths through the canonical fleet owner; no test, provisioning, normal inventory write, cached readiness injection or alternate path');
emit('EXPLICIT_ROUTE_IMPORT_SCOPE', 'built-in-only canonical fleet/state/Git closure; no npm or SQLite dependency is used or remeasured');
try {
  sourceGuard();
  emit('EXPLICIT_ROUTE_SOURCE', {sha: sourceSha, tree: sourceTree, srcTree: sourceSrcTree,
    owners: Object.fromEntries([
      'scripts/lab/fleet-discovery.js', 'scripts/lab/test-capability.js',
      'scripts/lab/machine-hold.js', 'scripts/lab/machine-lock-constants.js',
      'scripts/lab/placement-source.js', 'scripts/lab/placement-constants.js',
      'scripts/lab/process.js', 'scripts/lab/remote-command.js', 'scripts/lab/state.js',
      'scripts/checks/git-invocation.js', 'scripts/checks/git-process-environment.js',
    ].map((file) => [file, git(['rev-parse', 'HEAD:' + file])]))});
  normalPath = statePath();
  const state = await loadState({allowMissing: false});
  originalBytes = await readFile(normalPath);
  assert.deepEqual(state, JSON.parse(originalBytes), 'parsed normal inventory equals captured bytes');
  assert.equal(hash(originalBytes), expectedInventoryHash, 'exact previously reviewed inventory');
  assert.equal(state.version, 1, 'normal inventory schema');
  assert.ok(isRecord(state.nodes) && isRecord(state.controller), 'normal inventory records');
  const nodes = peerNames.map((name) => {
    const record = state.nodes[name];
    assert.ok(isRecord(record) && record.name === name, 'exact named peer ' + name);
    assert.ok(typeof record.ssh === 'string' && record.ssh.trim() &&
      !record.ssh.startsWith('-'), 'existing non-option SSH target ' + name);
    // This is one explicit candidate input for this observation. It is not
    // taken from cache at runtime and no other/default path is attempted.
    return {name, ssh: record.ssh, repoPath: candidatePath};
  });
  emit('EXPLICIT_ROUTE_INPUT', {normalInventoryBytes: originalBytes.length,
    normalInventorySha256: hash(originalBytes), candidatePath,
    pathBasis: 'explicit candidate selected from prior observation3684, not current path attestation',
    peers: nodes.map(({name, ssh, repoPath}) => ({name, repoPath, sshTargetSha256: hash(ssh)})),
    controllerPath: root, normalInventoryWrite: false});
  const requirement = fleetRequirement(root, sourceSha);
  assert.equal(requirement.source, sourceSha, 'requirement belongs to exact observed commit');
  emit('EXPLICIT_ROUTE_REQUIREMENT', requirement);
  const startedAtMs = Date.now();
  emit('EXPLICIT_ROUTE_STARTED', {atMs: startedAtMs, at: new Date(startedAtMs).toISOString(),
    perProbeBoundMs: 60000, targets: names});
  // No injected probe/capture collaborator and no recordFleet/saveState.
  const fleet = await discoverFleet({nodes, controllerRepoPath: root, ...requirement});
  const endedAtMs = Date.now();
  emit('EXPLICIT_ROUTE_ENDED', {atMs: endedAtMs, at: new Date(endedAtMs).toISOString()});
  emit('EXPLICIT_ROUTE_FULL_RETURNED_FLEET', fleet);
  assert.ok(Array.isArray(fleet) && fleet.length === names.length &&
    names.every((name) => fleet.filter((entry) => entry?.name === name).length === 1),
  'exact restricted three-entry observation');
  const identities = [];
  for (const name of names) {
    const entry = fleet.find((item) => item.name === name);
    assert.equal(entry.controller, name === '(controller)', 'controller identity ' + name);
    assert.equal(entry.error, null, 'fresh canonical probe returned no error for ' + name);
    assert.equal(entry.sameMachineAs, null, 'no duplicate machine for ' + name);
    const capability = entry.capability;
    assert.ok(isRecord(capability), 'fresh capability for ' + name);
    assert.ok(Number.isFinite(capability.probedAt) && capability.probedAt >= startedAtMs &&
      capability.probedAt <= endedAtMs, 'in-window fresh observation for ' + name);
    assert.ok(typeof capability.bootId === 'string' && capability.bootId.length > 0,
      'observed boot identity for ' + name);
    identities.push(capability.bootId);
    assert.equal(capability.repoPath, name === '(controller)' ? root : candidatePath,
      'exact supplied/expanded path for ' + name);
    assert.equal(capability.repo.present, true, 'observed .git presence for ' + name);
    assert.match(capability.repo.head, shaPattern, 'fresh Git HEAD for ' + name);
    assert.equal(capability.nodeVersion, 'v22.23.2', 'observed pinned Node for ' + name);
    if (name === '(controller)') assert.equal(capability.repo.head, sourceSha);
  }
  assert.equal(new Set(identities).size, names.length, 'three distinct current boot identities');
  emit('EXPLICIT_ROUTE_CANDIDATE_PATHS_OBSERVED', true);
} catch (error) {
  fail('observation', error);
} finally {
  if (originalBytes) {
    try {
      const finalBytes = await readFile(normalPath);
      const unchanged = finalBytes.equals(originalBytes);
      emit('EXPLICIT_ROUTE_NORMAL_INVENTORY_AFTER', {unchanged, bytes: finalBytes.length,
        sha256: hash(finalBytes)});
      assert.ok(unchanged, 'normal inventory unchanged during observation');
    } catch (error) { fail('normal-inventory-final-guard', error); }
  }
  try {
    sourceGuard();
    emit('EXPLICIT_ROUTE_SOURCE_FINAL_GUARD', true);
  } catch (error) { fail('source-final-guard', error); }
}
emit('EXPLICIT_ROUTE_LIMIT', 'full returned owner records are not raw transport transcripts; repoPath echoes supplied input, not realpath; repo.present means .git exists. Actual remote heads and readiness gaps remain as observed. No remote clean tree, origin, final candidate presence, SQLite, corpus, universal descendant closure or delivery is established. A deadline is adverse with incomplete output/unconfirmed group closure and cannot justify retry. Normal execution is not configured by this observation.');
emit('EXPLICIT_ROUTE_RESULT', {ok: !failureObserved,
  firstFailureStage: firstFailure?.stage ?? null, exitCode: failureObserved ? 95 : 0});
process.exitCode = failureObserved ? 95 : 0;
LAGRANGE_EXPLICIT_ROUTE_OBSERVATION
