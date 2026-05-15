#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ENCODING_UTF8 = 'utf8';
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const SPACE = ' ';
const TABLE_DELIMITER = '|';
const TABLE_SEPARATOR_CELL_PATTERN = /^:?-{3,}:?$/u;
const TABLE_SEPARATOR_MIN_WIDTH = 3;
const TABLE_WIDTH_TARGET_NUMERATOR = 7;
const TABLE_WIDTH_TARGET_DENOMINATOR = 10;
const MARKDOWN_HEADING_PREFIX = '# ';
const TRACK_HEADING_PREFIX = '# Track: ';
const SECTION_HEADING_PREFIX = '## ';
const MARKDOWN_EXTENSION = '.md';
const README_FILE_NAME = 'README.md';
const WORK_DIRECTORY = 'work';
const TRACKS_DIRECTORY = path.join(WORK_DIRECTORY, 'tracks');
const SPRINTS_DIRECTORY = path.join(WORK_DIRECTORY, 'sprints');
const RELEASES_DIRECTORY = path.join(WORK_DIRECTORY, 'releases');
const CURRENT_BLOCKER_JSON_PATH = path.join(
  SPRINTS_DIRECTORY,
  'current-blocker.json',
);
const DEPENDENCY_MAP_PATH = path.join(RELEASES_DIRECTORY, '0.1-dependency-map.md');
const STABILIZATION_RELEASE_PATH = path.join(
  RELEASES_DIRECTORY,
  '0.1-stabilization.md',
);
const SECTION_TRACK_TYPE = 'Track Type';
const SECTION_CURRENT_EVIDENCE = 'Current Evidence';
const SECTION_SPRINT_MEMBERSHIP = 'Sprint Membership';
const SECTION_TRACK_DEPENDENCIES = 'Track Dependencies';
const SECTION_TRACKS_CONSUMED = 'Tracks Consumed By 0.1';
const SECTION_CURRENT_EXECUTION_ATTACHMENT = 'Current Execution Attachment';
const COLUMN_TRACK = 'track';
const COLUMN_CURRENT_STATE = 'current state';
const COLUMN_CURRENT_STATUS = 'current status';
const COLUMN_EXECUTION_ITEM = 'execution item';
const COLUMN_ATTACHED_TRACK = 'attached track';
const COLUMN_SPRINT = 'sprint';
const COLUMN_SPRINT_KIND = 'sprint kind';
const COLUMN_STATUS = 'status';
const COLUMN_RELATION = 'relation';
const COLUMN_TRACK_RELATION = 'track relation';
const DEFAULT_RELATION = 'primary';
const RELEASE_ATTACHMENT_RELATION = 'release-attachment';
const UNKNOWN_VALUE = 'unknown';
const NONE_VALUE = 'none';
const OUTPUT_TITLE = '# Work Track Summary';
const OUTPUT_NOTE_PREFIX = 'Generated from ';
const TABLE_HEADER = Object.freeze([
  'Track',
  'Type',
  'Current status',
  'Active sprints',
  'Upcoming sprints',
]);
const ACTIVE_STATUS = 'active';
const UPCOMING_STATUS_PATTERNS = Object.freeze([
  'todo',
  'planned',
  'upcoming',
  'queued',
  'ready',
  'blocked',
  'next',
  'future',
]);
const CURRENT_BLOCKER_STATUS_FIELDS = Object.freeze([
  'status',
  'frontier',
  'owner',
  'boundary',
  'dominantReason',
]);
const SCRIPT_FILE_NAME = 'work-track-summary.js';
const PROCESS_ARG_SCRIPT_INDEX = 1;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/u;
const MARKDOWN_CODE_PATTERN = /`([^`]+)`/u;
const TRACK_LINK_PATH_PATTERN = /(?:^|\/)tracks\/([^/)]+\.md)/u;
const SPRINT_PATH_PATTERN = /(?:^|\/)(work\/sprints\/[^)\s`]+\.md)/u;
const RELATIVE_SPRINT_PATH_PATTERN = /(?:^|\/)sprints\/([^)\s`]+\.md)/u;
const TRACK_FILE_PATH_PATTERN = /(?:^|\/)(work\/tracks\/[^)\s`]+\.md)/u;
const RELATIVE_TRACK_PATH_PATTERN = /(?:^|\/)tracks\/([^)\s`]+\.md)/u;

function normalizeWhitespace(value = EMPTY_TEXT) {
  return String(value).trim().replace(/\s+/gu, SPACE);
}

function stripMarkdown(value = EMPTY_TEXT) {
  return normalizeWhitespace(value)
    .replace(MARKDOWN_LINK_PATTERN, '$1')
    .replace(MARKDOWN_CODE_PATTERN, '$1')
    .replace(/\.$/u, EMPTY_TEXT)
    .trim();
}

function normalizeHeader(value) {
  return stripMarkdown(value).toLowerCase();
}

function normalizeStatus(value) {
  return stripMarkdown(value).toLowerCase();
}

function slugFromTrackPath(trackPath) {
  return path.basename(trackPath, MARKDOWN_EXTENSION);
}

function sprintLabel(sprintPath) {
  if (!sprintPath) {
    return UNKNOWN_VALUE;
  }
  return path.basename(sprintPath, MARKDOWN_EXTENSION);
}

function extractMarkdownLinkTarget(value) {
  return value.match(MARKDOWN_LINK_PATTERN)?.[2];
}

function extractCodeSpan(value) {
  return value.match(MARKDOWN_CODE_PATTERN)?.[1];
}

function normalizeSprintPath(value) {
  const code = extractCodeSpan(value);
  const target = extractMarkdownLinkTarget(value);
  const candidate = code ?? target ?? value;
  const directMatch = candidate.match(SPRINT_PATH_PATTERN);
  if (directMatch) {
    return directMatch[1];
  }
  const relativeMatch = candidate.match(RELATIVE_SPRINT_PATH_PATTERN);
  if (relativeMatch) {
    return path.join(SPRINTS_DIRECTORY, relativeMatch[1]);
  }
  return stripMarkdown(candidate);
}

function normalizeTrackSlug(value) {
  const code = extractCodeSpan(value);
  const target = extractMarkdownLinkTarget(value);
  const candidate = code ?? target ?? value;
  const linkedTrackMatch = candidate.match(TRACK_LINK_PATH_PATTERN);
  if (linkedTrackMatch) {
    return path.basename(linkedTrackMatch[1], MARKDOWN_EXTENSION);
  }
  const directMatch = candidate.match(TRACK_FILE_PATH_PATTERN);
  if (directMatch) {
    return path.basename(directMatch[1], MARKDOWN_EXTENSION);
  }
  const relativeMatch = candidate.match(RELATIVE_TRACK_PATH_PATTERN);
  if (relativeMatch) {
    return path.basename(relativeMatch[1], MARKDOWN_EXTENSION);
  }
  return stripMarkdown(candidate);
}

function extractSection(content, sectionName) {
  const sectionHeading = `${SECTION_HEADING_PREFIX}${sectionName}`;
  const lines = content.split(NEWLINE);
  const startIndex = lines.findIndex((line) => line.trim() === sectionHeading);
  if (startIndex < 0) {
    return EMPTY_TEXT;
  }
  const sectionLines = [];
  for (const line of lines.slice(startIndex + 1)) {
    if (line.startsWith(SECTION_HEADING_PREFIX)) {
      break;
    }
    sectionLines.push(line);
  }
  return sectionLines.join(NEWLINE).trim();
}

function parseMarkdownTable(sectionContent) {
  const tableLines = sectionContent
    .split(NEWLINE)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(TABLE_DELIMITER));
  if (tableLines.length < 2) {
    return [];
  }
  const headerCells = splitMarkdownTableRow(tableLines[0]).map(normalizeHeader);
  const rows = [];
  for (const line of tableLines.slice(1)) {
    const cells = splitMarkdownTableRow(line);
    if (cells.every((cell) => TABLE_SEPARATOR_CELL_PATTERN.test(cell.trim()))) {
      continue;
    }
    const row = new Map();
    headerCells.forEach((header, index) => {
      row.set(header, cells[index] ?? EMPTY_TEXT);
    });
    rows.push(row);
  }
  return rows;
}

function splitMarkdownTableRow(line) {
  const trimmed = line.trim();
  const withoutLeading = trimmed.startsWith(TABLE_DELIMITER) ?
    trimmed.slice(1) :
    trimmed;
  const withoutTrailing = withoutLeading.endsWith(TABLE_DELIMITER) ?
    withoutLeading.slice(0, -1) :
    withoutLeading;
  return withoutTrailing.split(TABLE_DELIMITER).map((cell) => cell.trim());
}

function parseTrackTitle(content, fallbackPath) {
  const heading = content
    .split(NEWLINE)
    .find((line) => line.startsWith(MARKDOWN_HEADING_PREFIX));
  if (!heading) {
    return slugFromTrackPath(fallbackPath);
  }
  if (heading.startsWith(TRACK_HEADING_PREFIX)) {
    return stripMarkdown(heading.slice(TRACK_HEADING_PREFIX.length));
  }
  return stripMarkdown(heading.slice(MARKDOWN_HEADING_PREFIX.length));
}

function parseTrackType(content) {
  const section = extractSection(content, SECTION_TRACK_TYPE);
  const codeValue = extractCodeSpan(section);
  if (codeValue) {
    return codeValue;
  }
  const firstLine = section
    .split(NEWLINE)
    .map(stripMarkdown)
    .find(Boolean);
  return firstLine ?? UNKNOWN_VALUE;
}

function parseCurrentEvidenceStatus(content) {
  const section = extractSection(content, SECTION_CURRENT_EVIDENCE);
  const firstLine = section
    .split(NEWLINE)
    .map(stripMarkdown)
    .find(Boolean);
  if (!firstLine) {
    return UNKNOWN_VALUE;
  }
  const lowered = firstLine.toLowerCase();
  if (lowered.includes('optional') && lowered.includes('planned')) {
    return 'optional/planned';
  }
  if (lowered.includes('planned')) {
    return 'planned';
  }
  if (lowered.includes('active')) {
    return 'active';
  }
  return firstLine;
}

function parseSprintMembership(content) {
  const section = extractSection(content, SECTION_SPRINT_MEMBERSHIP);
  return parseMarkdownTable(section)
    .map((row) => {
      const sprint = normalizeSprintPath(row.get(COLUMN_SPRINT) ?? EMPTY_TEXT);
      if (!sprint || sprint === UNKNOWN_VALUE) {
        return undefined;
      }
      return {
        path: sprint,
        kind: stripMarkdown(row.get(COLUMN_SPRINT_KIND) ?? UNKNOWN_VALUE),
        status: stripMarkdown(row.get(COLUMN_STATUS) ?? UNKNOWN_VALUE),
        relation: stripMarkdown(
          row.get(COLUMN_TRACK_RELATION) ??
          row.get(COLUMN_RELATION) ??
          DEFAULT_RELATION,
        ),
        notes: stripMarkdown(row.get('notes') ?? EMPTY_TEXT),
      };
    })
    .filter(Boolean);
}

function parseTrackFile(relativePath, content) {
  return {
    path: relativePath,
    slug: slugFromTrackPath(relativePath),
    title: parseTrackTitle(content, relativePath),
    type: parseTrackType(content),
    evidenceStatus: parseCurrentEvidenceStatus(content),
    sprints: parseSprintMembership(content),
  };
}

function parseTrackStateRows(content, sectionName) {
  const section = extractSection(content, sectionName);
  const rows = parseMarkdownTable(section);
  const stateByTrack = new Map();
  for (const row of rows) {
    const trackCell = row.get(COLUMN_TRACK);
    const stateCell = row.get(COLUMN_CURRENT_STATE) ?? row.get(COLUMN_CURRENT_STATUS);
    if (!trackCell || !stateCell) {
      continue;
    }
    stateByTrack.set(normalizeTrackSlug(trackCell), stripMarkdown(stateCell));
  }
  return stateByTrack;
}

function parseExecutionAttachments(content) {
  const section = extractSection(content, SECTION_CURRENT_EXECUTION_ATTACHMENT);
  const rows = parseMarkdownTable(section);
  const attachments = new Map();
  for (const row of rows) {
    const executionItem = row.get(COLUMN_EXECUTION_ITEM);
    const trackCell = row.get(COLUMN_ATTACHED_TRACK);
    if (!executionItem || !trackCell) {
      continue;
    }
    const sprintPath = normalizeSprintPath(executionItem);
    if (!sprintPath.startsWith(SPRINTS_DIRECTORY)) {
      continue;
    }
    const trackSlug = normalizeTrackSlug(trackCell);
    const entry = {
      path: sprintPath,
      kind: UNKNOWN_VALUE,
      status: stripMarkdown(row.get(COLUMN_STATUS) ?? UNKNOWN_VALUE),
      relation: RELEASE_ATTACHMENT_RELATION,
      notes: 'from release dependency map',
    };
    const entries = attachments.get(trackSlug) ?? [];
    entries.push(entry);
    attachments.set(trackSlug, entries);
  }
  return attachments;
}

async function readTextIfPresent(root, relativePath) {
  try {
    return await fs.readFile(path.join(root, relativePath), ENCODING_UTF8);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return EMPTY_TEXT;
    }
    throw error;
  }
}

async function readCurrentBlocker(root) {
  const content = await readTextIfPresent(root, CURRENT_BLOCKER_JSON_PATH);
  if (!content) {
    return undefined;
  }
  return JSON.parse(content);
}

async function readReleaseState(root) {
  const stateByTrack = new Map();
  for (const relativePath of [DEPENDENCY_MAP_PATH, STABILIZATION_RELEASE_PATH]) {
    const content = await readTextIfPresent(root, relativePath);
    if (!content) {
      continue;
    }
    const dependencyRows = parseTrackStateRows(content, SECTION_TRACK_DEPENDENCIES);
    const consumedRows = parseTrackStateRows(content, SECTION_TRACKS_CONSUMED);
    for (const [track, state] of [...dependencyRows, ...consumedRows]) {
      if (!stateByTrack.has(track)) {
        stateByTrack.set(track, state);
      }
    }
  }
  return stateByTrack;
}

async function readExecutionAttachments(root) {
  const content = await readTextIfPresent(root, DEPENDENCY_MAP_PATH);
  if (!content) {
    return new Map();
  }
  return parseExecutionAttachments(content);
}

async function readTracks(root) {
  const tracksPath = path.join(root, TRACKS_DIRECTORY);
  const names = await fs.readdir(tracksPath);
  const trackNames = names
    .filter((name) => name.endsWith(MARKDOWN_EXTENSION))
    .filter((name) => name !== README_FILE_NAME)
    .sort();
  const tracks = [];
  for (const name of trackNames) {
    const relativePath = path.join(TRACKS_DIRECTORY, name);
    const content = await fs.readFile(path.join(root, relativePath), ENCODING_UTF8);
    tracks.push(parseTrackFile(relativePath, content));
  }
  return tracks;
}

function withReleaseAttachments(track, attachmentsByTrack) {
  const attachedSprints = attachmentsByTrack.get(track.slug) ?? [];
  if (attachedSprints.length === 0) {
    return track;
  }
  const existingPaths = new Set(track.sprints.map((sprint) => sprint.path));
  const mergedSprints = [...track.sprints];
  for (const sprint of attachedSprints) {
    if (!existingPaths.has(sprint.path)) {
      mergedSprints.push(sprint);
    }
  }
  return {
    ...track,
    sprints: mergedSprints,
  };
}

function isCurrentBlockerTrack(track, currentBlocker) {
  if (!currentBlocker?.sprint) {
    return false;
  }
  return track.sprints.some((sprint) => sprint.path === currentBlocker.sprint);
}

function formatCurrentBlockerStatus(currentBlocker) {
  const residual = currentBlocker.representativeResidual ?? {};
  const values = {
    status: residual.status ?? currentBlocker.status,
    frontier: residual.frontier,
    owner: residual.owner ?? currentBlocker.owner,
    boundary: residual.boundary ?? currentBlocker.boundary,
    dominantReason: residual.dominantReason ?? currentBlocker.dominantReason,
  };
  const [status, frontier, owner, boundary, reason] =
    CURRENT_BLOCKER_STATUS_FIELDS.map((field) => values[field]).map(stripMarkdown);
  if (frontier && owner && boundary && reason) {
    return `${status}: ${frontier} (${owner} / ${boundary}; ${reason})`;
  }
  if (owner && boundary && reason) {
    return `${status}: ${owner} / ${boundary}; ${reason}`;
  }
  return status || UNKNOWN_VALUE;
}

function currentTrackStatus(track, releaseStateByTrack, currentBlocker) {
  if (isCurrentBlockerTrack(track, currentBlocker)) {
    return formatCurrentBlockerStatus(currentBlocker);
  }
  return releaseStateByTrack.get(track.slug) ?? track.evidenceStatus;
}

function isActiveSprint(sprint) {
  return normalizeStatus(sprint.status) === ACTIVE_STATUS;
}

function isUpcomingSprint(sprint) {
  const status = normalizeStatus(sprint.status);
  return UPCOMING_STATUS_PATTERNS.some((pattern) => status.includes(pattern)) &&
    !isActiveSprint(sprint);
}

function formatSprintEntry(sprint) {
  const details = [
    `status=${stripMarkdown(sprint.status) || UNKNOWN_VALUE}`,
    `kind=${stripMarkdown(sprint.kind) || UNKNOWN_VALUE}`,
    `relation=${stripMarkdown(sprint.relation) || DEFAULT_RELATION}`,
  ];
  return `${sprintLabel(sprint.path)} (${details.join('; ')})`;
}

function buildTrackRow(track, releaseStateByTrack, currentBlocker) {
  const activeSprints = track.sprints.filter(isActiveSprint).map(formatSprintEntry);
  const upcomingSprints = track.sprints
    .filter(isUpcomingSprint)
    .map(formatSprintEntry);
  return {
    track: track.slug,
    title: track.title,
    type: track.type,
    status: currentTrackStatus(track, releaseStateByTrack, currentBlocker),
    activeSprints,
    upcomingSprints,
  };
}

async function buildTrackSummary(options = {}) {
  const root = options.root ?? process.cwd();
  const [tracks, releaseStateByTrack, currentBlocker, attachmentsByTrack] =
    await Promise.all([
      readTracks(root),
      readReleaseState(root),
      readCurrentBlocker(root),
      readExecutionAttachments(root),
    ]);
  return tracks
    .map((track) => withReleaseAttachments(track, attachmentsByTrack))
    .map((track) => buildTrackRow(track, releaseStateByTrack, currentBlocker));
}

function escapeTableCell(value) {
  return String(value).replace(/\|/gu, '\\|');
}

function formatSprintList(entries) {
  if (entries.length === 0) {
    return NONE_VALUE;
  }
  return entries.map(escapeTableCell).join('<br>');
}

function formatTrackTableCells(row) {
  return [
    `\`${escapeTableCell(row.track)}\``,
    escapeTableCell(row.type),
    escapeTableCell(row.status),
    formatSprintList(row.activeSprints),
    formatSprintList(row.upcomingSprints),
  ];
}

