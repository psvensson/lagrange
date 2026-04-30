#!/usr/bin/env node

import {promises as fs} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  ERRNO,
  FILE_TEXT,
  NUM,
  TEST_OUTPUT_PATH,
  TEST_OUTPUT_SUFFIX,
} from '../src/constants/index.js';
import {
  TEST_OUTPUT_PRUNE_BYTE_BASE,
  TEST_OUTPUT_PRUNE_BYTE_FRACTION_DIGITS,
  TEST_OUTPUT_PRUNE_BYTE_THRESHOLD,
  TEST_OUTPUT_PRUNE_BYTE_UNITS,
  TEST_OUTPUT_PRUNE_DEFAULT_KEEP_DAYS,
  TEST_OUTPUT_PRUNE_DEFAULT_KEEP_LEGACY_PLAYBACKS,
  TEST_OUTPUT_PRUNE_DEFAULT_KEEP_REPORT_PLAYBACKS,
  TEST_OUTPUT_PRUNE_DEFAULT_KEEP_REPORTS,
  TEST_OUTPUT_PRUNE_DEFAULT_KEEP_TOP_LEVEL,
  TEST_OUTPUT_PRUNE_DELETE_OPTIONS,
  TEST_OUTPUT_PRUNE_ENTRY_TYPE,
  TEST_OUTPUT_PRUNE_EXIT_CODE,
  TEST_OUTPUT_PRUNE_FLAG,
  TEST_OUTPUT_PRUNE_JSON_SPACING,
  TEST_OUTPUT_PRUNE_MS_PER_DAY,
  TEST_OUTPUT_PRUNE_PARSE_INT_RADIX,
  TEST_OUTPUT_PRUNE_PINNED_NAME_PATTERN,
  TEST_OUTPUT_PRUNE_READDIR_OPTIONS,
  TEST_OUTPUT_PRUNE_RESERVED_TOP_LEVEL,
  TEST_OUTPUT_PRUNE_USAGE,
} from '../src/constants/test-output-prune-values.js';
import {
  TEST_OUTPUT_PRUNE_ARGV_USER_START_INDEX,
  TEST_OUTPUT_PRUNE_ERROR_TEXT,
  TEST_OUTPUT_PRUNE_VERB,
} from '../src/constants/test-output-prune-scalars.js';

const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_1B3UP = 'reports/report playbacks/legacy playbacks/run-like categories.';

const TEST_OUTPUT_PRUNE_CATEGORY = Object.freeze({
  REPORTS: 'reports',
  REPORT_PLAYBACKS: 'reportPlaybacks',
  LEGACY_PLAYBACKS: 'legacyPlaybacks',
  TOP_LEVEL: 'topLevel',
  TMP_TOP_LEVEL: 'tmpTopLevel',
  TMP_PLAYBACKS: 'tmpPlaybacks',
  PLAYBACK_TOP_LEVEL: 'playbackTopLevel',
  PLAYBACK_ARCHIVES: 'playbackArchives',
  TAP_RESULTS: 'tapResults',
  DATA_LOGS: 'dataLogs',
  DATA3_LOGS: 'data3Logs',
  EXAMPLE_PARTITION_LOGS: 'examplePartitionLogs',
});
const TEST_OUTPUT_PRUNE_WORKSPACE_DIR = Object.freeze({
  TMP: '.tmp',
  TAP: '.tap',
  TEST_RESULTS: 'test-results',
  REUSE_CONTROL: 'reuse-control',
});
const TEST_OUTPUT_PRUNE_TMP_RESERVED_TOP_LEVEL = Object.freeze([
  TEST_OUTPUT_PATH.PLAYBACK_DIR,
  TEST_OUTPUT_PRUNE_WORKSPACE_DIR.REUSE_CONTROL,
]);
const TEST_OUTPUT_PRUNE_PLAYBACK_RESERVED_TOP_LEVEL = Object.freeze([
  TEST_OUTPUT_PATH.PLAYBACK_DIR,
]);
const TEST_OUTPUT_PRUNE_PARTITION_LOG_SUFFIXES = Object.freeze([
  '.db-wal',
  '.db-shm',
  '.db',
]);
const TEST_OUTPUT_PRUNE_PARTITION_LOG_SPECS = Object.freeze([
  Object.freeze({
    category: TEST_OUTPUT_PRUNE_CATEGORY.DATA_LOGS,
    segments: Object.freeze(['data', 'partitions', 'logs-p1']),
  }),
  Object.freeze({
    category: TEST_OUTPUT_PRUNE_CATEGORY.DATA3_LOGS,
    segments: Object.freeze(['data3', 'partitions', 'logs-p1']),
  }),
  Object.freeze({
    category: TEST_OUTPUT_PRUNE_CATEGORY.EXAMPLE_PARTITION_LOGS,
    segments: Object.freeze([
      'data',
      'examples',
      'movielens-lagrange-node',
      'partitions',
      'logs-p1',
    ]),
  }),
]);

