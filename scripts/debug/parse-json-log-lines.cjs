const LOCAL_STR_HELP = '--help';
const LOCAL_STR_H = '-h';
const LOCAL_STR_KRU1O = 'Usage: node scripts/debug/parse-json-log-lines.cjs <log-file>';
const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;

const fs = require('fs');
const logFile = process.argv[2];

if (!logFile || process.argv.includes(LOCAL_STR_HELP) || process.argv.includes(LOCAL_STR_H)) {
  console.error(LOCAL_STR_KRU1O);
  process.exit(logFile ? LOCAL_NUM_ZERO : LOCAL_NUM_ONE);
}

const lines = fs.readFileSync(logFile, 'utf8').split('\n');
lines.forEach((line) => {
  if (!line.trim()) {
    return;
  }
  try {
    const payload = JSON.parse(line);
    console.log(payload.time, payload.subsystem, payload.msg);
  } catch {
    // Ignore non-JSON lines.
  }
});
