// Markdown rendering of a failure bundle's node-log windows and their
// coverage records (failure-bundle-artifact-foundation.js LOG_WINDOW_COVERAGE
// owns the record shape and the size constants). The JSON artifact keeps each
// window once (logs.excerptsByNodeId); the markdown shows a bounded excerpt
// of it (head and tail, MARKDOWN_EXCERPT_BYTES per node) and points at the
// whole window, never repeating megabytes.
import {
  LOG_WINDOW_COVERAGE,
  UNKNOWN_VALUE,
  UTF8_ENCODING,
  ZERO,
  formatLogWindowCoverageVerdict,
  isRecord,
} from './failure-bundle-artifact-foundation.js';

const bufferSubarray = Function.call.bind(Buffer.prototype.subarray);
const bufferToString = Function.call.bind(Buffer.prototype.toString);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayPush = Function.call.bind(Array.prototype.push);

const ONE = 1;
const HALVES = 2;
const LINE_SEPARATOR = '\n';
const NONE_VALUE = 'none';
const UTF8_CONTINUATION_MASK = 0xc0;
const UTF8_CONTINUATION_BITS = 0x80;
const BUNDLE_JSON_WINDOW_PATH = 'failure-bundle.json logs.excerptsByNodeId';

// What a null field of a coverage record means: NONE where the field is
// legitimately absent (a complete record has no missingReason; a missing log
// names no source and retained no byte range), UNKNOWN where the value exists
// but could not be known (withheld bytes of an unread log, a divergence the
// scenario did not record, a window with no readable timestamp).
const NULL_FIELD_MEANING = Object.freeze({
  firstDivergenceAt: UNKNOWN_VALUE,
  windowStartAt: UNKNOWN_VALUE,
  windowEndAt: UNKNOWN_VALUE,
  windowStartByte: NONE_VALUE,
  windowEndByte: NONE_VALUE,
  withheldBytes: UNKNOWN_VALUE,
  captureCompleteness: UNKNOWN_VALUE,
  source: NONE_VALUE,
  missingReason: NONE_VALUE,
});

/**
 * One coverage-record field as markdown text: `none` for a legitimately
 * absent value, `unknown` for an unknowable one (NULL_FIELD_MEANING).
 * @param {Object} record
 * @param {string} field One of LOG_WINDOW_COVERAGE.RECORD_FIELDS.
 * @return {string}
 */
function formatCoverageField(record, field) {
  const value = record?.[field];
  if (value === null || value === undefined) {
    return NULL_FIELD_MEANING[field] ?? UNKNOWN_VALUE;
  }
  if (isRecord(value)) {
    const verdict = value.complete === true ?
      'complete' :
      `incomplete:${value.reason}`;
    // The verdict names the quiet bound it was judged against
    // (capture-quiet-bound.js): source, and the action for a harness stop.
    const bound = value.quietBound;
    if (!isRecord(bound)) {
      return verdict;
    }
    return typeof bound.action === 'string' ?
      `${verdict}:${bound.source}:${bound.action}` :
      `${verdict}:${bound.source}`;
  }
  return String(value);
}

// Values are backtick-quoted so a path (the record's source) stays one
// token that a reader, and the run archive's path rewrite, can resolve.
function formatLogWindowCoverageRecord(nodeId, record) {
  const fields = [];
  for (const field of LOG_WINDOW_COVERAGE.RECORD_FIELDS) {
    arrayPush(fields, `${field}=\`${formatCoverageField(record, field)}\``);
  }
  return `- ${nodeId}: ${arrayJoin(fields, ' ')}`;
}

function renderLogWindowCoverageSection(bundle) {
  const records = isRecord(bundle?.logs?.logWindowCoverageByNodeId) ?
    Object.entries(bundle.logs.logWindowCoverageByNodeId) :
    [];
  const lines = [
    '## Log Window Coverage',
    `- Coverage: ${formatLogWindowCoverageVerdict(
      bundle?.summary?.logWindowCoverage,
    )}`,
  ];
  for (const [nodeId, record] of records) {
    arrayPush(lines, formatLogWindowCoverageRecord(nodeId, record));
  }
  return arrayJoin(lines, LINE_SEPARATOR);
}

