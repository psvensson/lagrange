#!/usr/bin/env node

import {promises as fs} from 'node:fs';
import path from 'node:path';
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
        options.keepDays = parseInteger(argv[++index], TEST_OUTPUT_PRUNE_FLAG.KEEP_DAYS);
        break;
      case TEST_OUTPUT_PRUNE_FLAG.KEEP_REPORTS:
        options.keepReports =
          parseInteger(argv[++index], TEST_OUTPUT_PRUNE_FLAG.KEEP_REPORTS);
        break;
      case TEST_OUTPUT_PRUNE_FLAG.KEEP_REPORT_PLAYBACKS:
        options.keepReportPlaybacks =
          parseInteger(argv[++index], TEST_OUTPUT_PRUNE_FLAG.KEEP_REPORT_PLAYBACKS);
        break;
      case TEST_OUTPUT_PRUNE_FLAG.KEEP_LEGACY_PLAYBACKS:
        options.keepLegacyPlaybacks =
          parseInteger(argv[++index], TEST_OUTPUT_PRUNE_FLAG.KEEP_LEGACY_PLAYBACKS);
        break;
      case TEST_OUTPUT_PRUNE_FLAG.KEEP_TOP_LEVEL:
        options.keepTopLevel =
          parseInteger(argv[++index], TEST_OUTPUT_PRUNE_FLAG.KEEP_TOP_LEVEL);
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

async function listDirectoryEntries(directoryPath, entryType) {
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
      path: fullPath,
      mtimeMs: stats.mtimeMs,
      sizeBytes: await measureEntryBytes(fullPath, dirent.isDirectory()),
      entryType,
    });
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

function selectEntriesToKeep(entries, keepCount, cutoffMs, pinnedNames = new Set()) {
  const keep = new Set();
  for (const entry of entries) {
    if (pinnedNames.has(entry.name) || isPinnedName(entry.name)) {
      keep.add(entry.name);
    }
  }

  for (const entry of entries) {
    if (entry.mtimeMs >= cutoffMs) {
      keep.add(entry.name);
    }
  }

  for (const entry of entries.slice(NUM.ZERO, keepCount)) {
    keep.add(entry.name);
  }

  return keep;
}

function buildDeletionPlan(entries, keepNames) {
  return entries.filter((entry) => !keepNames.has(entry.name));
}

