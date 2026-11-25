import path from 'node:path';

const COMPLEXITY_MESSAGE_PATTERN =
  /^(?<subject>.+?) has a complexity of (?<severity>\d+)\b/iu;
const FALLBACK_COMPLEXITY_NUMBER_PATTERN = /complexity of (?<severity>\d+)\b/iu;
const COGNITIVE_MESSAGE_PATTERN =
  /Cognitive Complexity from (?<severity>\d+)\b/iu;
const HAS_COMPLEXITY_SPLIT_PATTERN = /\s+has a complexity of\b/iu;
const WHITESPACE_COLLAPSE_PATTERN = /\s+/gu;
const OCCURRENCE_SUFFIX_PATTERN = /#\d+$/u;
const RADIX_DECIMAL = 10;
const DEFAULT_SEVERITY = 1;
const ZERO_COUNT = 0;
const SINGLE_SPACE = ' ';
const EMPTY_STRING = '';
const IDENTITY_SEPARATOR = '::';
const OCCURRENCE_SEPARATOR = '#';
const COLON_SEPARATOR = ':';
const NEWLINE_SEPARATOR = '\n';
const DEFAULT_SUBJECT_LABEL = 'violation';
const DEFAULT_ANALYZER_LABEL = 'eslint';
const SCAN_ERROR_DISPLAY_LIMIT = 20;
const TYPE_STRING = 'string';
const TYPE_NUMBER = 'number';
const TYPE_FUNCTION = 'function';
const TYPE_OBJECT = 'object';

function normalizeSubjectLabel(rawSubject, fallbackLabel) {
  const candidate = typeof rawSubject === TYPE_STRING ?
    rawSubject.trim().replace(WHITESPACE_COLLAPSE_PATTERN, SINGLE_SPACE) :
    EMPTY_STRING;
  return candidate.length > ZERO_COUNT ? candidate : fallbackLabel;
}

function parseViolationMetadata(messageText, ruleId) {
  const text = typeof messageText === TYPE_STRING ? messageText : EMPTY_STRING;
  const fallbackSubject = normalizeSubjectLabel(ruleId, DEFAULT_SUBJECT_LABEL);
  const directMatch = COMPLEXITY_MESSAGE_PATTERN.exec(text);
  if (directMatch?.groups) {
    return {
      subject: normalizeSubjectLabel(
        directMatch.groups.subject,
        fallbackSubject,
      ),
      severity: Number.parseInt(directMatch.groups.severity, RADIX_DECIMAL),
    };
  }
  const fallbackMatch = FALLBACK_COMPLEXITY_NUMBER_PATTERN.exec(text);
  if (fallbackMatch?.groups) {
    const [prefix] = text.split(HAS_COMPLEXITY_SPLIT_PATTERN);
    return {
      subject: normalizeSubjectLabel(prefix, fallbackSubject),
      severity: Number.parseInt(fallbackMatch.groups.severity, RADIX_DECIMAL),
    };
  }
  const cognitiveMatch = COGNITIVE_MESSAGE_PATTERN.exec(text);
  if (cognitiveMatch?.groups) {
    return {
      subject: fallbackSubject,
      severity: Number.parseInt(cognitiveMatch.groups.severity, RADIX_DECIMAL),
    };
  }
  return {
    subject: fallbackSubject,
    severity: DEFAULT_SEVERITY,
  };
}

// Repo-relative so the report bytes are identical across checkouts (the
// owner-debt inventory pins these report files' digests).
export function collectRuleViolations(results, ruleId) {
  const safeResults = Array.isArray(results) ? results : [];
  return safeResults.flatMap((result) => {
    const relativeFilePath = path.relative(
      process.cwd(),
      result?.filePath || EMPTY_STRING,
    );
    return (result?.messages || [])
      .filter((message) => message.ruleId === ruleId)
      .map((message) => {
        const {subject, severity} = parseViolationMetadata(
          message.message,
          ruleId,
        );
        return {
          filePath: relativeFilePath,
          line: message.line,
          column: message.column,
          message: message.message,
          severity,
          subject,
        };
      });
  });
}

