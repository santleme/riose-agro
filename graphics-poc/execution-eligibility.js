const BLOCKED_STATUSES = new Set(['in-progress', 'review', 'unsupported', 'candidate-integration']);
// The Worker owns numerical state and serialization too; every command is
// gated so a stale Worker cannot answer after the UI switches to dairy.
const WORKER_COMMANDS = new Set(['reset', 'load', 'configure', 'select', 'tick', 'compare', 'replayComparison', 'snapshot']);

function moduleModelIds(module) {
  return Array.isArray(module?.modelIds) ? module.modelIds.filter(id => typeof id === 'string' && id.trim()) : [];
}

/**
 * Resolve whether a scene can issue numeric work. Visual scene loading does not
 * depend on this result. The existing beef engine remains explicitly labeled as
 * demonstrative; scientific modules need a validated status and registered IDs.
 */
export function sceneExecutionAvailability(scene, registeredModelIds = []) {
  const module = scene?.domainModule;
  const productionSystem = scene?.simulation?.productionSystem;
  const status = module?.status ?? 'unsupported';
  const modelIds = moduleModelIds(module);

  if (BLOCKED_STATUSES.has(status)) {
    return {
      available: false,
      status: 'unavailable',
      reason: status === 'review' ? 'Modelo aguardando revisão.' : 'Módulo visual sem modelo numérico elegível.',
      moduleId: module?.moduleId ?? null,
      moduleStatus: status,
      modelIds
    };
  }

  // Keep the legacy beef demo usable while making its non-scientific status explicit.
  if (productionSystem === 'beef' && status === 'demonstrative-unvalidated') {
    return {
      available: true,
      status: 'demonstrative',
      reason: 'Motor demonstrativo, não validado cientificamente.',
      moduleId: module?.moduleId ?? null,
      moduleStatus: status,
      modelIds
    };
  }

  const registered = new Set(registeredModelIds);
  const allModelsRegistered = modelIds.length > 0 && modelIds.every(id => registered.has(id));
  if (status === 'validated' && allModelsRegistered) {
    return {
      available: true,
      status: 'validated',
      reason: null,
      moduleId: module?.moduleId ?? null,
      moduleStatus: status,
      modelIds
    };
  }

  return {
    available: false,
    status: 'unavailable',
    reason: modelIds.length ? 'Modelo não registrado para execução nesta versão.' : 'Nenhum modelo numérico registrado para este módulo.',
    moduleId: module?.moduleId ?? null,
    moduleStatus: status,
    modelIds
  };
}

export function assertSceneCommandAllowed(scene, command, registeredModelIds = []) {
  if (!WORKER_COMMANDS.has(command)) return sceneExecutionAvailability(scene, registeredModelIds);
  const availability = sceneExecutionAvailability(scene, registeredModelIds);
  if (!availability.available) {
    throw new Error(`Execução numérica indisponível: ${availability.reason}`);
  }
  return availability;
}

/** JSON-safe unavailable adapter for UI/result boundaries; it carries no outputs. */
export function unavailableExecutionState(scene) {
  const availability = sceneExecutionAvailability(scene);
  return {
    schemaVersion: 1,
    kind: 'numeric-execution-unavailable',
    moduleId: availability.moduleId,
    moduleStatus: availability.moduleStatus,
    status: availability.status,
    reason: availability.reason,
    modelIds: availability.modelIds
  };
}

/** Stop an in-flight numeric Worker when the UI enters a visual-only scene. */
export function terminateNumericWorker(worker, pending = []) {
  worker?.terminate?.();
  for (const request of pending.splice(0)) request.resolve?.({type: 'stale'});
}
