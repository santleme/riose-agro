import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';

const report = JSON.parse(await readFile(new URL('../docs/evidence/dmi-adg-readiness-v1.json', import.meta.url), 'utf8'));

test('DMI/ADG readiness matrix keeps ordered source references and component outcomes explicit', () => {
  assert.equal(report.schemaVersion, 'riose.dmi-adg-readiness/v1');
  assert.equal(report.domainExpertReview.status, 'pending_not_obtained');
  assert.equal(report.sources.length, report.processing.sourceCount);
  assert.deepEqual(report.sources.map(source => source.id), [...report.sources.map(source => source.id)].sort((a, b) => {
    const declared = ['usda-cper-behavior', 'usda-cper-ltgi', 'dryad-finishing-steers', 'sdsu-individual-dmi', 'grastech-dairy-grazing', 'usda-ars-feedlot-dmi', 'dryad-grazing-yearlings', 'rothamsted-dairy-beef-grazing', 'mdpi-angus-cows', 'public-pasture-dmi-unavailable'];
    return declared.indexOf(a) - declared.indexOf(b);
  }));

  for (const source of report.sources) {
    assert.ok(['available_local', 'unavailable_or_not_reusable'].includes(source.access));
    for (const outcome of Object.values(source.outcomes)) {
      assert.ok(['eligible', 'conditional', 'ineligible'].includes(outcome.status));
      assert.equal(outcome.status === 'ineligible' && outcome.trainable, false);
      if (source.access !== 'available_local') assert.equal(outcome.trainable, false);
    }
    for (const reference of Object.values(source.references)) {
      if (reference) assert.equal(existsSync(new URL(`../${reference}`, import.meta.url)), true, `${source.id}: ${reference}`);
    }
  }

  const inaccessible = report.sources.find(source => source.access !== 'available_local');
  assert.ok(inaccessible);
  assert.equal(inaccessible.outcomes.dmi.trainable, false);
  assert.equal(inaccessible.outcomes.adg.trainable, false);
  assert.ok(report.sources.some(source => source.outcomes.dmi.status === 'conditional'));
  assert.ok(report.sources.some(source => source.outcomes.adg.status === 'conditional'));
});
