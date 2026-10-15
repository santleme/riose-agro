#!/usr/bin/env sh
set -eu
cargo build --release --target wasm32-unknown-unknown -p riose-core --lib
mkdir -p wasm
cp target/wasm32-unknown-unknown/release/riose_core.wasm wasm/riose_core.wasm