function printUsage() {
  process.stdout.write(TEST_OUTPUT_PRUNE_USAGE);
}

function parseInteger(value, flagName) {
  const parsed = Number.parseInt(value, TEST_OUTPUT_PRUNE_PARSE_INT_RADIX);
  if (!Number.isFinite(parsed) || parsed < NUM.ZERO) {
    throw new Error(
      `${flagName}${TEST_OUTPUT_PRUNE_ERROR_TEXT.INTEGER_ERROR_SUFFIX}`,
    );
  }
  return parsed;
}

function parseArgs(argv) {
  const options = {
    root: TEST_OUTPUT_PATH.ROOT,
    apply: false,
    json: false,
    keepDays: TEST_OUTPUT_PRUNE_DEFAULT_KEEP_DAYS,
    keepReports: TEST_OUTPUT_PRUNE_DEFAULT_KEEP_REPORTS,
    keepReportPlaybacks: TEST_OUTPUT_PRUNE_DEFAULT_KEEP_REPORT_PLAYBACKS,
    keepLegacyPlaybacks: TEST_OUTPUT_PRUNE_DEFAULT_KEEP_LEGACY_PLAYBACKS,
    keepTopLevel: TEST_OUTPUT_PRUNE_DEFAULT_KEEP_TOP_LEVEL,
  };

  for (let index = LOCAL_NUM_ZERO; index < argv.length; index += LOCAL_NUM_ONE) {
    const arg = argv[index];
    switch (arg) {
    case TEST_OUTPUT_PRUNE_FLAG.ROOT:
      options.root = argv[++index];
      break;
    case TEST_OUTPUT_PRUNE_FLAG.APPLY:
      options.apply = true;
      break;
    case TEST_OUTPUT_PRUNE_FLAG.JSON:
      options.json = true;
      break;
    case TEST_OUTPUT_PRUNE_FLAG.KEEP_DAYS:
      options.keepDays = parseInteger(
        argv[++index],
        TEST_OUTPUT_PRUNE_FLAG.KEEP_DAYS,
      );
      break;
    case TEST_OUTPUT_PRUNE_FLAG.KEEP_REPORTS:
      options.keepReports =
          parseInteger(argv[++index], TEST_OUTPUT_PRUNE_FLAG.KEEP_REPORTS);
      break;
    case TEST_OUTPUT_PRUNE_FLAG.KEEP_REPORT_PLAYBACKS:
      options.keepReportPlaybacks = parseInteger(
        argv[++index],
        TEST_OUTPUT_PRUNE_FLAG.KEEP_REPORT_PLAYBACKS,
      );
      break;
    case TEST_OUTPUT_PRUNE_FLAG.KEEP_LEGACY_PLAYBACKS:
      options.keepLegacyPlaybacks = parseInteger(
        argv[++index],
        TEST_OUTPUT_PRUNE_FLAG.KEEP_LEGACY_PLAYBACKS,
      );
      break;
    case TEST_OUTPUT_PRUNE_FLAG.KEEP_TOP_LEVEL:
      options.keepTopLevel = parseInteger(
        argv[++index],
        TEST_OUTPUT_PRUNE_FLAG.KEEP_TOP_LEVEL,
      );
      break;
    case TEST_OUTPUT_PRUNE_FLAG.HELP:
    case TEST_OUTPUT_PRUNE_FLAG.HELP_SHORT:
      printUsage();
      process.exit(TEST_OUTPUT_PRUNE_EXIT_CODE.SUCCESS);
      break;
    default:
      throw new Error(
        `${TEST_OUTPUT_PRUNE_ERROR_TEXT.UNKNOWN_ARGUMENT_PREFIX}${arg}`,
      );
    }
  }

  return options;
}

function getEntryKeepKey(entry) {
  return entry.keepKey || entry.name;
}