function isParserOrFatalMessage(message) {
  return Boolean(message) &&
    (message.fatal === true || message.ruleId === null);
}

export function collectScanCompleteness(
  results,
  {
    ruleId = null,
    targets = [],
    analyzer = DEFAULT_ANALYZER_LABEL,
  } = {},
) {
  const safeResults = Array.isArray(results) ? results : [];
  const parserFatalErrors = [];
  let failedFiles = ZERO_COUNT;
  for (const result of safeResults) {
    const relativeFilePath = path.relative(
      process.cwd(),
      result?.filePath || EMPTY_STRING,
    );
    const fatalMessages = (result?.messages || []).filter(
      isParserOrFatalMessage,
    );
    if (fatalMessages.length > ZERO_COUNT) {
      failedFiles += 1;
    }
    for (const message of fatalMessages) {
      parserFatalErrors.push({
        filePath: relativeFilePath,
        line: message.line ?? ZERO_COUNT,
        column: message.column ?? ZERO_COUNT,
        message: message.message,
      });
    }
  }
  const analyzedFiles = safeResults.length;
  const skippedFiles = ZERO_COUNT;
  const complete = analyzedFiles > ZERO_COUNT && failedFiles === ZERO_COUNT;
  return {
    analyzer,
    ruleId,
    targets: Array.isArray(targets) ? [...targets] : [],
    analyzedFiles,
    parserFatalErrors,
    failedFiles,
    skippedFiles,
    complete,
  };
}

function formatFatalError(entry) {
  return `${entry.filePath}${COLON_SEPARATOR}${entry.line}` +
    `${COLON_SEPARATOR}${entry.column}${SINGLE_SPACE}${entry.message}`;
}

export function assertScanCompleteness(
  completeness,
  label = DEFAULT_ANALYZER_LABEL,
) {
  if (completeness &&
      completeness.complete === true &&
      completeness.analyzedFiles > ZERO_COUNT &&
      completeness.failedFiles === ZERO_COUNT) {
    return completeness;
  }
  const analyzedFiles = completeness?.analyzedFiles ?? ZERO_COUNT;
  const failedFiles = completeness?.failedFiles ?? ZERO_COUNT;
  const fatalErrors = Array.isArray(completeness?.parserFatalErrors) ?
    completeness.parserFatalErrors :
    [];
  const detailLines = fatalErrors
    .slice(ZERO_COUNT, SCAN_ERROR_DISPLAY_LIMIT)
    .map(formatFatalError);
  const detailSuffix = detailLines.length > ZERO_COUNT ?
    `${NEWLINE_SEPARATOR}${detailLines.join(NEWLINE_SEPARATOR)}` :
    EMPTY_STRING;
  throw new Error(
    `Scan completeness check FAILED for ${label}: ` +
    `analyzedFiles=${analyzedFiles}, failedFiles=${failedFiles}.` +
    detailSuffix,
  );
}

function resolveViolationSubject(violation) {
  if (typeof violation?.subject === TYPE_STRING &&
      violation.subject.trim().length > ZERO_COUNT) {
    return normalizeSubjectLabel(violation.subject, DEFAULT_SUBJECT_LABEL);
  }
  return parseViolationMetadata(violation?.message, violation?.ruleId).subject;
}

function resolveViolationSeverity(violation, getSeverity) {
  if (typeof violation === TYPE_NUMBER && Number.isFinite(violation)) {
    return violation;
  }
  if (typeof getSeverity === TYPE_FUNCTION) {
    const customSeverity = getSeverity(violation);
    if (typeof customSeverity === TYPE_NUMBER &&
        Number.isFinite(customSeverity)) {
      return customSeverity;
    }
  }
  if (typeof violation?.severity === TYPE_NUMBER &&
      Number.isFinite(violation.severity)) {
    return violation.severity;
  }
  return parseViolationMetadata(violation?.message, violation?.ruleId).severity;
}

