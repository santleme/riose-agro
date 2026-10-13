# Continuous integration

CI runs on Ubuntu 24.04 for pull requests to `main`, pushes to `main`, and manual dispatch. It checks this Linux environment only; it does not claim Windows or macOS support.

## Supported CI toolchains

| Tool | CI version | Repository requirement |
| --- | --- | --- |
| Node.js | 24 LTS | The local server requires Node.js 20 or newer. |
| Python | 3.12 | Python audit dependencies are pinned in `requirements-data-audit.txt`; the unit suite itself uses the standard library. |
| Rust | 1.95.0 stable | The workspace declares Rust 1.78 as its minimum language version. CI pins the stable compiler used to build the committed WASM artifact. |
| Rust target | `wasm32-unknown-unknown` | Required by the existing `npm run build:wasm` wrapper. |

## Commands run

The JavaScript and WASM job checks out full Git history because historical-source tests use `git show`, then runs:

```sh
npm ci
python -m pip install -r requirements-data-audit.txt
npm run build:wasm
git diff --exit-code -- wasm/riose_core.wasm
npm test
npm run test:scenarios
```

The Python job runs:

```sh
python -m unittest discover -s tests -p 'test_*.py' -v
```

The native Rust job runs:

```sh
cargo test --locked --workspace
cargo build --locked --workspace --release
npm run test:parity
```

The trajectory parity command uses the released native CLI to compare every hourly engine snapshot and metric against the JavaScript engine for the supported baseline and housing scenarios. It does not apply a numeric tolerance.

The WASM build uses the repository's existing shell script through `npm run build:wasm`; the subsequent Git diff check fails if the tracked module is stale. CI does not install PyTorch/ROCm, require AMD/GPU hardware, download datasets, or run performance benchmarks.