async function pathExists(candidatePath) {
  try {
    await fs.access(candidatePath);
    return true;
  } catch (error) {
    if (error?.code === ERRNO.ENOENT) {
      return false;
    }
    throw error;
  }
}

async function listDirectoryEntries(
  directoryPath,
  entryType,
  keepKeySelector = (name) => name,
) {
  if (!(await pathExists(directoryPath))) {
    return [];
  }

  const dirents = await fs.readdir(directoryPath, TEST_OUTPUT_PRUNE_READDIR_OPTIONS);
  const entries = [];
  for (const dirent of dirents) {
    const isMatch =
      (entryType === TEST_OUTPUT_PRUNE_ENTRY_TYPE.FILE && dirent.isFile()) ||
      (entryType === TEST_OUTPUT_PRUNE_ENTRY_TYPE.DIR && dirent.isDirectory());
    if (!isMatch) {
      continue;
    }
    const fullPath = path.join(directoryPath, dirent.name);
    const stats = await fs.stat(fullPath);
    entries.push({
      name: dirent.name,
      keepKey: keepKeySelector(dirent.name),
      path: fullPath,
      mtimeMs: stats.mtimeMs,
      sizeBytes: await measureEntryBytes(fullPath, dirent.isDirectory()),
      entryType,
    });
  }
  entries.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return entries;
}

async function listRecursiveFileEntries(
  directoryPath,
  keepKeySelector = (relativePath) => relativePath,
) {
  if (!(await pathExists(directoryPath))) {
    return [];
  }

  const entries = [];
  const stack = [directoryPath];
  while (stack.length > NUM.ZERO) {
    const current = stack.pop();
    const dirents = await fs.readdir(current, TEST_OUTPUT_PRUNE_READDIR_OPTIONS);
    for (const dirent of dirents) {
      const fullPath = path.join(current, dirent.name);
      if (dirent.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!dirent.isFile()) {
        continue;
      }
      const stats = await fs.stat(fullPath);
      const relativePath = path.relative(directoryPath, fullPath);
      entries.push({
        name: relativePath,
        keepKey: keepKeySelector(relativePath, dirent.name),
        path: fullPath,
        mtimeMs: stats.mtimeMs,
        sizeBytes: stats.size,
        entryType: TEST_OUTPUT_PRUNE_ENTRY_TYPE.FILE,
      });
    }
  }
  entries.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return entries;
}

async function measureEntryBytes(targetPath, isDirectory) {
  if (!isDirectory) {
    const stats = await fs.stat(targetPath);
    return stats.size;
  }

  let total = NUM.ZERO;
  const stack = [targetPath];
  while (stack.length > NUM.ZERO) {
    const current = stack.pop();
    const dirents = await fs.readdir(current, TEST_OUTPUT_PRUNE_READDIR_OPTIONS);
    for (const dirent of dirents) {
      const fullPath = path.join(current, dirent.name);
      if (dirent.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!dirent.isFile()) {
        continue;
      }
      const stats = await fs.stat(fullPath);
      total += stats.size;
    }
  }
  return total;
}

function isPinnedName(name) {
  return TEST_OUTPUT_PRUNE_PINNED_NAME_PATTERN.test(name);
}

function reportBasenameToPlaybackName(name) {
  if (name.endsWith(TEST_OUTPUT_SUFFIX.REPORT)) {
    return name.slice(NUM.ZERO, -TEST_OUTPUT_SUFFIX.REPORT.length);
  }
  if (name.endsWith(TEST_OUTPUT_SUFFIX.JSON)) {
    return name.slice(NUM.ZERO, -TEST_OUTPUT_SUFFIX.JSON.length);
  }
  return name;
}

function partitionLogNameToKeepKey(name) {
  for (const suffix of TEST_OUTPUT_PRUNE_PARTITION_LOG_SUFFIXES) {
    if (name.endsWith(suffix)) {
      return name.slice(NUM.ZERO, -suffix.length);
    }
  }
  return name;
}

function buildRetentionGroups(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const keepKey = getEntryKeepKey(entry);
    const current = groups.get(keepKey);
    if (current) {
      current.mtimeMs = Math.max(current.mtimeMs, entry.mtimeMs);
      current.sizeBytes += entry.sizeBytes;
      continue;
    }
    groups.set(keepKey, {
      keepKey,
      mtimeMs: entry.mtimeMs,
      sizeBytes: entry.sizeBytes,
    });
  }
  return [...groups.values()].sort((left, right) => {
    if (left.mtimeMs !== right.mtimeMs) {
      return right.mtimeMs - left.mtimeMs;
    }
    return left.keepKey.localeCompare(right.keepKey);
  });
}

