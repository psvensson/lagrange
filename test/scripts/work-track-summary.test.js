import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {
  buildTrackSummary,
  parseSprintMembership,
  parseTrackStateRows,
  renderTrackSummaryTable,
} from '../../scripts/work-track-summary.js';

const TEMP_PREFIX = 'work-track-summary-';
const ENCODING_UTF8 = 'utf8';
const WORK_DIRECTORY = 'work';
const TRACKS_DIRECTORY = path.join(WORK_DIRECTORY, 'tracks');
const SPRINTS_DIRECTORY = path.join(WORK_DIRECTORY, 'sprints');
const RELEASES_DIRECTORY = path.join(WORK_DIRECTORY, 'releases');
const CURRENT_BLOCKER_JSON_PATH = path.join(
  SPRINTS_DIRECTORY,
  'current-blocker.json',
);
const ALPHA_TRACK_PATH = path.join(TRACKS_DIRECTORY, 'alpha-track.md');
const BETA_TRACK_PATH = path.join(TRACKS_DIRECTORY, 'beta-track.md');
const DEPENDENCY_MAP_PATH = path.join(RELEASES_DIRECTORY, '0.1-dependency-map.md');
const ACTIVE_ALPHA_SPRINT = path.join(SPRINTS_DIRECTORY, 'active-alpha.md');
const TODO_ALPHA_SPRINT = path.join(SPRINTS_DIRECTORY, 'todo-alpha.md');
const ALPHA_TRACK_CONTENT = [
  '# Track: Alpha Track',
  '',
  '## Track Type',
  '',
  '`runtime-invariant`',
  '',
  '## Current Evidence',
  '',
  'This track is planned.',
  '',
  '## Sprint Membership',
  '',
  '| Sprint | Sprint kind | Status | Track relation | Notes |',
  '| --- | --- | --- | --- | --- |',
  `| \`${ACTIVE_ALPHA_SPRINT}\` | \`bugfix\` | active | primary | Current sprint. |`,
  `| \`${TODO_ALPHA_SPRINT}\` | \`stabilization\` | todo | secondary | Next sprint. |`,
  '',
].join('\n');
const BETA_TRACK_CONTENT = [
  '# Track: Beta Track',
  '',
  '## Track Type',
  '',
  '`release-gate`',
  '',
  '## Current Evidence',
  '',
  'Planned and optional.',
  '',
  '## Sprint Membership',
  '',
  'No sprints are currently attached.',
  '',
].join('\n');
const DEPENDENCY_MAP_CONTENT = [
  '# Dependency Map',
  '',
  '## Current Execution Attachment',
  '',
  '| Execution item | Attached track | Depends on | Unblocks | Status |',
  '| --- | --- | --- | --- | --- |',
  `| \`${ACTIVE_ALPHA_SPRINT}\` | [alpha-track](../tracks/alpha-track.md) | proof | next | active |`,
  '',
  '## Track Dependencies',
  '',
  '| Track | Depends on | Unblocks | Current state |',
  '| --- | --- | --- | --- |',
  '| [alpha-track](../tracks/alpha-track.md) | current package | next | stale release state |',
  '| [beta-track](../tracks/beta-track.md) | alpha closes | release | planned |',
  '',
].join('\n');
const CURRENT_BLOCKER = Object.freeze({
  sprint: ACTIVE_ALPHA_SPRINT,
  status: 'active',
  owner: 'startup_active_gate_owner',
  boundary: 'snapshot_coverage',
  dominantReason: 'active_gate_timed_out',
  representativeResidual: Object.freeze({
    status: 'live-red',
    frontier: 'active_gate_snapshot_coverage',
    owner: 'startup_active_gate_owner',
    boundary: 'snapshot_coverage',
    dominantReason: 'active_gate_timed_out',
  }),
});
const SUMMARY_TEST_NAME =
  'track summary reports current status plus active and upcoming sprint relation';
const PARSE_MEMBERSHIP_TEST_NAME =
  'sprint membership parser reads relation from the track table';
const PARSE_RELEASE_STATE_TEST_NAME =
  'release state parser reads track dependency status';
const PADDED_TABLE_HEADER_PATTERN =
  /\| Track\s+\| Type\s+\| Current status\s+\| Active sprints\s+\| Upcoming sprints\s+\|/u;

async function makeTempRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  t.teardown(async () => {
    await fs.rm(root, {recursive: true, force: true});
  });
  await fs.mkdir(path.join(root, TRACKS_DIRECTORY), {recursive: true});
  await fs.mkdir(path.join(root, SPRINTS_DIRECTORY), {recursive: true});
  await fs.mkdir(path.join(root, RELEASES_DIRECTORY), {recursive: true});
  return root;
}

async function writeFixture(root, relativePath, content) {
  await fs.writeFile(path.join(root, relativePath), content, ENCODING_UTF8);
}

test(PARSE_MEMBERSHIP_TEST_NAME, (t) => {
  const rows = parseSprintMembership(ALPHA_TRACK_CONTENT);

  t.equal(rows.length, 2);
  t.equal(rows[0].path, ACTIVE_ALPHA_SPRINT);
  t.equal(rows[0].status, 'active');
  t.equal(rows[0].relation, 'primary');
  t.equal(rows[1].path, TODO_ALPHA_SPRINT);
  t.equal(rows[1].status, 'todo');
  t.equal(rows[1].relation, 'secondary');
  t.end();
});

test(PARSE_RELEASE_STATE_TEST_NAME, (t) => {
  const rows = parseTrackStateRows(DEPENDENCY_MAP_CONTENT, 'Track Dependencies');

  t.equal(rows.get('alpha-track'), 'stale release state');
  t.equal(rows.get('beta-track'), 'planned');
  t.end();
});

test(SUMMARY_TEST_NAME, async (t) => {
  const root = await makeTempRoot(t);
  await writeFixture(root, ALPHA_TRACK_PATH, ALPHA_TRACK_CONTENT);
  await writeFixture(root, BETA_TRACK_PATH, BETA_TRACK_CONTENT);
  await writeFixture(root, DEPENDENCY_MAP_PATH, DEPENDENCY_MAP_CONTENT);
  await writeFixture(
    root,
    CURRENT_BLOCKER_JSON_PATH,
    JSON.stringify(CURRENT_BLOCKER, null, 2),
  );

  const rows = await buildTrackSummary({root});
  const alpha = rows.find((row) => row.track === 'alpha-track');
  const beta = rows.find((row) => row.track === 'beta-track');
  const rendered = renderTrackSummaryTable(rows);

  t.ok(alpha);
  t.match(alpha.status, 'live-red: active_gate_snapshot_coverage');
  t.same(alpha.activeSprints, [
    'active-alpha (status=active; kind=bugfix; relation=primary)',
  ]);
  t.same(alpha.upcomingSprints, [
    'todo-alpha (status=todo; kind=stabilization; relation=secondary)',
  ]);
  t.ok(beta);
  t.equal(beta.status, 'planned');
  t.match(rendered, PADDED_TABLE_HEADER_PATTERN);
  t.match(rendered, '`alpha-track`');
  t.match(rendered, 'active-alpha (status=active; kind=bugfix;');
  t.match(rendered, 'relation=primary)');
  t.match(rendered, 'todo-alpha (status=todo; kind=stabilization;');
  t.match(rendered, 'relation=secondary)');
});
