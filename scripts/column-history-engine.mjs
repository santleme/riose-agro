import {FarmEngine} from '../src/client/engine.js';
import {ActivityHistoryColumns} from './activity-history-columns.mjs';

export class ColumnHistoryEngine extends FarmEngine {
  recordActivity(animal, reason, observedThirst = animal.thirst, announce = true) {
    if (!this.activityColumns) return super.recordActivity(animal, reason, observedThirst, announce);
    this.activityColumns.pushValues(animal.id, this.state.hour, animal.action, reason, this.state.hour % 24, observedThirst, this.state.config.housing);
    if (announce) {
      const activity = {grazing: 'pastando', feeding: 'no cocho', drinking: 'bebendo água', resting: 'descansando'}[animal.action];
      this.log(animal.name + ': ' + activity + '.', animal.id);
    }
  }

  constructor(seed, count) {
    super(seed, count);
    this.activityColumns = new ActivityHistoryColumns(count);
    for (const animal of this.state.animals) {
      for (const record of animal.history) this.activityColumns.push(animal.id, record);
      delete animal.history; delete animal.historyNext;
    }
  }

  historyFor(animal) { return animal ? this.activityColumns.historyFor(animal.id) : []; }

  snapshot() {
    const snapshot = super.snapshot();
    snapshot.animals.forEach(animal => { animal.history = this.activityColumns.historyFor(animal.id); });
    return snapshot;
  }
}
