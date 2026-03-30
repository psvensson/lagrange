const fs = require('fs');
const path = require('path');
const lines = fs.readFileSync(0, 'utf8').split('\n'); // read from stdin
const counts = {};
lines.forEach(line => {
    const match = line.match(/"error": "(.*)"/);
    if (match && match[1]) {
        let err = match[1];
        // Strip out exact ms values and specific node info to aggregate
        err = err.replace(/\d+ms/g, 'Nms').replace(/attempts=\d+/g, 'attempts=N').replace(/elapsedMs=\d+/g, '').replace(/lastProgressElapsedMs=\d+/g, '');
        counts[err] = (counts[err] || 0) + 1;
    }
});
for (const [err, count] of Object.entries(counts)) {
    if (err && err !== 'No issues') {
        console.log(`[${count}] ${err.substring(0,250)}`);
    }
}
