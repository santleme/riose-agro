import {parentPort} from 'node:worker_threads';
import {executeScenario} from './experiments/run-scenarios.js';

parentPort.postMessage({type: 'ready'});

parentPort.on('message', ({taskId, scenario}) => {
  try {
    parentPort.postMessage({taskId, result: executeScenario(scenario)});
  } catch (error) {
    parentPort.postMessage({taskId, error: String(error?.message ?? error)});
  }
});
