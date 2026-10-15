const actions = {grazing: 0, feeding: 1, drinking: 2, resting: 3};
const actionNames = ['grazing', 'feeding', 'drinking', 'resting'];
const housings = {pasture: 0, barn: 1};
const housingNames = ['pasture', 'barn'];

export class ActivityHistoryColumns {
  constructor(animalCount, capacity = 40) {
    if (!Number.isInteger(animalCount) || animalCount < 1) throw new RangeError('animalCount must be a positive integer');
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 255) throw new RangeError('capacity must be 1–255');
    this.animalCount = animalCount;
    this.capacity = capacity;
    const slots = animalCount * capacity;
    this.hour = new Uint32Array(slots);
    this.action = new Uint8Array(slots);
    this.reason = new Uint8Array(slots);
    this.observedHour = new Uint8Array(slots);
    this.thirst = new Float64Array(slots);
    this.housing = new Uint8Array(slots);
    this.head = new Uint8Array(animalCount);
    this.length = new Uint8Array(animalCount);
    this.reasons = [];
    this.reasonCodes = new Map();
  }

  push(animalId, record) {
    this.pushValues(animalId, record.hour, record.action, record.reason, record.observed.hour, record.observed.thirst, record.observed.housing);
  }

  pushValues(animalId, hour, action, reason, observedHour, thirst, housing) {
    const animalIndex = animalId - 1;
    if (!Number.isInteger(animalIndex) || animalIndex < 0 || animalIndex >= this.animalCount) throw new RangeError(`unknown animal ID ${animalId}`);
    const actionCode = actions[action], housingCode = housings[housing];
    if (actionCode === undefined || housingCode === undefined) throw new TypeError('activity contains an unsupported action or housing value');
    let reasonCode = this.reasonCodes.get(reason);
    if (reasonCode === undefined) {
      reasonCode = this.reasons.length;
      if (reasonCode > 255) throw new RangeError('activity reason dictionary exceeds 256 values');
      this.reasonCodes.set(reason, reasonCode); this.reasons.push(reason);
    }
    const slot = animalIndex * this.capacity + this.head[animalIndex];
    this.hour[slot] = hour; this.action[slot] = actionCode; this.reason[slot] = reasonCode;
    this.observedHour[slot] = observedHour; this.thirst[slot] = thirst; this.housing[slot] = housingCode;
    this.head[animalIndex] = (this.head[animalIndex] + 1) % this.capacity;
    this.length[animalIndex] = Math.min(this.capacity, this.length[animalIndex] + 1);
  }

  historyFor(animalId) {
    const animalIndex = animalId - 1;
    if (!Number.isInteger(animalIndex) || animalIndex < 0 || animalIndex >= this.animalCount) return [];
    const count = this.length[animalIndex], start = (this.head[animalIndex] - count + this.capacity) % this.capacity, history = [];
    for (let offset = 0; offset < count; offset++) {
      const slot = animalIndex * this.capacity + (start + offset) % this.capacity;
      history.push({
        hour: this.hour[slot],
        action: actionNames[this.action[slot]],
        reason: this.reasons[this.reason[slot]],
        observed: {hour: this.observedHour[slot], thirst: this.thirst[slot], housing: housingNames[this.housing[slot]]}
      });
    }
    return history;
  }
}
