#!/usr/bin/env node

// Prevention gate: fail if any NUMBERED ordinal module (`*-segment-N`,
// `*-stage-N`, `*-part-N`) exists under src/. The de-ordinalization migration
// reached zero ordinal files; this gate locks that in so the debt cannot
// regenerate. Ordinal filenames carry no semantic meaning, so an LLM (or human)
// cannot locate behavior by path and must grep — exactly the friction the
// migration removed. New large files must be split into semantically named
// owner/boundary modules, never numbered segment/stage/part files.
//
// Reuses the inventory scanner's classification (extractOrdinalTokens via
// buildInventoryFromPaths) rather than a parallel regex, so this gate and the
// inventory cannot drift apart.

import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
  buildInventoryFromPaths,
  collectSourceFiles,
  SOURCE_ROOT,
} from './inventory-ordinal-segments.js';

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NEWLINE = '\n';

// Pure: given a list of file paths, return the ones that carry numbered ordinal
// tokens (the inventory treats exactly these as ordinal entries).
function findOrdinalFiles(filePaths) {
  return buildInventoryFromPaths(filePaths).entries.map((entry) => entry.path);
}

async function runCheck(explicitPaths = null) {
  const filePaths = explicitPaths ?? (await collectSourceFiles(SOURCE_ROOT));
  const offenders = findOrdinalFiles(filePaths);
  if (offenders.length === 0) {
    return {
      ok: true,
      message: `No ordinal (segment/stage/part-N) files under ${SOURCE_ROOT}/.`,
    };
  }
  const lines = [
    `Found ${offenders.length} ordinal file(s) under ${SOURCE_ROOT}/ — these are banned:`,
    ...offenders.map((p) => `  - ${p}`),
    '',
    'Numbered segment/stage/part filenames carry no semantic meaning. Split large',
    'files into semantically named owner/boundary modules behind the existing',
    'entrypoint instead (no digits in the new filename). See',
    'docs/development/llm-dev-process-improvement-plan.md (WS7) and the ordinal inventory.',
  ];
  return {ok: false, message: lines.join(NEWLINE)};
}

function isDirectRun() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  runCheck()
    .then((result) => {
      const stream = result.ok ? process.stdout : process.stderr;
      stream.write(result.message + NEWLINE);
      process.exitCode = result.ok ? EXIT_SUCCESS : EXIT_FAILURE;
    })
    .catch((error) => {
      process.stderr.write(String(error?.message ?? error) + NEWLINE);
      process.exitCode = EXIT_FAILURE;
    });
}

export {findOrdinalFiles, runCheck};
