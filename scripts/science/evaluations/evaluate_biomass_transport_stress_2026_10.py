#!/usr/bin/env python3
"""Fixed OLS transport stress diagnostics on Mendeley biomass only."""
from __future__ import annotations
import hashlib, json, platform, subprocess, time
from collections import defaultdict
from pathlib import Path
from typing import Any
import numpy as np
import pandas as pd
import sklearn
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error

ROOT = Path(__file__).resolve().parents[3]
PROTOCOL = ROOT / "experiments/diagnostics/biomass/preregister-transport-stress-2026-10.json"
INPUT = ROOT / "data/mendeley-pasture-biomass/processed/pasture-biomass-samples-v1.parquet"
LEGACY_OOF = ROOT / "experiments/biomass/mendeley-spatial-cv/buffered-spatial-oof-predictions.csv"
OUT = ROOT / "experiments/biomass/transport-stress-2026-10"
PREDICTIONS, REPORT_JSON, REPORT_MD = (OUT / "predictions.csv", OUT / "evaluation-report.json", OUT / "evaluation-report.md")
TARGET, HEIGHT = "dry_matter_yield_kg_dm_ha", "sward_height_cm"
COORDS = ["farm", "latitude_deg", "longitude_deg"]
DISTANCES, SEED, BOOTSTRAPS = [0, 25, 100, 250, 500, 1000], 20261013, 10000


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""): h.update(chunk)
    return h.hexdigest()


def haversine_m(lat, lon, lat2, lon2):
    radius = 6371000.0
    lat1r, lon1r = np.radians(lat), np.radians(lon)
    lat2r, lon2r = np.radians(lat2), np.radians(lon2)
    a = np.sin((lat2r-lat1r)/2)**2 + np.cos(lat1r)*np.cos(lat2r)*np.sin((lon2r-lon1r)/2)**2
    return 2*radius*np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def components(frame: pd.DataFrame) -> pd.Series:
    fields = sorted(set(zip(frame.farm.astype(str), frame.field_code.astype(str))))
    parent = {x: x for x in fields}
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for _, rows in frame.groupby(COORDS, sort=True):
        aliases = sorted(set(zip(rows.farm.astype(str), rows.field_code.astype(str))))
        for alias in aliases[1:]:
            a, b = find(aliases[0]), find(alias)
            if a != b: parent[max(a,b)] = min(a,b)
    roots = {x: find(x) for x in fields}
    return pd.Series(["/".join(roots[(str(f),str(c))]) for f,c in zip(frame.farm,frame.field_code)], index=frame.index, dtype="string")


def spatial_folds(frame: pd.DataFrame, buffer_m: float):
    blocks = frame["_block"]
    locations = frame.groupby(COORDS, as_index=False, sort=True).agg(block=("_block", "first"))
    for block in sorted(blocks.unique()):
        test = blocks.eq(block).to_numpy()
        testloc = locations[locations.block.eq(block)]
        candidates = locations[~locations.block.eq(block)]
        tl, tn = testloc.latitude_deg.to_numpy(float), testloc.longitude_deg.to_numpy(float)
        allowed = []
        for row in candidates.itertuples(index=False):
            allowed.append(float(haversine_m(row.latitude_deg,row.longitude_deg,tl,tn).min()) >= buffer_m)
        coords = set(map(tuple,candidates.loc[allowed,COORDS].itertuples(index=False,name=None)))
        train = np.array([(str(f),lat,lon) in coords and str(b) != block for f,lat,lon,b in zip(frame.farm,frame.latitude_deg,frame.longitude_deg,blocks)], dtype=bool)
        yield str(block), train, test


def campaign_split_masks(frame: pd.DataFrame, campaign: str):
    """Test one campaign and exclude every repeated exact farm-coordinate from train."""
    testmask = frame.campaign.astype(str).eq(campaign).to_numpy()
    testcoords = set(map(tuple, frame.loc[testmask, COORDS].drop_duplicates().itertuples(index=False, name=None)))
    trainmask = np.array([not istest and (str(f), lat, lon) not in testcoords for f, lat, lon, istest in zip(frame.farm, frame.latitude_deg, frame.longitude_deg, testmask)], bool)
    overlap = testcoords & set(map(tuple, frame.loc[trainmask, COORDS].drop_duplicates().itertuples(index=False, name=None)))
    removed = int((~testmask).sum() - int(trainmask.sum()))
    return trainmask, testmask, len(testcoords), removed, len(overlap)


