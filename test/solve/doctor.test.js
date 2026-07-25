import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {adapterSessionWarning, buildDoctorReport, renderDoctor}
  from '../../scripts/solve/doctor.js';
import {inspectAgentConfig} from '../../scripts/solve/agent-executor.js';
import {
  inspectCoauthorAttribution,
  resolveCoauthorTrailer,
} from '../../scripts/solve/operator-config.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'solve-doctor-'));
}

function writeConfig(root, value) {
  const file = path.join(root, 'solve', 'config.json');
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, value);
  return file;
}

tap.test('solve doctor capability inspection', async (t) => {
  t.test('absent, malformed, and disabled configurations select supervised mode', (t) => {
    const root = tmp();
    t.equal(buildDoctorReport(root).recommendedMode, 'supervised');
    t.equal(inspectAgentConfig(root).state, 'absent');

    writeConfig(root, '{broken');
    t.equal(inspectAgentConfig(root).state, 'malformed');

    writeConfig(root, JSON.stringify({enabled: false, agentCommand: process.execPath}));
    t.equal(inspectAgentConfig(root).state, 'disabled');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('an adapter that looks like it resumes a session is flagged', (t) => {
    // The executor contract is one fresh agent per attempt — state travels in the
    // dossier, not in an accumulating conversation. agentCommand is an arbitrary argv
    // template though, so a resuming adapter would silently defeat that and the
    // dossier budget with it. Advisory, never a gate.
    t.match(adapterSessionWarning('claude --resume abc {requestFile} {responseFile}'),
      /--resume/u);
    t.match(adapterSessionWarning('agent --continue {requestFile}'), /--continue/u);
    t.match(adapterSessionWarning('agent --session s1 {requestFile}'), /--session/u);
    t.equal(adapterSessionWarning('node adapter.js {requestFile} {responseFile}'), null,
      'an ordinary one-shot adapter is not flagged');
    t.equal(adapterSessionWarning(null), null, 'an absent command is not flagged');

    const root = tmp();
    writeConfig(root, JSON.stringify({
      enabled: true,
      agentCommand: `${process.execPath} --resume x {requestFile} {responseFile}`,
    }));
    const report = buildDoctorReport(root);
    t.ok(report.agentExecutor.sessionWarning, 'the warning reaches the report');
    t.equal(report.recommendedMode, 'autonomous',
      'it is advisory — it never downgrades the recommended mode');
    t.match(renderDoctor(report), /warning:.*--resume/u, 'and it is rendered');

    writeConfig(root, JSON.stringify({
      enabled: true,
      agentCommand: `${process.execPath} {requestFile} {responseFile}`,
    }));
    t.equal(buildDoctorReport(root).agentExecutor.sessionWarning, null);
    t.notMatch(renderDoctor(buildDoctorReport(root)), /warning:/u,
      'a clean adapter renders no warning line');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('enabled live adapter selects autonomous mode; example adapter never does', (t) => {
    const root = tmp();
    writeConfig(root, JSON.stringify({
      enabled: true,
      agentCommand: `${process.execPath} {requestFile} {responseFile}`,
    }));
    const live = buildDoctorReport(root);
    t.equal(live.recommendedMode, 'autonomous');
    t.equal(live.agentExecutor.available, true);

    writeConfig(root, JSON.stringify({
      enabled: true,
      agentCommand: 'scripts/solve/agent-adapter.example.sh {requestFile} {responseFile}',
    }));
    const example = inspectAgentConfig(root);
    t.equal(example.available, false);
    t.match(example.issues.join('\n'), /no-op reference adapter/u);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('inspection does not mutate the inspected directory', (t) => {
    const root = tmp();
    const config = writeConfig(root, JSON.stringify({enabled: false}));
    const before = fs.readFileSync(config, 'utf8');
    const beforeFiles = fs.readdirSync(path.join(root, 'solve'));
    buildDoctorReport(root);
    t.equal(fs.readFileSync(config, 'utf8'), before);
    t.same(fs.readdirSync(path.join(root, 'solve')), beforeFiles);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('co-author attribution is validated and never defaults to a vendor', (t) => {
    const root = tmp();
    t.equal(resolveCoauthorTrailer(root, {}), null);
    const trailer = 'Co-Authored-By: Example Agent <agent@example.test>';
    t.same(inspectCoauthorAttribution(root, {SOLVE_COAUTHOR_TRAILER: trailer}), {
      configured: true,
      valid: true,
      source: 'environment',
      trailer,
      issue: null,
    });
    t.equal(resolveCoauthorTrailer(root, {SOLVE_COAUTHOR_TRAILER: 'Claude'}), null);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
