//! Typed native representation of the currently supported FarmEngine snapshot.

use crate::{EntityId, Weather};
use serde::{Deserialize, Deserializer, Serialize};

pub const INITIAL_PASTURE_KG_DM: f64 = 1_800.0;
pub const DAILY_PASTURE_GROWTH_KG_DM: f64 = 35.0;
pub const PASTURE_CAP_KG_DM: f64 = 2_400.0;
pub const SUPPLEMENT_PRICE: f64 = crate::feeding::SUPPLEMENT_PRICE;
pub const BALANCED_PRICE: f64 = crate::feeding::BALANCED_PRICE;
pub const CONCENTRATE_PRICE: f64 = crate::feeding::CONCENTRATE_PRICE;
pub const MAINTENANCE_KG_DM: f64 = crate::MAINTENANCE_KG_DM;
pub const GAIN_FACTOR: f64 = crate::GAIN_FACTOR;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Diet {
    #[default]
    Pasture,
    Balanced,
    Concentrate,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Housing {
    #[default]
    Pasture,
    Barn,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Activity {
    #[default]
    Grazing,
    Feeding,
    Drinking,
    Resting,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActivityReason {
    PastureHousing,
    BarnHousing,
    ThirstThreshold,
    RestWindow,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FarmConfig {
    #[serde(default)]
    pub diet: Diet,
    #[serde(default)]
    pub housing: Housing,
    #[serde(default)]
    pub weather: Weather,
    #[serde(default)]
    pub supplement: f64,
}

impl FarmConfig {
    pub fn validate(&self) -> Result<(), String> {
        if !self.supplement.is_finite() || !(0.0..=4.0).contains(&self.supplement) {
            return Err(
                "supplement must be finite and between 0 and 4 kg DM per animal per day".into(),
            );
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ObservedActivityState {
    pub hour: u8,
    pub thirst: f64,
    pub housing: Housing,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActivityRecord {
    pub hour: u64,
    pub action: Activity,
    pub reason: ActivityReason,
    pub observed: ObservedActivityState,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimalState {
    pub id: EntityId,
    pub name: String,
    pub weight: f64,
    pub initial_weight: f64,
    pub energy: f64,
    pub thirst: f64,
    pub action: Activity,
    pub patch: u32,
    pub history: Vec<ActivityRecord>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AnimalStateInput {
    id: EntityId,
    name: String,
    weight: f64,
    initial_weight: f64,
    energy: f64,
    thirst: f64,
    action: Activity,
    patch: u32,
    #[serde(default)]
    history: Vec<ActivityRecord>,
    // Legacy map coordinates are accepted at the input boundary and discarded.
    #[serde(rename = "x", default)]
    _legacy_x: Option<f64>,
    #[serde(rename = "y", default)]
    _legacy_y: Option<f64>,
    #[serde(rename = "targetX", default)]
    _legacy_target_x: Option<f64>,
    #[serde(rename = "targetY", default)]
    _legacy_target_y: Option<f64>,
}

impl<'de> Deserialize<'de> for AnimalState {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let input = AnimalStateInput::deserialize(deserializer)?;
        Ok(Self {
            id: input.id,
            name: input.name,
            weight: input.weight,
            initial_weight: input.initial_weight,
            energy: input.energy,
            thirst: input.thirst,
            action: input.action,
            patch: input.patch,
            history: input.history,
        })
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IntakeTotals {
    #[serde(rename = "pastureKgDM")]
    pub pasture_kg_dm: f64,
    #[serde(rename = "barnBaseKgDM")]
    pub barn_base_kg_dm: f64,
    #[serde(rename = "supplementKgDM")]
    pub supplement_kg_dm: f64,
    #[serde(rename = "dietExtraKgDM")]
    pub diet_extra_kg_dm: f64,
}

impl Default for IntakeTotals {
    fn default() -> Self {
        Self {
            pasture_kg_dm: 0.0,
            barn_base_kg_dm: 0.0,
            supplement_kg_dm: 0.0,
            diet_extra_kg_dm: 0.0,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FarmEvent {
    pub hour: u64,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub animal_id: Option<EntityId>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FarmSnapshot {
    pub hour: u64,
    pub animals: Vec<AnimalState>,
    pub pastures: Vec<f64>,
    pub intake: IntakeTotals,
    pub config: FarmConfig,
    pub cost: f64,
    pub events: Vec<FarmEvent>,
    /// Current state of the model RNG stream, matching JS `state.seed`.
    pub seed: u32,
    pub initial_seed: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FarmSnapshotInput {
    hour: u64,
    animals: Vec<AnimalState>,
    pastures: Vec<f64>,
    intake: IntakeTotals,
    config: FarmConfig,
    cost: f64,
    events: Vec<FarmEvent>,
    seed: u32,
    #[serde(default)]
    initial_seed: Option<u32>,
    #[serde(rename = "locomotionSeed", default)]
    _legacy_locomotion_seed: Option<u32>,
}

impl<'de> Deserialize<'de> for FarmSnapshot {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let input = FarmSnapshotInput::deserialize(deserializer)?;
        Ok(Self {
            hour: input.hour,
            animals: input.animals,
            pastures: input.pastures,
            intake: input.intake,
            config: input.config,
            cost: input.cost,
            events: input.events,
            seed: input.seed,
            initial_seed: input.initial_seed.unwrap_or(input.seed),
        })
    }
}

impl FarmSnapshot {
    pub fn validate(&self) -> Result<(), String> {
        if self.animals.is_empty() || self.animals.len() > 10_000 {
            return Err("snapshot animal count must be between 1 and 10000".into());
        }
        if self.pastures.len() != 4 {
            return Err("snapshot pastures must contain exactly four paddocks".into());
        }
        self.config.validate()?;
        let mut ids = std::collections::HashSet::with_capacity(self.animals.len());
        for animal in &self.animals {
            if !ids.insert(animal.id) {
                return Err(format!("duplicate animal id {}", animal.id.0));
            }
            if animal.patch >= 4 {
                return Err(format!(
                    "animal {} has unsupported patch {}",
                    animal.id.0, animal.patch
                ));
            }
            if [
                animal.weight,
                animal.initial_weight,
                animal.energy,
                animal.thirst,
            ]
            .iter()
            .any(|value| !value.is_finite())
            {
                return Err(format!(
                    "animal {} contains a non-finite field",
                    animal.id.0
                ));
            }
            if animal.history.len() > 40 {
                return Err(format!("animal {} history exceeds 40 records", animal.id.0));
            }
        }
        if self.pastures.iter().any(|value| !value.is_finite())
            || !self.cost.is_finite()
            || [
                self.intake.pasture_kg_dm,
                self.intake.barn_base_kg_dm,
                self.intake.supplement_kg_dm,
                self.intake.diet_extra_kg_dm,
            ]
            .iter()
            .any(|value| !value.is_finite())
        {
            return Err("snapshot contains non-finite pasture, intake, or cost data".into());
        }
        if self.events.len() > 100 {
            return Err("snapshot event list exceeds 100 records".into());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FarmMetrics {
    pub weight: f64,
    pub gain: f64,
    pub cost: f64,
    pub pasture: f64,
    pub pasture_by_paddock: Vec<f64>,
    pub intake: IntakeMetrics,
    pub stress: u8,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IntakeMetrics {
    #[serde(rename = "pastureKgDM")]
    pub pasture_kg_dm: f64,
    #[serde(rename = "barnBaseKgDM")]
    pub barn_base_kg_dm: f64,
    #[serde(rename = "supplementKgDM")]
    pub supplement_kg_dm: f64,
    #[serde(rename = "dietExtraKgDM")]
    pub diet_extra_kg_dm: f64,
    #[serde(rename = "totalKgDM")]
    pub total_kg_dm: f64,
}
