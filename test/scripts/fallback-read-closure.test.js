/**
 * The fallback-read closure ratchet (scripts/checks/fallback-read-closure.js)
 * over a synthetic git checkout: every cell family is counted from known
 * sites, and every known-bad input is refused (R19): a new site, a raised
 * baseline, a census edited without a re-join, a refresh that moves a site
 * to a more exercised bucket, a hand-edited census record, a census head off
 * the lineage or absent, and a kept arm that names prose, the wrong bucket,
 * no red trap run or no classified witness. The checker measures and never
 * acts (R27): the checkout is unchanged after every run.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {after, test} from 'node:test';

import {detectNavigabilityPatterns} from '../../scripts/checks/code-navigability-detectors.js';
import {necessitySiteId} from '../../scripts/checks/fallback-necessity-sites.js';
import {runClosureCheck} from '../../scripts/checks/fallback-read-closure.js';

const CENSUS = 'data/fallback-census/census.json';
const BASELINE = 'data/fallback-census/closure-baseline.json';
const KEPT = 'data/fallback-census/kept.json';

const READS = [
  'const RAFT_ROLE = Object.freeze({LEADER: \'leader\', FOLLOWER: \'follower\'});',
  'const COLUMN = Object.freeze({RAFT_ROLE: \'raft_role\'});',
  'const LEADER_ROLE = RAFT_ROLE.LEADER;',
  'const LEADERS = new Set([RAFT_ROLE.LEADER]);',
  'const READ_MODE = Object.freeze({',
  '  OWNER_RPC_PREFERRED_SQL_FALLBACK: \'owner_rpc_preferred_sql_fallback\',',
  '  OWNER_RPC_REQUIRED: \'owner_rpc_required\',',
  '});',
  'const READ_LEADER_MODE = Object.freeze({ANY: \'any\', PREFERRED: \'preferred\', REQUIRED: \'required\'});',
  'const REPORT_TIMESTAMP_FALLBACK_MS = 5;',
  'export function reads(a, b) {',
  '  const value = a.x || b.y;',
  '  const options = {authoritativeReadMode: READ_MODE.OWNER_RPC_REQUIRED};',
  '  const strict = {authoritativeReadMode: READ_MODE.OWNER_RPC_REQUIRED, leaderMode: \'required\'};',
  '  const loose = {leaderMode: \'any\', replicaFallbackConsistency: \'local\'};',
  '  const weak = READ_LEADER_MODE.PREFERRED;',
  '  const fallbackMode = READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK;',
  '  return {value, options, strict, loose, weak, fallbackMode};',
  '}',
  'function roleOf(r) {',
  '  return r.raft_role;',
  '}',
  'export function leaders(row, service, rows) {',
  '  const direct = row.raft_role === \'leader\';',
  '  const normalised = String(service?.[COLUMN.RAFT_ROLE]).toLowerCase() === RAFT_ROLE.LEADER;',
  '  const role = row.raftRole;',
  '  const viaLocal = role === LEADER_ROLE;',
  '  const viaFunction = roleOf(rows[0]) === \'leader\';',
  '  const inSet = LEADERS.has(row.raft_role);',
  '  const viaKey = firstField(row, COLUMN.RAFT_ROLE) === String(RAFT_ROLE.LEADER).toLowerCase();',
  '  const otherColumn = firstField(row, COLUMN.STATUS) === \'leader\';',
  '  let viaSwitch = false;',
  '  switch (row.raft_role) {',
  '  case \'leader\': viaSwitch = true; break;',
  '  case \'follower\': break;',
  '  default: break;',
  '  }',
  '  const live = this.role === \'leader\' || service.raft.readStatus().role === \'leader\' ||',
  '    this.raftRole === \'leader\';',
  '  return {direct, normalised, viaLocal, viaFunction, inSet, viaKey, otherColumn, viaSwitch, live,',
  '    wait: REPORT_TIMESTAMP_FALLBACK_MS};',
  '}',
  'export function guarded(text) {',
  '  try {',
  '    return JSON.parse(text);',
  '  } catch (error) {',
  '    return null;',
  '  }',
  '}',
  'export function probe(port) {',
  '  return typeof port.read === \'function\' ? port.read() : null;',
  '}',
  '',
].join('\n');

const FIXTURE_ROWS = [
  'const RAFT_ROLE = Object.freeze({LEADER: \'leader\'});',
  'const SERVICE_TYPE = Object.freeze({MESSAGE_GROUP: \'message_group\'});',
  'export const rows = [',
  '  {service_type: \'partition\', raft_role: \'leader\'},',
  '  {service_type: SERVICE_TYPE.MESSAGE_GROUP, raft_role: RAFT_ROLE.LEADER},',
  '  {service_type: \'wasm_service\', raft_role: \'leader\'},',
  '  {raft_role: \'follower\'},',
  '];',
  'export function make(index, raftRole = \'leader\') {',
  '  const row = {raft_role: index === 0 ? \'leader\' : \'follower\', raftRole};',
  '  row.raft_role = \'leader\';',
  '  return row;',
  '}',
  '',
].join('\n');

const LANES = ['unit', 'packaging', 'integration', 'bootstrap', 'formation'];
const directories = [];
after(() => {
  for (const directory of directories) fs.rmSync(directory, {recursive: true, force: true});
});

function git(root, ...args) {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid',
    '-c', 'commit.gpgsign=false', ...args], {cwd: root, encoding: 'utf8'}).trim();
}

function write(root, file, text) {
  fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
  fs.writeFileSync(path.join(root, file), text);
}

function commit(root, message) {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

function sites(root) {
  return detectNavigabilityPatterns(root).sites.filter((site) =>
    ['two_source_fallback_reads', 'typeof_dual_paths', 'catch_returns_default'].includes(site.row));
}

function siteOf(root, row) {
  return sites(root).find((site) => site.row === row);
}

function record(site, sidesByRun, overrides = {}) {
  const any = (side) => Object.values(sidesByRun).some((sides) => sides[side]);
  const sidesExecuted = {primary: any('primary'), fallback: any('fallback')};
  const klass = {'false|false': 'never', 'true|false': 'primary-only',
    'false|true': 'fallback-only', 'true|true': 'both'}[`${sidesExecuted.primary}|` +
    `${sidesExecuted.fallback}`];
  return {file: site.file, row: site.row, range: site.range, hash: site.hash,
    occurrence: site.occurrence, class: klass, sidesExecuted, runs: Object.keys(sidesByRun),
    sidesByRun, ...overrides};
}

const BOTH = {primary: true, fallback: true};
const PRIMARY = {primary: true, fallback: false};

// N5 two-source, N1 catch, and a typeof record carrying a hash of text it
// was never measured on (the 2026-11-14 hand edit's shape).
// A re-join carries its own runs: `rejoin` renames every run (and every
// record's reference to it) as a fresh collection would.
function rejoined(census, rejoin) {
  if (!rejoin) return census;
  const rename = (id) => `${id}-${rejoin}`;
  const renameSides = (sidesByRun) => Object.fromEntries(Object.entries(sidesByRun)
    .map(([id, sides]) => [rename(id), sides]));
  return {...census, runs: census.runs.map((run) => ({...run, id: rename(run.id)})),
    sites: census.sites.map((site) => ({...site, runs: site.runs.map(rename),
      sidesByRun: renameSides(site.sidesByRun)}))};
}

function censusAt(root, head, {generatedAt = '2026-11-10T00:00:00.000Z', catchSides,
  rejoin} = {}) {
  return rejoined(baseCensus(root, head, generatedAt, catchSides), rejoin);
}

function baseCensus(root, head, generatedAt, catchSides) {
  const runs = LANES.map((lane) => ({id: `${lane}-run`, lane}));
  const twoSource = siteOf(root, 'two_source_fallback_reads');
  const catchSite = siteOf(root, 'catch_returns_default');
  const typeofSite = siteOf(root, 'typeof_dual_paths');
  const doctored = createHash('sha256').update('measured on other text').digest('hex');
  return {schema: 'fallback-census/1', generatedAt, head, runs, sites: [
    record(twoSource, {'unit-run': BOTH, 'formation-run': BOTH}),
    record(catchSite, catchSides || {'unit-run': PRIMARY}),
    record(typeofSite, {'unit-run': PRIMARY}, {hash: doctored}),
  ]};
}

function writeJson(root, file, value) {
  write(root, file, `${JSON.stringify(value, null, 2)}\n`);
}

function check(root, ...argv) {
  const before = git(root, 'status', '--porcelain');
  const result = runClosureCheck(root, argv);
  assert.equal(git(root, 'status', '--porcelain'), before, 'the checker writes nothing');
  return result;
}

function baselineOf(root) {
  const result = check(root, '--print-baseline');
  assert.equal(result.exitCode, 0, result.stderr.join('\n'));
  return JSON.parse(result.stdout.join('\n'));
}

// A checkout with source, fixtures, census and a committed baseline.
function checkout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'closure-ratchet-'));
  directories.push(root);
  git(root, 'init', '-q');
  write(root, 'src/alpha/reads.js', READS);
  write(root, 'test/alpha/rows-fixture.js', FIXTURE_ROWS);
  writeJson(root, 'test/shards/primary-classes.json',
    {classes: {'test/alpha/witness.test.js': 'integration'}});
  write(root, 'test/alpha/witness.test.js', 'export {};\n');
  const head = commit(root, 'source');
  writeJson(root, CENSUS, censusAt(root, head));
  commit(root, 'census');
  writeJson(root, BASELINE, baselineOf(root));
  commit(root, 'baseline');
  return {root, head};
}

test('every cell family counts its known sites, and a hand-edited record is unreproducible', () => {
  const {root} = checkout();
  const {cells} = JSON.parse(fs.readFileSync(path.join(root, BASELINE), 'utf8'));
  assert.deepEqual(cells, {
    'census_records_unreproducible/typeof_dual_paths/alpha': 1,
    'fallback_sites/catch_returns_default/alpha': 1,
    'fallback_sites/two_source_fallback_reads/alpha': 1,
    'fallback_sites/typeof_dual_paths/alpha': 1,
    'fallback_sites_bucket/catch_returns_default/alpha/N1': 1,
    'fallback_sites_bucket/two_source_fallback_reads/alpha/N5': 1,
    'fallback_sites_uncensused/typeof_dual_paths/alpha': 1,
    'fixture_leader_role_rows/alpha': 4,
    'fixture_leader_role_rows_message_group/alpha': 1,
    'non_required_leader_mode/alpha': 5,
    'read_mode_fallback_members/alpha': 3,
    'role_derived_leader_reads/alpha': 7,
  });
  const result = check(root);
  assert.equal(result.exitCode, 0, result.stderr.join('\n'));
  const text = result.stdout.join('\n');
  assert.match(text, /census_records_unreproducible: src\/alpha\/reads\.js \[\d+,\d+\] slice-hash-does-not-reproduce-at-census-head/u);
  assert.match(text, /fixture_leader_role_rows exempt \(wasm\/meta rows, not counted\): 1/u);
  assert.match(text, /ratchet OK: 27 sites in one-way cells, baseline 27/u);
});

test('a new site anywhere fails, naming it; a removed site prints the tightening hint', () => {
  const {root} = checkout();
  write(root, 'src/beta/new.js', 'export const pick = (a, b) => a.x ?? b.y;\n');
  const added = check(root);
  assert.equal(added.exitCode, 1);
  assert.match(added.stderr.join('\n'),
    /over the baseline: fallback_sites\/two_source_fallback_reads\/beta 1 > 0: src\/beta\/new\.js:1 ts\./u);
  assert.match(added.stderr.join('\n'), /fallback_sites_uncensused\/two_source_fallback_reads\/beta 1 > 0/u);
  fs.rmSync(path.join(root, 'src/beta'), {recursive: true});
  write(root, 'test/alpha/rows-fixture.js', FIXTURE_ROWS.replace(
    '  {service_type: \'partition\', raft_role: \'leader\'},\n', ''));
  const removed = check(root);
  assert.equal(removed.exitCode, 0, removed.stderr.join('\n'));
  assert.deepEqual([removed.tighten, removed.total, removed.allowed], [true, 26, 27]);
});

test('a raised baseline in history is refused even when the tree is within it', () => {
  const {root} = checkout();
  const baseline = JSON.parse(fs.readFileSync(path.join(root, BASELINE), 'utf8'));
  baseline.cells['role_derived_leader_reads/alpha'] += 1;
  writeJson(root, BASELINE, baseline);
  commit(root, 'raise');
  const result = check(root);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join('\n'),
    /baseline raised \(ratchet baselines are one-way\): role_derived_leader_reads\/alpha 7 \([0-9a-f]{40}\) -> 8/u);
});

test('a census edited without a re-join is refused', () => {
  const {root, head} = checkout();
  writeJson(root, CENSUS, censusAt(root, head, {catchSides: {'unit-run': PRIMARY,
    'integration-run': PRIMARY}}));
  const result = check(root);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join('\n'), /census changed without a re-join .*: working tree/u);
});

test('a refresh may move a site toward less exercised buckets only', () => {
  const {root} = checkout();
  const head = git(root, 'rev-parse', 'HEAD');
  writeJson(root, CENSUS, censusAt(root, head, {generatedAt: '2026-11-21T00:00:00.000Z',
    catchSides: {'unit-run': BOTH, 'formation-run': BOTH}, rejoin: 'r2'}));
  const up = check(root);
  assert.equal(up.exitCode, 1);
  assert.match(up.stderr.join('\n'),
    /a census refresh moved a site to a more exercised bucket: src\/alpha\/reads\.js \[\d+,\d+\] N1 -> N5/u);
  const census = baseCensus(root, head, '2026-11-21T00:00:00.000Z');
  census.sites[0] = record(siteOf(root, 'two_source_fallback_reads'), {'unit-run': PRIMARY});
  writeJson(root, CENSUS, rejoined(census, 'r2'));
  writeJson(root, BASELINE, baselineOf(root));
  commit(root, 'refresh');
  const down = check(root);
  assert.equal(down.exitCode, 0, down.stderr.join('\n'));
  const cells = JSON.parse(fs.readFileSync(path.join(root, BASELINE), 'utf8')).cells;
  assert.equal(cells['fallback_sites_bucket/two_source_fallback_reads/alpha/N1'], 1,
    'bucket cells re-base at a refresh: N5 -> N1 is a raise of the N1 cell');
});

test('a census head off the lineage is a one-way cell; an absent one is unmeasurable', () => {
  const {root} = checkout();
  const tree = git(root, 'rev-parse', 'HEAD^{tree}');
  const orphan = git(root, 'commit-tree', tree, '-m', 'off lineage');
  const census = JSON.parse(fs.readFileSync(path.join(root, CENSUS), 'utf8'));
  writeJson(root, CENSUS, rejoined({...census, head: orphan,
    generatedAt: '2026-11-22T00:00:00.000Z'}, 'r2'));
  const off = check(root);
  assert.equal(off.exitCode, 1);
  assert.match(off.stderr.join('\n'), /over the baseline: census_head_not_ancestor\/\. 1 > 0/u);
  writeJson(root, CENSUS, {...census, head: 'b'.repeat(40), generatedAt: '2026-11-23T00:00:00.000Z'});
  const absent = check(root);
  assert.equal(absent.exitCode, 3);
  assert.match(absent.stderr.join('\n'), /census-head-unavailable: the census head is not a commit/u);
});

test('without a baseline the ratchet refuses to run', () => {
  const {root} = checkout();
  fs.rmSync(path.join(root, BASELINE));
  const result = check(root);
  assert.equal(result.exitCode, 2);
  assert.match(result.stderr.join('\n'), /refuses to run without a baseline/u);
});

function trapResult(root, siteId, {mode = 'throw', laneExitCode = 1, thrown = 1} = {}) {
  return {schema: 'fallback-necessity-trap-merged/1', plan: 'p', head: git(root, 'rev-parse', 'HEAD'),
    mode, selection: `site:${siteId}`, run: {id: 'run1', lane: 'integration', laneExitCode},
    processes: ['h:1:0:t'], loaded: {}, refused: [],
    arms: {[`${siteId}#1`]: {site: siteId, thrown, count: 1}}};
}

test('a kept arm stands only on a red throw-mode trap run and a classified witness', () => {
  const {root} = checkout();
  const n5 = necessitySiteId(siteOf(root, 'two_source_fallback_reads'));
  const n1 = necessitySiteId(siteOf(root, 'catch_returns_default'));
  const entry = {siteId: n5, trapRun: 'run1', witnessTest: 'test/alpha/witness.test.js'};
  const refusals = [
    [[{...entry, reason: 'documented default'}], /no labels or prose; unexpected or missing field/u],
    [[{...entry, siteId: n1}], /a kept arm must be in N4c or N5/u],
    [[entry], /names no red throw-mode trap run/u],
  ];
  for (const [entries, expected] of refusals) {
    writeJson(root, KEPT, {version: 1, entries});
    const result = check(root);
    assert.equal(result.exitCode, 1, String(expected));
    assert.match(result.stderr.join('\n'), expected);
  }
  writeJson(root, KEPT, {version: 1, entries: [entry]});
  const runOf = (laneExitCode) => ({id: 'run1', lane: 'integration', laneExitCode,
    failedTests: ['test/alpha/witness.test.js']});
  for (const bad of [{mode: 'observe'}, {run: runOf(0)}, {verdict: 'NOT-REACHED', surfaced: []},
    {schema: 'fallback-necessity-trap-merged/2'}]) {
    writeJson(root, 'data/fallback-census/traps/run1.json', report(root, n5, bad));
    assert.match(check(root).stderr.join('\n'), /names no red throw-mode trap run/u,
      JSON.stringify(bad));
  }
  writeJson(root, 'data/fallback-census/traps/run1.json', report(root, n5,
    {run: {...runOf(1), failedTests: ['test/alpha/absent.test.js']}}));
  writeJson(root, KEPT, {version: 1, entries: [{...entry, witnessTest: 'test/alpha/absent.test.js'}]});
  assert.match(check(root).stderr.join('\n'), /witness is not a classified \.test\.js file/u,
    'a failed witness must still be a classified test file');
  writeJson(root, 'data/fallback-census/traps/run1.json', report(root, n5));
  writeJson(root, KEPT, {version: 1, entries: [entry]});
  const kept = check(root, '--json');
  assert.equal(kept.exitCode, 0, kept.stderr.join('\n'));
  const {cells} = JSON.parse(kept.stdout.join('\n'));
  assert.equal(cells['fallback_sites_kept/two_source_fallback_reads/alpha'], 1);
  assert.equal(cells['fallback_sites_bucket/two_source_fallback_reads/alpha/N5'], undefined,
    'a kept arm leaves its N5 cell');
});

test('--metric prints the selected cells as the last line for a script probe', () => {
  const {root} = checkout();
  const metric = (...argv) => {
    const result = check(root, '--metric', ...argv);
    assert.equal(result.exitCode, 0, result.stderr.join('\n'));
    return result.stdout.at(-1);
  };
  assert.equal(metric(), '27');
  assert.equal(metric('--rows', 'fallback_sites_bucket', '--buckets', 'N0,N1,N2,N3'), '2',
    'the N1 catch site and the uncensused typeof site');
  assert.equal(metric('--rows', 'fallback_sites_bucket', '--buckets', 'N0,N1,N2,N3',
    '--scope', 'src/beta/'), '0');
  assert.equal(metric('--rows', 'role_derived_leader_reads,non_required_leader_mode'), '12');
  assert.equal(check(root, '--rows', 'labels').exitCode, 2, 'an unknown row is a refusal');
});

// --- Corrective round (reports/verify-trap-apparatus.md): each hole below is
// a known-bad input the checker at e39fe811c accepted.

function metricOf(root, ...argv) {
  return check(root, '--metric', ...argv);
}

test('hole 5: the slice probe counts the sites its scope made uncensused', () => {
  const {root} = checkout();
  write(root, 'src/alpha/reads.js', READS.replace('  } catch (error) {\n    return null;\n',
    '  } catch (error) {\n    return null; // edited, so its census record no longer binds\n'));
  const probe = metricOf(root, '--rows', 'fallback_sites_bucket', '--buckets', 'N0,N1,N2,N3',
    '--scope', 'src/alpha/');
  assert.notEqual(probe.stdout.at(-1), '0', 'editing a site must not reach the target');
  assert.notEqual(probe.exitCode, 0);
});

test('hole 6: an absent census head names the ref to fetch and exits with its own code', () => {
  const {root} = checkout();
  const census = JSON.parse(fs.readFileSync(path.join(root, CENSUS), 'utf8'));
  writeJson(root, CENSUS, {...census, head: 'b'.repeat(40)});
  const result = check(root);
  assert.equal(result.exitCode, 3);
  assert.match(result.stderr.join('\n'), /census-head-unavailable/u);
  assert.match(result.stderr.join('\n'),
    /git fetch origin census\/fallback-census-head-b{9}:census\/fallback-census-head-b{9}/u);
});

test('hole 7: one red bucket-wide throw run cannot keep an arm', () => {
  const {root} = checkout();
  const n5 = necessitySiteId(siteOf(root, 'two_source_fallback_reads'));
  const other = necessitySiteId(siteOf(root, 'catch_returns_default'));
  const bucketRun = trapResult(root, n5);
  bucketRun.selection = 'bucket:N5';
  bucketRun.arms[`${other}#1`] = {site: other, thrown: 1, count: 1};
  writeJson(root, 'data/fallback-census/traps/run1.json', bucketRun);
  writeJson(root, KEPT, {version: 1, entries: [{siteId: n5, trapRun: 'run1',
    witnessTest: 'test/alpha/witness.test.js'}]});
  const result = check(root);
  assert.equal(result.exitCode, 1, 'a run that armed other sites keeps nothing');
  assert.match(result.stderr.join('\n'), /trap run/u);
});

function report(root, siteId, overrides = {}) {
  return {schema: 'fallback-necessity-trap-report/1', plan: 'p',
    head: git(root, 'rev-parse', 'HEAD'), mode: 'throw', selection: `site:${siteId}`,
    run: {id: 'run1', lane: 'integration', laneExitCode: 1,
      failedTests: ['test/alpha/witness.test.js']},
    verdict: 'SURFACED', armed: [`${siteId}#f1`], surfaced: [`${siteId}#f1`], swallowed: [],
    ...overrides};
}

test('hole 7: a kept arm needs a run that armed that site alone and failed its witness', () => {
  const {root} = checkout();
  const n5 = necessitySiteId(siteOf(root, 'two_source_fallback_reads'));
  const other = necessitySiteId(siteOf(root, 'catch_returns_default'));
  writeJson(root, KEPT, {version: 1, entries: [{siteId: n5, trapRun: 'run1',
    witnessTest: 'test/alpha/witness.test.js'}]});
  for (const [overrides, expected] of [
    [{armed: [`${n5}#f1`, `${other}#f0`]}, /did not arm that site alone/u],
    [{run: {id: 'run1', lane: 'integration', laneExitCode: 1, failedTests: ['test/x.test.js']}},
      /witness is not a test the trap run failed/u],
    [{verdict: 'SWALLOWED', surfaced: [], swallowed: [`${n5}#f1`]},
      /names no red throw-mode trap run/u],
  ]) {
    writeJson(root, 'data/fallback-census/traps/run1.json', report(root, n5, overrides));
    const result = check(root);
    assert.equal(result.exitCode, 1, String(expected));
    assert.match(result.stderr.join('\n'), expected);
  }
  writeJson(root, 'data/fallback-census/traps/run1.json', report(root, n5));
  const kept = check(root, '--json');
  assert.equal(kept.exitCode, 0, kept.stderr.join('\n'));
  assert.equal(JSON.parse(kept.stdout.join('\n'))
    .cells['fallback_sites_kept/two_source_fallback_reads/alpha'], 1);
});

test('hole 8: a leader constant injected through options is still a leader token', () => {
  const {root} = checkout();
  write(root, 'src/gamma/injected.js', [
    'export function injected(options, row) {',
    '  const {LEADER_RAFT_ROLE} = options;',
    '  return row.raft_role === LEADER_RAFT_ROLE;',
    '}',
    '',
  ].join('\n'));
  assert.equal(metricOf(root, '--rows', 'role_derived_leader_reads', '--scope', 'src/gamma/')
    .stdout.at(-1), '1');
});

test('hole 9: a fixture row is exempt by its service type, not a substring of its id', () => {
  const {root} = checkout();
  write(root, 'test/delta/meta-row.js', [
    'export const row = {service_id: \'p1-metadata-r1\', service_type: \'message_group\',',
    '  raft_role: \'leader\'};',
    '',
  ].join('\n'));
  assert.equal(metricOf(root, '--rows', 'fixture_leader_role_rows_message_group',
    '--scope', 'test/delta/').stdout.at(-1), '1');
});

test('hole 10: a census edit is refused even with generatedAt bumped', () => {
  const {root, head} = checkout();
  writeJson(root, CENSUS, censusAt(root, head, {generatedAt: '2026-11-25T00:00:00.000Z',
    catchSides: {'unit-run': PRIMARY, 'integration-run': PRIMARY}}));
  const result = check(root);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join('\n'), /re-join/u);
});

test('hole 10: the baseline must name the census head it was measured against', () => {
  const {root} = checkout();
  const baseline = JSON.parse(fs.readFileSync(path.join(root, BASELINE), 'utf8'));
  writeJson(root, BASELINE, {...baseline, censusHead: 'c'.repeat(40)});
  const result = check(root);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr.join('\n'), /baseline names census head c{40}/u);
});

test('hole 11: baselines tightened on two branches compose by cell-wise minimum', () => {
  const {root} = checkout();
  const mainline = git(root, 'rev-parse', '--abbrev-ref', 'HEAD');
  git(root, 'checkout', '-q', '-b', 'side');
  write(root, 'test/alpha/rows-fixture.js', FIXTURE_ROWS.replace(
    '  {service_type: \'partition\', raft_role: \'leader\'},\n', ''));
  writeJson(root, BASELINE, baselineOf(root));
  commit(root, 'side lowers the fixture cell');
  git(root, 'checkout', '-q', mainline);
  write(root, 'src/alpha/reads.js', READS.replace(
    'export function probe(port) {\n  return typeof port.read === \'function\' ? ' +
      'port.read() : null;\n}\n', ''));
  writeJson(root, BASELINE, baselineOf(root));
  const mainBaseline = JSON.parse(fs.readFileSync(path.join(root, BASELINE), 'utf8'));
  commit(root, 'mainline lowers the typeof cells');
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'merge',
    '--no-ff', '--no-commit', 'side'], {cwd: root, encoding: 'utf8'});
  write(root, 'test/alpha/rows-fixture.js', FIXTURE_ROWS.replace(
    '  {service_type: \'partition\', raft_role: \'leader\'},\n', ''));
  const sideCells = JSON.parse(git(root, 'show', `side:${BASELINE}`)).cells;
  const cells = {};
  for (const cell of new Set([...Object.keys(mainBaseline.cells), ...Object.keys(sideCells)])) {
    const value = Math.min(mainBaseline.cells[cell] ?? 0, sideCells[cell] ?? 0);
    if (value > 0) cells[cell] = value;
  }
  writeJson(root, BASELINE, {...mainBaseline, cells});
  commit(root, 'merge side: baselines compose by cell-wise minimum');
  const result = check(root);
  assert.equal(result.exitCode, 0, result.stderr.join('\n'));
});

test('a new semantic detectors version re-bases the semantic cells and only them', () => {
  const {root} = checkout();
  const current = JSON.parse(fs.readFileSync(path.join(root, BASELINE), 'utf8'));
  assert.equal(current.detectors, 2, 'the baseline names the detectors that measured it');
  const older = {...current, detectors: 1,
    cells: {...current.cells, 'role_derived_leader_reads/alpha': 6}};
  writeJson(root, BASELINE, older);
  commit(root, 'a baseline measured by the v1 detectors');
  writeJson(root, BASELINE, current);
  commit(root, 'the v2 detectors count one more reader');
  assert.equal(check(root).exitCode, 0, 'a semantic cell may rise only with the version');
  writeJson(root, BASELINE, {...current, detectors: 1,
    cells: {...current.cells, 'fallback_sites_uncensused/typeof_dual_paths/alpha': 0}});
  commit(root, 'v1 again, with a census-row cell lowered');
  writeJson(root, BASELINE, current);
  commit(root, 'v2, raising the census-row cell');
  assert.match(check(root).stderr.join('\n'),
    /baseline raised .*fallback_sites_uncensused\/typeof_dual_paths\/alpha 0/u,
    'a detectors version never re-bases a census-row cell');
  writeJson(root, BASELINE, {...current, detectors: 1});
  assert.match(check(root).stderr.join('\n'), /measured with semantic detectors v1; they are v2/u);
});
