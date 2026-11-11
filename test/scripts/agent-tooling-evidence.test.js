// Isolated admission controls. These records are test inputs, never client or
// comparative-system observations. Live component proof is retained separately.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {configure} from '../../scripts/agent-tooling/configuration.js';
import {configurationIdentity, sourceDigests, sourceFiles,
  validateObservation, validateReview} from '../../scripts/agent-tooling/evidence.js';
import {validateComponent} from '../../scripts/agent-tooling/component-evidence.js';
import {applicableFiles} from '../../scripts/agent-tooling/evidence-scope.js';
import {loadProfile, sha256} from '../../scripts/agent-tooling/profile.js';
import {readRuntime, recordRuntime, runtimeDirectory} from '../../scripts/agent-tooling/runtime.js';
import {run} from '../../scripts/agent-tooling/process.js';
import {headSha} from '../../scripts/solve/guards.js';
import {computeCandidateDigest} from '../../scripts/solve/commands.js';
import {execGit} from '../../scripts/checks/git-invocation.js';
import {materializedEvidencePath, readMaterializedEvidence} from '../../scripts/solve/evidence-store.js';
import {OBSERVATION_PHASE} from '../../scripts/agent-tooling/evidence-contract.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROJECT = '.serena/project.yml';
const HOME_CONFIG = '.codex/quest-tooling/serena-home/serena_config.yml';

function write(root, file, bytes) {
  fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
  fs.writeFileSync(path.join(root, file), bytes);
}

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tooling-admission-control-')));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  for (const file of sourceFiles(REPO)) write(root, file, fs.readFileSync(path.join(REPO, file)));
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  const {profile, digest} = loadProfile(root);
  configure(root, profile, digest, 'setup', {[PROJECT]: '{}\n', [HOME_CONFIG]: '{}\n'}, () => {});
  const directory = runtimeDirectory(profile);
  const dependency = profile.upstreams.context7;
  write(root, `${directory}/package.json`, '{}');
  write(root, `${directory}/package-lock.json`, JSON.stringify({packages: {
    [`node_modules/${dependency.package}`]: {version: dependency.version, integrity: dependency.integrity},
  }}));
  write(root, `${directory}/node_modules/${dependency.package}/package.json`,
    JSON.stringify({name: dependency.package, version: dependency.version}));
  recordRuntime(root, profile);
  // These admission controls send no stdin; retain actual child output and errors.
  const execution = run(root, process.execPath, ['--version'], {stdio: ['ignore', 'pipe', 'pipe']});
  assert.equal(execution.error, null, 'admission fixture requires an actual completed command');
  const source = {root, commit: headSha(REPO), files: sourceDigests(root)};
  const configuration = configurationIdentity(root, profile);
  const observation = {schema: 'quest-agent-tooling-observation/1', id: 'isolated-command-control',
    phase: 'control', kind: 'command', ...execution, host: profile.host, profileDigest: digest,
    source, sourceAfter: structuredClone(source), configuration,
    configurationAfter: structuredClone(configuration),
    stdoutSha256: sha256(execution.stdout), stderrSha256: sha256(execution.stderr)};
  return {root, profile, observation};
}

test('actual command output validates in an isolated control, without establishing a component', (t) => {
  const {root, profile, observation} = fixture(t);
  assert.deepEqual(validateObservation(root, observation, profile), []);
});

test('old observations cannot be rebound with a new envelope or changed effective configuration', (t) => {
  const {root, profile, observation} = fixture(t);
  const changes = [
    (copy) => {
      copy.profileDigest = 'different';
    },
    (copy) => {
      copy.source.files['scripts/agent-tooling/profile.json'] = 'different';
    },
    (copy) => {
      delete copy.sourceAfter;
    },
    (copy) => {
      copy.sourceAfter.commit = 'different';
    },
    (copy) => {
      copy.configuration.configDigest = 'different';
    },
    (copy) => {
      copy.configurationAfter.runtime.manifestDigest = 'different';
    },
    (copy) => {
      copy.cwd = path.dirname(root);
    },
    (copy) => {
      copy.host.version = '0.0.0';
    },
    (copy) => {
      copy.stdout += 'altered';
    },
    (copy) => {
      copy.stdout = ''; copy.stdoutSha256 = sha256('');
    },
    (copy) => {
      copy.phase = 'manually-passed';
    },
  ];
  for (const change of changes) {
    const copy = structuredClone(observation);
    change(copy);
    assert.throws(() => validateObservation(root, copy, profile), /tooling_evidence_invalid/u);
  }
  write(root, 'scripts/agent-tooling/profile.js', 'changed source');
  assert.throws(() => validateObservation(root, observation, profile), /stale source/u);
});

