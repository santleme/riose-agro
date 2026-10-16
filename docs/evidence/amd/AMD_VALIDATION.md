# AMD + ROCm validation record

This record captures the supplied successful hardware run for the Product livestock metabolism batch. It is scoped to the historical run below and does not validate current main, the complete simulator, biological predictions, or farm-level outcomes.

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

## Historical reproduction at the release commit

The commands and Product interactions below apply only to `acb5cdf6e3bc23d7e48026bc736da05427f89907`. Use a checkout of that release commit before following them. The `verify:amd-livestock` script and the AMD/ROCm Product selection described here belong to that release.

In Santleme source revision [`ab7561d`](https://github.com/santleme/riose-agro/commit/ab7561dbe99ea7aa85fd358e19d66fbc57ff7068), `product.html` is the main Product page and `experiments.html` is the compatibility redirect to it. The `verify:amd-livestock` npm script is absent, and `src/server/compute_service.py` accepts only the `scale_vector` operation, rejecting other operations. Starting that service does not establish support for the historical livestock metabolism batch in the current Product.

On the release checkout in a compatible AMD ROCm environment, from the repository root, start the compute service:

```sh
python3 src/server/compute_service.py
```

On the same release checkout, run the Product server in another terminal:

```sh
npm start
```

Open `http://127.0.0.1:8000/product.html`, select **AMD · ROCm**, and advance the simulation. With the compute service running, the batch verifier is:

```sh
npm run verify:amd-livestock
```

At the release commit, the verifier uses a 24-animal batch from `FarmEngine(seed=2026)`, compares the selected backend with the JavaScript metabolism reference, and fails unless ROCm actually executes and parity is within `1e-12`. A successful verifier result is evidence for this batch on the recorded hardware/runtime only.
