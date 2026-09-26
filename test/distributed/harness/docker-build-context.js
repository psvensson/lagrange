/**
 * The explicit file list dockerode tars as the image build context.
 *
 * The Dockerfile is the one owner of what the build reads from the context:
 * every source of a `COPY` that is not `--from=<stage>` is sent (a
 * directory source is walked), plus the Dockerfile itself. There is no
 * second hand-kept list here to drift from it (a hardcoded `src` walk once
 * dropped vendor/raft-rs-wasm/ and broke every live harness build).
 *
 * dockerode receives this explicit allowlist. Sending .dockerignore in that
 * tar would make its broad `**` rule remove the recursively requested
 * directories before the daemon can apply the later negations.
 */

import {readFileSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arraySome = Function.call.bind(Array.prototype.some);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);

const ZERO = 0;
const ONE = 1;
const UTF8 = 'utf8';
const LINE_SEPARATOR = /\r?\n/u;
const LINE_CONTINUATION = /\\\s*$/u;
const COPY_INSTRUCTION = /^\s*COPY\s+(.+)$/iu;
const TOKEN_SEPARATOR = /\s+/u;
const JSON_ARRAY_PREFIX = '[';
const FLAG_PREFIX = '--';
const FROM_FLAG_PREFIX = '--from=';
const TRAILING_SEPARATORS = /\/+$/u;
const CURRENT_DIRECTORY = '.';
const DOCKERFILE_UNREADABLE =
  'Dockerfile unreadable while building the image context: ';

/**
 * Join backslash-continued lines so one instruction is one line.
 * @param {string} text
 * @return {Array<string>}
 */
function logicalLines(text) {
  const lines = [];
  let pending = '';
  for (const line of stringSplit(text, LINE_SEPARATOR)) {
    if (LINE_CONTINUATION.test(line)) {
      pending += `${stringReplace(line, LINE_CONTINUATION, '')} `;
      continue;
    }
    lines.push(pending + line);
    pending = '';
  }
  if (pending.length > ZERO) {
    lines.push(pending);
  }
  return lines;
}

function copyOperands(argumentText) {
  const trimmed = stringTrim(argumentText);
  if (stringStartsWith(trimmed, JSON_ARRAY_PREFIX)) {
    return JSON.parse(trimmed);
  }
  return arrayFilter(stringSplit(trimmed, TOKEN_SEPARATOR),
    (token) => token.length > ZERO);
}

/**
 * The context-relative sources of every COPY that reads the build context.
 * @param {string} dockerfileText
 * @return {Array<string>}
 */
function dockerfileContextSources(dockerfileText) {
  const sources = [];
  for (const line of logicalLines(dockerfileText)) {
    const match = COPY_INSTRUCTION.exec(line);
    if (!match) {
      continue;
    }
    const tokens = copyOperands(match[ONE]);
    if (arraySome(tokens,
      (token) => stringStartsWith(token, FROM_FLAG_PREFIX))) {
      continue;
    }
    const operands = arrayFilter(tokens,
      (token) => !stringStartsWith(token, FLAG_PREFIX));
    for (const source of operands.slice(ZERO, -ONE)) {
      const normalized = stringReplace(path.posix.normalize(source),
        TRAILING_SEPARATORS, '');
      if (normalized.length > ZERO && normalized !== CURRENT_DIRECTORY) {
        sources.push(normalized);
      }
    }
  }
  return sources;
}

function appendContextFiles(entries, contextPath, relativePath) {
  const absolute = path.join(contextPath, relativePath);
  let stats = null;
  try {
    stats = statSync(absolute);
  } catch {
    // An absent source is still requested, so the daemon names it in its
    // own COPY failure instead of the build silently omitting it.
    entries.push(relativePath);
    return;
  }
  if (!stats.isDirectory()) {
    entries.push(relativePath);
    return;
  }
  for (const entry of readdirSync(absolute, {withFileTypes: true})) {
    appendContextFiles(entries, contextPath,
      path.join(relativePath, entry.name));
  }
}

function readDockerfile(contextPath, dockerfile) {
  try {
    return readFileSync(path.join(contextPath, dockerfile), UTF8);
  } catch (error) {
    throw new Error(`${DOCKERFILE_UNREADABLE}${error.message}`);
  }
}

/**
 * @param {string} contextPath - Build context directory.
 * @param {string} dockerfile - Dockerfile path relative to the context.
 * @return {{context: string, src: Array<string>}}
 */
function buildImageContext(contextPath, dockerfile) {
  const requested = [dockerfile];
  const sources =
    dockerfileContextSources(readDockerfile(contextPath, dockerfile));
  for (const source of sources) {
    appendContextFiles(requested, contextPath, source);
  }
  const entries = Array.from(new Set(arrayFilter(requested,
    (entry) => typeof entry === 'string' && entry.length > ZERO,
  ))).sort();
  return {
    context: contextPath,
    src: entries,
  };
}

export {buildImageContext};
