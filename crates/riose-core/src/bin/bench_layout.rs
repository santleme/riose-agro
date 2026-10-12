use riose_core::update_metabolism;
use serde::Deserialize;
use std::io::{self, Read};
use std::time::Instant;

#[derive(Deserialize)]
struct Fixture {
    input: Vec<f64>,
    warmups: usize,
    repetitions: usize,
}

fn main() {
    let mut source = String::new();
    io::stdin().read_to_string(&mut source).unwrap();
    let fixture: Fixture = serde_json::from_str(&source).unwrap();
    assert_eq!(fixture.input.len() % 4, 0);
    let count = fixture.input.len() / 4;
    let mut output = vec![0.0; count * 2];
    for _ in 0..fixture.warmups {
        update_metabolism(&fixture.input, &mut output).unwrap();
    }
    let mut samples = Vec::with_capacity(fixture.repetitions);
    for _ in 0..fixture.repetitions {
        let start = Instant::now();
        update_metabolism(&fixture.input, &mut output).unwrap();
        samples.push(start.elapsed().as_secs_f64() * 1000.0);
    }
    println!(
        "{}",
        serde_json::json!({"animals": count, "samplesMs": samples, "output": output})
    );
}
