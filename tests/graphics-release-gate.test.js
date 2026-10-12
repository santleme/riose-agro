import test from 'node:test';
import assert from 'node:assert/strict';
import {assertGraphicsReleaseReady} from '../scripts/assets/graphics-release-gate.mjs';

test('release packaging refuses the current unreviewed and unresolved graphics manifests', async () => {
  await assert.rejects(assertGraphicsReleaseReady(), error => {
    assert.match(error.message, /^Graphics release blocked \(\d+ manifest issue\(s\)\):/);
    assert.match(error.message, /status REVIEW is not release eligible/);
    assert.match(error.message, /unresolved renderer asset reference/);
    assert.match(error.message, /no documented rights basis/);
    return true;
  });
});