function selectKeepKeys(groups, keepCount, cutoffMs, pinnedNames = new Set()) {
  const keep = new Set();
  for (const group of groups) {
    if (pinnedNames.has(group.keepKey) || isPinnedName(group.keepKey)) {
      keep.add(group.keepKey);
    }
  }

  for (const group of groups) {
    if (group.mtimeMs >= cutoffMs) {
      keep.add(group.keepKey);
    }
  }

  for (const group of groups.slice(NUM.ZERO, keepCount)) {
    keep.add(group.keepKey);
  }

  return keep;
}

function buildDeletionPlan(entries, keepNames) {
  return entries.filter((entry) => !keepNames.has(getEntryKeepKey(entry)));
}

function buildCategoryPlan(entries, keepCount, cutoffMs, pinnedNames = new Set()) {
  const keepKeys = selectKeepKeys(
    buildRetentionGroups(entries),
    keepCount,
    cutoffMs,
    pinnedNames,
  );
  return {
    keepKeys,
    deletePlan: buildDeletionPlan(entries, keepKeys),
  };
}

async function listTopLevelEntries(
  rootPath,
  reservedTopLevel = TEST_OUTPUT_PRUNE_RESERVED_TOP_LEVEL,
) {
  if (!(await pathExists(rootPath))) {
    return [];
  }

  const dirents = await fs.readdir(rootPath, TEST_OUTPUT_PRUNE_READDIR_OPTIONS);
  const entries = [];
  for (const dirent of dirents) {
    if (reservedTopLevel.includes(dirent.name)) {
      continue;
    }
    const fullPath = path.join(rootPath, dirent.name);
    const stats = await fs.stat(fullPath);
    entries.push({
      name: dirent.name,
      keepKey: dirent.name,
      path: fullPath,
      mtimeMs: stats.mtimeMs,
      sizeBytes: await measureEntryBytes(fullPath, dirent.isDirectory()),
      entryType: dirent.isDirectory() ?
        TEST_OUTPUT_PRUNE_ENTRY_TYPE.DIR :
        TEST_OUTPUT_PRUNE_ENTRY_TYPE.FILE,
    });
  }
  entries.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return entries;
}

async function deleteEntries(entries) {
  for (const entry of entries) {
    await fs.rm(entry.path, TEST_OUTPUT_PRUNE_DELETE_OPTIONS);
  }
}

function summarizeCategory(entries) {
  const bytes =
    entries.reduce((sum, entry) => sum + entry.sizeBytes, NUM.ZERO);
  return {
    count: entries.length,
    bytes,
  };
}

function formatBytes(bytes) {
  const units = TEST_OUTPUT_PRUNE_BYTE_UNITS;
  let value = bytes;
  let unitIndex = NUM.ZERO;
  while (value >= TEST_OUTPUT_PRUNE_BYTE_BASE &&
    unitIndex < units.length - NUM.ONE) {
    value /= TEST_OUTPUT_PRUNE_BYTE_BASE;
    unitIndex += NUM.ONE;
  }
  return `${value.toFixed(
    value >= TEST_OUTPUT_PRUNE_BYTE_THRESHOLD || unitIndex === NUM.ZERO ?
      TEST_OUTPUT_PRUNE_BYTE_FRACTION_DIGITS.WHOLE :
      TEST_OUTPUT_PRUNE_BYTE_FRACTION_DIGITS.FRACTIONAL,
  )}${units[unitIndex]}`;
}