function calculateColumnWidths(tableRows) {
  return tableRows.reduce((widths, row) =>
    row.map((cell, index) => Math.max(widths[index], cell.length)),
  TABLE_HEADER.map(() => 0));
}

function sumValues(values) {
  return values.reduce((total, value) => total + value, 0);
}

function calculateWrappedColumnWidths(tableRows) {
  const naturalWidths = calculateColumnWidths(tableRows);
  const minimumWidths = TABLE_HEADER.map((header) =>
    Math.max(header.length, TABLE_SEPARATOR_MIN_WIDTH));
  const naturalTotal = sumValues(naturalWidths);
  const minimumTotal = sumValues(minimumWidths);
  const targetTotal = Math.max(
    minimumTotal,
    Math.floor(
      naturalTotal * TABLE_WIDTH_TARGET_NUMERATOR /
      TABLE_WIDTH_TARGET_DENOMINATOR,
    ),
  );
  const widths = [...naturalWidths];
  let currentTotal = naturalTotal;
  while (currentTotal > targetTotal) {
    const widestReducibleIndex = widths.reduce((selectedIndex, width, index) => {
      const reducible = width - minimumWidths[index];
      const selectedReducible = selectedIndex < 0 ?
        0 :
        widths[selectedIndex] - minimumWidths[selectedIndex];
      return reducible > selectedReducible ? index : selectedIndex;
    }, -1);
    if (widestReducibleIndex < 0) {
      break;
    }
    widths[widestReducibleIndex] -= 1;
    currentTotal -= 1;
  }
  return widths;
}

