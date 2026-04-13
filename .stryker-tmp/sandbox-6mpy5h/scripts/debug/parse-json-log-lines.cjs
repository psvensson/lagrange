// @ts-nocheck
const fs = require('fs');
const logFile = process.argv[2];

if (!logFile || process.argv.includes('--help') || process.argv.includes('-h')) {
  console.error('Usage: node scripts/debug/parse-json-log-lines.cjs <log-file>');
  process.exit(logFile ? 0 : 1);
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
