import {
  CLI_ARG,
  DEFAULT_EXAMPLES_DIR,
  DEFAULT_TARGET,
} from './examples-runner-constants.js';

const LOCAL_STR_EMPTY = '';
const LOCAL_STR_COMMA = ',';
const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;

/**
 * Split a comma-separated CLI value.
 *
 * @param {string} raw
 * @return {string[]}
 */
function splitCsv(raw) {
  return String(raw || LOCAL_STR_EMPTY)
    .split(LOCAL_STR_COMMA)
    .map((entry) => entry.trim())
    .filter((entry) => Boolean(entry));
}

/**
 * Parse examples runner CLI flags.
 *
 * @param {string[]} argv
 * @return {{
 *   target: string,
 *   examplesDir: string,
 *   include: string[],
 *   exclude: string[],
 *   outputPath: string|null
 * }}
 */
function parseArgs(argv) {
  const args = {
    target: DEFAULT_TARGET,
    examplesDir: DEFAULT_EXAMPLES_DIR,
    include: [],
    exclude: [],
    outputPath: null,
  };

  for (let i = LOCAL_NUM_ZERO; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === CLI_ARG.TARGET && i + LOCAL_NUM_ONE < argv.length) {
      args.target = argv[++i];
    } else if (arg === CLI_ARG.EXAMPLES_DIR && i + LOCAL_NUM_ONE < argv.length) {
      args.examplesDir = argv[++i];
    } else if (arg === CLI_ARG.INCLUDE && i + LOCAL_NUM_ONE < argv.length) {
      args.include = splitCsv(argv[++i]);
    } else if (arg === CLI_ARG.EXCLUDE && i + LOCAL_NUM_ONE < argv.length) {
      args.exclude = splitCsv(argv[++i]);
    } else if (arg === CLI_ARG.OUT && i + LOCAL_NUM_ONE < argv.length) {
      args.outputPath = argv[++i];
    }
  }

  return args;
}

export {parseArgs};
