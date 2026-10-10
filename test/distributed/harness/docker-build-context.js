/**
 * The explicit file list dockerode tars as the image build context.
 *
 * The Dockerfile is the one owner of what the build reads from the context:
 * every source of a `COPY` that is not `--from=<stage>` is sent (a
 * directory source is walked), plus the Dockerfile itself. Constructs that
 * cannot be mapped to explicit entries are refused with a typed error. There is no
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
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringToUpperCase = Function.call.bind(String.prototype.toUpperCase);
const stringTrim = Function.call.bind(String.prototype.trim);

const ZERO = 0;
const ONE = 1;
const UTF8 = 'utf8';
const LINE_SEPARATOR = /\r?\n/u;
const LINE_CONTINUATION = /\\\s*$/u;
const COMMENT_LINE = /^\s*#/u;
const INSTRUCTION = /^\s*(COPY|ADD)\s+(.+)$/iu;
const ADD_INSTRUCTION = 'ADD';
const TOKEN_SEPARATOR = /\s+/u;
const JSON_ARRAY_PREFIX = '[';
const HEREDOC_PREFIX = '<<';
const FLAG_PREFIX = '--';
const FROM_FLAG_PREFIX = '--from=';
const REMOTE_SOURCE = /^(?:https?|git):\/\//iu;
const WILDCARD_CHARACTERS = /[*?[\]]/u;
const TRAILING_SEPARATORS = /\/+$/u;
const CURRENT_DIRECTORY = '.';
const PARENT_DIRECTORY_PREFIX = '..';
const DOCKERFILE_UNREADABLE =
  'Dockerfile unreadable while building the image context: ';

// Constructs the builder cannot map to explicit context entries. The
// builder supports exactly the grammar the repository Dockerfile uses
// (plain shell-form COPY of named files/directories, optional flags,
// --from= stages, comments, backslash continuations); each of these is an
// explicit refusal (R11), never a guessed context.
const DOCKERFILE_CONTEXT_CONSTRUCT = Object.freeze({
  ADD_LOCAL: 'add_local_source',
  HEREDOC: 'heredoc',
  JSON_FORM: 'json_form',
  OUTSIDE_CONTEXT: 'outside_context',
  WHOLE_CONTEXT: 'whole_context',
  WILDCARD: 'wildcard',
});

const DOCKERFILE_CONTEXT_UNSUPPORTED_ERROR_NAME =
  'DockerfileContextUnsupportedError';

class DockerfileContextUnsupportedError extends Error {
  /**
   * @param {string} construct - A DOCKERFILE_CONTEXT_CONSTRUCT value.
   * @param {number} line - 1-based Dockerfile line of the instruction.
   * @param {string} text - The instruction text.
   */
  constructor(construct, line, text) {
    super('Dockerfile construct not supported by the harness build ' +
      `context (${construct}) at line ${line}: ${text}`);
    this.name = DOCKERFILE_CONTEXT_UNSUPPORTED_ERROR_NAME;
    this.construct = construct;
    this.line = line;
  }
}

/**
 * Instructions as Docker reads them: comment lines are removed first (also
 * inside a continuation, and a trailing backslash on a comment continues
 * nothing), then backslash continuations are joined. Each instruction keeps
 * the 1-based line it starts on.
 * @param {string} text
 * @return {Array<{line: number, text: string}>}
 */
function logicalInstructions(text) {
  const instructions = [];
  let pending = null;
  const lines = stringSplit(text, LINE_SEPARATOR);
  for (let index = ZERO; index < lines.length; index += ONE) {
    const line = lines[index];
    if (COMMENT_LINE.test(line)) {
      continue;
    }
    const current = pending || {line: index + ONE, text: ''};
    if (LINE_CONTINUATION.test(line)) {
      current.text += `${stringReplace(line, LINE_CONTINUATION, '')} `;
      pending = current;
      continue;
    }
    current.text += line;
    instructions.push(current);
    pending = null;
  }
  if (pending) {
    instructions.push(pending);
  }
  return instructions;
}

