// A finite endpoint collaborator for client/runner controls. It is not native
// sensor evidence: its pinned program records every requested decision.
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  THERMAL_ENDPOINT_ENV, THERMAL_DEADLINE_ENV, TEST_EXECUTION_CONTEXT_ENV,
} from '../../scripts/checks/wait-for-thermal-headroom.js';

const FIXTURE_BUDGET_MS = 360000;
const PYTHON = '/usr/bin/python3';
const BOOT = 'native-thermal-fixture-boot';
const SENSOR_POLICY = Object.freeze({
  mode: 'sensor-required', cadence_ms: 0, max_concurrency: 4,
});

export function nativeThermalFixture(t, {policy = SENSOR_POLICY,
  outcomes = ['READY'], ledger = null} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-thermal-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const entry = path.join(root, 'observer.py');
  const config = path.join(root, 'config.json');
  const counter = path.join(root, 'counter');
  fs.writeFileSync(config, JSON.stringify({policy, outcomes, ledger, counter}));
  fs.writeFileSync(entry, [
    'import hashlib, json, pathlib, sys, time',
    'config = pathlib.Path(sys.argv[sys.argv.index("--config") + 1])',
    'data = json.loads(config.read_bytes())',
    'counter = pathlib.Path(data["counter"])',
    'index = int(counter.read_text()) if counter.exists() else 0',
    'counter.write_text(str(index + 1))',
    'outcome = data["outcomes"][min(index, len(data["outcomes"]) - 1)]',
    'if data["ledger"]:',
    '    with open(data["ledger"], "a") as stream:',
    '        stream.write(json.dumps({"kind": "observe", "outcome": outcome}) + "\\n")',
    'value = {"schema": "lab3-thermal-observation/v1", "outcome": outcome,',
    '  "observations": None if outcome == "UNAVAILABLE" else {name: {',
    '    "path": "/fixture/" + name, "millidegrees": 40000, "hwmon_name": "fixture",',
    '    "device": "/fixture/device/" + name, "label": None} for name in ("cpu", "ssd")},',
    '  "cooling_reason": "fixture hold" if outcome == "HOLD" else None,',
    '  "abort_reason": None,',
    '  "reason": "fixture unavailable" if outcome == "UNAVAILABLE" else None,',
    `  "boot_id": ${JSON.stringify(BOOT)}, "observed_at": int(time.time() * 1000),`,
    '  "source_sha256": hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),',
    '  "config_sha256": hashlib.sha256(config.read_bytes()).hexdigest(),',
    '  "execution_policy": data["policy"]}',
    'print(json.dumps(value))',
    'sys.exit(2 if outcome == "UNAVAILABLE" else 0)',
    '',
  ].join('\n'));
  const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const endpoint = {schema: 'native-thermal-endpoint/v1', python: PYTHON, entry, config,
    sourceSha256: hash(entry), configSha256: hash(config), bootId: BOOT};
  const env = {...process.env,
    [THERMAL_ENDPOINT_ENV]: JSON.stringify(endpoint),
    [THERMAL_DEADLINE_ENV]: String(Date.now() + FIXTURE_BUDGET_MS)};
  // Explicit undefined clears a caller phase even when the library merges
  // process.env with this complete fixture environment. Node omits it at spawn.
  env[TEST_EXECUTION_CONTEXT_ENV] = undefined;
  delete env.NODE_TEST_CONTEXT;
  return {root, entry, config, endpoint, env, counter};
}