def metrics(y, pred):
    if not len(y): raise ValueError("metrics require nonempty vectors")
    return {"rows":int(len(y)),"maeKgDmHa":float(mean_absolute_error(y,pred)),"rmseKgDmHa":float(np.sqrt(mean_squared_error(y,pred))),"biasPredictedMinusObservedKgDmHa":float(np.mean(pred-y))}


def fit_predict(train, test, runtime):
    if train.empty or test.empty: raise ValueError("OLS needs nonempty train and test")
    model=LinearRegression(fit_intercept=True)
    t=time.perf_counter(); model.fit(train[[HEIGHT]].to_numpy(float),train[TARGET].to_numpy(float)); runtime["fitSeconds"]+=time.perf_counter()-t
    t=time.perf_counter(); pred=np.asarray(model.predict(test[[HEIGHT]].to_numpy(float)),float); runtime["predictSeconds"]+=time.perf_counter()-t
    if pred.shape!=(len(test),) or not np.isfinite(pred).all(): raise ValueError("invalid OLS prediction")
    return pred


def rows_for(frame, train_mask, test_mask, pred, analysis, fold, lo, hi, buffer=None):
    test=frame.loc[test_mask]; out=[]
    for (idx,r),p in zip(test.iterrows(),pred):
        out.append({"analysis":analysis,"fold":fold,"source_row_index":int(idx),"farm":str(r.farm),"campaign":str(r.campaign),"management_type":str(r.management_type),"spatial_block":str(r["_block"]),"latitude_deg":float(r.latitude_deg),"longitude_deg":float(r.longitude_deg),"sward_height_cm":float(r[HEIGHT]),"observed_kg_dm_ha":float(r[TARGET]),"prediction_kg_dm_ha":float(p),"error_kg_dm_ha":float(p-r[TARGET]),"train_rows":int(train_mask.sum()),"test_rows":int(test_mask.sum()),"train_height_min_cm":lo,"train_height_max_cm":hi,"in_train_height_support":bool(lo<=r[HEIGHT]<=hi),"buffer_m":buffer})
    return out


def subgroup(part, col):
    out=[]
    for name,g in part.groupby(col,dropna=False,sort=True):
        out.append({col:str(name),**metrics(g.observed_kg_dm_ha.to_numpy(float),g.prediction_kg_dm_ha.to_numpy(float)),"spatialBlocks":int(g.spatial_block.nunique())})
    return out


