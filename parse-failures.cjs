const fs = require('fs');
const path = require('path');

const dir = 'test-output/reports';
const files = fs.readdirSync(dir).filter(f => f.includes('20260324T084427Z') || f.includes('task16-seed-restart-under-load'));

const problems = {};

files.forEach(f => {
    if (!f.endsWith('.json')) return;
    try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (data.status !== 'failed' && !data.error && (!data.metrics || !data.metrics.some(m => m.name === 'error'))) {
            // Check test results if available
            if (data.results && data.results.failed) {
               // failed
            } else {
               return; // passed
            }
        }
        
        let errorMsg = data.error || (data.status === 'failed' ? "status=failed" : "unknown");
        
        // try to extract from steps or results
        if (data.results && data.results.error) errorMsg = data.results.error;
        if (data.steps && data.steps.length > 0) {
            const failedStep = data.steps.find(s => s.status === 'failed');
            if (failedStep) {
                errorMsg = failedStep.error || failedStep.name + " failed";
            }
        }
        if (data.results && data.results.runError) errorMsg = data.results.runError.message || data.results.runError;

        if (data.error && typeof data.error === 'object' && data.error.message) {
            errorMsg = data.error.message;
        } else if (typeof data.error === 'string') {
            errorMsg = data.error;
        }

        if (data.runError && typeof data.runError === 'object' && data.runError.message) {
             errorMsg = data.runError.message;
        }
        
        // Harness timeout reason
        if (data.timeoutReason) {
            errorMsg = "Timeout Reason: " + data.timeoutReason + " (" + (data.error ? JSON.stringify(data.error) : "") + ")";
        }

        // Just dump the top-level error object maybe if not captured
        if (data.details && data.details.error) {
             errorMsg += " | " + JSON.stringify(data.details.error);
        }

        // check bestReasons
        if (data.error && data.error.bestReasons) {
             errorMsg += " | Reasons: " + data.error.bestReasons;
        }

        if (!problems[errorMsg]) {
            problems[errorMsg] = [];
        }
        problems[errorMsg].push(f);
    } catch(e) {
        console.error("Could not parse", f, e.message);
    }
});

console.log(JSON.stringify(problems, null, 2));
