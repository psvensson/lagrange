#!/usr/bin/env node

import {promises as fs} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  ERRNO,
  FILE_TEXT,
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

const TEST_OUTPUT_PRUNE_GATE_AGGREGATE_PATTERN =
  /^stat-gate-\d{8}T\d{6}Z(-runs\.ndjson|\.json)$/;
const HARNESS_REPORT_SUFFIX = '.report.json';
// Longest first: a stderr companion must not be read as a result for a
// test file literally named `<file>.tap`.
const TAP_RESULT_SUFFIXES = Object.freeze(['.tap.stderr', '.tap']);
const HARNESS_REPORT_ENCODING = 'utf8';
const HARNESS_REPORT_SCENARIOS = 'scenarios';
// How far past the clock a modification time may be and still count as use.
// Read per stat, not once per run: a file written while the walk is running
// is already "after" a clock read when the walk began, and treating it as
// future-dated made a live tree look abandoned (verifier round 2). Past this
// tolerance a date is clock skew or a copied fixture, and counts for nothing.
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;
// A path component that is a file: the path cannot exist either.
const ERRNO_NOT_A_DIRECTORY = 'ENOTDIR';
const REPORT_LIST_LIMIT = 10;
const PRUNE_TARGET_SUMMARY_TEXT =
  'reports/report playbacks/legacy playbacks/run-like categories.';

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
  REUSE_DATA: 'reuse-data',
});
const TEST_OUTPUT_PRUNE_TMP_RESERVED_TOP_LEVEL = Object.freeze([
  TEST_OUTPUT_PATH.PLAYBACK_DIR,
  TEST_OUTPUT_PRUNE_WORKSPACE_DIR.REUSE_CONTROL,
  TEST_OUTPUT_PRUNE_WORKSPACE_DIR.REUSE_DATA,
]);
const TEST_OUTPUT_PRUNE_PLAYBACK_RESERVED_TOP_LEVEL = Object.freeze([
  TEST_OUTPUT_PATH.PLAYBACK_DIR,
]);
// Parents of REGISTERED git worktrees: the push gate and the publisher each
// add one per run under these and remove it with `git worktree remove`. An
// rm -rf here would leave the worktree registered with its directory gone,
// so these are never age-pruned; their owners clean their own children.
const TEST_OUTPUT_PRUNE_WORKTREE_PARENTS = Object.freeze([
  'push-gate-worktrees',
  'publish-worktrees',
]);
const TEST_OUTPUT_PRUNE_ROOT_RESERVED_TOP_LEVEL = Object.freeze([
  ...TEST_OUTPUT_PRUNE_RESERVED_TOP_LEVEL,
  ...TEST_OUTPUT_PRUNE_WORKTREE_PARENTS,
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
  if (!Number.isFinite(parsed) || parsed < 0) {
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

  for (let index = 0; index < argv.length; index += 1) {
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

// A modification time as evidence of use: itself, or nothing when it lies
// beyond the future tolerance.
function evidenceOfUse(mtimeMs) {
  return mtimeMs > Date.now() + FUTURE_TOLERANCE_MS ? 0 : mtimeMs;
}

function isAbsence(error) {
  return error?.code === ERRNO.ENOENT || error?.code === ERRNO_NOT_A_DIRECTORY;
}

// Whether a path may exist: only a definite absence says no, so a path that
// cannot be checked - a directory we may not read - is kept, never deleted
// and never allowed to stop the prune (verifier round 2).
async function mayExist(candidatePath) {
  try {
    await fs.access(candidatePath);
    return true;
  } catch (error) {
    return !isAbsence(error);
  }
}

// A directory's entries, or none when it cannot be read: listing nothing
// deletes nothing there. An absent directory is simply empty; any other
// failure is recorded, so what is kept for it is never kept silently.
async function readdirOrNothing(run, directoryPath) {
  try {
    return await fs.readdir(directoryPath, TEST_OUTPUT_PRUNE_READDIR_OPTIONS);
  } catch (error) {
    if (!isAbsence(error)) run.unmeasured.add(directoryPath);
    return [];
  }
}

async function listDirectoryEntries(
  run,
  directoryPath,
  entryType,
  keepKeySelector = (name) => name,
) {
  const dirents = await readdirOrNothing(run, directoryPath);
  const entries = [];
  for (const dirent of dirents) {
    const isMatch =
      (entryType === TEST_OUTPUT_PRUNE_ENTRY_TYPE.FILE && dirent.isFile()) ||
      (entryType === TEST_OUTPUT_PRUNE_ENTRY_TYPE.DIR && dirent.isDirectory());
    if (!isMatch) {
      continue;
    }
    const fullPath = path.join(directoryPath, dirent.name);
    const stats = await statOrFresh(run, fullPath);
    const measured = await measureEntry(run, fullPath, dirent.isDirectory());
    entries.push({
      name: dirent.name,
      keepKey: keepKeySelector(dirent.name),
      path: fullPath,
      mtimeMs: Math.max(stats.mtimeMs, measured.newestMtimeMs),
      sizeBytes: measured.sizeBytes,
      entryType,
    });
  }
  entries.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return entries;
}

async function listRecursiveFileEntries(
  run,
  directoryPath,
  keepKeySelector = (relativePath) => relativePath,
) {
  const entries = [];
  const stack = [directoryPath];
  while (stack.length > 0) {
    const current = stack.pop();
    // Unreadable: nothing under it is listed, so nothing under it is deleted.
    const dirents = await readdirOrNothing(run, current);
    for (const dirent of dirents) {
      const fullPath = path.join(current, dirent.name);
      if (dirent.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!dirent.isFile()) {
        continue;
      }
      const stats = await statOrFresh(run, fullPath);
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

// An entry's size and the newest modification time of anything inside it.
// A directory's own mtime moves only when an entry is added, removed or
// renamed, so a directory whose files are rewritten in place looks old while
// its contents are fresh - test-output/analysis holds the generated import
// graph that npm test reads, and survived the first routine prune only because
// its inode mtime happened to be recent. Age is therefore the newest content,
// measured in the walk that already stats every file for its size.
// Directories count too: a new empty subdirectory, or a delete inside one, is
// activity, and counting it can only ever keep more. A timestamp beyond the
// future tolerance says nothing about when the entry was last used, so it
// counts for nothing (evidenceOfUse); clamping it to "now" instead would read
// as fresh on every run and keep the tree forever. And an entry that cannot
// be measured - a dangling link, an unreadable directory, a file deleted
// mid-walk - reads as fresh rather than aborting the whole prune: before, one
// such entry made every run exit before deleting anything (verifier round 1).
// It is recorded, so the summary names what was kept without being measured.
async function measureEntry(run, targetPath, isDirectory) {
  try {
    if (!isDirectory) {
      const stats = await fs.stat(targetPath);
      return {sizeBytes: stats.size, newestMtimeMs: evidenceOfUse(stats.mtimeMs)};
    }
    let total = 0;
    let newest = 0;
    const stack = [targetPath];
    while (stack.length > 0) {
      const current = stack.pop();
      const dirents = await fs.readdir(current, TEST_OUTPUT_PRUNE_READDIR_OPTIONS);
      for (const dirent of dirents) {
        const fullPath = path.join(current, dirent.name);
        if (!dirent.isDirectory() && !dirent.isFile()) {
          continue;
        }
        const stats = await fs.stat(fullPath);
        const mtimeMs = evidenceOfUse(stats.mtimeMs);
        if (mtimeMs > newest) newest = mtimeMs;
        if (dirent.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
        total += stats.size;
      }
    }
    return {sizeBytes: total, newestMtimeMs: newest};
  } catch {
    run.unmeasured.add(targetPath);
    return {sizeBytes: 0, newestMtimeMs: Date.now()};
  }
}

function isPinnedName(name) {
  return TEST_OUTPUT_PRUNE_PINNED_NAME_PATTERN.test(name);
}

function reportBasenameToPlaybackName(name) {
  if (name.endsWith(TEST_OUTPUT_SUFFIX.REPORT)) {
    return name.slice(0, -TEST_OUTPUT_SUFFIX.REPORT.length);
  }
  if (name.endsWith(TEST_OUTPUT_SUFFIX.JSON)) {
    return name.slice(0, -TEST_OUTPUT_SUFFIX.JSON.length);
  }
  return name;
}

function partitionLogNameToKeepKey(name) {
  for (const suffix of TEST_OUTPUT_PRUNE_PARTITION_LOG_SUFFIXES) {
    if (name.endsWith(suffix)) {
      return name.slice(0, -suffix.length);
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

  for (const group of groups.slice(0, keepCount)) {
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
  run,
  rootPath,
  reservedTopLevel = TEST_OUTPUT_PRUNE_ROOT_RESERVED_TOP_LEVEL,
) {
  const dirents = await readdirOrNothing(run, rootPath);
  const entries = [];
  for (const dirent of dirents) {
    if (reservedTopLevel.includes(dirent.name)) {
      continue;
    }
    const fullPath = path.join(rootPath, dirent.name);
    const stats = await statOrFresh(run, fullPath);
    const measured = await measureEntry(run, fullPath, dirent.isDirectory());
    entries.push({
      name: dirent.name,
      keepKey: dirent.name,
      path: fullPath,
      mtimeMs: Math.max(stats.mtimeMs, measured.newestMtimeMs),
      sizeBytes: measured.sizeBytes,
      entryType: dirent.isDirectory() ?
        TEST_OUTPUT_PRUNE_ENTRY_TYPE.DIR :
        TEST_OUTPUT_PRUNE_ENTRY_TYPE.FILE,
    });
  }
  entries.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return entries;
}

// An entry that has vanished or cannot be read is treated as fresh - kept -
// rather than failing the whole plan: retention must degrade to keeping more,
// never to deleting nothing forever (verifier round 1). Its own date obeys the
// same future tolerance as everything inside it (verifier round 2).
async function statOrFresh(run, fullPath) {
  try {
    const stats = await fs.stat(fullPath);
    return {mtimeMs: evidenceOfUse(stats.mtimeMs), size: stats.size};
  } catch {
    run.unmeasured.add(fullPath);
    return {mtimeMs: Date.now(), size: 0};
  }
}

// The test file a result under .tap/test-results belongs to, or null.
function tapResultSourceFile(relativePath) {
  for (const suffix of TAP_RESULT_SUFFIXES) {
    if (relativePath.endsWith(suffix)) return relativePath.slice(0, -suffix.length);
  }
  return null;
}

// The keep keys of the newest `count` reports the harness history reads.
// Entries arrive newest first, so this parses only until the floor is met.
async function newestHarnessReportKeys(entries, count) {
  const keys = new Set();
  for (const entry of entries) {
    if (keys.size >= count) break;
    if (!entry.name.endsWith(HARNESS_REPORT_SUFFIX)) continue;
    try {
      const parsed = JSON.parse(await fs.readFile(entry.path, HARNESS_REPORT_ENCODING));
      if (parsed && Array.isArray(parsed[HARNESS_REPORT_SCENARIOS])) {
        keys.add(getEntryKeepKey(entry));
      }
    } catch {
      // Unreadable or not JSON: not a report the harness can read either.
    }
  }
  return keys;
}

// Every entry is attempted: one that cannot be removed is recorded and the
// rest still go, rather than stopping every later delete (verifier round 2).
async function deleteEntries(run, entries) {
  const removed = [];
  for (const entry of entries) {
    try {
      await fs.rm(entry.path, TEST_OUTPUT_PRUNE_DELETE_OPTIONS);
      removed.push(entry);
    } catch (error) {
      run.failedDeletes.push({path: entry.path, code: error?.code || error?.message});
    }
  }
  return removed;
}

function summarizeCategory(entries) {
  const bytes =
    entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  return {
    count: entries.length,
    bytes,
  };
}

function formatBytes(bytes) {
  const units = TEST_OUTPUT_PRUNE_BYTE_UNITS;
  let value = bytes;
  let unitIndex = 0;
  while (value >= TEST_OUTPUT_PRUNE_BYTE_BASE &&
    unitIndex < units.length - 1) {
    value /= TEST_OUTPUT_PRUNE_BYTE_BASE;
    unitIndex += 1;
  }
  return `${value.toFixed(
    value >= TEST_OUTPUT_PRUNE_BYTE_THRESHOLD || unitIndex === 0 ?
      TEST_OUTPUT_PRUNE_BYTE_FRACTION_DIGITS.WHOLE :
      TEST_OUTPUT_PRUNE_BYTE_FRACTION_DIGITS.FRACTIONAL,
  )}${units[unitIndex]}`;
}

async function main(argv) {
  const options = parseArgs(argv);
  const rootPath = path.resolve(options.root);
  const workspaceRoot = path.dirname(rootPath);
  const cutoffMs = Date.now() - (options.keepDays * TEST_OUTPUT_PRUNE_MS_PER_DAY);
  const run = {unmeasured: new Set(), failedDeletes: []};

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
    await listDirectoryEntries(run, reportsDir, TEST_OUTPUT_PRUNE_ENTRY_TYPE.FILE);
  // Gate AGGREGATES (stat-gate-<TS>.json, a few KB each) are the cross-gate
  // trend ledger read by scripts/query-gate-trends.js — deleting them erases
  // signature history for no meaningful disk win, so they are exempt from the
  // report retention count (per-run stat-gate-<TS>-run<i>.report.json files,
  // the actual disk cost, remain covered).
  const reportJsonFiles = reportFiles.filter((entry) =>
    entry.name.endsWith(TEST_OUTPUT_SUFFIX.JSON) &&
    !TEST_OUTPUT_PRUNE_GATE_AGGREGATE_PATTERN.test(entry.name),
  );
  // The report floor exists to keep the harness's history window, which reads
  // only *.report.json files that carry a `scenarios` array (the 20 newest,
  // test/distributed/run.js). A floor counted over every json was spent on
  // model reports - fixed-name TLC/Alloy files rewritten in place on every
  // corpus run - so the first routine prune deleted all 213 harness reports
  // (verifier round 1). The newest harness reports are therefore pinned by
  // what they ARE, and the general floor still applies on top.
  const harnessHistory = await newestHarnessReportKeys(
    reportJsonFiles, options.keepReports);
  const reportPlan = buildCategoryPlan(
    reportJsonFiles,
    options.keepReports,
    cutoffMs,
    harnessHistory,
  );
  const preservedPlaybackNames = new Set(
    [...reportPlan.keepKeys].map((name) => reportBasenameToPlaybackName(name)),
  );

  const reportPlaybackEntries =
    await listDirectoryEntries(run, reportPlaybackDir, TEST_OUTPUT_PRUNE_ENTRY_TYPE.DIR);
  const reportPlaybackPlan = buildCategoryPlan(
    reportPlaybackEntries,
    options.keepReportPlaybacks,
    cutoffMs,
    preservedPlaybackNames,
  );

  const legacyPlaybackEntries =
    await listDirectoryEntries(run, legacyPlaybackDir, TEST_OUTPUT_PRUNE_ENTRY_TYPE.DIR);
  const legacyPlaybackPlan = buildCategoryPlan(
    legacyPlaybackEntries,
    options.keepLegacyPlaybacks,
    cutoffMs,
  );

  const topLevelEntries = await listTopLevelEntries(run, rootPath);
  const topLevelPlan = buildCategoryPlan(
    topLevelEntries,
    options.keepTopLevel,
    cutoffMs,
  );

  const tmpTopLevelEntries = await listTopLevelEntries(
    run,
    tmpDir,
    TEST_OUTPUT_PRUNE_TMP_RESERVED_TOP_LEVEL,
  );
  const tmpTopLevelPlan = buildCategoryPlan(
    tmpTopLevelEntries,
    options.keepTopLevel,
    cutoffMs,
  );

  const tmpPlaybackEntries =
    await listDirectoryEntries(run, tmpPlaybackDir, TEST_OUTPUT_PRUNE_ENTRY_TYPE.DIR);
  const tmpPlaybackPlan = buildCategoryPlan(
    tmpPlaybackEntries,
    options.keepLegacyPlaybacks,
    cutoffMs,
  );

  const playbackTopLevelEntries = await listTopLevelEntries(
    run,
    playbackDir,
    TEST_OUTPUT_PRUNE_PLAYBACK_RESERVED_TOP_LEVEL,
  );
  const playbackTopLevelPlan = buildCategoryPlan(
    playbackTopLevelEntries,
    options.keepTopLevel,
    cutoffMs,
  );

  const playbackArchiveEntries =
    await listDirectoryEntries(run, playbackArchiveDir, TEST_OUTPUT_PRUNE_ENTRY_TYPE.DIR);
  const playbackArchivePlan = buildCategoryPlan(
    playbackArchiveEntries,
    options.keepLegacyPlaybacks,
    cutoffMs,
  );

  const tapResultEntries = await listRecursiveFileEntries(run, tapResultsDir);
  // A result whose test file still exists is one file per test, overwritten
  // in place on every run, so it never accumulates - and it is the last
  // duration the lane planner dispatches longest-first by. Pruning it by age
  // saved 64 MB and cost the ordering after any week without a full run in
  // this checkout (verifier round 1). Only results whose test is GONE pile
  // up, so only those age out.
  const liveTapResults = new Set();
  for (const entry of tapResultEntries) {
    const source = tapResultSourceFile(entry.name);
    if (source && await mayExist(path.join(workspaceRoot, source))) {
      liveTapResults.add(getEntryKeepKey(entry));
    }
  }
  const tapResultsPlan = buildCategoryPlan(
    tapResultEntries,
    options.keepTopLevel,
    cutoffMs,
    liveTapResults,
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
      run,
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
    for (const [category, entries] of Object.entries(categoryPlans)) {
      categoryPlans[category] = await deleteEntries(run, entries);
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
    unmeasured: [...run.unmeasured].map((entry) => path.relative(workspaceRoot, entry)),
    failedDeletes: run.failedDeletes.map((entry) =>
      ({path: path.relative(workspaceRoot, entry.path), code: entry.code})),
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
    0,
  );
  const totalEntries = Object.values(summary.categories).reduce(
    (sum, category) => sum + category.count,
    0,
  );
  const affectedCategories = Object.values(summary.categories).filter((category) =>
    category.count > 0,
  ).length;
  const verb =
    options.apply ? TEST_OUTPUT_PRUNE_VERB.APPLY : TEST_OUTPUT_PRUNE_VERB.DRY_RUN;

  // The first line is what the publisher prints, so what was NOT done is on it.
  process.stdout.write(
    `${verb} ${totalEntries} artifact entries across ${affectedCategories} ` +
    `categories (${formatBytes(totalBytes)} total by file stat).` +
    unfinishedWork(summary) +
    FILE_TEXT.NEWLINE,
  );
  for (const entry of summary.failedDeletes.slice(0, REPORT_LIST_LIMIT)) {
    process.stdout.write(`Could not delete: ${entry.path} (${entry.code})${FILE_TEXT.NEWLINE}`);
  }
  for (const entry of summary.unmeasured.slice(0, REPORT_LIST_LIMIT)) {
    process.stdout.write(`Kept, could not be measured: ${entry}${FILE_TEXT.NEWLINE}`);
  }
  process.stdout.write(
    `Policy: keep pinned names, keep items newer than ${options.keepDays} days, ` +
    `and keep at least ${options.keepReports}/${options.keepReportPlaybacks}/` +
    `${options.keepLegacyPlaybacks}/${options.keepTopLevel} recent items for ` +
    PRUNE_TARGET_SUMMARY_TEXT +
    FILE_TEXT.NEWLINE,
  );
}

function unfinishedWork(summary) {
  const failed = summary.failedDeletes.length;
  const unmeasured = summary.unmeasured.length;
  return (failed > 0 ? ` ${failed} could not be deleted.` : '') +
    (unmeasured > 0 ? ` ${unmeasured} kept because they could not be measured.` : '');
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
