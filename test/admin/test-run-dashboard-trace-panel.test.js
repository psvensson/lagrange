import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const DASHBOARD_PATH = 'src/admin/static/test-run-dashboard.html';

describe('test-run dashboard trace panel', () => {
  it('renders trace panel controls and output container', async () => {
    const html = await readFile(DASHBOARD_PATH, 'utf8');

    assert.ok(html.includes('id="traceLineageInput"'));
    assert.ok(html.includes('id="traceNodeInput"'));
    assert.ok(html.includes('id="traceLevelsInput"'));
    assert.ok(html.includes('id="traceConnectBtn"'));
    assert.ok(html.includes('id="traceClearBtn"'));
    assert.ok(html.includes('id="traceInfo"'));
    assert.ok(html.includes('id="traceBox"'));
  });

  it('wires websocket endpoint and bounded rendering logic', async () => {
    const html = await readFile(DASHBOARD_PATH, 'utf8');

    assert.ok(html.includes("traceWs: '/api/admin/debug/trace'"));
    assert.ok(html.includes('const TRACE_DISPLAY_LIMIT = 2000;'));
    assert.ok(html.includes('function connectTraceStream()'));
    assert.ok(html.includes('function disconnectTraceStream()'));
    assert.ok(html.includes('function appendTraceLine(line)'));
    assert.ok(html.includes('state.traceLines.length > TRACE_DISPLAY_LIMIT'));
  });
});
