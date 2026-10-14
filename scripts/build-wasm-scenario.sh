#!/usr/bin/env sh
set -eu
cargo build --release --target wasm32-unknown-unknown -p riose-core --lib --features browser-scenario-wasm
mkdir -p wasm
cp target/wasm32-unknown-unknown/release/riose_core.wasm wasm/riose_scenario_core.wasm