async function main(argv) {
  const options = parseArgs(argv);
  const rootPath = path.resolve(options.root);
  const workspaceRoot = path.dirname(rootPath);
  const cutoffMs = Date.now() - (options.keepDays * TEST_OUTPUT_PRUNE_MS_PER_DAY);

  const reportsDir = path.join(rootPath, TEST_OUTPUT_PATH.REPORTS_DIR);
  const reportPlaybackDir = path.join(reportsDir, TEST_OUTPUT_PATH.PLAYBACK_DIR);
  const legacyPlaybackDir = path.join(rootPath, TEST_OUTPUT_PATH.PLAYBACK_DIR);
  const tmpDir = path.join(workspaceRoot, TEST_OUTPUT_PRUNE_WORKSPACE_DIR.TMP);
  const tmpPlaybackDir = path.join(tmpDir, TEST_OUTPUT_PATH.PLAYBACK_DIR);
  const playbackDir = path.join(workspaceRoot, TEST_OUTPUT_PATH.PLAYBACK_DIR);
  const playbackArchiveDir = path.join(playbackDir, TEST_OUTPUT_PATH.PLAYBACK_DIR);
  const tapResultsDir = path.join(
    workspaceRoot,
    TEST_OUTPUT_PRUNE_WORKSPACE_DIR.TAP,
    TEST_OUTPUT_PRUNE_WORKSPACE_DIR.TEST_RESULTS,
  );

  const reportFiles =
    await listDirectoryEntries(reportsDir, TEST_OUTPUT_PRUNE_ENTRY_TYPE.FILE);
  const reportJsonFiles = reportFiles.filter((entry) =>
    entry.name.endsWith(TEST_OUTPUT_SUFFIX.JSON),
  );
  const reportPlan = buildCategoryPlan(
    reportJsonFiles,
    options.keepReports,
    cutoffMs,
  );
  const preservedPlaybackNames = new Set(
    [...reportPlan.keepKeys].map((name) => reportBasenameToPlaybackName(name)),
  );

  const reportPlaybackEntries =
    await listDirectoryEntries(reportPlaybackDir, TEST_OUTPUT_PRUNE_ENTRY_TYPE.DIR);
  const reportPlaybackPlan = buildCategoryPlan(
    reportPlaybackEntries,
    options.keepReportPlaybacks,
    cutoffMs,
    preservedPlaybackNames,
  );

  const legacyPlaybackEntries =
    await listDirectoryEntries(legacyPlaybackDir, TEST_OUTPUT_PRUNE_ENTRY_TYPE.DIR);
  const legacyPlaybackPlan = buildCategoryPlan(
    legacyPlaybackEntries,
    options.keepLegacyPlaybacks,
    cutoffMs,
  );

  const topLevelEntries = await listTopLevelEntries(rootPath);
  const topLevelPlan = buildCategoryPlan(
    topLevelEntries,
    options.keepTopLevel,
    cutoffMs,
  );

  const tmpTopLevelEntries = await listTopLevelEntries(
    tmpDir,
    TEST_OUTPUT_PRUNE_TMP_RESERVED_TOP_LEVEL,
  );
  const tmpTopLevelPlan = buildCategoryPlan(
    tmpTopLevelEntries,
    options.keepTopLevel,
    cutoffMs,
  );

  const tmpPlaybackEntries =
    await listDirectoryEntries(tmpPlaybackDir, TEST_OUTPUT_PRUNE_ENTRY_TYPE.DIR);
  const tmpPlaybackPlan = buildCategoryPlan(
    tmpPlaybackEntries,
    options.keepLegacyPlaybacks,
    cutoffMs,
  );

  const playbackTopLevelEntries = await listTopLevelEntries(
    playbackDir,
    TEST_OUTPUT_PRUNE_PLAYBACK_RESERVED_TOP_LEVEL,
  );
  const playbackTopLevelPlan = buildCategoryPlan(
    playbackTopLevelEntries,
    options.keepTopLevel,
    cutoffMs,
  );

  const playbackArchiveEntries =
    await listDirectoryEntries(playbackArchiveDir, TEST_OUTPUT_PRUNE_ENTRY_TYPE.DIR);
  const playbackArchivePlan = buildCategoryPlan(
    playbackArchiveEntries,
    options.keepLegacyPlaybacks,
    cutoffMs,
  );

  const tapResultEntries = await listRecursiveFileEntries(tapResultsDir);
  const tapResultsPlan = buildCategoryPlan(
    tapResultEntries,
    options.keepTopLevel,
    cutoffMs,
  );

  const categoryPlans = {
    [TEST_OUTPUT_PRUNE_CATEGORY.REPORTS]: reportPlan.deletePlan,
    [TEST_OUTPUT_PRUNE_CATEGORY.REPORT_PLAYBACKS]: reportPlaybackPlan.deletePlan,
    [TEST_OUTPUT_PRUNE_CATEGORY.LEGACY_PLAYBACKS]: legacyPlaybackPlan.deletePlan,
    [TEST_OUTPUT_PRUNE_CATEGORY.TOP_LEVEL]: topLevelPlan.deletePlan,
    [TEST_OUTPUT_PRUNE_CATEGORY.TMP_TOP_LEVEL]: tmpTopLevelPlan.deletePlan,
    [TEST_OUTPUT_PRUNE_CATEGORY.TMP_PLAYBACKS]: tmpPlaybackPlan.deletePlan,
    [TEST_OUTPUT_PRUNE_CATEGORY.PLAYBACK_TOP_LEVEL]:
      playbackTopLevelPlan.deletePlan,
    [TEST_OUTPUT_PRUNE_CATEGORY.PLAYBACK_ARCHIVES]:
      playbackArchivePlan.deletePlan,
    [TEST_OUTPUT_PRUNE_CATEGORY.TAP_RESULTS]: tapResultsPlan.deletePlan,
  };

  for (const spec of TEST_OUTPUT_PRUNE_PARTITION_LOG_SPECS) {
    const entries = await listDirectoryEntries(
      path.join(workspaceRoot, ...spec.segments),
      TEST_OUTPUT_PRUNE_ENTRY_TYPE.FILE,
      partitionLogNameToKeepKey,
    );
    categoryPlans[spec.category] = buildCategoryPlan(
      entries,
      options.keepTopLevel,
      cutoffMs,
    ).deletePlan;
  }

  if (options.apply) {
    for (const entries of Object.values(categoryPlans)) {
      await deleteEntries(entries);
    }
  }

  const summary = {
    root: rootPath,
    workspaceRoot,
    apply: options.apply,
    policy: {
      keepDays: options.keepDays,
      keepReports: options.keepReports,
      keepReportPlaybacks: options.keepReportPlaybacks,
      keepLegacyPlaybacks: options.keepLegacyPlaybacks,
      keepTopLevel: options.keepTopLevel,
      pinnedNamePattern: TEST_OUTPUT_PRUNE_PINNED_NAME_PATTERN.source,
    },
    categories: {},
    deletedPaths: {},
  };

  for (const [category, deletePlan] of Object.entries(categoryPlans)) {
    summary.categories[category] = summarizeCategory(deletePlan);
    summary.deletedPaths[category] = deletePlan.map((entry) =>
      path.relative(workspaceRoot, entry.path),
    );
  }

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(summary, null, TEST_OUTPUT_PRUNE_JSON_SPACING)}` +
      FILE_TEXT.NEWLINE,
    );
    return;
  }

  const totalBytes = Object.values(summary.categories).reduce(
    (sum, category) => sum + category.bytes,
    NUM.ZERO,
  );
  const totalEntries = Object.values(summary.categories).reduce(
    (sum, category) => sum + category.count,
    NUM.ZERO,
  );
  const affectedCategories = Object.values(summary.categories).filter((category) =>
    category.count > NUM.ZERO,
  ).length;
  const verb =
    options.apply ? TEST_OUTPUT_PRUNE_VERB.APPLY : TEST_OUTPUT_PRUNE_VERB.DRY_RUN;

  process.stdout.write(
    `${verb} ${totalEntries} artifact entries across ${affectedCategories} ` +
    `categories (${formatBytes(totalBytes)} total by file stat).` +
    FILE_TEXT.NEWLINE,
  );
  process.stdout.write(
    `Policy: keep pinned names, keep items newer than ${options.keepDays} days, ` +
    `and keep at least ${options.keepReports}/${options.keepReportPlaybacks}/` +
    `${options.keepLegacyPlaybacks}/${options.keepTopLevel} recent items for ` +
    LOCAL_STR_1B3UP +
    FILE_TEXT.NEWLINE,
  );
}

async function runCli() {
  try {
    await main(process.argv.slice(TEST_OUTPUT_PRUNE_ARGV_USER_START_INDEX));
  } catch (error) {
    process.stderr.write(
      `${error.stack || error.message}${FILE_TEXT.NEWLINE}`,
    );
    process.exit(TEST_OUTPUT_PRUNE_EXIT_CODE.FAILURE);
  }
}

const TEST_OUTPUT_PRUNE_IS_DIRECT_EXECUTION = process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (TEST_OUTPUT_PRUNE_IS_DIRECT_EXECUTION) {
  await runCli();
}

export {main};