function refuse(construct, instruction) {
  throw new DockerfileContextUnsupportedError(construct, instruction.line,
    stringTrim(instruction.text));
}

function sourceConstruct(source) {
  if (stringStartsWith(source, HEREDOC_PREFIX)) {
    return DOCKERFILE_CONTEXT_CONSTRUCT.HEREDOC;
  }
  if (WILDCARD_CHARACTERS.test(source)) {
    return DOCKERFILE_CONTEXT_CONSTRUCT.WILDCARD;
  }
  const normalized = path.posix.normalize(source);
  if (path.posix.isAbsolute(normalized) ||
      stringStartsWith(normalized, PARENT_DIRECTORY_PREFIX)) {
    return DOCKERFILE_CONTEXT_CONSTRUCT.OUTSIDE_CONTEXT;
  }
  if (stringReplace(normalized, TRAILING_SEPARATORS, '') ===
      CURRENT_DIRECTORY) {
    return DOCKERFILE_CONTEXT_CONSTRUCT.WHOLE_CONTEXT;
  }
  return null;
}

/**
 * The context sources one COPY/ADD instruction reads, or a refusal.
 * @param {string} keyword - COPY or ADD.
 * @param {string} argumentText
 * @param {{line: number, text: string}} instruction
 * @return {Array<string>}
 */
function instructionSources(keyword, argumentText, instruction) {
  const tokens = arrayFilter(
    stringSplit(stringTrim(argumentText), TOKEN_SEPARATOR),
    (token) => token.length > ZERO);
  if (arraySome(tokens, (token) => stringStartsWith(token, FROM_FLAG_PREFIX))) {
    return [];
  }
  const operands = arrayFilter(tokens,
    (token) => !stringStartsWith(token, FLAG_PREFIX));
  if (operands.length > ZERO &&
      stringStartsWith(operands[ZERO], JSON_ARRAY_PREFIX)) {
    refuse(DOCKERFILE_CONTEXT_CONSTRUCT.JSON_FORM, instruction);
  }
  const sources = operands.slice(ZERO, -ONE);
  const isAdd = stringToUpperCase(keyword) === ADD_INSTRUCTION;
  const local = arrayFilter(sources, (source) => !REMOTE_SOURCE.test(source));
  if (isAdd && local.length > ZERO) {
    refuse(DOCKERFILE_CONTEXT_CONSTRUCT.ADD_LOCAL, instruction);
  }
  for (const source of local) {
    const construct = sourceConstruct(source);
    if (construct) {
      refuse(construct, instruction);
    }
  }
  return arrayMap(local, (source) =>
    stringReplace(path.posix.normalize(source), TRAILING_SEPARATORS, ''));
}

/**
 * The context-relative sources of every COPY that reads the build context.
 * @param {string} dockerfileText
 * @return {Array<string>}
 */
function dockerfileContextSources(dockerfileText) {
  const sources = [];
  for (const instruction of logicalInstructions(dockerfileText)) {
    const match = INSTRUCTION.exec(instruction.text);
    if (match) {
      sources.push(...instructionSources(match[ONE], match[2], instruction));
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
 * The context roots the build reads: the Dockerfile and every COPY source
 * (a directory root, not its walked files), from the same parse as
 * buildImageContext. Certification limits its checkout check to them.
 * @param {string} contextPath - Build context directory.
 * @param {string} dockerfile - Dockerfile path relative to the context.
 * @return {Array<string>} Sorted, distinct, context-relative.
 */
function dockerfileContextRoots(contextPath, dockerfile) {
  return Array.from(new Set([dockerfile, ...dockerfileContextSources(
    readDockerfile(contextPath, dockerfile))])).sort();
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

export {
  DOCKERFILE_CONTEXT_CONSTRUCT,
  DockerfileContextUnsupportedError,
  buildImageContext,
  dockerfileContextRoots,
};
