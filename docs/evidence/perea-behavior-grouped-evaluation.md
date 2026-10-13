# Perea behavior classification: grouped-by-animal evaluation

This is a bounded behavior-classification diagnostic using the public Perea et al. v2 data. It does not validate DMI, ADG, BR-CORTE, or the Riose engine.

Source: [Figshare dataset](https://figshare.com/articles/dataset/Labeled_sensor_dataset_of_beef_cattle_behavior_grazing_desert_rangelands/28801181), DOI [10.6084/m9.figshare.28801181.v2](https://doi.org/10.6084/m9.figshare.28801181.v2), CC BY 4.0.

## Method

A six-fold out-of-fold split holds out four animals in each fold, one from each of the four breeds. All observations for a `Breed:ID` remain together. The model is a regularized multinomial logistic regression using only the published one-minute motion index; scaling is fit on training animals only and training weights equalize each animal, then class mass. The baseline predicts the training-fold majority class.

The published file has 9,222 rows. Repeated animal-minute keys are collapsed to one mean motion index when labels agree; all rows for the 54 timestamps with conflicting behavior labels are excluded. The evaluation has 8,864 rows from 24 animals.

## Out-of-fold metrics

| Model | Record-weighted accuracy | Record-weighted balanced accuracy | Record-weighted macro F1 | Equal-animal accuracy | Equal-animal balanced accuracy | Equal-animal macro F1 |
|---|---:|---:|---:|---:|---:|---:|
| MI logistic | 0.739 | 0.720 | 0.662 | 0.741 | 0.720 | 0.664 |
| Majority baseline | 0.432 | 0.250 | 0.151 | 0.427 | 0.250 | 0.150 |

## Source selection and separation

Perea is selected because its rows pair a timestamped animal identity and sensor motion index with human-reviewed behavior labels. The local audit of the Grazing Ingestive Behavior compilation shows 676 treatment-level rows from 90 papers/199 experiments, with intake-rate fields but no individual/time-aligned behavior labels. The local CPER audit has 36 animal-period rows for 33 identified yearling steers, ADG outcomes, and period summaries of bout duration/velocity; its existing animal-cluster analysis is an ADG association, not a behavior classifier. These sources stay separate and none is used to score the Perea model.

## Limits

This is internal held-out-animal evidence from one dataset, not an external-site test. The 24 animals share collection context; the model uses one scalar motion index rather than raw accelerometer axes. The source labels are one-minute annotations, some timestamps have conflicting labels, and temporal autocorrelation remains. No result here supports DMI, ADG, or whole-engine claims.

Reproduce with `python3 scripts/evaluate_perea_behavior_grouped.py`. Machine-readable details: `docs/evidence/perea-behavior-grouped-evaluation.json`; OOF rows: `docs/evidence/perea-behavior-grouped-oof-predictions.csv`.
