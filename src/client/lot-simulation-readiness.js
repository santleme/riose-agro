/**
 * A linked farm-data lot is not automatically an executable FarmEngine state.
 * Keep this gate conservative until a reviewed snapshot-to-engine adapter can
 * map observed units, animal state and paddock state without defaults.
 */
export function assessLotSimulationReadiness(snapshot, lot) {
  const blockers = [];
  if (!snapshot || snapshot.snapshotKind !== 'farm-baseline') {
    blockers.push({
      code: 'NOT_FARM_BASELINE',
      message: 'O snapshot é um recorte observacional, não uma condição inicial completa da fazenda.'
    });
  }
  if (snapshot?.simulationEligibility?.status !== 'ready') {
    blockers.push({
      code: 'SNAPSHOT_NOT_ELIGIBLE',
      message: `Elegibilidade declarada: ${snapshot?.simulationEligibility?.status ?? 'ausente'}.`
    });
  }
  blockers.push({
    code: 'NO_REVIEWED_ENGINE_ADAPTER',
    message: 'Não há adaptador revisado que converta observações do lote em pesos iniciais por animal, estoque dos quatro piquetes, estado do motor e configuração com unidades e proveniência preservadas.'
  });
  blockers.push({
    code: 'NO_OBSERVED_INTERVENTION',
    message: 'Os dados vinculados não definem uma intervenção pareada; ADG observado não pode ser tratado como resposta prevista a pasto ou confinamento.'
  });
  return {
    status: blockers.length ? 'blocked' : 'eligible',
    snapshotId: snapshot?.snapshotId ?? null,
    snapshotKind: snapshot?.snapshotKind ?? null,
    lotId: lot?.id ?? null,
    animalIds: Array.isArray(lot?.animalIds) ? [...lot.animalIds] : [],
    blockers
  };
}
