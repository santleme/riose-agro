# AMD + ROCm validation record

This record captures the supplied successful hardware run for the Product livestock metabolism batch. It is scoped to the run below and does not validate the complete simulator, biological predictions, or farm-level outcomes.

| Field | Recorded result |
| --- | --- |
| Branch | `release/amd-act-iii` |
| Commit | `acb5cdf6e3bc23d7e48026bc736da05427f89907` |
| GPU | AMD Instinct MI300X VF |
| PyTorch | `2.11.0+rocm7.14.1` |
| ROCm/HIP | `7.14.60850` |
| Requested / used backend | AMD / `amd_rocm` |
| Workload | `riose-livestock-metabolism-batch` |
| Animals / outputs | 24 / 48 |
| Parity | PASS; maximum absolute difference `0` at absolute and relative tolerances `1e-12` |
| Fallback | None in the successful verifier run |
| Verifier status | `AMD_PRODUCT_PATH_FUNCTIONAL` |

## Captures

- [Environment and compute service](01-amd-environment.png)
- [Product AMD validation output](02-riose-amd-validation.png)
- [Detected CPU/CUDA/ROCm backends](03-amd-backend-detection.png)

The captures were provided with the README request. The environment capture shows the release branch and commit above, and the verifier output records the actual backend and parity result.

## Reproduction

These commands reproduce the recorded run only at the release commit listed above. They do not run on current main: product.html is a compatibility redirect, the AMD livestock verifier is absent, and the current compute service supports vector scaling only. Check out `acb5cdf6e3bc23d7e48026bc736da05427f89907` before following the steps below.

On a compatible AMD ROCm environment, from the repository root, start the compute service:

```sh
python3 src/server/compute_service.py
```

Then run the Product server in another terminal:

```sh
npm start
```

Open `http://127.0.0.1:8000/product.html`, select **AMD · ROCm**, and advance the simulation. With the compute service running, the batch verifier is:

```sh
npm run verify:amd-livestock
```

The verifier uses a 24-animal batch from `FarmEngine(seed=2026)`, compares the selected backend with the JavaScript metabolism reference, and fails unless ROCm actually executes and parity is within `1e-12`. A successful verifier result is evidence for this batch on the recorded hardware/runtime only.
