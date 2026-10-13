//! Small local timing harness for the native hourly simulation and snapshots.

use riose_core::FarmEngine;
use std::hint::black_box;
use std::time::{Duration, Instant};

const HERD_SIZES: [usize; 3] = [100, 1_000, 10_000];
const TICK_HOURS: u32 = 24;
const TICK_SAMPLES: usize = 5;
const SNAPSHOT_SAMPLES: usize = 100;

fn average(duration: Duration, samples: usize) -> Duration {
    duration / samples as u32
}

fn main() -> Result<(), String> {
    println!("animals,tick_hours,tick_average_ns,snapshot_average_ns");
    for count in HERD_SIZES {
        let mut tick_total = Duration::ZERO;
        for _ in 0..TICK_SAMPLES {
            // Construction is intentionally outside the timed region.
            let mut engine = FarmEngine::new(2026, count)?;
            let start = Instant::now();
            engine.tick(TICK_HOURS)?;
            tick_total += start.elapsed();
            black_box(engine.snapshot());
        }

        // Setup and warm the state before measuring snapshot materialization.
        let mut engine = FarmEngine::new(2026, count)?;
        engine.tick(TICK_HOURS)?;
        let start = Instant::now();
        for _ in 0..SNAPSHOT_SAMPLES {
            black_box(engine.snapshot());
        }
        let snapshot_total = start.elapsed();

        println!(
            "{count},{TICK_HOURS},{},{}",
            average(tick_total, TICK_SAMPLES).as_nanos(),
            average(snapshot_total, SNAPSHOT_SAMPLES).as_nanos(),
        );
    }
    Ok(())
}
