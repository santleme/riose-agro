"""Derive descriptive comparison from frozen raw predictions; never train or tune."""
import hashlib
import json
from pathlib import Path
import statistics
from laya_intent_worker import summarize

ROOT = Path(__file__).resolve().parents[2]
fixture_bytes = (ROOT / 'tests/fixtures/intent-routing-v1.json').read_bytes()
fixture = json.loads(fixture_bytes)
fixture_sha = hashlib.sha256(fixture_bytes).hexdigest()
raw = {name: json.loads((ROOT / f'docs/evidence/{path}').read_text()) for name, path in {
    'laya': 'laya-routing-cpu-v1.json', 'deterministic': 'deterministic-routing-v1.json', 'groq': 'groq-routing-v1.json'}.items()}
report = {'type': 'riose-intent-routing-comparison', 'version': 1, 'fixtureSha256': fixture_sha, 'final': {},
          'limitation': '16 developer-authored final smoke cases; no real-user/external validation, no calibrated probabilities, no production reliability or biological validity claim.'}
for name, artifact in raw.items():
    if artifact['fixtureSha256'] != fixture_sha:
        raise ValueError('fixture_digest_mismatch')
    by_id = {row['id']: row for row in artifact['cases']}
    rows = []
    for case in fixture['cases']:
        if case['split'] != 'final':
            continue
        prediction = by_id.get(case['id'], {})
        if prediction and (prediction['prompt'] != case['prompt'] or prediction['expected'] != case['expected']):
            raise ValueError('case_or_label_changed')
        rows.append({**case, 'label': prediction.get('label', 'error'), **{k: prediction[k] for k in ['latencyMs', 'metadata'] if k in prediction}})
    metrics = summarize(rows, fixture['labels'])
    durations = sorted(row.get('latencyMs', row.get('metadata', {}).get('latencyMs')) for row in rows if row.get('latencyMs', row.get('metadata', {}).get('latencyMs')) is not None)
    metrics['medianMs'] = statistics.median(durations) if durations else None
    metrics['p95Ms'] = durations[min(len(durations)-1, int(.95*len(durations)))] if durations else None
    metrics['language'] = {lang: summarize([row for row in rows if row['language'] == lang], fixture['labels'])['accuracy'] for lang in ['pt', 'en']}
    report['final'][name] = metrics
laya, parser = report['final']['laya'], report['final']['deterministic']
report['promotionScreen'] = {'accuracyStrictlyImproves': laya['accuracy'] > parser['accuracy'],
    'macroF1StrictlyImproves': laya['macroF1'] > parser['macroF1'],
    'unsupportedRecallComplete': laya['perClass']['unsupported_request']['recall'] == 1,
    'cpuP95Under1000Ms': laya['p95Ms'] is not None and laya['p95Ms'] < 1000}
report['promotionScreenPassed'] = all(report['promotionScreen'].values())
report['routingEnabled'] = False
report['decision'] = 'EXPERIMENTAL_OFF' if not report['promotionScreenPassed'] else 'EXTERNAL_USER_COVERAGE_REQUIRED'
(ROOT / 'docs/evidence/intent-routing-comparison-v1.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'decision': report['decision'], 'screen': report['promotionScreen'], 'final': {key: {k:v for k,v in m.items() if k in ['accuracy','macroF1','medianMs','p95Ms','language']} for key,m in report['final'].items()}}, ensure_ascii=False))