function computeViolationIdentity(
  violation,
  occurrenceCounts,
  getKey,
  baselineMap,
) {
  if (typeof violation?.identity === TYPE_STRING &&
      OCCURRENCE_SUFFIX_PATTERN.test(violation.identity)) {
    return violation.identity;
  }
  const subject = resolveViolationSubject(violation);
  const defaultBaseKey =
    `${violation?.filePath || EMPTY_STRING}${IDENTITY_SEPARATOR}${subject}`;
  const rawBaseKey = typeof getKey === TYPE_FUNCTION ?
    String(getKey(violation)) :
    defaultBaseKey;
  if (OCCURRENCE_SUFFIX_PATTERN.test(rawBaseKey)) {
    return rawBaseKey;
  }
  const occurrenceIndex = (occurrenceCounts.get(rawBaseKey) || ZERO_COUNT) + 1;
  occurrenceCounts.set(rawBaseKey, occurrenceIndex);
  const indexedIdentity =
    `${rawBaseKey}${OCCURRENCE_SEPARATOR}${occurrenceIndex}`;
  if (baselineMap &&
      !baselineMap.has(indexedIdentity) &&
      baselineMap.has(rawBaseKey)) {
    return rawBaseKey;
  }
  return indexedIdentity;
}

function normalizeBaselineMap(baselineEntries, getKey, getSeverity) {
  const baselineMap = new Map();
  if (!baselineEntries) {
    return baselineMap;
  }
  if (baselineEntries instanceof Map) {
    for (const [identity, value] of baselineEntries.entries()) {
      baselineMap.set(
        String(identity),
        resolveViolationSeverity(value, getSeverity),
      );
    }
    return baselineMap;
  }
  if (Array.isArray(baselineEntries)) {
    const occurrenceCounts = new Map();
    for (const entry of baselineEntries) {
      const identity = typeof entry?.identity === TYPE_STRING ?
        entry.identity :
        computeViolationIdentity(entry, occurrenceCounts, getKey, null);
      baselineMap.set(identity, resolveViolationSeverity(entry, getSeverity));
    }
    return baselineMap;
  }
  if (typeof baselineEntries === TYPE_OBJECT) {
    for (const [identity, value] of Object.entries(baselineEntries)) {
      baselineMap.set(
        identity,
        resolveViolationSeverity(value, getSeverity),
      );
    }
  }
  return baselineMap;
}

export function evaluateIdentitySeverityRatchet({
  violations = [],
  baselineEntries = {},
  getKey = null,
  getSeverity = null,
} = {}) {
  const baselineMap = normalizeBaselineMap(
    baselineEntries,
    getKey,
    getSeverity,
  );
  const occurrenceCounts = new Map();
  const currentMap = new Map();
  const newViolations = [];
  const worsenedViolations = [];
  const improvedViolations = [];

  for (const violation of violations) {
    const identity = computeViolationIdentity(
      violation,
      occurrenceCounts,
      getKey,
      baselineMap,
    );
    const severity = resolveViolationSeverity(violation, getSeverity);
    const subject = resolveViolationSubject(violation);
    currentMap.set(identity, severity);
    if (!baselineMap.has(identity)) {
      newViolations.push({
        ...violation,
        subject,
        severity,
        identity,
      });
      continue;
    }
    const baselineSeverity = baselineMap.get(identity);
    if (severity > baselineSeverity) {
      worsenedViolations.push({
        ...violation,
        subject,
        severity,
        baselineSeverity,
        identity,
      });
    } else if (severity < baselineSeverity) {
      improvedViolations.push({
        ...violation,
        subject,
        severity,
        baselineSeverity,
        identity,
      });
    }
  }

  const removedIdentities = [];
  for (const identity of baselineMap.keys()) {
    if (!currentMap.has(identity)) {
      removedIdentities.push(identity);
    }
  }

  const currentEntries = Object.fromEntries(
    [...currentMap.entries()].sort(([left], [right]) =>
      left.localeCompare(right)),
  );

  return {
    newViolations,
    worsenedViolations,
    removedIdentities,
    improvedViolations,
    currentEntries,
    ok: newViolations.length === ZERO_COUNT &&
      worsenedViolations.length === ZERO_COUNT,
  };
}

export function printRatchetTighteningHint(label, current, baseline, filePath) {
  if (current < baseline) {
    console.log(
      `Baseline can be tightened from ${baseline} to ${current} in ${label}: ` +
      `${filePath}.`,
    );
  }
}
