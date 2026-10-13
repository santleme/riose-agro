# Perea behavior nested evaluation

**State:** preregistered; no nested candidate has been fit or selected.

## Target and use

Evaluate four human-reviewed behavior labels (grazing `GR`, resting `RE`, ruminating `RU`, walking `WA`) from the Perea open sensor dataset (DOI `10.6084/m9.figshare.28801181.v2`, CC BY 4.0). The input is one-minute motion index (MI). This is a separate behavior-classification task; it does not evaluate DMI, ADG, BR-CORTE, the engine, or whole-day activity budgets.

## Rows and time features

Use the audited 8,864 unambiguous animal-minute rows after same-label duplicates are collapsed and conflicting-label timestamps are excluded. The nested comparison uses one common temporal feature set of 5,582 rows: current MI and the previous four MI values, only when all five rows are consecutive minutes for the same animal. Reset at every time gap. Use no behavior labels or future MI as features. Past MI from a held-out animal is available only as an inference-time sensor stream. Fit any scaling within training folds.

## Folds

Use the six animal-held-out fold assignments already frozen in `docs/evidence/perea-behavior-grouped-evaluation.json`. Each outer test fold holds one animal per breed; no animal's rows may cross train/test. Within each outer training set, assign the five remaining animals in each breed, sorted by ID, one per inner fold. This yields five inner folds, each with four validation animals and sixteen training animals.

Because all outer folds reuse the two source ranches and every breed, this design measures held-out animals within the sampled settings. Do not describe it as independent ranch validation. A two-ranch stress test cannot isolate ranch from breed because the factors are perfectly confounded.

## Candidates and selection

On the same 5,582 rows in each inner and outer comparison, evaluate the fixed candidates in the JSON protocol: static MI logistic regression; lag-4 logistic models at `C=0.1, 1, 10`; and shallow lag-4 CART at depths 2, 3, and 4 with at least 20 rows per leaf. Logistic preprocessing is trained on the fold's training rows. CART has fixed seed 20261013. Weight training rows so each animal contributes equally, then balance the four class totals. The majority-class predictor is a descriptive baseline only.

Select within each outer training set using stitched inner out-of-fold predictions. The primary metric is the equal-animal mean of per-animal F1 for `RE` and `RU`, with equal weight for the two classes. Break ties by higher minimum of equal-animal `RE`/`RU` recall, then higher equal-animal four-class macro-F1, then the fixed simplicity order in JSON. Do not use the outer test labels to choose any model or threshold.

## Reporting limits

Report per-animal and per-outer-fold metrics, equal-animal class F1/recall, observation-weighted accuracy, and confusion matrices. Report the existing static six-fold baseline on all 8,864 rows as its own diagnostic; do not compare that score directly against the temporal 5,582-row analysis. The primary target is weak for `RE` in the existing result; annotation carry-forward can create short-term label persistence, so temporal performance is not independent evidence of behavior-state duration. XGain outputs are produced by an existing decision tree and are not independent reference labels.

The expected deliverables are an executable nested evaluation script plus machine-readable and Markdown reports under `experiments/behavior/perea-nested-animal/`.
