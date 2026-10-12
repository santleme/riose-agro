import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadScientificCorpus, searchScientificSources} from '../scripts/scientific-retrieval.js';

const corpus = [
  {source_id: 'data/a/manifest.json', path: 'data/a/manifest.json', content: '{\n  "title": "Pasture intake study",\n  "doi": "10.1234/example"\n}'},
  {source_id: 'docs/evidence/b.json', path: 'docs/evidence/b.json', content: '{\n  "question": "Pasture growth and animal intake",\n  "limits": "observational"\n}'},
  {source_id: 'docs/c.md', path: 'docs/c.md', content: '# Cattle\n\nPasture intake and forage growth were measured.'},
];

test('retrieval returns top-K exact local snippets with explainable lexical scores', () => {
  const results = searchScientificSources('pasture intake growth', corpus, {topK: 2});

  assert.equal(results.length, 2);
  assert.equal(results[0].source_id, 'docs/c.md');
  assert.equal(results[0].snippet, 'Pasture intake and forage growth were measured.');
  assert.deepEqual(results[0].location, {path: 'docs/c.md', start_line: 3, end_line: 3});
  assert.deepEqual(results[0].score, {
    value: 1,
    matched_terms: ['growth', 'intake', 'pasture'],
    total_query_terms: 3,
    explanation: 'matched unique query terms / unique query terms',
  });
});

test('retrieval is deterministic across corpus order and breaks ties by source and line', () => {
  const query = 'pasture intake';
  assert.deepEqual(searchScientificSources(query, corpus), searchScientificSources(query, [...corpus].reverse()));
});

test('score ties follow source paths even when source IDs sort in the opposite order', () => {
  const docs = [
    {source_id: 'z-source', path: 'docs/a.md', content: 'Pasture intake in source A.'},
    {source_id: 'a-source', path: 'docs/z.md', content: 'Pasture intake in source Z.'},
  ];

  assert.equal(searchScientificSources('pasture intake', docs, {topK: 1})[0].location.path, 'docs/a.md');
  assert.deepEqual(searchScientificSources('pasture intake', docs), searchScientificSources('pasture intake', [...docs].reverse()));
});

test('retrieval returns no results for empty or unmatched queries', () => {
  assert.deepEqual(searchScientificSources('unavailable terminology', corpus), []);
  assert.deepEqual(searchScientificSources('   ', corpus), []);
});

test('repository corpus reuses scientific evidence metadata and returns verifiable file locations', () => {
  const documents = loadScientificCorpus();
  const result = searchScientificSources('10.15482/USDA.ADC/1524788', documents, {topK: 1})[0];

  assert.ok(documents.some(document => document.source_id === 'data/usda-cper/manifest.json'));
  assert.equal(result.source_id, 'data/usda-cper/manifest.json');
  assert.equal(result.location.path, result.source_id);
  const fileLines = readFileSync(new URL(`../${result.location.path}`, import.meta.url), 'utf8').replace(/\r\n?/g, '\n').split('\n');
  const locatedText = fileLines.slice(result.location.start_line - 1, result.location.end_line).join('\n');
  assert.equal(result.snippet, locatedText);
  assert.ok(result.snippet.includes('10.15482/USDA.ADC/1524788'));
});

test('invalid top-K and malformed corpus inputs fail clearly', () => {
  assert.throws(() => searchScientificSources('cattle', corpus, {topK: 0}), /topK must be a positive integer/);
  assert.throws(() => searchScientificSources('cattle', [{}]), /source_id, path, and content/);
});
