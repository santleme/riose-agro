#!/usr/bin/env node
import {readdir, readFile, mkdir, writeFile} from 'node:fs/promises';
import {basename, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import {FarmEngine} from '../engine.js';

const schemaPath = fileURLToPath(new URL('../schemas/scenario.schema.json', import.meta.url));
const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
const validateShape = new Ajv2020({allErrors: true, strict: true}).compile(schema);
const defaultScenarioDirectory = fileURLToPath(new URL('../tests/scenarios/', import.meta.url));
const defaultResultDirectory = fileURLToPath(new URL('../.test-results/scenarios/', import.meta.url));

function formatValidationError(error) {
  return `${error.instancePath || '/'} ${error.message}`;
}

export function validateScenario(scenario) {
  if (validateShape(scenario)) return {valid: true, errors: []};
  return {valid: false, errors: validateShape.errors.map(formatValidationError)};
}

function readPointer(value, pointer) {
  return pointer.slice(1).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((current, key) => current == null ? undefined : current[key], value);
}

function checkAssertion(actual, assertion) {
  const expected = assertion.value;
  switch (assertion.operator) {
    case 'equals': return Object.is(actual, expected);
    case 'greaterThan': return typeof actual === 'number' && actual > expected;
    case 'lessThan': return typeof actual === 'number' && actual < expected;
    case 'approximatelyEquals': return typeof actual === 'number' && typeof expected === 'number'
      && Math.abs(actual - expected) <= (assertion.tolerance ?? 1e-6);
    default: return false;
  }
}

function failedResult(scenario, errors) {
  return {
    formatVersion: 1,
    scenarioId: typeof scenario?.scenarioId === 'string' ? scenario.scenarioId : null,
    passed: false,
    errors,
    assertions: [],
    input: scenario ?? null,
    result: null,
  };
}

export function executeScenario(scenario) {
  const validation = validateScenario(scenario);
  if (!validation.valid) return failedResult(scenario, validation.errors);

  try {
    const engine = new FarmEngine(scenario.engine.seed, scenario.engine.animalCount);
    if (scenario.configuration) engine.configure(scenario.configuration);
    engine.tick(scenario.run.hours);
    const output = {state: engine.snapshot(), metrics: engine.metrics()};
    const assertions = scenario.assertions.map(assertion => {
      const actual = readPointer(output, assertion.path);
      const passed = checkAssertion(actual, assertion);
      return {
        path: assertion.path,
        operator: assertion.operator,
        expected: assertion.value,
        ...(assertion.tolerance === undefined ? {} : {tolerance: assertion.tolerance}),
        actual: actual === undefined ? null : actual,
        passed,
        message: passed ? 'passed' : `Expected ${assertion.path} ${assertion.operator} ${JSON.stringify(assertion.value)}; received ${JSON.stringify(actual)}`,
      };
    });
    const errors = assertions.filter(assertion => !assertion.passed).map(assertion => assertion.message);
    return {
      formatVersion: 1,
      scenarioId: scenario.scenarioId,
      passed: errors.length === 0,
      errors,
      assertions,
      input: scenario,
      result: output,
    };
  } catch (error) {
    return failedResult(scenario, [error.message]);
  }
}

export async function runScenarioDirectory(scenarioDirectory, resultDirectory) {
  const scenarioFiles = (await readdir(scenarioDirectory, {withFileTypes: true}))
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => entry.name)
    .sort();
  if (scenarioFiles.length === 0) throw new Error(`No scenario JSON files found in ${scenarioDirectory}`);
  await mkdir(resultDirectory, {recursive: true});

  const results = [];
  for (const file of scenarioFiles) {
    let result;
    try {
      const scenario = JSON.parse(await readFile(resolve(scenarioDirectory, file), 'utf8'));
      result = executeScenario(scenario);
    } catch (error) {
      result = failedResult(null, [`${basename(file)}: ${error.message}`]);
    }
    await writeFile(resolve(resultDirectory, file.replace(/\.json$/i, '.result.json')), `${JSON.stringify(result, null, 2)}\n`);
    results.push({file, ...result});
  }
  return results;
}

async function main() {
  const [scenarioArgument, resultArgument] = process.argv.slice(2);
  const scenarioDirectory = resolve(scenarioArgument ?? defaultScenarioDirectory);
  const resultDirectory = resolve(resultArgument ?? defaultResultDirectory);
  try {
    const results = await runScenarioDirectory(scenarioDirectory, resultDirectory);
    for (const result of results) {
      const label = result.passed ? 'PASS' : 'FAIL';
      process.stdout.write(`${label} ${result.file}${result.errors.length ? `: ${result.errors.join('; ')}` : ''}\n`);
    }
    process.stdout.write(`Results: ${resultDirectory}\n`);
    if (results.some(result => !result.passed)) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