async function listTopLevelEntries(rootPath) {
  if (!(await pathExists(rootPath))) {
    return [];
  }

  const dirents = await fs.readdir(rootPath, TEST_OUTPUT_PRUNE_READDIR_OPTIONS);
  const entries = [];
  for (const dirent of dirents) {
    if (TEST_OUTPUT_PRUNE_RESERVED_TOP_LEVEL.includes(dirent.name)) {
      continue;
    }
    const fullPath = path.join(rootPath, dirent.name);
    const stats = await fs.stat(fullPath);
    entries.push({
      name: dirent.name,
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
  const cutoffMs = Date.now() - (options.keepDays * TEST_OUTPUT_PRUNE_MS_PER_DAY);

  const reportsDir = path.join(rootPath, TEST_OUTPUT_PATH.REPORTS_DIR);
  const reportPlaybackDir =
    path.join(reportsDir, TEST_OUTPUT_PATH.PLAYBACK_DIR);
  const legacyPlaybackDir = path.join(rootPath, TEST_OUTPUT_PATH.PLAYBACK_DIR);

  const reportFiles =
    await listDirectoryEntries(reportsDir, TEST_OUTPUT_PRUNE_ENTRY_TYPE.FILE);
  const reportJsonFiles = reportFiles.filter((entry) =>
    entry.name.endsWith(TEST_OUTPUT_SUFFIX.JSON),
  );
  const reportKeepNames = selectEntriesToKeep(
    reportJsonFiles,
    options.keepReports,
    cutoffMs,
  );
  const preservedPlaybackNames = new Set(
    [...reportKeepNames].map((name) => reportBasenameToPlaybackName(name)),
  );

  const reportPlaybackEntries =
    await listDirectoryEntries(reportPlaybackDir, TEST_OUTPUT_PRUNE_ENTRY_TYPE.DIR);
  const reportPlaybackKeepNames = selectEntriesToKeep(
    reportPlaybackEntries,
    options.keepReportPlaybacks,
    cutoffMs,
    preservedPlaybackNames,
  );

  const legacyPlaybackEntries =
    await listDirectoryEntries(legacyPlaybackDir, TEST_OUTPUT_PRUNE_ENTRY_TYPE.DIR);
  const legacyPlaybackKeepNames = selectEntriesToKeep(
    legacyPlaybackEntries,
    options.keepLegacyPlaybacks,
    cutoffMs,
  );

  const topLevelEntries = await listTopLevelEntries(rootPath);
  const topLevelKeepNames = selectEntriesToKeep(
    topLevelEntries,
    options.keepTopLevel,
    cutoffMs,
  );

  const reportDeletePlan = buildDeletionPlan(reportJsonFiles, reportKeepNames);
  const reportPlaybackDeletePlan =
    buildDeletionPlan(reportPlaybackEntries, reportPlaybackKeepNames);
  const legacyPlaybackDeletePlan =
    buildDeletionPlan(legacyPlaybackEntries, legacyPlaybackKeepNames);
  const topLevelDeletePlan = buildDeletionPlan(topLevelEntries, topLevelKeepNames);

  if (options.apply) {
    await deleteEntries(reportDeletePlan);
    await deleteEntries(reportPlaybackDeletePlan);
    await deleteEntries(legacyPlaybackDeletePlan);
    await deleteEntries(topLevelDeletePlan);
  }

  const summary = {
    root: rootPath,
    apply: options.apply,
    policy: {
      keepDays: options.keepDays,
      keepReports: options.keepReports,
      keepReportPlaybacks: options.keepReportPlaybacks,
      keepLegacyPlaybacks: options.keepLegacyPlaybacks,
      keepTopLevel: options.keepTopLevel,
      pinnedNamePattern: TEST_OUTPUT_PRUNE_PINNED_NAME_PATTERN.source,
    },
    categories: {
      reports: summarizeCategory(reportDeletePlan),
      reportPlaybacks: summarizeCategory(reportPlaybackDeletePlan),
      legacyPlaybacks: summarizeCategory(legacyPlaybackDeletePlan),
      topLevel: summarizeCategory(topLevelDeletePlan),
    },
    deletedPaths: {
      reports: reportDeletePlan.map((entry) => path.relative(rootPath, entry.path)),
      reportPlaybacks:
        reportPlaybackDeletePlan.map((entry) => path.relative(rootPath, entry.path)),
      legacyPlaybacks:
        legacyPlaybackDeletePlan.map((entry) => path.relative(rootPath, entry.path)),
      topLevel:
        topLevelDeletePlan.map((entry) => path.relative(rootPath, entry.path)),
    },
  };

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(summary, null, TEST_OUTPUT_PRUNE_JSON_SPACING)}` +
      FILE_TEXT.NEWLINE,
    );
    return;
  }

  const totalBytes =
    summary.categories.reports.bytes +
    summary.categories.reportPlaybacks.bytes +
    summary.categories.legacyPlaybacks.bytes +
    summary.categories.topLevel.bytes;
  const verb =
    options.apply ? TEST_OUTPUT_PRUNE_VERB.APPLY : TEST_OUTPUT_PRUNE_VERB.DRY_RUN;

  process.stdout.write(
    `${verb} ${summary.categories.reports.count} reports, ` +
    `${summary.categories.reportPlaybacks.count} report playbacks, ` +
    `${summary.categories.legacyPlaybacks.count} legacy playbacks, and ` +
    `${summary.categories.topLevel.count} top-level entries ` +
    `(${formatBytes(totalBytes)} total by file stat).` +
    FILE_TEXT.NEWLINE,
  );
  process.stdout.write(
    `Policy: keep pinned names, keep items newer than ${options.keepDays} days, ` +
      `and keep at least ${options.keepReports}/${options.keepReportPlaybacks}/` +
      `${options.keepLegacyPlaybacks}/${options.keepTopLevel} recent items per category.` +
      FILE_TEXT.NEWLINE,
  );
}

main(process.argv.slice(TEST_OUTPUT_PRUNE_ARGV_USER_START_INDEX)).catch((error) => {
  process.stderr.write(
    `${error.stack || error.message}${FILE_TEXT.NEWLINE}`,
  );
  process.exit(TEST_OUTPUT_PRUNE_EXIT_CODE.FAILURE);
});
