import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {
  buildSprintRemainingSummary,
  extractPackageLinks,
  renderSprintRemainingSummary,
} from '../../scripts/work-sprint-remaining.js';
import {runSprintPush} from '../../scripts/work-sprint-push.js';

const TEMP_PREFIX = 'work-sprint-remaining-';
const ENCODING_UTF8 = 'utf8';
const WORK_DIRECTORY = 'work';
const PACKAGES_DIRECTORY = path.join(WORK_DIRECTORY, 'packages');
const SPRINTS_DIRECTORY = path.join(WORK_DIRECTORY, 'sprints');
const CURRENT_BLOCKER_JSON_PATH = path.join(
  SPRINTS_DIRECTORY,
  'current-blocker.json',
);
const ACTIVE_SPRINT_PATH = path.join(SPRINTS_DIRECTORY, 'active-sprint.md');
const DONE_PACKAGE_PATH = path.join(PACKAGES_DIRECTORY, 'done-first.md');
const ACTIVE_PACKAGE_PATH = path.join(PACKAGES_DIRECTORY, 'active-current.md');
const TODO_PACKAGE_PATH = path.join(PACKAGES_DIRECTORY, 'todo-next.md');
const CURRENT_BLOCKER_ONLY_PACKAGE_PATH = path.join(
  PACKAGES_DIRECTORY,
  'active-current-blocker-only.md',
);
const ACTIVE_PACKAGE_TITLE = 'Current Package';
const TODO_PACKAGE_TITLE = 'Next Package';
const CURRENT_BLOCKER_ONLY_TITLE = 'Current Blocker Only';
const TEST_GIT_COMMAND = 'git';
const TEST_NODE_COMMAND_SUFFIX = 'node';
const TEST_PUSH_COMMAND = 'push';
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const SUMMARY_TEST_NAME =
  'sprint remaining summary lists active and todo packages only';
const CURRENT_BLOCKER_TEST_NAME =
  'sprint remaining summary includes current-blocker package if sprint links omit it';
const LINK_PARSE_TEST_NAME =
  'sprint package link parser normalizes package paths';
const PUSH_WRAPPER_TEST_NAME =
  'sprint push wrapper runs remaining summary after successful push';
const PUSH_FAILURE_TEST_NAME =
  'sprint push wrapper skips remaining summary after failed push';

function packageFile(title, metadata) {
  return [
    `# ${title}`,
    '',
    '<!-- work-package',
    JSON.stringify(metadata, null, 2),
    '-->',
    '',
  ].join('\n');
}

async function makeTempRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  t.teardown(async () => {
    await fs.rm(root, {recursive: true, force: true});
  });
  await fs.mkdir(path.join(root, PACKAGES_DIRECTORY), {recursive: true});
  await fs.mkdir(path.join(root, SPRINTS_DIRECTORY), {recursive: true});
  return root;
}

async function writeFixture(root, relativePath, content) {
  await fs.writeFile(path.join(root, relativePath), content, ENCODING_UTF8);
}

function packageMetadata(status, title) {
  return {
    schema: 'work-package-v1',
    status,
    lane: status === 'todo' ? 'scenario-release-gate' : 'runtime-owner-boundary',
    scenario: 'rolling-restart',
    owner: `${title.toLowerCase().replace(/\s+/gu, '_')}_owner`,
    boundary: 'test_boundary',
    dominantReason: `${status}_reason`,
    nextAction: `${title} next action`,
  };
}

test(LINK_PARSE_TEST_NAME, (t) => {
  const content = [
    '[Done](../packages/done-first.md)',
    '[Active](../packages/active-current.md)',
    '[Todo](work/packages/todo-next.md)',
  ].join('\n');

  t.same(extractPackageLinks(ACTIVE_SPRINT_PATH, content), [
    DONE_PACKAGE_PATH,
    ACTIVE_PACKAGE_PATH,
    TODO_PACKAGE_PATH,
  ]);
  t.end();
});