function isUtf8Continuation(byte) {
  return (byte & UTF8_CONTINUATION_MASK) === UTF8_CONTINUATION_BITS;
}

// The first `maxBytes` of `buffer`, never splitting a character.
function headBytes(buffer, maxBytes) {
  let end = Math.min(buffer.length, maxBytes);
  while (end > ZERO && end < buffer.length && isUtf8Continuation(buffer[end])) {
    end -= ONE;
  }
  return bufferSubarray(buffer, ZERO, end);
}

// The last `maxBytes` of `buffer`, never splitting a character.
function tailBytes(buffer, maxBytes) {
  let start = Math.max(ZERO, buffer.length - maxBytes);
  while (start < buffer.length && isUtf8Continuation(buffer[start])) {
    start += ONE;
  }
  return bufferSubarray(buffer, start);
}

/**
 * The markdown excerpt of one node's retained window: the whole window when
 * it fits MARKDOWN_EXCERPT_BYTES, else its head and tail halves around a
 * line naming the omitted bytes and where the whole window is.
 * @param {string} nodeId
 * @param {Array<string>} lines The retained window's lines.
 * @param {?Object} record The node's coverage record.
 * @return {string}
 */
function renderLogWindowExcerpt(nodeId, lines, record) {
  const window = Buffer.from(
    arrayJoin(Array.isArray(lines) ? lines : [], LINE_SEPARATOR), UTF8_ENCODING);
  const limit = LOG_WINDOW_COVERAGE.MARKDOWN_EXCERPT_BYTES;
  // A missing record retained no byte range: it names its reason instead.
  const range = typeof record?.missingReason === 'string' ?
    `no window: ${record.missingReason}` :
    `source bytes ${formatCoverageField(record, 'windowStartByte')}` +
    `..${formatCoverageField(record, 'windowEndByte')} of ` +
    `${formatCoverageField(record, 'source')}`;
  const header = `### ${nodeId}\n\nWhole window: ${BUNDLE_JSON_WINDOW_PATH}` +
    `["${nodeId}"] (${range}).`;
  if (window.length <= limit) {
    return `${header}\n\n\`\`\`text\n${bufferToString(window, UTF8_ENCODING)}\n\`\`\``;
  }
  const head = headBytes(window, Math.floor(limit / HALVES));
  const tail = tailBytes(window, Math.floor(limit / HALVES));
  const omitted = window.length - head.length - tail.length;
  return `${header}\n\n\`\`\`text\n${bufferToString(head, UTF8_ENCODING)}\n` +
    `... ${omitted} bytes of the window omitted here ...\n` +
    `${bufferToString(tail, UTF8_ENCODING)}\n\`\`\``;
}

/**
 * The bundle markdown's log sections: coverage, then bounded excerpts.
 * @param {Object} bundle
 * @return {Array<string>}
 */
function renderLogWindowSections(bundle) {
  const sections = [renderLogWindowCoverageSection(bundle)];
  const excerpts = isRecord(bundle?.logs?.excerptsByNodeId) ?
    Object.entries(bundle.logs.excerptsByNodeId) :
    [];
  if (excerpts.length > ZERO) {
    const rendered = [];
    for (const [nodeId, lines] of excerpts) {
      arrayPush(rendered, renderLogWindowExcerpt(nodeId, lines,
        bundle.logs.logWindowCoverageByNodeId?.[nodeId] ?? null));
    }
    arrayPush(sections, `## Log Excerpts\n${arrayJoin(rendered, '\n\n')}`);
  }
  return sections;
}

export {
  formatCoverageField,
  renderLogWindowExcerpt,
  renderLogWindowSections,
};
