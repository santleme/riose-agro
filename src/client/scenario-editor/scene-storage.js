const storeKey = 'riose-world-scene-v1';
const activeSceneKey = 'riose-active-scene-v1';

export function createSceneStorage(storage = globalThis.localStorage) {
  return {
    activeSceneId() {
      return storage.getItem(activeSceneKey);
    },
    read(sceneId, {legacyFallback = false} = {}) {
      try {
        const raw = storage.getItem(`${storeKey}:${sceneId}`)
          ?? (legacyFallback ? storage.getItem(storeKey) : null)
          ?? 'null';
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    write(scene, {pretty = false} = {}) {
      try {
        const text = JSON.stringify(scene, null, pretty ? 2 : undefined);
        storage.setItem(`${storeKey}:${scene.metadata.id}`, text);
        storage.setItem(activeSceneKey, scene.metadata.id);
        storage.setItem(storeKey, text);
        return true;
      } catch {
        return false;
      }
    },
  };
}
