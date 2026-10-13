#!/usr/bin/env python3
"""Move or duplicate a relative-offset prefab instance in a Riose scene JSON."""
from pathlib import Path
import argparse
import copy
import json


def load_scene(path):
    path=Path(path)
    scene=json.loads(path.read_text())
    placements={item['placementId']:item for item in scene.get('placements',[])}
    if len(placements)!=len(scene.get('placements',[])):
        raise ValueError('Scene has duplicate placement IDs')
    return scene,placements


def find_prefab(scene,prefab_id):
    for prefab in scene.get('prefabs',[]):
        if prefab.get('id')==prefab_id:
            if not prefab.get('reusable'):
                raise ValueError(f"Prefab is not reusable: {prefab_id}")
            if not prefab.get('placements'):
                raise ValueError(f"Prefab has no placement references: {prefab_id}")
            return prefab
    raise KeyError(f"Prefab not found: {prefab_id}")


def move(scene,prefab_id,dx,dy):
    prefab=find_prefab(scene,prefab_id)
    placements={item['placementId']:item for item in scene['placements']}
    ids=[ref['placementId'] for ref in prefab['placements']]
    if len(ids)!=len(set(ids)) or any(pid not in placements for pid in ids):
        raise ValueError(f"Prefab references are invalid: {prefab_id}")
    for pid in ids:
        item=placements[pid]
        item['anchorPx']=[item['anchorPx'][0]+dx,item['anchorPx'][1]+dy]
        item['depthKey']=item.get('depthKey',item['anchorPx'][1]-dy)+dy
    prefab['originPx']=[prefab['originPx'][0]+dx,prefab['originPx'][1]+dy]
    return scene,len(ids)


def duplicate(scene,prefab_id,instance_id,x,y):
    source=find_prefab(scene,prefab_id)
    placements={item['placementId']:item for item in scene['placements']}
    refs=source['placements']
    source_ids=[ref['placementId'] for ref in refs]
    if len(source_ids)!=len(set(source_ids)) or any(pid not in placements for pid in source_ids):
        raise ValueError(f"Prefab references are invalid: {prefab_id}")
    if any(prefab.get('id')==instance_id for prefab in scene['prefabs']):
        raise ValueError(f"Instance ID already exists: {instance_id}")
    new_refs=[]
    for index,ref in enumerate(refs,1):
        old=placements[ref['placementId']]
        new=copy.deepcopy(old)
        new_id=f'{instance_id}-placement-{index:03d}'
        if new_id in placements:
            raise ValueError(f"Placement ID already exists: {new_id}")
        new['placementId']=new_id
        new['anchorPx']=[x+ref['offsetPx'][0],y+ref['offsetPx'][1]]
        new['depthKey']=new['anchorPx'][1]
        scene['placements'].append(new)
        placements[new_id]=new
        new_refs.append({'placementId':new_id,'offsetPx':list(ref['offsetPx'])})
    instance=copy.deepcopy(source)
    instance.update({'id':instance_id,'sourcePrefabId':prefab_id,'originPx':[x,y],
                     'placements':new_refs})
    scene['prefabs'].append(instance)
    return scene,len(new_refs)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('scene',type=Path)
    parser.add_argument('--prefab-id',required=True)
    parser.add_argument('--output',type=Path,required=True)
    actions=parser.add_subparsers(dest='action',required=True)
    mover=actions.add_parser('move'); mover.add_argument('--delta',nargs=2,type=int,required=True,metavar=('DX','DY'))
    copier=actions.add_parser('duplicate'); copier.add_argument('--instance-id',required=True); copier.add_argument('--origin',nargs=2,type=int,required=True,metavar=('X','Y'))
    args=parser.parse_args()
    scene,_=load_scene(args.scene)
    if args.action=='move': scene,count=move(scene,args.prefab_id,*args.delta)
    else: scene,count=duplicate(scene,args.prefab_id,args.instance_id,*args.origin)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(scene,indent=2,ensure_ascii=False)+'\n')
    print(f"{args.action}d prefab {args.prefab_id}: {count} placements -> {args.output}")

if __name__=='__main__': main()
