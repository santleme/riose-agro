use std::hint::black_box;
use std::time::Instant;

use riose_core::update_metabolism;

fn main() {
    let repetitions = 21;
    for count in [100, 1_000, 10_000, 100_000] {
        let mut input = Vec::with_capacity(count * 4);
        for index in 0..count {
            input.extend_from_slice(&[330.0 + (index % 70) as f64, 75.0, 0.4, 0.0]);
        }
        let mut output = vec![0.0; count * 2];
        update_metabolism(black_box(&input), black_box(&mut output)).unwrap();
        let mut elapsed = Vec::with_capacity(repetitions);
        for _ in 0..repetitions {
            let start = Instant::now();
            update_metabolism(black_box(&input), black_box(&mut output)).unwrap();
            elapsed.push(start.elapsed().as_secs_f64() * 1_000.0);
            black_box(&output);
        }
        elapsed.sort_by(f64::total_cmp);
        println!(
            "animals={count} repetitions={repetitions} median_ms={:.4}",
            elapsed[repetitions / 2]
        );
    }
}
