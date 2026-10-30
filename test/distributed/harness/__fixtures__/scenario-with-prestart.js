const events = [];

function clearEvents() {
  events.length = 0;
}

async function preStart() {
  events.push('preStart');
  return Object.freeze({admission: 'fixture-only'});
}

async function run(_cluster, token) {
  events.push('run');
  if (token?.admission !== 'fixture-only') {
    throw new Error('scenario preStart token not forwarded');
  }
  return {status: 'passed'};
}

export {clearEvents, events, preStart, run};
