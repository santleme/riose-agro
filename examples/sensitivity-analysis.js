import {FarmEngine} from '../engine.js';
import {analyzeSensitivity} from '../sensitivity-analysis.js';

const engine = new FarmEngine(417, 4);
engine.configure({diet: 'balanced', housing: 'pasture', weather: 'normal', supplement: 1});
engine.tick(24);

const analysis = analyzeSensitivity({
  snapshot: engine.snapshot(),
  targetVariable: 'supplement',
  values: [0, 1, 2],
  durationHours: 24,
  outputs: ['weight', 'gain', 'cost'],
});

process.stdout.write(`${JSON.stringify(analysis, null, 2)}\n`);
