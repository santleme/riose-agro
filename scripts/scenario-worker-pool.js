import {Worker} from 'node:worker_threads';
import {randomUUID} from 'node:crypto';

/** Small bounded pool for independent, CPU-bound scenario executions. */
export class ScenarioWorkerPool {
  #workers = [];
  #pending = new Map();
  #idle = [];
  #waiters = [];
  #closed = false;

  constructor(size, {maxOldGenerationSizeMb} = {}) {
    if (!Number.isInteger(size) || size < 1) throw new RangeError('worker pool size must be a positive integer');
    if (!Number.isInteger(maxOldGenerationSizeMb) || maxOldGenerationSizeMb < 16) throw new RangeError('maxOldGenerationSizeMb must be at least 16');
    this.maxOldGenerationSizeMb = maxOldGenerationSizeMb;
    this.#workers = Array(size);
    for (let index = 0; index < size; index++) this.#spawn(index);
  }

  #spawn(index) {
    const worker = new Worker(new URL('./scenario-worker.js', import.meta.url), {
      resourceLimits: {maxOldGenerationSizeMb: this.maxOldGenerationSizeMb},
    });
    const record = {worker, index, busy: false, failed: false, ready: false};
    this.#workers[index] = record;
    this.#idle.push(record);
    worker.on('message', message => this.#onMessage(record, message));
    worker.on('error', error => this.#onFailure(record, error));
    worker.on('exit', code => { if (!this.#closed) this.#onFailure(record, new Error(`scenario worker exited with code ${code}`)); });
    const waiter = this.#waiters.shift();
    if (waiter) waiter.resolve(this.#idle.pop());
  }

  async #acquire() {
    if (this.#closed) throw new Error('scenario worker pool is closed');
    if (this.#idle.length) return this.#idle.pop();
    return new Promise((resolve, reject) => this.#waiters.push({resolve, reject}));
  }

  #release(record) {
    record.busy = false;
    const waiter = this.#waiters.shift();
    if (waiter && !this.#closed) waiter.resolve(record);
    else if (!this.#closed) this.#idle.push(record);
  }

  #onMessage(record, message) {
    if (message.type === 'ready') {
      record.ready = true;
      return;
    }
    const task = this.#pending.get(message.taskId);
    if (!task) return;
    this.#pending.delete(message.taskId);
    this.#release(record);
    if (message.error) task.reject(new Error(message.error));
    else task.resolve(message.result);
  }

  #onFailure(record, error) {
    if (record.failed) return;
    record.failed = true;
    for (const [taskId, task] of this.#pending) {
      if (task.record !== record) continue;
      this.#pending.delete(taskId);
      task.reject(error);
    }
    this.#idle = this.#idle.filter(item => item !== record);
    if (!this.#closed) this.#spawn(record.index);
  }

  async execute(scenario) {
    const record = await this.#acquire();
    record.busy = true;
    const taskId = randomUUID();
    return new Promise((resolve, reject) => {
      this.#pending.set(taskId, {record, resolve, reject});
      try { record.worker.postMessage({taskId, scenario}); }
      catch (error) {
        this.#pending.delete(taskId);
        this.#release(record);
        reject(error);
      }
    });
  }

  get size() { return this.#workers.length; }

  async ready() {
    await Promise.all(this.#workers.map(record => record.ready ? Promise.resolve() : new Promise((resolve, reject) => {
      record.worker.once('message', message => message.type === 'ready' ? resolve() : reject(new Error('worker sent a task response before startup')));
      record.worker.once('error', reject);
    })));
  }

  async close() {
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) waiter.reject(new Error('scenario worker pool closed'));
    await Promise.all(this.#workers.map(({worker}) => worker.terminate()));
  }
}
