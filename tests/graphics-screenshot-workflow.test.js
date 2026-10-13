import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflowUrl = new URL('../.github/workflows/graphics-screenshot-regression.yml', import.meta.url);

test('visual regression workflow watches scene, asset, and manifest inputs', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const pullRequestPaths = workflow.match(/  pull_request:\n    paths:\n((?:      - .+\n)+)/)?.[1];
  assert.ok(pullRequestPaths, 'workflow must keep explicit pull request path filters');

  const watchedPaths = new Set([...pullRequestPaths.matchAll(/^      - ['"]?([^'"\n]+)['"]?$/gm)].map(([, path]) => path));
  for (const requiredPath of [
    'graphics-poc/**',
    'assets/**',
    'public/assets/**',
  ]) {
    assert.ok(watchedPaths.has(requiredPath), `visual regression workflow must run when ${requiredPath} changes`);
  }
});
