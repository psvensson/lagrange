#!/usr/bin/env node

import {readdir, readFile} from 'node:fs/promises';
import {join, relative, resolve} from 'node:path';

const LOCAL_STR_JS = '.js';
const LOCAL_STR_NEWLINE = '\n';
const LOCAL_STR_SCENARIO_POLICY_SQL_GUARD_PASSED_NO_FORB = 'Scenario policy SQL guard passed: no forbidden raw table_policies updates found.\n';
const LOCAL_STR_SCENARIO_POLICY_SQL_GUARD_FAILED_MOVE_TA = 'Scenario policy SQL guard failed. Move table policy mutation through the owner helper.\n';
const LOCAL_STR_DASH_SPACE = '- ';
const LOCAL_STR_COLON = ':';
const LOCAL_STR_SCENARIO_POLICY_SQL_GUARD_CRASHED = 'Scenario policy SQL guard crashed: ';

const SCENARIOS_DIR = resolve('test/distributed/scenarios');
const UTF8_ENCODING = 'utf8';
const POLICY_SQL_PATTERN = /UPDATE\s+tables\s+SET\s+table_policies/ig;
const ALLOWED_POLICY_SQL_OWNERS = new Set([
  'test/distributed/scenarios/table-distribution-helpers.js',
  'test/distributed/scenarios/postgres-baseline-comparison.js',
]);

async function listScenarioFiles(dir) {
  const entries = await readdir(dir, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listScenarioFiles(fullPath));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(LOCAL_STR_JS)) {
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function toLineNumber(source, index) {
  const prefix = source.slice(0, Math.max(0, index));
  return prefix.split(LOCAL_STR_NEWLINE).length;
}

async function findViolations() {
  const scenarioFiles = await listScenarioFiles(SCENARIOS_DIR);
  const violations = [];

  for (const filePath of scenarioFiles) {
    const workspaceRelativePath = relative(process.cwd(), filePath);
    if (ALLOWED_POLICY_SQL_OWNERS.has(workspaceRelativePath)) {
      continue;
    }
    const source = await readFile(filePath, UTF8_ENCODING);
    const matches = source.matchAll(POLICY_SQL_PATTERN);
    for (const match of matches) {
      violations.push({
        filePath: workspaceRelativePath,
        line: toLineNumber(source, match.index || 0),
      });
    }
  }
  return violations;
}

async function main() {
  const violations = await findViolations();
  if (violations.length === 0) {
    process.stdout.write(
      LOCAL_STR_SCENARIO_POLICY_SQL_GUARD_PASSED_NO_FORB,
    );
    return;
  }

  process.stderr.write(
    LOCAL_STR_SCENARIO_POLICY_SQL_GUARD_FAILED_MOVE_TA,
  );
  for (const violation of violations) {
    process.stderr.write(
      LOCAL_STR_DASH_SPACE + violation.filePath + LOCAL_STR_COLON +
        violation.line + LOCAL_STR_NEWLINE,
    );
  }
  process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(
    LOCAL_STR_SCENARIO_POLICY_SQL_GUARD_CRASHED +
    String(error?.message || error) + LOCAL_STR_NEWLINE,
  );
  process.exitCode = 1;
});
