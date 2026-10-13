const RNG_MULTIPLIER=1664525;
const RNG_INCREMENT=1013904223;

export class AnimalViewState {
  locomotionSeed;
  #animals=new Map();

  constructor(locomotionSeed=0){this.locomotionSeed=locomotionSeed>>>0;}
  random(){this.locomotionSeed=(Math.imul(RNG_MULTIPLIER,this.locomotionSeed)+RNG_INCREMENT)>>>0;return this.locomotionSeed/4294967296;}
  get(animalId){return this.#animals.get(animalId);}
  set(animalId,position){this.#animals.set(animalId,{x:position.x,y:position.y,targetX:position.targetX,targetY:position.targetY});}
  toSnapshotAnimals(animals){
    return animals.map(animal=>{
      const position=this.#animals.get(animal.id);
      const {history,...domain}=animal;
      const snapshot={...domain,...position};
      if(history!==undefined)snapshot.history=structuredClone(history);
      return snapshot;
    });
  }
  static fromSnapshot(snapshot,animals){
    const state=new AnimalViewState(snapshot.locomotionSeed);
    const savedById=new Map(snapshot.animals.map(animal=>[animal.id,animal]));
    for(const animal of animals){
      const legacy=savedById.get(animal.id);
      if(!legacy)continue;
      const fallbackX=legacy.patch===1||legacy.patch===3?267.5:102.5;
      const fallbackY=legacy.patch>=2?230:95;
      const x=Number.isFinite(legacy.x)?legacy.x:fallbackX;
      const y=Number.isFinite(legacy.y)?legacy.y:fallbackY;
      state.set(animal.id,{
        x,y,
        targetX:Number.isFinite(legacy.targetX)?legacy.targetX:x,
        targetY:Number.isFinite(legacy.targetY)?legacy.targetY:y
      });
    }
    return state;
  }
}

export function createAnimalViewStateDTO(animals,viewState){
  const positions=viewState instanceof AnimalViewState?null:new Map(viewState.animals.map(animal=>[animal.id,animal]));
  return {animals:animals.map(animal=>{
    const {x,y}=viewState instanceof AnimalViewState?viewState.get(animal.id):positions.get(animal.id);
    return {id:animal.id,name:animal.name,action:animal.action,x,y};
  })};
}

export function separateLegacySnapshot(snapshot){
  const animals=snapshot.animals.map(animal=>{
    const {x,y,targetX,targetY,...domain}=animal;
    return domain;
  });
  const viewAnimals=snapshot.animals.map(({id,x,y,targetX,targetY})=>({id,x,y,targetX,targetY}));
  const {locomotionSeed,...domainSnapshot}=snapshot;
  return {state:{...domainSnapshot,animals},viewState:{animals:viewAnimals,locomotionSeed}};
}

export function combineLegacySnapshot(state,viewState){
  const positions=new Map(viewState.animals.map(animal=>[animal.id,animal]));
  const animals=state.animals.map(animal=>{
    const {history,...domain}=animal;
    const {x,y,targetX,targetY}=positions.get(animal.id)??{};
    return {...domain,x,y,targetX,targetY,history};
  });
  return {...state,animals,locomotionSeed:viewState.locomotionSeed};
}
