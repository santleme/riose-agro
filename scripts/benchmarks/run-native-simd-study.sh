#!/usr/bin/env bash
# Run from repository root with cargo/rustc/node/python3/objdump/nm on PATH.
set -euo pipefail
out=$(realpath -m "${1:?provide an output directory outside the repository}")
target=$(realpath -m "${SIMD_STUDY_TARGET_ROOT:?set an external build directory}")
runs=${SIMD_STUDY_RUNS:-4}
if ! [[ "$runs" =~ ^[0-9]+$ ]] || (( runs < 4 )); then
  echo "At least four captures per profile are required." >&2
  exit 1
fi
if [[ "$out/" == "$(pwd)/"* || "$target/" == "$(pwd)/"* ]]; then
  echo 'Output and target directories must be outside the source checkout.' >&2
  exit 1
fi
if [[ -e "$out" ]]; then
  echo 'Capture output path must not already exist; choose a fresh directory.' >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo 'Commit the harness before capture; source must be clean.' >&2
  exit 1
fi
mkdir -p "$out"
for profile in generic native scalar; do
  case "$profile" in
    generic) flags='' ;;
    native) flags='-C target-cpu=native' ;;
    scalar) flags='-C no-vectorize-loops -C no-vectorize-slp' ;;
  esac
  export RUSTFLAGS="$flags" CARGO_TARGET_DIR="$target/$profile"
  cargo rustc --offline --locked --release -p riose-core --lib -- --emit=asm,llvm-ir
  python3 scripts/benchmarks/audit-native-simd.py "$CARGO_TARGET_DIR/release/libriose_core.so" \
    "$out/audit-$profile" --ir "$CARGO_TARGET_DIR/release/deps/riose_core.ll" \
    > "$out/audit-$profile.log"
  cargo test --offline --locked --release -p riose-core --example simd_metabolism_study
  if [[ "$profile" == generic ]]; then
    # The workspace emits both rlib and cdylib; isolate the canonical replay
    # from release test/abort artifact filename collisions (Cargo #6313).
    CARGO_TARGET_DIR="$target/b3-tests" cargo test --offline --locked -p riose-core --test scenario_goldens
  fi
  cargo build --offline --locked --release -p riose-core --example simd_metabolism_study
  for ((run=1; run<=runs; run++)); do
    /usr/bin/time -v -o "$out/$profile-run-$run.time.txt" \
      env SIMD_STUDY_PROFILE="$profile: $flags" SIMD_STUDY_RUN="$run" \
      "$CARGO_TARGET_DIR/release/examples/simd_metabolism_study" > "$out/$profile-run-$run.json"
    node scripts/benchmarks/validate-benchmark-report.mjs < "$out/$profile-run-$run.json"
  done
done
RUSTFLAGS='-C target-feature=-avx,-avx2' CARGO_TARGET_DIR="$target/portable" \
  cargo test --offline --locked --release -p riose-core --example simd_metabolism_study
