// MEASURED (part A): the liferaft configuration is local, is not replicated,
// and carries no generation.
//
// Three measurements on real production objects: the reconciliation's join
// emits no protocol message at all; a second node's reported membership is
// unchanged by it; and the protocol packet a node builds is identical before
// and after its configuration changes, so a receiver cannot tell the
// configuration moved.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {runConfigurationLocality} from './liferaft-scenarios.js';

test('liferaft configuration is local, unreplicated and without generation',
  async () => {
    const record = await runConfigurationLocality();

    assert.equal(record.protocolMessagesEmitted, 0,
      'a configuration change must have emitted no protocol message');
    assert.notDeepEqual(record.atThreeMembers, record.atTwoMembers,
      'the configuration must actually have changed between the packets');
    assert.deepEqual(record.observerAfter, record.observerBefore,
      'the second node must report exactly the membership it had before');
    assert.equal(record.observerLearnedTheOtherNode, false,
      'the second node must not have learned the first node as a member');
    assert.equal(record.packetsIdenticalAcrossConfigurationChange, true,
      'the packet must be identical across a configuration change: no ' +
      'configuration identity, generation or index travels on the wire');
  });
