const fs = require('fs');
const path = require('path');
const reportFiles = fs.readdirSync('test-output/reports').filter(f => f.includes('20260324T084427Z') || f.includes('task16'));

const problems = {};

for (const file of reportFiles) {
    if (!file.endsWith('.json')) continue;
    try {
        const fullPath = path.join('test-output/reports', file);
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

        let foundError = false;

        // Check if report itself is considered failed
        let isFailed = data.summary?.failed > 0 || data.results?.some(r => r.status === 'failed' || r.error);

        if (isFailed) {
            data.results?.forEach(r => {
                if (r.status === 'failed' || r.error) {
                    let errMsg = r.error;
                    if (typeof errMsg === 'object' && errMsg !== null) errMsg = errMsg.message || JSON.stringify(errMsg);
                    
                    if (!errMsg && r.steps) {
                        const failedStep = r.steps.find(s => s.status === 'failed');
                        if (failedStep) errMsg = failedStep.error || `Step ${failedStep.name} failed`;
                    }
                    if (!errMsg) errMsg = "Unknown failure in " + r.scenarioName;

                    if (!problems[errMsg]) problems[errMsg] = [];
                    problems[errMsg].push(`${file} - ${r.scenarioName}`);
                }
            });
        }
    } catch(e) {
         console.log("Error parsing", file, e.message);
    }
}
console.log(JSON.stringify(problems, null, 2));