function splitLongWord(word, width) {
  const chunks = [];
  for (let index = 0; index < word.length; index += width) {
    chunks.push(word.slice(index, index + width));
  }
  return chunks;
}

function wrapTextSegment(segment, width) {
  const words = segment.split(/\s+/u).filter(Boolean);
  if (words.length === 0) {
    return [EMPTY_TEXT];
  }
  const lines = [];
  let currentLine = EMPTY_TEXT;
  for (const word of words) {
    for (const chunk of splitLongWord(word, width)) {
      if (!currentLine) {
        currentLine = chunk;
      } else if (currentLine.length + SPACE.length + chunk.length <= width) {
        currentLine = `${currentLine}${SPACE}${chunk}`;
      } else {
        lines.push(currentLine);
        currentLine = chunk;
      }
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

function wrapTableCell(cell, width) {
  return String(cell)
    .split('<br>')
    .flatMap((segment) => wrapTextSegment(segment, width));
}

function renderPaddedTableRow(cells, columnWidths) {
  const paddedCells = cells.map((cell, index) =>
    cell.padEnd(columnWidths[index], SPACE));
  return `${TABLE_DELIMITER} ${paddedCells.join(` ${TABLE_DELIMITER} `)} ${TABLE_DELIMITER}`;
}

function renderPaddedSeparatorRow(columnWidths) {
  const separatorCells = columnWidths.map((width) =>
    '-'.repeat(Math.max(width, TABLE_SEPARATOR_MIN_WIDTH)));
  return renderPaddedTableRow(separatorCells, columnWidths);
}

function renderWrappedTableRows(cells, columnWidths) {
  const wrappedCells = cells.map((cell, index) =>
    wrapTableCell(cell, columnWidths[index]));
  const lineCount = Math.max(...wrappedCells.map((cellLines) => cellLines.length));
  const lines = [];
  for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
    lines.push(renderPaddedTableRow(
      wrappedCells.map((cellLines) => cellLines[lineIndex] ?? EMPTY_TEXT),
      columnWidths,
    ));
  }
  return lines;
}

function renderTrackSummaryTable(rows) {
  const tableRows = [
    TABLE_HEADER,
    ...rows.map(formatTrackTableCells),
  ];
  const columnWidths = calculateWrappedColumnWidths(tableRows);
  const tableLines = [
    renderPaddedTableRow(TABLE_HEADER, columnWidths),
    renderPaddedSeparatorRow(columnWidths),
    ...rows.flatMap((row) =>
      renderWrappedTableRows(formatTrackTableCells(row), columnWidths)),
  ];
  return [
    OUTPUT_TITLE,
    EMPTY_TEXT,
    `${OUTPUT_NOTE_PREFIX}\`${TRACKS_DIRECTORY}/\`, ` +
      `\`${DEPENDENCY_MAP_PATH}\`, and \`${CURRENT_BLOCKER_JSON_PATH}\` when present.`,
    EMPTY_TEXT,
    ...tableLines,
  ].join(NEWLINE);
}

async function main() {
  const rows = await buildTrackSummary();
  process.stdout.write(`${renderTrackSummaryTable(rows)}${NEWLINE}`);
}

if (
  process.argv[PROCESS_ARG_SCRIPT_INDEX] &&
  process.argv[PROCESS_ARG_SCRIPT_INDEX].endsWith(SCRIPT_FILE_NAME)
) {
  await main();
}

export {
  buildTrackSummary,
  parseExecutionAttachments,
  parseSprintMembership,
  parseTrackFile,
  parseTrackStateRows,
  renderTrackSummaryTable,
};
