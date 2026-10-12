import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const root = new URL('../data/plos-wyffels-dormant-grazing/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
const audit = JSON.parse(await readFile(new URL('../docs/evidence/wyffels-dormant-grazing-audit.json', import.meta.url), 'utf8'));

function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

test('PLOS Wyffels supplements are checksum-pinned and remain scoped to observed cow behavior', async () => {
  assert.match(manifest.source, /10\.1371\/journal\.pone\.0240629/);
  assert.match(audit.source.citation, /PLOS ONE/);
  assert.equal(manifest.license, 'Creative Commons Attribution (CC BY)');
  assert.ok(audit.source.license.startsWith(manifest.license));

  for (const file of manifest.assets) {
    const bytes = await readFile(new URL(file.file, root));
    assert.equal(bytes.length, file.bytes, file.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.file);
  }

  for (const [file, auditKey, metric] of [
    ['S1-Appendix-grazing-minutes.csv', 'S1', 'Time_min'],
    ['S2-Appendix-distance-traveled.csv', 'S2', 'Dist_m'],
  ]) {
    const text = await readFile(new URL(file, root), 'utf8');
    const lines = text.trim().split(/\r?\n/);
    const headers = parseCsvLine(lines[0]);
    const records = lines.slice(1).map(line => {
      const values = parseCsvLine(line);
      assert.equal(values.length, headers.length);
      return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
    });
    const expected = audit.audit[auditKey];
    assert.equal(records.length, expected.rows);
    assert.ok(headers.includes(metric));
    assert.ok(headers.includes('SuppInt'));
    assert.ok(headers.includes('PreWt'));
    assert.ok(records.every(record => record[metric] !== ''));
    assert.equal(new Set(records.map(record => `${record.Year}|${record.CowID}|${record.Date_Time}`)).size, records.length);
    for (const year of ['Y1', 'Y2']) {
      const yearRecords = records.filter(record => record.Year === year);
      const yearSummary = expected.byYear[year];
      assert.equal(yearRecords.length, yearSummary.rows);
      assert.equal(new Set(yearRecords.map(record => record.CowID)).size, yearSummary.cows);
    }
  }

  assert.equal(audit.audit.intendedUse, 'Separate read-only exploratory source for observed adult-cow grazing behavior; not engine validation, calibration, or the principal ADG/pasture case.');
  assert.ok(audit.audit.limitations.some(limit => /No individual ADG/.test(limit)));
  assert.ok(audit.audit.limitations.some(limit => /unit.*not declared/.test(limit)));
  const unitCheck = audit.audit.preWtUnitReconciliation;
  assert.equal(unitCheck.distinctCowYearRecords, 58);
  assert.equal(unitCheck.conversionTest.candidateUnit, 'lb');
  assert.equal(unitCheck.conversionTest.matchesAfterRounding, true);
  assert.ok(Math.abs(unitCheck.conversionTest.convertedMeanKg - unitCheck.conversionTest.publishedArticleMeanKg) < 1);
  assert.match(unitCheck.conclusion, /inferred, not explicitly labeled/);
});
