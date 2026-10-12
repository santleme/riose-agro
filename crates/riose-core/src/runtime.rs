//! Versioned, domain-neutral primitives for native/WASM simulation runtimes.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

pub const CORE_SNAPSHOT_TYPE: &str = "riose-core-snapshot";
pub const CORE_SNAPSHOT_VERSION: u16 = 1;

#[derive(
    Clone, Copy, Debug, Default, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize, Deserialize,
)]
#[serde(transparent)]
pub struct EntityId(pub u32);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct IdExhausted;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EntityIdAllocator {
    next: u32,
}

impl EntityIdAllocator {
    pub fn new(first_id: u32) -> Self {
        Self { next: first_id }
    }

    pub fn allocate(&mut self) -> Result<EntityId, IdExhausted> {
        let id = self.next;
        self.next = self.next.checked_add(1).ok_or(IdExhausted)?;
        Ok(EntityId(id))
    }

    pub fn next_id(&self) -> u32 {
        self.next
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationClock {
    tick: u64,
}

impl SimulationClock {
    pub fn at(tick: u64) -> Self {
        Self { tick }
    }

    pub fn tick(&self) -> u64 {
        self.tick
    }

    pub fn advance(&mut self) -> Result<u64, ClockExhausted> {
        self.tick = self.tick.checked_add(1).ok_or(ClockExhausted)?;
        Ok(self.tick)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ClockExhausted;

/// The same 32-bit LCG recurrence used by the current JavaScript engine.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeededRng {
    state: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SeedStreams {
    pub model: SeededRng,
    pub locomotion: SeededRng,
}

impl SeedStreams {
    pub fn new(seed: u32) -> Self {
        Self {
            model: SeededRng::new(seed),
            locomotion: SeededRng::new(derive_locomotion_seed(seed)),
        }
    }
}

pub fn derive_locomotion_seed(seed: u32) -> u32 {
    (seed ^ 0x9e37_79b9)
        .wrapping_mul(1_664_525)
        .wrapping_add(1_013_904_223)
}

impl SeededRng {
    pub fn new(seed: u32) -> Self {
        Self { state: seed }
    }

    pub fn state(&self) -> u32 {
        self.state
    }

    pub fn next_u32(&mut self) -> u32 {
        self.state = self
            .state
            .wrapping_mul(1_664_525)
            .wrapping_add(1_013_904_223);
        self.state
    }

    pub fn next_f64(&mut self) -> f64 {
        f64::from(self.next_u32()) / 4_294_967_296.0
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationMetrics {
    pub ticks: u64,
    pub entities_processed: u64,
    pub elapsed_nanoseconds: u64,
}

impl SimulationMetrics {
    pub fn record_tick(&mut self, entities: u64, elapsed_nanoseconds: u64) {
        self.ticks = self.ticks.saturating_add(1);
        self.entities_processed = self.entities_processed.saturating_add(entities);
        self.elapsed_nanoseconds = self.elapsed_nanoseconds.saturating_add(elapsed_nanoseconds);
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ComponentSnapshot {
    pub type_id: String,
    pub version: u16,
    pub value: serde_json::Value,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntitySnapshot {
    pub id: EntityId,
    pub components: Vec<ComponentSnapshot>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommandEnvelope {
    pub version: u16,
    pub sequence: u64,
    pub target_tick: u64,
    pub entity_id: Option<EntityId>,
    pub command_type: String,
    pub payload: serde_json::Value,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EventEnvelope {
    pub version: u16,
    pub sequence: u64,
    pub tick: u64,
    pub entity_id: Option<EntityId>,
    pub event_type: String,
    pub payload: serde_json::Value,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CoreSnapshot {
    #[serde(rename = "type")]
    pub snapshot_type: String,
    pub version: u16,
    pub tick: u64,
    pub model_seed: u32,
    pub model_rng_state: u32,
    pub locomotion_rng_state: u32,
    pub next_entity_id: u32,
    pub metrics: SimulationMetrics,
    pub entities: Vec<EntitySnapshot>,
    pub pending_commands: Vec<CommandEnvelope>,
    pub recent_events: Vec<EventEnvelope>,
}

impl CoreSnapshot {
    pub fn empty(seed: u32) -> Self {
        Self {
            snapshot_type: CORE_SNAPSHOT_TYPE.to_owned(),
            version: CORE_SNAPSHOT_VERSION,
            tick: 0,
            model_seed: seed,
            model_rng_state: seed,
            locomotion_rng_state: derive_locomotion_seed(seed),
            next_entity_id: 1,
            metrics: SimulationMetrics::default(),
            entities: Vec::new(),
            pending_commands: Vec::new(),
            recent_events: Vec::new(),
        }
    }
}

#[derive(Debug)]
pub enum SnapshotDecodeError {
    Json(serde_json::Error),
    UnsupportedType(String),
    UnsupportedVersion(u16),
    InvalidContents(&'static str),
}

pub fn encode_snapshot(snapshot: &CoreSnapshot) -> Result<String, serde_json::Error> {
    serde_json::to_string(snapshot)
}

pub fn decode_snapshot(json: &str) -> Result<CoreSnapshot, SnapshotDecodeError> {
    let snapshot: CoreSnapshot = serde_json::from_str(json).map_err(SnapshotDecodeError::Json)?;
    if snapshot.snapshot_type != CORE_SNAPSHOT_TYPE {
        return Err(SnapshotDecodeError::UnsupportedType(snapshot.snapshot_type));
    }
    if snapshot.version != CORE_SNAPSHOT_VERSION {
        return Err(SnapshotDecodeError::UnsupportedVersion(snapshot.version));
    }
    let mut entity_ids = HashSet::with_capacity(snapshot.entities.len());
    for entity in &snapshot.entities {
        if !entity_ids.insert(entity.id) {
            return Err(SnapshotDecodeError::InvalidContents("duplicate entity ID"));
        }
        for component in &entity.components {
            if component.type_id.trim().is_empty() || component.version == 0 {
                return Err(SnapshotDecodeError::InvalidContents(
                    "invalid component type or version",
                ));
            }
        }
    }
    if snapshot
        .pending_commands
        .iter()
        .any(|command| command.version == 0 || command.command_type.trim().is_empty())
    {
        return Err(SnapshotDecodeError::InvalidContents(
            "invalid command type or version",
        ));
    }
    if snapshot
        .recent_events
        .iter()
        .any(|event| event.version == 0 || event.event_type.trim().is_empty())
    {
        return Err(SnapshotDecodeError::InvalidContents(
            "invalid event type or version",
        ));
    }
    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn clock_ids_rng_and_metrics_are_deterministic() {
        let mut clock = SimulationClock::at(9);
        assert_eq!(clock.advance(), Ok(10));
        assert_eq!(SimulationClock::at(u64::MAX).advance(), Err(ClockExhausted));

        let mut ids = EntityIdAllocator::new(1);
        assert_eq!(ids.allocate(), Ok(EntityId(1)));
        assert_eq!(ids.allocate(), Ok(EntityId(2)));
        assert_eq!(
            EntityIdAllocator::new(u32::MAX).allocate(),
            Err(IdExhausted)
        );

        let mut first = SeededRng::new(917);
        let mut second = SeededRng::new(917);
        assert_eq!(first.next_u32(), 2_540_273_648);
        assert_eq!(second.next_u32(), 2_540_273_648);
        assert_eq!(first.next_f64(), 1_949_569_679.0 / 4_294_967_296.0);
        assert_eq!(first.state(), second.next_u32());
        assert_eq!(derive_locomotion_seed(917), 1_312_403_355);
        let streams = SeedStreams::new(917);
        assert_eq!(streams.model.state(), 917);
        assert_eq!(streams.locomotion.state(), 1_312_403_355);

        let mut metrics = SimulationMetrics::default();
        metrics.record_tick(24, 500);
        metrics.record_tick(24, 700);
        assert_eq!(
            metrics,
            SimulationMetrics {
                ticks: 2,
                entities_processed: 48,
                elapsed_nanoseconds: 1_200
            }
        );
    }

    #[test]
    fn versioned_json_snapshot_roundtrips_entities_commands_and_events() {
        let mut snapshot = CoreSnapshot::empty(917);
        snapshot.tick = 7;
        snapshot.entities.push(EntitySnapshot {
            id: EntityId(1),
            components: vec![ComponentSnapshot {
                type_id: "livestock.metabolism".into(),
                version: 1,
                value: json!({"weightKg": 360.0, "energy": 75.0}),
            }],
        });
        snapshot.pending_commands.push(CommandEnvelope {
            version: 1,
            sequence: 2,
            target_tick: 8,
            entity_id: Some(EntityId(1)),
            command_type: "set-supplement".into(),
            payload: json!({"kgDmPerDay": 1.5}),
        });
        snapshot.recent_events.push(EventEnvelope {
            version: 1,
            sequence: 3,
            tick: 7,
            entity_id: Some(EntityId(1)),
            event_type: "activity-changed".into(),
            payload: json!({"action": "grazing"}),
        });
        let encoded = encode_snapshot(&snapshot).unwrap();
        assert!(encoded.contains("\"type\":\"riose-core-snapshot\""));
        assert_eq!(decode_snapshot(&encoded).unwrap(), snapshot);
    }

    #[test]
    fn snapshot_decoder_rejects_unknown_versions() {
        let encoded = encode_snapshot(&CoreSnapshot::empty(1))
            .unwrap()
            .replace("\"version\":1", "\"version\":2");
        assert!(matches!(
            decode_snapshot(&encoded),
            Err(SnapshotDecodeError::UnsupportedVersion(2))
        ));
    }

    #[test]
    fn checkpoint_contract_compatibility_table_fails_closed() {
        let valid = encode_snapshot(&CoreSnapshot::empty(42)).unwrap();
        let mut unknown_version: serde_json::Value = serde_json::from_str(&valid).unwrap();
        unknown_version["version"] = json!(CORE_SNAPSHOT_VERSION + 1);
        let mut unknown_type: serde_json::Value = serde_json::from_str(&valid).unwrap();
        unknown_type["type"] = json!("future-core-snapshot");
        let mut missing_version: serde_json::Value = serde_json::from_str(&valid).unwrap();
        missing_version.as_object_mut().unwrap().remove("version");

        let cases = [
            ("current checkpoint v1", valid, true),
            (
                "unknown checkpoint version",
                unknown_version.to_string(),
                false,
            ),
            ("unknown checkpoint type", unknown_type.to_string(), false),
            (
                "missing checkpoint version",
                missing_version.to_string(),
                false,
            ),
        ];
        for (label, bytes, expected_valid) in cases {
            assert_eq!(decode_snapshot(&bytes).is_ok(), expected_valid, "{label}");
        }
    }

    #[test]
    fn snapshot_decoder_rejects_duplicate_ids_and_unversioned_components() {
        let mut snapshot = CoreSnapshot::empty(1);
        snapshot.entities.push(EntitySnapshot {
            id: EntityId(1),
            components: Vec::new(),
        });
        snapshot.entities.push(EntitySnapshot {
            id: EntityId(1),
            components: Vec::new(),
        });
        let encoded = encode_snapshot(&snapshot).unwrap();
        assert!(matches!(
            decode_snapshot(&encoded),
            Err(SnapshotDecodeError::InvalidContents("duplicate entity ID"))
        ));

        snapshot.entities.truncate(1);
        snapshot.entities[0].components.push(ComponentSnapshot {
            type_id: "livestock.metabolism".into(),
            version: 0,
            value: json!({}),
        });
        let encoded = encode_snapshot(&snapshot).unwrap();
        assert!(matches!(
            decode_snapshot(&encoded),
            Err(SnapshotDecodeError::InvalidContents(
                "invalid component type or version"
            ))
        ));
    }
}
