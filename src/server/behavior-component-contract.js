import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const interfaceSchema = JSON.parse(readFileSync(new URL('../../schemas/behavioral-agent-interfaces-v1.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({allErrors: true, strict: true});
addFormats(ajv);
const validateSchema = ajv.compile(interfaceSchema);

function fail(reason) {
  return {valid: false, errors: [reason]};
}

function isExplicitTimestamp(value) {
  return typeof value === 'string'
    && /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,9})?)?(?:Z|[+-]\d\d:\d\d)$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function isLocalWallClock(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.(\d{1,9}))?)?$/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second = '0'] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1
    && date.getUTCDate() === Number(day) && Number(hour) <= 23 && Number(minute) <= 59 && Number(second) <= 59;
}

export function validateBehaviorComponentMessage(message) {
  if (!validateSchema(message)) {
    return {valid: false, errors: (validateSchema.errors ?? []).map(error => `${error.instancePath || '/'} ${error.message}`)};
  }
  if (message.time) {
    const {start, end, offsetStatus} = message.time;
    const validTimestamps = offsetStatus === 'explicit'
      ? isExplicitTimestamp(start) && isExplicitTimestamp(end)
      : isLocalWallClock(start) && isLocalWallClock(end);
    if (!validTimestamps) return fail('/time timestamps do not match the declared offset status');
    const after = offsetStatus === 'explicit' ? Date.parse(end) > Date.parse(start) : end > start;
    if (!after) return fail('/time end must be later than start');
    if (message.componentId === 'observation-model') {
      const validRecordTimestamp = offsetStatus === 'explicit' ? isExplicitTimestamp : isLocalWallClock;
      if (message.records.some(record => !validRecordTimestamp(record.timestamp))) return fail('/records timestamps do not match the declared offset status');
    }
  }

  if (message.componentId === 'behavior-policy') {
    const labels = new Set(message.ontology.labels);
    if (message.sequence.some(item => !labels.has(item.activity))) return fail('/sequence contains an activity outside the declared ontology');
  }

  if (message.componentId === 'observation-model') {
    const labels = new Set(message.ontology.labels);
    if (message.records.some(item => item.label !== null && !labels.has(item.label) && item.status !== 'unmapped')) {
      return fail('/records contains a label outside the declared ontology without unmapped status');
    }
  }

  return {valid: true, errors: []};
}