def main():
    protocol=json.loads(PROTOCOL.read_text())
    if protocol.get("status")!="preregistered_before_fitting": raise ValueError("protocol not preregistered")
    if sha256(INPUT)!=protocol["input"]["sha256"]: raise ValueError("Mendeley checksum mismatch")
    frame=pd.read_parquet(INPUT).reset_index(drop=True)
    required={"farm","field_code","campaign","management_type",HEIGHT,TARGET,"latitude_deg","longitude_deg"}
    if required-set(frame): raise ValueError(f"missing columns: {sorted(required-set(frame))}")
    if frame[["farm","field_code","campaign","management_type",TARGET,"latitude_deg","longitude_deg"]].isna().any().any(): raise ValueError("missing required grouping/target values")
    frame=frame.dropna(subset=[HEIGHT]).reset_index(drop=True)
    if len(frame)!=234: raise ValueError(f"expected 234 complete-height rows, found {len(frame)}")
    if not np.isfinite(frame[[HEIGHT,TARGET,"latitude_deg","longitude_deg"]].to_numpy(float)).all(): raise ValueError("nonfinite values")
    frame["_block"]=components(frame)
    if frame["_block"].nunique()!=13: raise ValueError("expected 13 spatial components")
    if sorted(frame.farm.astype(str).unique())!=protocol["input"]["farms"]: raise ValueError("farm set changed")
    if sorted(frame.campaign.astype(str).unique())!=protocol["input"]["campaigns"]: raise ValueError("campaign set changed")
    OUT.mkdir(parents=True,exist_ok=True)
    predictions=[]; reports=defaultdict(list); timing=defaultdict(lambda:{"fitSeconds":0.,"predictSeconds":0.,"fitCount":0,"predictionRows":0})

    # Two-fold leave-one-farm-out diagnostic.
    for farm in protocol["input"]["farms"]:
        testmask=frame.farm.astype(str).eq(farm).to_numpy(); trainmask=~testmask
        train,test=frame.loc[trainmask],frame.loc[testmask]; fold="farm="+farm
        if train.empty:
            reports["leaveOneFarmOut"].append({"fold":fold,"status":"unscored_empty_training","trainRows":0,"testRows":len(test)}); continue
        pred=fit_predict(train,test,timing["leaveOneFarmOut"]); timing["leaveOneFarmOut"]["fitCount"]+=1; timing["leaveOneFarmOut"]["predictionRows"]+=len(test)
        lo,hi=float(train[HEIGHT].min()),float(train[HEIGHT].max()); predictions+=rows_for(frame,trainmask,testmask,pred,"leaveOneFarmOut",fold,lo,hi)
        reports["leaveOneFarmOut"].append({"fold":fold,"status":"scored","trainRows":len(train),"testRows":len(test),**metrics(test[TARGET].to_numpy(float),pred),"trainHeightRangeCm":[lo,hi],"testOutsideTrainRangeRows":int((~test[HEIGHT].between(lo,hi)).sum())})

    # Campaign holdout: no coordinate identity can cross train/test.
    for campaign in protocol["input"]["campaigns"]:
        trainmask,testmask,n_test_coords,removed,n_overlap=campaign_split_masks(frame,campaign)
        train,test=frame.loc[trainmask],frame.loc[testmask]; fold="campaign="+campaign
        if n_overlap: raise AssertionError("campaign point identity leakage")
        if train.empty:
            reports["leaveOneCampaignOut"].append({"fold":fold,"status":"unscored_no_nonoverlap_training_points","trainRows":0,"testRows":len(test),"testCoordinateGroups":n_test_coords,"removedOverlappingTrainingRows":removed,"overlapCoordinateGroups":n_overlap}); continue
        pred=fit_predict(train,test,timing["leaveOneCampaignOut"]); timing["leaveOneCampaignOut"]["fitCount"]+=1; timing["leaveOneCampaignOut"]["predictionRows"]+=len(test)
        lo,hi=float(train[HEIGHT].min()),float(train[HEIGHT].max()); predictions+=rows_for(frame,trainmask,testmask,pred,"leaveOneCampaignOut",fold,lo,hi)
        reports["leaveOneCampaignOut"].append({"fold":fold,"status":"scored","trainRows":len(train),"testRows":len(test),"testCoordinateGroups":n_test_coords,"overlapCoordinateGroups":n_overlap,**metrics(test[TARGET].to_numpy(float),pred),"trainHeightRangeCm":[lo,hi],"testOutsideTrainRangeRows":int((~test[HEIGHT].between(lo,hi)).sum())})

    # Fixed OLS across six distances and the same 13 connected components.
    by_distance={}
    for distance in DISTANCES:
        folds=list(spatial_folds(frame,distance))
        if len(folds)!=13: raise AssertionError(f"{distance}m yielded {len(folds)} folds")
        foldrows=[]; details=[]; scored=0; expected=0
        for block,trainmask,testmask in folds:
            train,test=frame.loc[trainmask],frame.loc[testmask]; expected+=len(test)
            detail={"fold":block,"trainRows":len(train),"testRows":len(test)}
            if train.empty:
                detail["status"]="unscored_empty_training"; details.append(detail); continue
            testloc=test[COORDS].drop_duplicates(); trainloc=train[COORDS].drop_duplicates()
            if set(map(tuple,testloc.itertuples(index=False,name=None))) & set(map(tuple,trainloc.itertuples(index=False,name=None))): raise AssertionError("coordinate identity leaked")
            dmin=min(float(haversine_m(r.latitude_deg,r.longitude_deg,testloc.latitude_deg.to_numpy(float),testloc.longitude_deg.to_numpy(float)).min()) for r in trainloc.itertuples(index=False))
            if dmin+1e-6<distance: raise AssertionError(f"buffer violation {dmin} < {distance}")
            runtime=timing[f"spatial{distance}m"]; pred=fit_predict(train,test,runtime); runtime["fitCount"]+=1; runtime["predictionRows"]+=len(test)
            lo,hi=float(train[HEIGHT].min()),float(train[HEIGHT].max()); new=rows_for(frame,trainmask,testmask,pred,f"spatial{distance}m",block,lo,hi,distance); predictions+=new; foldrows+=new; scored+=len(test)
            details.append({"fold":block,"status":"scored","trainRows":len(train),"testRows":len(test),"minimumTrainToTestDistanceMeters":dmin,**metrics(test[TARGET].to_numpy(float),pred),"trainHeightRangeCm":[lo,hi],"testOutsideTrainRangeRows":int((~test[HEIGHT].between(lo,hi)).sum())})
        part=pd.DataFrame(foldrows)
        if len(part.source_row_index.unique())!=len(part): raise AssertionError("duplicate OOF assignment")
        if len(part):
            block_mae=part.groupby("spatial_block",sort=True).apply(lambda g:mean_absolute_error(g.observed_kg_dm_ha,g.prediction_kg_dm_ha),include_groups=False)
            item={**metrics(part.observed_kg_dm_ha.to_numpy(float),part.prediction_kg_dm_ha.to_numpy(float)),"coverage":scored/expected,"equalSpatialBlockMaeKgDmHa":float(block_mae.mean()),"folds":details,"byFarm":subgroup(part,"farm"),"byCampaign":subgroup(part,"campaign"),"byManagement":subgroup(part,"management_type"),"inTrainingHeightSupport":metrics(part.loc[part.in_train_height_support,"observed_kg_dm_ha"].to_numpy(float),part.loc[part.in_train_height_support,"prediction_kg_dm_ha"].to_numpy(float)) if part.in_train_height_support.any() else None,"outsideTrainingHeightSupport":metrics(part.loc[~part.in_train_height_support,"observed_kg_dm_ha"].to_numpy(float),part.loc[~part.in_train_height_support,"prediction_kg_dm_ha"].to_numpy(float)) if (~part.in_train_height_support).any() else None,"outsideTrainingHeightSupportRows":int((~part.in_train_height_support).sum())}
        else: item={"rows":0,"coverage":0.,"folds":details,"byFarm":[],"byCampaign":[],"byManagement":[]}
        by_distance[str(distance)]=item

    pred_df=pd.DataFrame(predictions); pred_df.to_csv(PREDICTIONS,index=False)
    base=pred_df[pred_df.analysis.eq("spatial100m")].sort_values("source_row_index")
    # Post-fit implementation integrity check against the already frozen Mendeley OOF artifact.
    # This does not refit, select, or change the preregistered estimator; it checks alignment/grouping.
    legacy=pd.read_csv(LEGACY_OOF)
    if len(legacy)!=len(base): raise AssertionError("legacy 100m OOF row count differs")
    same_blocks=np.array_equal(legacy["spatial_block"].astype(str).to_numpy(),base["spatial_block"].astype(str).to_numpy())
    same_folds=np.array_equal(legacy["fold"].astype(str).to_numpy(),base["fold"].astype(str).to_numpy())
    same_groups=same_blocks and same_folds and np.array_equal(legacy["farm"].astype(str),base["farm"].astype(str)) and np.array_equal(legacy["campaign"].astype(str),base["campaign"].astype(str))
    max_prediction_delta=float(np.max(np.abs(legacy["M1_ols"].to_numpy(float)-base["prediction_kg_dm_ha"].to_numpy(float))))
    if not same_groups or not np.allclose(legacy["observed"].to_numpy(float),base["observed_kg_dm_ha"].to_numpy(float),rtol=0,atol=1e-8) or max_prediction_delta>1e-6:
        raise AssertionError("100m spatial OOF grouping or OLS predictions do not reconcile with the frozen Mendeley artifact")
    block_mae=base.groupby("spatial_block",sort=True).apply(lambda g:mean_absolute_error(g.observed_kg_dm_ha,g.prediction_kg_dm_ha),include_groups=False).to_numpy(float)
    if len(block_mae)!=13: raise AssertionError(f"expected 13 block errors, got {len(block_mae)}")
    rng=np.random.default_rng(SEED); draws=rng.integers(0,len(block_mae),size=(BOOTSTRAPS,len(block_mae))); boot=np.mean(block_mae[draws],axis=1)
    campaign_rows=pred_df[pred_df.analysis.eq("leaveOneCampaignOut")]
    farm_rows=pred_df[pred_df.analysis.eq("leaveOneFarmOut")]
    loo={"leaveOneFarmOut":{"folds":reports["leaveOneFarmOut"],"scoredRows":len(farm_rows),"coverage":len(farm_rows)/len(frame),"pooledMetrics":metrics(farm_rows.observed_kg_dm_ha.to_numpy(float),farm_rows.prediction_kg_dm_ha.to_numpy(float)) if len(farm_rows) else None},"leaveOneCampaignOut":{"folds":reports["leaveOneCampaignOut"],"scoredRows":len(campaign_rows),"coverage":len(campaign_rows)/len(frame),"pooledMetrics":metrics(campaign_rows.observed_kg_dm_ha.to_numpy(float),campaign_rows.prediction_kg_dm_ha.to_numpy(float)) if len(campaign_rows) else None}}
    head=subprocess.run(["git","rev-parse","HEAD"],cwd=ROOT,capture_output=True,text=True,check=True).stdout.strip()
    dirty=bool(subprocess.run(["git","status","--porcelain"],cwd=ROOT,capture_output=True,text=True,check=True).stdout.strip())
    report={"schemaVersion":"1.0.0","status":"completed","experiment":"Mendeley-only fixed OLS transport stress","epistemicStatus":protocol["epistemicStatus"],"input":{"path":str(INPUT.relative_to(ROOT)),"sha256":sha256(INPUT),"rows":len(frame),"farms":sorted(frame.farm.astype(str).unique()),"campaigns":sorted(frame.campaign.astype(str).unique()),"spatialComponents":int(frame["_block"].nunique())},"protocolSha256":sha256(PROTOCOL),"protocolPath":str(PROTOCOL.relative_to(ROOT)),"estimator":{"id":"fixed_ols","class":"sklearn.linear_model.LinearRegression","fitIntercept":True,"predictors":[HEIGHT],"target":TARGET},**loo,"bufferSensitivity":by_distance,"blockBootstrapAt100m":{"resamplingUnit":"whole spatial block score","blocks":len(block_mae),"farms":2,"replicates":BOOTSTRAPS,"seed":SEED,"observedEqualBlockMaeKgDmHa":float(block_mae.mean()),"quantiles025_050_975":[float(x) for x in np.quantile(boot,[.025,.5,.975])],"interpretation":"Descriptive stability only, not a population confidence interval: 13 blocks nested in two farms."},"runtime":{k:{**v,"fitMillisecondsPerFit":1000*v["fitSeconds"]/v["fitCount"] if v["fitCount"] else None,"predictMicrosecondsPerRow":1e6*v["predictSeconds"]/v["predictionRows"] if v["predictionRows"] else None} for k,v in timing.items()},"environment":{"python":platform.python_version(),"numpy":np.__version__,"pandas":pd.__version__,"scikitLearn":sklearn.__version__,"gitHead":head,"workingTreeDirtyAtRun":dirty},"legacyOofReconciliation":{"path":str(LEGACY_OOF.relative_to(ROOT)),"sha256":sha256(LEGACY_OOF),"rows":len(legacy),"sameSpatialBlocks":same_blocks,"sameFoldIds":same_folds,"sameFarmAndCampaignAssignments":same_groups,"maximumOlsPredictionAbsoluteDifferenceKgDmHa":max_prediction_delta,"interpretation":"Post-fit implementation integrity comparison only; no model selection or tuning."},"groupingAudit":{"componentDefinition":"Connected farm/field components; fields sharing an exact farm-coordinate are joined; campaign repeats remain in the same spatial block.","bufferValidation":"Every scored spatial fold asserted coordinate identity did not cross train/test and minimum geodesic separation met its preregistered distance.","campaignValidation":"Campaign train/test exact coordinate intersection was asserted empty.","100mOofAssignmentsUnique":len(base.source_row_index.unique())==len(base),"100mScoredRows":len(base),"100mUniqueRows":int(base.source_row_index.nunique()),"100mBlocks":int(base.spatial_block.nunique())},"limitations":protocol["interpretationLimits"],"outputs":{"predictions":str(PREDICTIONS.relative_to(ROOT)),"reportJson":str(REPORT_JSON.relative_to(ROOT)),"reportMarkdown":str(REPORT_MD.relative_to(ROOT))}}
    REPORT_JSON.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n")
    lines=["# Mendeley biomass transport stress diagnostics","","**Status:** exploratory diagnostics only; not independent validation or model promotion.","","## Fixed OLS spatial-buffer sensitivity","","| Buffer | Rows | Coverage | MAE kg DM/ha | RMSE | Bias | Equal-block MAE | Outside training-height support |","|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for d in DISTANCES:
        x=by_distance[str(d)]; lines.append(f"| {d} m | {x.get('rows',0)} | {x.get('coverage',0):.1%} | {x.get('maeKgDmHa',float('nan')):.1f} | {x.get('rmseKgDmHa',float('nan')):.1f} | {x.get('biasPredictedMinusObservedKgDmHa',float('nan')):+.1f} | {x.get('equalSpatialBlockMaeKgDmHa',float('nan')):.1f} | {x.get('outsideTrainingHeightSupportRows',0)} |")
    lines += ["","## Leave-one-farm-out","","Only two farms are available; these are descriptive farm cases, not farm-population estimates.","",json.dumps(loo["leaveOneFarmOut"],indent=2),"","## Leave-one-campaign-out","","Repeated exact farm-coordinate identities are removed from campaign training. Empty training sets are left unscored rather than relaxing the split.","",json.dumps(loo["leaveOneCampaignOut"],indent=2),"","## 100 m subgroup diagnostics","","By-farm rows:",""]
    for x in by_distance["100"].get("byFarm",[]): lines.append(f"- {x['farm']}: n={x['rows']}, blocks={x['spatialBlocks']}, MAE={x['maeKgDmHa']:.1f}, RMSE={x['rmseKgDmHa']:.1f}, bias={x['biasPredictedMinusObservedKgDmHa']:+.1f} kg DM/ha.")
    lines += ["","Campaign, management, support-stratified, and per-block errors are in the JSON report and prediction CSV.","", "## Block bootstrap","",f"Equal-block MAE={block_mae.mean():.1f} kg DM/ha. The 10,000 whole-block bootstrap quantiles (2.5%, median, 97.5%) are {report['blockBootstrapAt100m']['quantiles025_050_975']}. Descriptive stability only; the 13 blocks are nested within two farms.","", "## Grouping, support, and timing","",f"At 100 m, {len(base)}/{len(frame)} unique rows were scored over {base.spatial_block.nunique()} blocks. Every buffer split checked coordinate disjointness and geodesic distance. The 100 m OOF fold assignments, farm/campaign labels, observed values, and OLS predictions also reconcile with the frozen Mendeley OOF artifact. The JSON records train-height ranges and timings per split.","","## Limits",""]+["- "+x for x in protocol["interpretationLimits"]]
    REPORT_MD.write_text("\n".join(lines)+"\n")
    print(json.dumps({"status":"completed","report":str(REPORT_JSON.relative_to(ROOT)),"predictionRows":len(pred_df),"campaignFolds":reports["leaveOneCampaignOut"],"buffer100m":{"rows":len(base),"blocks":base.spatial_block.nunique(),"mae":by_distance["100"].get("maeKgDmHa"),"coverage":by_distance["100"].get("coverage")}},indent=2))

if __name__=="__main__": main()