test(SUMMARY_TEST_NAME, async (t) => {
  const root = await makeTempRoot(t);
  await writeFixture(root, ACTIVE_SPRINT_PATH, [
    '# Sprint',
    '',
    `1. [Done](../packages/${path.basename(DONE_PACKAGE_PATH)})`,
    `2. [Active](../packages/${path.basename(ACTIVE_PACKAGE_PATH)})`,
    `3. [Todo](../packages/${path.basename(TODO_PACKAGE_PATH)})`,
    '',
  ].join('\n'));
  await writeFixture(
    root,
    DONE_PACKAGE_PATH,
    packageFile('Done Package', packageMetadata('done', 'Done Package')),
  );
  await writeFixture(
    root,
    ACTIVE_PACKAGE_PATH,
    packageFile(ACTIVE_PACKAGE_TITLE, packageMetadata('active', ACTIVE_PACKAGE_TITLE)),
  );
  await writeFixture(
    root,
    TODO_PACKAGE_PATH,
    packageFile(TODO_PACKAGE_TITLE, packageMetadata('todo', TODO_PACKAGE_TITLE)),
  );

  const summary = await buildSprintRemainingSummary({root});
  const rendered = renderSprintRemainingSummary(summary);

  t.equal(summary.sprintPath, ACTIVE_SPRINT_PATH);
  t.equal(summary.totalLinkedPackages, 3);
  t.equal(summary.counts.left, 2);
  t.same(summary.leftPackages.map((workPackage) => workPackage.title), [
    ACTIVE_PACKAGE_TITLE,
    TODO_PACKAGE_TITLE,
  ]);
  t.match(rendered, 'Packages left: 2 (active=1, todo=1)');
  t.match(rendered, ACTIVE_PACKAGE_TITLE);
  t.match(rendered, TODO_PACKAGE_TITLE);
  t.notMatch(rendered, 'Done Package');
});

test(CURRENT_BLOCKER_TEST_NAME, async (t) => {
  const root = await makeTempRoot(t);
  await writeFixture(root, ACTIVE_SPRINT_PATH, '# Sprint\n');
  await writeFixture(
    root,
    CURRENT_BLOCKER_ONLY_PACKAGE_PATH,
    packageFile(
      CURRENT_BLOCKER_ONLY_TITLE,
      packageMetadata('active', CURRENT_BLOCKER_ONLY_TITLE),
    ),
  );
  await writeFixture(
    root,
    CURRENT_BLOCKER_JSON_PATH,
    JSON.stringify({
      schema: 'current-blocker-v1',
      sprint: ACTIVE_SPRINT_PATH,
      package: CURRENT_BLOCKER_ONLY_PACKAGE_PATH,
      status: 'active',
    }, null, 2),
  );

  const summary = await buildSprintRemainingSummary({root});

  t.equal(summary.counts.left, 1);
  t.equal(summary.leftPackages[0].title, CURRENT_BLOCKER_ONLY_TITLE);
});

test(PUSH_WRAPPER_TEST_NAME, (t) => {
  const calls = [];
  const runner = (command, args) => {
    calls.push([command, args]);
    return {status: EXIT_SUCCESS};
  };

  const status = runSprintPush(['origin', 'branch'], runner);

  t.equal(status, EXIT_SUCCESS);
  t.equal(calls[0][0], TEST_GIT_COMMAND);
  t.same(calls[0][1], [TEST_PUSH_COMMAND, 'origin', 'branch']);
  t.match(calls[1][0], new RegExp(`${TEST_NODE_COMMAND_SUFFIX}$`, 'u'));
  t.same(calls[1][1], ['scripts/work-sprint-remaining.js']);
  t.end();
});

test(PUSH_FAILURE_TEST_NAME, (t) => {
  const calls = [];
  const runner = (command, args) => {
    calls.push([command, args]);
    return {status: EXIT_FAILURE};
  };

  const status = runSprintPush(['origin', 'branch'], runner);

  t.equal(status, EXIT_FAILURE);
  t.equal(calls.length, 1);
  t.end();
});
