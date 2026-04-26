import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
  formatStateMachinePressurePreflightSummary,
  runStateMachinePressurePreflight,
} from '../test/distributed/harness/state-machine-pressure-preflight.js';

const ARG_REPORT = '--report';
const ARG_JSON = '--json';
const ENCODING_UTF8 = 'utf8';
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const START_INDEX = 0;
const PROCESS_ARG_SCRIPT_INDEX = 1;
const EMPTY_TEXT = '';
const OPTION_FIELD_REPORT_PATH = 'reportPath';
const OPTION_FIELD_JSON = 'json';
const PROCESS_ARG_OFFSET = 2;
const ARG_VALUE_OFFSET = 1;
const NEXT_ARG_INDEX_OFFSET = 1;
const JSON_INDENT = 2;
const NEWLINE = '\n';
const ERROR_PREFIX = 'State-machine pressure preflight failed: ';

function parseArgs(argv = process.argv.slice(PROCESS_ARG_OFFSET)) {
  const options = {
    [OPTION_FIELD_REPORT_PATH]: EMPTY_TEXT,
    [OPTION_FIELD_JSON]: false,
  };
  for (let index = START_INDEX; index < argv.length;
    index += NEXT_ARG_INDEX_OFFSET) {
    const arg = argv[index];
    if (arg === ARG_REPORT && index + ARG_VALUE_OFFSET < argv.length) {
      options[OPTION_FIELD_REPORT_PATH] = argv[index + ARG_VALUE_OFFSET];
      index += ARG_VALUE_OFFSET;
      continue;
    }
    if (arg === ARG_JSON) {
      options[OPTION_FIELD_JSON] = true;
    }
  }
  return options;
}

async function loadReport(reportPath) {
  if (!reportPath) {
    return {};
  }
  const raw = await readFile(reportPath, ENCODING_UTF8);
  return JSON.parse(raw);
}

async function main(argv = process.argv.slice(PROCESS_ARG_OFFSET)) {
  const options = parseArgs(argv);
  const report = await loadReport(options[OPTION_FIELD_REPORT_PATH]);
  const result = runStateMachinePressurePreflight({report});
  const output = options[OPTION_FIELD_JSON] ?
    JSON.stringify(result, null, JSON_INDENT) :
    formatStateMachinePressurePreflightSummary(result);
  process.stdout.write(output + NEWLINE);
  return result.ready === true ? EXIT_SUCCESS : EXIT_FAILURE;
}

function isDirectRun() {
  return resolve(process.argv[PROCESS_ARG_SCRIPT_INDEX] || EMPTY_TEXT) ===
    fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  main().then((exitCode) => {
    process.exit(exitCode);
  }).catch((error) => {
    process.stderr.write(ERROR_PREFIX + error.message + NEWLINE);
    process.exit(EXIT_FAILURE);
  });
}

export {main, parseArgs};
