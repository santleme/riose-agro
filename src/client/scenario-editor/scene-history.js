const snapshotOf = scene => JSON.stringify(scene);

export function createSceneHistory({limit = 40} = {}) {
  const capacity = Number.isInteger(limit) && limit > 0 ? limit : 40;
  let snapshots = [];
  let cursor = -1;

  return {
    reset(scene) {
      snapshots = [snapshotOf(scene)];
      cursor = 0;
    },
    commit(scene) {
      const snapshot = snapshotOf(scene);
      if (snapshots[cursor] === snapshot) return false;
      snapshots = snapshots.slice(0, cursor + 1);
      snapshots.push(snapshot);
      if (snapshots.length > capacity) snapshots.shift();
      cursor = snapshots.length - 1;
      return true;
    },
    undo() {
      if (cursor <= 0) return null;
      cursor--;
      return JSON.parse(snapshots[cursor]);
    },
  };
}
