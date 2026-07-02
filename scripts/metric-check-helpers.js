import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';


const SCRIPT_FILE_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIRECTORY_PATH = path.dirname(SCRIPT_FILE_PATH);
const REPO_ROOT_PATH = path.resolve(SCRIPT_DIRECTORY_PATH, '..');

export function getRepoPath(...relativePathSegments) {
  return path.join(REPO_ROOT_PATH, ...relativePathSegments);
}

export function writeJsonReport(relativeReportPath, payload) {
  const reportPath = getRepoPath(relativeReportPath);
  fs.mkdirSync(path.dirname(reportPath), {recursive: true});
  fs.writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`);
  return reportPath;
}

export function printRatchetTighteningHint(label, current, baseline, filePath) {
  if (current < baseline) {
    console.log(
      `Baseline can be tightened from ${baseline} to ${current} in ${label}: ` +
      `${filePath}.`,
    );
  }
}
