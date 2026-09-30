import {test} from '../../src/test-helpers/tap.js';
import {
  ENDPOINT_WRITERS,
  ENDPOINT_WRITE_CLASS,
  collectEndpointMutationSites,
} from './endpoint-writer-census.js';

test('every endpoint mutation path is a classified incarnation owner ' +
  '(a new, unclassified endpoint writer fails here)', (t) => {
  const sites = collectEndpointMutationSites();
  t.same(sites.filter((site) => !ENDPOINT_WRITERS[site]), [],
    'no unclassified endpoint mutation site');
  t.same(Object.keys(ENDPOINT_WRITERS).filter((site) => !sites.includes(site)),
    [], 'every classified writer is still a live site (entries only shrink)');
  t.end();
});

test('no endpoint writer is classified dormant: an incarnation-less ' +
  'writer is deleted, never recorded (D5/W-4)', (t) => {
  t.same(Object.values(ENDPOINT_WRITE_CLASS).sort(),
    ['incarnation_fenced', 'virgin_birth_stamped'],
    'the only writer classes carry the node boot incarnation');
  const unfenced = Object.entries(ENDPOINT_WRITERS)
    .filter(([, entry]) =>
      !Object.values(ENDPOINT_WRITE_CLASS).includes(entry.writeClass))
    .map(([site]) => site);
  t.same(unfenced, [], 'every classified writer is fenced or stamped');
  t.end();
});