test('captured source changes during execution are refused even when the after bytes are current', (t) => {
  const {root, profile, observation} = fixture(t);
  observation.source.files['scripts/agent-tooling/profile.js'] = sha256('old source');
  assert.throws(() => validateObservation(root, observation, profile), /source changed during execution/u);
});

test('historical observations require their actual source snapshot and remain historical', (t) => {
  const {root, profile, observation} = fixture(t);
  observation.phase = 'baseline';
  assert.throws(() => validateObservation(root, observation, profile), /historical source bytes missing/u);
  observation.sourceContents = Object.fromEntries(Object.keys(observation.source.files)
    .map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
  assert.deepEqual(validateObservation(root, observation, profile), []);
  observation.sourceContents['scripts/agent-tooling/profile.js'] += '\n';
  assert.throws(() => validateObservation(root, observation, profile), /historical source bytes missing/u);
});

function baselineControl(t) {
  const control = fixture(t);
  control.observation.phase = OBSERVATION_PHASE.BASELINE;
  control.observation.sourceContents = Object.fromEntries(
    Object.keys(control.observation.source.files)
      .map((file) => [file, fs.readFileSync(path.join(control.root, file), 'utf8')]));
  return control;
}

test('failed baseline admission preserves unavailable streams for each failure state', (t) => {
  const {root, profile, observation} = baselineControl(t);
  const failures = [
    {exitCode: 1, error: null, signal: null},
    {exitCode: null, error: null, signal: null},
    {exitCode: 0, error: 'isolated error admission control', signal: null},
    {exitCode: 0, error: null, signal: 'SIGKILL'},
  ];
  for (const failure of failures) {
    for (const streams of [['stdout'], ['stderr'], ['stdout', 'stderr']]) {
      const copy = {...structuredClone(observation), ...failure};
      for (const stream of streams) {
        copy[stream] = null;
        copy[`${stream}Sha256`] = null;
      }
      assert.deepEqual(validateObservation(root, copy, profile), []);
    }
  }
});

for (const phase of Object.values(OBSERVATION_PHASE)) {
  test(`${phase} admission refuses unavailable streams on an otherwise successful result`, (t) => {
    const {root, profile, observation} = baselineControl(t);
    for (const stream of ['stdout', 'stderr']) {
      const copy = {...structuredClone(observation), phase,
        [stream]: null, [`${stream}Sha256`]: null};
      assert.throws(() => validateObservation(root, copy, profile),
        new RegExp(`unavailable ${stream}`, 'u'));
    }
  });
}

test('every positive phase rejects failed observations even with valid null digest pairs', (t) => {
  const {root, profile, observation} = baselineControl(t);
  for (const phase of Object.values(OBSERVATION_PHASE)) {
    if (phase === OBSERVATION_PHASE.BASELINE) continue;
    const copy = {...structuredClone(observation), phase, exitCode: null,
      error: 'isolated failure admission control', stdout: null, stderr: null,
      stdoutSha256: null, stderrSha256: null};
    assert.throws(() => validateObservation(root, copy, profile), /execution incomplete/u);
  }
});

test('failed baseline admission rejects malformed streams and mismatched digest pairs', (t) => {
  const {root, profile, observation} = baselineControl(t);
  const invalidPairs = [
    [null, sha256('')], [null, undefined], [undefined, null], [undefined, undefined],
    [0, null], [false, null], [{}, null], [[], null],
    ['', null], ['', undefined], ['', {}], ['', sha256('different bytes')],
  ];
  for (const stream of ['stdout', 'stderr']) {
    for (const [output, digest] of invalidPairs) {
      const copy = {...structuredClone(observation), exitCode: 1,
        [stream]: output, [`${stream}Sha256`]: digest};
      assert.throws(() => validateObservation(root, copy, profile),
        new RegExp(`(?:altered|unavailable) ${stream}`, 'u'));
    }
  }
});

test('admission requires explicit native status, error and signal shapes in every phase', (t) => {
  const {root, profile, observation} = baselineControl(t);
  for (const phase of Object.values(OBSERVATION_PHASE)) {
    for (const field of ['exitCode', 'error', 'signal']) {
      const invalid = field === 'exitCode' ? [undefined, '0', false, 0.5, NaN] :
        [undefined, 0, false, {}, []];
      for (const value of invalid) {
        const copy = {...structuredClone(observation), phase, [field]: value};
        assert.throws(() => validateObservation(root, copy, profile),
          /execution status, error or signal invalid/u);
      }
    }
  }
});

test('genuine empty strings retain their exact hashes and remain distinct from missing output', (t) => {
  const {root, profile, observation} = baselineControl(t);
  const empty = {...observation, stdout: '', stderr: '',
    stdoutSha256: sha256(''), stderrSha256: sha256('')};
  assert.equal(empty.stdoutSha256,
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.deepEqual(validateObservation(root, {...empty, exitCode: 1}, profile), []);
  assert.throws(() => validateObservation(root, empty, profile), /output missing/u);
  const positive = {...empty, phase: OBSERVATION_PHASE.CANDIDATE,
    stderr: 'captured output', stderrSha256: sha256('captured output')};
  assert.deepEqual(validateObservation(root, positive, profile), []);
});

test('a failed Codex baseline with unavailable stdout retains no invented events', (t) => {
  const {root, profile, observation} = baselineControl(t);
  Object.assign(observation, {kind: 'codex', command: ['codex', 'exec', '--json'],
    exitCode: null, error: 'isolated missing executable admission control',
    stdout: null, stderr: null, stdoutSha256: null, stderrSha256: null});
  assert.deepEqual(validateObservation(root, observation, profile), []);
  observation.phase = OBSERVATION_PHASE.CANDIDATE;
  assert.throws(() => validateObservation(root, observation, profile), /execution incomplete/u);
});

test('runtime binding detects changed executable metadata and removed files', (t) => {
  const {root, profile} = fixture(t);
  const file = `${runtimeDirectory(profile)}/node_modules/@upstash/context7-mcp/package.json`;
  write(root, file, '{}');
  assert.throws(() => readRuntime(root, profile), /runtime_drift/u);
});

test('configuration evidence binds the installed parser and its package-owner declaration', (t) => {
  const {root, profile, observation} = fixture(t);
  fs.unlinkSync(path.join(root, 'node_modules'));
  fs.mkdirSync(path.join(root, 'node_modules'));
  fs.symlinkSync(path.join(REPO, 'node_modules/typescript'),
    path.join(root, 'node_modules/typescript'), 'dir');
  fs.cpSync(fs.realpathSync(path.join(REPO, 'node_modules/smol-toml')),
    path.join(root, 'node_modules/smol-toml'), {recursive: true});
  assert.deepEqual(validateObservation(root, observation, profile), []);
  fs.appendFileSync(path.join(root, 'node_modules/smol-toml/dist/parse.js'), '\n// isolated edit\n');
  assert.throws(() => validateObservation(root, observation, profile), /stale observation configuration/u);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  manifest.devDependencies['smol-toml'] = '0.0.0';
  write(root, 'package.json', JSON.stringify(manifest));
  assert.throws(() => configurationIdentity(root, profile), /parser_declaration_mismatch/u);
});

test('materialized store objects must match recorded bytes and reject symlink substitution', (t) => {
  const {root} = fixture(t);
  const bytes = Buffer.from('retained actual bytes for an isolated storage control');
  const record = {sha256: sha256(bytes), bytes: bytes.length, asset: 'control.json'};
  const file = materializedEvidencePath(root, record);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, bytes);
  assert.deepEqual(readMaterializedEvidence(root, record), bytes);
  fs.writeFileSync(file, 'altered');
  assert.throws(() => readMaterializedEvidence(root, record), /mismatch/u);
  fs.unlinkSync(file);
  const target = path.join(root, 'outside-control');
  fs.writeFileSync(target, bytes);
  fs.symlinkSync(target, file);
  assert.throws(() => readMaterializedEvidence(root, record), /contained regular file/u);
});

test('capability applicability preserves unrelated edits and refuses affected source changes', (t) => {
  const {root, profile, observation} = fixture(t);
  const files = applicableFiles('quest-tooling-serena-navigation', observation);
  write(root, '.agents/skills/quest-learn/SKILL.md', 'unrelated capability edit');
  observation.sourceAfter.files['.agents/skills/quest-learn/SKILL.md'] = sha256('changed');
  assert.deepEqual(validateObservation(root, observation, profile, files), []);
  write(root, '.agents/skills/quest-navigate/SKILL.md', 'affected capability edit');
  assert.throws(() => validateObservation(root, observation, profile, files), /stale source/u);
});

test('failed real executions remain failure evidence and cannot establish a positive capability', (t) => {
  const {root, profile, observation} = fixture(t);
  const actual = run(root, process.execPath, ['-e', 'setInterval(() => {}, 1000)'],
    {timeout: 50, stdio: ['ignore', 'pipe', 'pipe']});
  Object.assign(observation, actual, {phase: 'baseline', stdoutSha256: sha256(actual.stdout),
    stderrSha256: sha256(actual.stderr)});
  observation.sourceContents = Object.fromEntries(Object.keys(observation.source.files)
    .map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
  assert.notEqual(observation.signal, null);
  assert.deepEqual(validateObservation(root, observation, profile), []);
  observation.phase = 'candidate';
  assert.throws(() => validateObservation(root, observation, profile), /execution incomplete/u);
});

test('historical host identity follows captured bytes, never the current host label', (t) => {
  const {root, profile, observation} = fixture(t);
  observation.phase = 'baseline';
  observation.sourceContents = Object.fromEntries(Object.keys(observation.source.files)
    .map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
  const newer = structuredClone(profile);
  newer.host.version = '9.9.9';
  assert.deepEqual(validateObservation(root, observation, newer), []);
  observation.host = {...newer.host};
  assert.throws(() => validateObservation(root, observation, newer), /historical host/u);
});

test('only canonical landing permits a commit-only transition', (t) => {
  const {root, profile, observation} = fixture(t);
  observation.sourceAfter.commit = '1'.repeat(40);
  assert.throws(() => validateObservation(root, observation, profile), /source changed/u);
  observation.phase = 'landing';
  observation.command = ['node', 'scripts/solve.js', 'land', '--id', 'isolated-pilot'];
  assert.deepEqual(validateObservation(root, observation, profile), []);
  observation.command[1] = 'unrelated.js';
  assert.throws(() => validateObservation(root, observation, profile), /canonical commit-only/u);
});

test('positive component subjects reject a historical session and an unrelated successful command', () => {
  // Deliberately incomplete isolated inputs: these are not recorded sessions.
  const historical = {id: 'control', phase: 'baseline', exitCode: 0, error: null, signal: null};
  const byId = new Map([['control', historical]]);
  for (const [id, data] of [
    ['quest-tooling-serena-navigation', {navigation: {session: 'control'}}],
    ['quest-tooling-owner-and-profile', {setup: 'control'}],
    ['quest-tooling-lifecycle-and-upgrades', {lifecycle: 'control'}],
  ]) assert.throws(() => validateComponent('/unused', {id}, data, byId), /evidence role/u);
  historical.phase = 'candidate';
  historical.command = ['node', '--version'];
  assert.throws(() => validateComponent('/unused', {id: 'quest-tooling-owner-and-profile'},
    {setup: 'control'}, byId), /deep-equal/u);
});

function localGit(root, args) {
  return execGit(['-c', 'user.name=isolated-control', '-c', 'user.email=control@example.com',
    ...args], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
}

test('review refuses self-approval, a held verdict, receipt replacement and intervening edits', (t) => {
  const {root} = fixture(t);
  localGit(root, ['init', '-q']);
  localGit(root, ['commit', '-q', '--allow-empty', '-m', 'isolated admission control']);
  const quest = {id: 'isolated-review'};
  const file = `solve/quests/${quest.id}/log.ndjson`;
  const author = 'subagent:isolated-author';
  const digest = sha256('isolated receipt input');
  const review = {type: 'verification', verdict: 'approve', verifier: 'subagent:isolated-verifier',
    text: `tooling-receipt-sha256:${digest}`, at: headSha(root),
    candidateDigest: computeCandidateDigest(root, quest)};
  const put = (entries) => write(root, file, entries.map((entry) => JSON.stringify(entry)).join('\n'));
  put([review]);
  assert.doesNotThrow(() => validateReview(root, quest, {author}, digest));
  put([{...review, verifier: author}]);
  assert.throws(() => validateReview(root, quest, {author}, digest), /independent approval/u);
  put([{...review, verdict: 'reject'}]);
  assert.throws(() => validateReview(root, quest, {author}, digest), /independent approval/u);
  put([review]);
  assert.throws(() => validateReview(root, quest, {author}, sha256('replacement')), /retained bytes/u);
  put([review, {type: 'attempt', text: 'new implementation'}]);
  assert.throws(() => validateReview(root, quest, {author}, digest), /review is stale/u);
  put([review]);
  write(root, 'scripts/agent-tooling/profile.js', 'changed after review');
  assert.throws(() => validateReview(root, quest, {author}, digest), /verification currency/u);
});

test('profile refuses unpinned inputs and an editing tool before any activation', (t) => {
  const {root, profile} = fixture(t);
  profile.upstreams.serena.revision = 'main';
  write(root, 'scripts/agent-tooling/profile.json', JSON.stringify(profile));
  assert.throws(() => loadProfile(root), /unpinned/u);
  profile.upstreams.serena.revision = '1'.repeat(40);
  profile.servers.quest_serena.tools.push('replace_symbol_body');
  write(root, 'scripts/agent-tooling/profile.json', JSON.stringify(profile));
  assert.throws(() => loadProfile(root), /server_contract_invalid/u);
});

function pilotControl(t, committedResult = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tooling-pilot-admission-control-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const pilot = 'isolated-pilot';
  const log = `solve/quests/${pilot}/log.ndjson`;
  const subject = 'scripts/control.js';
  write(root, subject, 'before\n');
  write(root, log, JSON.stringify({type: 'finding', kind: 'decision', text: 'Isolated test input.'}));
  localGit(root, ['init', '-q']);
  localGit(root, ['add', '.']);
  localGit(root, ['commit', '-q', '-m', 'isolated input before transition']);
  const before = headSha(root);
  if (committedResult) write(root, subject, 'after\n');
  fs.appendFileSync(path.join(root, log), '\n' + JSON.stringify({type: 'terminal', status: 'solved'}));
  localGit(root, ['add', '.']);
  localGit(root, ['commit', '-q', '-m', 'isolated terminal input']);
  const after = headSha(root);
  write(root, subject, 'after\n');
  const eventInput = (id) => ({kind: 'codex', phase: 'authoring', changedFiles: [subject],
    sourceAfter: {files: {[subject]: sha256('after\n')}},
    stdout: JSON.stringify({type: 'thread.started', thread_id: id})});
  const completeInput = {exitCode: 0, error: null, signal: null};
  const byId = new Map([
    ['author', eventInput('isolated-author')], ['unrelated', eventInput('isolated-unrelated')],
    ['land', {...completeInput, phase: 'landing', source: {commit: before},
      sourceAfter: {commit: after}, command: ['node', 'scripts/solve.js', 'land', '--id', pilot]}],
    ['publication', {...completeInput, phase: 'candidate',
      command: ['node', '-e', 'console.log("unrelated JSON")'], stdout: '{}'}],
  ]);
  const data = {pilot: {quest: pilot, authoring: 'author', landing: 'land',
    landingCommit: after, publication: 'publication'},
  lesson: {resolutionQuest: pilot, originalSession: 'author'}};
  const check = () => validateComponent(root, {id: 'quest-tooling-real-pilot-acceptance'}, data, byId);
  return {root, data, byId, check};
}

test('pilot refuses publication-shaped output from an unrelated command', (t) => {
  const {check} = pilotControl(t);
  assert.throws(check, /deep-equal/u);
});

test('pilot refuses authored bytes missing from the actual landing commit', (t) => {
  const {check} = pilotControl(t, false);
  assert.throws(check, /authored result absent from landing/u);
});

test('pilot requires the publisher-owned receipt, not just a matching stdout object', (t) => {
  const {data, byId, check} = pilotControl(t);
  byId.get('publication').command = ['node', 'scripts/agent-tooling/cli.js',
    'publication', data.pilot.landingCommit];
  assert.throws(check, /ENOENT/u);
});

test('pilot lesson must refer to this resolution and this authoring session', (t) => {
  const {data, check} = pilotControl(t);
  data.lesson.resolutionQuest = 'unrelated-resolution';
  assert.throws(check, /strictly equal/u);
  data.lesson.resolutionQuest = data.pilot.quest;
  data.lesson.originalSession = 'unrelated';
  assert.throws(check, /strictly equal/u);
});

test('pilot refuses a landing observation bound to a different parent', (t) => {
  const {byId, check} = pilotControl(t);
  byId.get('land').source.commit = '1'.repeat(40);
  assert.throws(check, /strictly equal/u);
});
