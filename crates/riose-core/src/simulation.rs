//! Deterministic, headless implementation of the supported FarmEngine path.

use crate::environment::{environmental_stress, weather_rules};
use crate::feeding::calculate_feeding;
use crate::state::{
    Activity, ActivityReason, ActivityRecord, AnimalState, FarmConfig, FarmEvent, FarmMetrics,
    FarmSnapshot, IntakeMetrics, IntakeTotals, ObservedActivityState, BALANCED_PRICE,
    CONCENTRATE_PRICE, DAILY_PASTURE_GROWTH_KG_DM, GAIN_FACTOR, INITIAL_PASTURE_KG_DM,
    MAINTENANCE_KG_DM, PASTURE_CAP_KG_DM, SUPPLEMENT_PRICE,
};
use crate::{update_metabolism, EntityId, EntityIdAllocator, Housing, SeededRng};
use serde::{Deserialize, Serialize};

const NAMES: [&str; 24] = [
    "Aurora", "Bento", "Cacau", "Dália", "Estrela", "Figo", "Gaia", "Hugo", "Íris", "Joca",
    "Kiara", "Luna", "Milo", "Nina", "Oliva", "Pingo", "Quinoa", "Rubi", "Sol", "Teca", "Uva",
    "Vento", "Wally", "Zara",
];
#[derive(Clone, Debug)]
pub struct FarmEngine {
    state: FarmSnapshot,
    model_rng: SeededRng,
    #[cfg(feature = "history-ring")]
    /// Physical index of the oldest entry in each animal's bounded history.
    history_starts: Vec<u8>,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModelAssumptions {
    #[serde(rename = "baseDemandKgDM")]
    pub base_demand_kg_dm: f64,
    #[serde(rename = "dailyPastureGrowthKgDM")]
    pub daily_pasture_growth_kg_dm: f64,
    #[serde(rename = "initialPastureKgDM")]
    pub initial_pasture_kg_dm: f64,
    pub supplement_price: f64,
    pub balanced_price: f64,
    pub concentrate_price: f64,
    #[serde(rename = "maintenanceKgDM")]
    pub maintenance_kg_dm: f64,
    pub gain_factor: f64,
}

impl Default for ModelAssumptions {
    fn default() -> Self {
        Self {
            base_demand_kg_dm: crate::feeding::BASE_DEMAND_KG_DM,
            daily_pasture_growth_kg_dm: DAILY_PASTURE_GROWTH_KG_DM,
            initial_pasture_kg_dm: INITIAL_PASTURE_KG_DM,
            supplement_price: SUPPLEMENT_PRICE,
            balanced_price: BALANCED_PRICE,
            concentrate_price: CONCENTRATE_PRICE,
            maintenance_kg_dm: MAINTENANCE_KG_DM,
            gain_factor: GAIN_FACTOR,
        }
    }
}

impl FarmEngine {
    pub fn new(seed: u32, count: usize) -> Result<Self, String> {
        if !(1..=10_000).contains(&count) {
            return Err("animal count must be between 1 and 10000".into());
        }
        let mut model_rng = SeededRng::new(seed);
        let mut id_allocator = EntityIdAllocator::new(1);
        let mut animals = Vec::with_capacity(count);
        for index in 0..count {
            let weight = 330.0 + model_rng.next_f64() * 70.0;
            let patch = (index % 4) as u32;
            let id = id_allocator
                .allocate()
                .map_err(|_| "animal id space exhausted".to_owned())?;
            let name = if index < NAMES.len() {
                NAMES[index].to_owned()
            } else {
                format!("{} {}", NAMES[index % NAMES.len()], index + 1)
            };
            let mut animal = AnimalState {
                id,
                name,
                weight,
                initial_weight: weight,
                energy: 75.0,
                thirst: 20.0,
                action: Activity::Grazing,
                patch,
                history: Vec::new(),
            };
            record_activity_vec(
                &mut animal,
                6,
                ActivityReason::PastureHousing,
                20.0,
                Housing::Pasture,
            );
            animals.push(animal);
        }
        #[allow(unused_mut)]
        let mut engine = Self {
            state: FarmSnapshot {
                hour: 6,
                animals,
                pastures: vec![INITIAL_PASTURE_KG_DM; 4],
                intake: IntakeTotals::default(),
                config: FarmConfig::default(),
                cost: 0.0,
                events: vec![FarmEvent {
                    hour: 6,
                    text: "Fazenda iniciada. Os animais estão no pasto.".to_owned(),
                    animal_id: None,
                }],
                seed,
                initial_seed: seed,
            },
            model_rng,
            #[cfg(feature = "history-ring")]
            history_starts: vec![0; count],
        };
        engine.sync_rng_states();
        Ok(engine)
    }

    pub fn from_snapshot(snapshot: FarmSnapshot) -> Result<Self, String> {
        snapshot.validate()?;
        let model_rng = SeededRng::new(snapshot.seed);
        #[cfg(feature = "history-ring")]
        let history_starts = vec![0; snapshot.animals.len()];
        let engine = Self {
            state: snapshot,
            model_rng,
            #[cfg(feature = "history-ring")]
            history_starts,
        };
        Ok(engine)
    }

    pub fn snapshot(&self) -> FarmSnapshot {
        let mut result = self.state.clone();
        #[cfg(feature = "history-ring")]
        for (animal, start) in result.animals.iter_mut().zip(&self.history_starts) {
            animal.history.rotate_left(usize::from(*start));
        }
        result.seed = self.model_rng.state();
        result
    }

    pub fn metrics(&self) -> FarmMetrics {
        metrics(&self.state)
    }

    pub fn configure(&mut self, config: FarmConfig) -> Result<(), String> {
        config.validate()?;
        let previous = self.state.config;
        self.state.config = config;
        if config.housing != previous.housing {
            self.log(
                if config.housing == Housing::Barn {
                    "Rebanho transferido para o confinamento.".to_owned()
                } else {
                    "Rebanho voltou ao pasto.".to_owned()
                },
                None,
            );
        }
        if config.diet != previous.diet {
            let label = match config.diet {
                crate::Diet::Pasture => "volumoso / pasto",
                crate::Diet::Balanced => "balanceada",
                crate::Diet::Concentrate => "concentrado",
            };
            self.log(format!("Dieta alterada: {label}."), None);
        }
        if config.supplement != previous.supplement {
            self.log(
                format!("Suplementação: {} kg de MS/animal/dia.", config.supplement),
                None,
            );
        }
        if config.weather != previous.weather {
            let label = match config.weather {
                crate::Weather::Normal => "ameno",
                crate::Weather::Hot => "calor",
                crate::Weather::Rain => "chuva",
            };
            self.log(format!("Clima alterado: {label}."), None);
        }
        Ok(())
    }

    pub fn tick(&mut self, hours: u32) -> Result<(), String> {
        if !(1..=8_760).contains(&hours) {
            return Err("tick hours must be between 1 and 8760".into());
        }
        let mut metabolism_input = vec![0.0; self.state.animals.len() * 4];
        let mut metabolism_output = vec![0.0; self.state.animals.len() * 2];
        for _ in 0..hours {
            self.state.hour = self
                .state
                .hour
                .checked_add(1)
                .ok_or_else(|| "simulation hour exhausted".to_owned())?;
            let time = (self.state.hour % 24) as u8;
            let config = self.state.config;
            let environment = weather_rules(config.weather);
            for pasture in &mut self.state.pastures {
                *pasture = (*pasture
                    + DAILY_PASTURE_GROWTH_KG_DM * environment.pasture_growth_multiplier / 24.0)
                    .min(PASTURE_CAP_KG_DM);
            }

            for animal_index in 0..self.state.animals.len() {
                let activity_event = {
                    let animal = &mut self.state.animals[animal_index];
                    let previous_action = animal.action;
                    animal.thirst = clamp(animal.thirst + environment.thirst_per_hour, 0.0, 100.0);
                    let observed_thirst = animal.thirst;
                    let reason = if time < 6 || time >= 21 {
                        ActivityReason::RestWindow
                    } else if observed_thirst > 65.0 {
                        ActivityReason::ThirstThreshold
                    } else if config.housing == Housing::Pasture {
                        ActivityReason::PastureHousing
                    } else {
                        ActivityReason::BarnHousing
                    };
                    animal.action = match reason {
                        ActivityReason::RestWindow => Activity::Resting,
                        ActivityReason::ThirstThreshold => Activity::Drinking,
                        ActivityReason::PastureHousing => Activity::Grazing,
                        ActivityReason::BarnHousing => Activity::Feeding,
                    };
                    if animal.action == Activity::Drinking {
                        animal.thirst = 12.0;
                    }

                    let patch_index = animal.patch as usize;
                    let feeding = calculate_feeding(
                        animal.weight,
                        config.housing,
                        environment.heat_multiplier,
                        self.state.pastures[patch_index],
                        config.diet,
                        config.supplement,
                    );
                    if config.housing == Housing::Pasture {
                        self.state.pastures[patch_index] = feeding.pasture_after_feeding_kg_dm;
                    } else {
                        self.state.cost += feeding.barn_base_cost;
                    }
                    self.state.cost += feeding.additional_feed_cost;
                    self.state.intake.pasture_kg_dm += feeding.forage_kg_dm;
                    self.state.intake.barn_base_kg_dm += feeding.barn_base_feed_kg_dm;
                    self.state.intake.supplement_kg_dm += feeding.supplement_kg_dm;
                    self.state.intake.diet_extra_kg_dm += feeding.diet_extra_kg_dm;

                    let offset = animal_index * 4;
                    metabolism_input[offset] = animal.weight;
                    metabolism_input[offset + 1] = animal.energy;
                    metabolism_input[offset + 2] = feeding.energy_intake_kg_dm;
                    metabolism_input[offset + 3] = if animal.action == Activity::Resting {
                        1.0
                    } else {
                        0.0
                    };

                    let event = if animal.action != previous_action {
                        #[cfg(feature = "history-ring")]
                        record_activity_ring(
                            &mut animal.history,
                            &mut self.history_starts[animal_index],
                            self.state.hour,
                            reason,
                            observed_thirst,
                            config.housing,
                            animal.action,
                        );
                        #[cfg(not(feature = "history-ring"))]
                        record_activity(
                            animal,
                            self.state.hour,
                            reason,
                            observed_thirst,
                            config.housing,
                        );
                        Some((
                            format!("{}: {}.", animal.name, activity_label(animal.action)),
                            animal.id,
                        ))
                    } else {
                        None
                    };

                    event
                };
                if let Some((text, animal_id)) = activity_event {
                    self.log(text, Some(animal_id));
                }
            }

            update_metabolism(&metabolism_input, &mut metabolism_output).map_err(str::to_owned)?;
            for (index, animal) in self.state.animals.iter_mut().enumerate() {
                animal.weight = metabolism_output[index * 2];
                animal.energy = metabolism_output[index * 2 + 1];
            }
            self.sync_rng_states();
            if time == 6 {
                self.log(
                    format!("Novo dia: peso médio {:.1} kg.", self.metrics().weight),
                    None,
                );
            }
        }
        Ok(())
    }

    fn log(&mut self, text: String, animal_id: Option<EntityId>) {
        self.state.events.insert(
            0,
            FarmEvent {
                hour: self.state.hour,
                text,
                animal_id,
            },
        );
        self.state.events.truncate(100);
    }

    fn sync_rng_states(&mut self) {
        self.state.seed = self.model_rng.state();
    }
}

fn activity_label(activity: Activity) -> &'static str {
    match activity {
        Activity::Grazing => "pastando",
        Activity::Feeding => "no cocho",
        Activity::Drinking => "bebendo água",
        Activity::Resting => "descansando",
    }
}

fn clamp(value: f64, min: f64, max: f64) -> f64 {
    value.max(min).min(max)
}

fn record_activity_vec(
    animal: &mut AnimalState,
    hour: u64,
    reason: ActivityReason,
    observed_thirst: f64,
    housing: Housing,
) {
    animal.history.push(ActivityRecord {
        hour,
        action: animal.action,
        reason,
        observed: ObservedActivityState {
            hour: (hour % 24) as u8,
            thirst: observed_thirst,
            housing,
        },
    });
    if animal.history.len() > 40 {
        animal.history.remove(0);
    }
}

#[cfg(not(feature = "history-ring"))]
fn record_activity(
    animal: &mut AnimalState,
    hour: u64,
    reason: ActivityReason,
    observed_thirst: f64,
    housing: Housing,
) {
    record_activity_vec(animal, hour, reason, observed_thirst, housing);
}

#[cfg(feature = "history-ring")]
fn record_activity_ring(
    history: &mut Vec<ActivityRecord>,
    start: &mut u8,
    hour: u64,
    reason: ActivityReason,
    observed_thirst: f64,
    housing: Housing,
    action: Activity,
) {
    let record = ActivityRecord {
        hour,
        action,
        reason,
        observed: ObservedActivityState {
            hour: (hour % 24) as u8,
            thirst: observed_thirst,
            housing,
        },
    };
    if history.len() < 40 {
        history.push(record);
    } else {
        history[usize::from(*start)] = record;
        *start = ((*start + 1) % 40) as u8;
    }
}

pub fn metrics(snapshot: &FarmSnapshot) -> FarmMetrics {
    let count = snapshot.animals.len() as f64;
    let weight = snapshot
        .animals
        .iter()
        .map(|animal| animal.weight)
        .sum::<f64>()
        / count;
    // Preserve the JavaScript engine's left-to-right accumulation order:
    // `(sum + weight) - initialWeight` for each animal.
    let gain = snapshot.animals.iter().fold(0.0, |sum, animal| {
        sum + animal.weight - animal.initial_weight
    }) / count;
    let pasture = snapshot.pastures.iter().sum();
    let intake = IntakeMetrics {
        pasture_kg_dm: snapshot.intake.pasture_kg_dm,
        barn_base_kg_dm: snapshot.intake.barn_base_kg_dm,
        supplement_kg_dm: snapshot.intake.supplement_kg_dm,
        diet_extra_kg_dm: snapshot.intake.diet_extra_kg_dm,
        total_kg_dm: snapshot.intake.pasture_kg_dm
            + snapshot.intake.barn_base_kg_dm
            + snapshot.intake.supplement_kg_dm
            + snapshot.intake.diet_extra_kg_dm,
    };
    FarmMetrics {
        weight,
        gain,
        cost: snapshot.cost,
        pasture,
        pasture_by_paddock: snapshot.pastures.clone(),
        intake,
        stress: environmental_stress(snapshot.config.weather, snapshot.config.housing),
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ComparisonRow {
    pub day: u32,
    pub baseline_weight: f64,
    pub scenario_weight: f64,
    pub baseline_cost: f64,
    pub scenario_cost: f64,
    #[serde(rename = "baselineConsumptionKgDM")]
    pub baseline_consumption_kg_dm: f64,
    #[serde(rename = "scenarioConsumptionKgDM")]
    pub scenario_consumption_kg_dm: f64,
    #[serde(rename = "baselineIntakeBySourceKgDM")]
    pub baseline_intake_by_source_kg_dm: IntakeMetrics,
    #[serde(rename = "scenarioIntakeBySourceKgDM")]
    pub scenario_intake_by_source_kg_dm: IntakeMetrics,
    #[serde(rename = "baselinePastureKgDM")]
    pub baseline_pasture_kg_dm: f64,
    #[serde(rename = "scenarioPastureKgDM")]
    pub scenario_pasture_kg_dm: f64,
    pub baseline_pasture_by_paddock: Vec<f64>,
    pub scenario_pasture_by_paddock: Vec<f64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HousingComparison {
    pub days: u32,
    pub start_weight: f64,
    pub initial_config: FarmConfig,
    pub herd_size: usize,
    pub initial_pasture_by_paddock: Vec<f64>,
    pub comparison_factor: String,
    pub baseline_config: FarmConfig,
    pub scenario_config: FarmConfig,
    pub rows: Vec<ComparisonRow>,
    pub baseline: FarmMetrics,
    pub scenario: FarmMetrics,
    pub assumptions: ModelAssumptions,
    pub validated: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConfiguredComparisonRow {
    pub day: u32,
    pub reference_weight: f64,
    pub scenario_weight: f64,
    pub reference_cost: f64,
    pub scenario_cost: f64,
    #[serde(rename = "referenceConsumptionKgDM")]
    pub reference_consumption_kg_dm: f64,
    #[serde(rename = "scenarioConsumptionKgDM")]
    pub scenario_consumption_kg_dm: f64,
    #[serde(rename = "referenceIntakeBySourceKgDM")]
    pub reference_intake_by_source_kg_dm: IntakeMetrics,
    #[serde(rename = "scenarioIntakeBySourceKgDM")]
    pub scenario_intake_by_source_kg_dm: IntakeMetrics,
    #[serde(rename = "referencePastureKgDM")]
    pub reference_pasture_kg_dm: f64,
    #[serde(rename = "scenarioPastureKgDM")]
    pub scenario_pasture_kg_dm: f64,
    pub reference_pasture_by_paddock: Vec<f64>,
    pub scenario_pasture_by_paddock: Vec<f64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConfiguredComparison {
    pub engine_version: String,
    pub days: u32,
    pub start_weight: f64,
    pub initial_config: FarmConfig,
    pub herd_size: usize,
    pub initial_pasture_by_paddock: Vec<f64>,
    pub comparison_factor: String,
    pub seed: u32,
    pub reference_config: FarmConfig,
    pub scenario_config: FarmConfig,
    pub rows: Vec<ConfiguredComparisonRow>,
    pub reference: FarmMetrics,
    pub scenario: FarmMetrics,
    pub assumptions: ModelAssumptions,
    pub validated: bool,
}

fn intake_difference(current: &FarmMetrics, start: &FarmMetrics) -> IntakeMetrics {
    IntakeMetrics {
        pasture_kg_dm: current.intake.pasture_kg_dm - start.intake.pasture_kg_dm,
        barn_base_kg_dm: current.intake.barn_base_kg_dm - start.intake.barn_base_kg_dm,
        supplement_kg_dm: current.intake.supplement_kg_dm - start.intake.supplement_kg_dm,
        diet_extra_kg_dm: current.intake.diet_extra_kg_dm - start.intake.diet_extra_kg_dm,
        total_kg_dm: current.intake.total_kg_dm - start.intake.total_kg_dm,
    }
}

pub fn compare_housing(snapshot: &FarmSnapshot, days: u32) -> Result<HousingComparison, String> {
    if !(1..=365).contains(&days) {
        return Err("forecast days must be between 1 and 365".into());
    }
    snapshot.validate()?;
    let mut baseline = FarmEngine::from_snapshot(snapshot.clone())?;
    let mut scenario = FarmEngine::from_snapshot(snapshot.clone())?;
    let mut baseline_config = baseline.state.config;
    baseline_config.housing = Housing::Pasture;
    baseline.configure(baseline_config)?;
    let mut scenario_config = scenario.state.config;
    scenario_config.housing = Housing::Barn;
    scenario.configure(scenario_config)?;

    let base_cost = snapshot.cost;
    let start_metrics = metrics(snapshot);
    let mut rows = Vec::with_capacity(days as usize + 1);
    for day in 0..=days {
        if day > 0 {
            baseline.tick(24)?;
            scenario.tick(24)?;
        }
        let baseline_metrics = baseline.metrics();
        let scenario_metrics = scenario.metrics();
        let baseline_intake = intake_difference(&baseline_metrics, &start_metrics);
        let scenario_intake = intake_difference(&scenario_metrics, &start_metrics);
        rows.push(ComparisonRow {
            day,
            baseline_weight: baseline_metrics.weight,
            scenario_weight: scenario_metrics.weight,
            baseline_cost: baseline_metrics.cost - base_cost,
            scenario_cost: scenario_metrics.cost - base_cost,
            baseline_consumption_kg_dm: baseline_intake.total_kg_dm,
            scenario_consumption_kg_dm: scenario_intake.total_kg_dm,
            baseline_intake_by_source_kg_dm: baseline_intake,
            scenario_intake_by_source_kg_dm: scenario_intake,
            baseline_pasture_kg_dm: baseline_metrics.pasture,
            scenario_pasture_kg_dm: scenario_metrics.pasture,
            baseline_pasture_by_paddock: baseline_metrics.pasture_by_paddock,
            scenario_pasture_by_paddock: scenario_metrics.pasture_by_paddock,
        });
    }
    Ok(HousingComparison {
        days,
        start_weight: start_metrics.weight,
        initial_config: snapshot.config,
        herd_size: snapshot.animals.len(),
        initial_pasture_by_paddock: snapshot.pastures.clone(),
        comparison_factor: "housing".to_owned(),
        baseline_config: baseline.state.config,
        scenario_config: scenario.state.config,
        rows,
        baseline: baseline.metrics(),
        scenario: scenario.metrics(),
        assumptions: ModelAssumptions::default(),
        validated: false,
    })
}

/// Run a single-factor comparison from two copies of the same validated
/// snapshot. This adds no biological relationships beyond the existing engine.
pub fn compare_configured(
    snapshot: &FarmSnapshot,
    reference_config: FarmConfig,
    scenario_config: FarmConfig,
    days: u32,
) -> Result<ConfiguredComparison, String> {
    if !(1..=365).contains(&days) {
        return Err("forecast days must be between 1 and 365".into());
    }
    snapshot.validate()?;
    reference_config.validate()?;
    scenario_config.validate()?;

    let mut changed_factors = Vec::with_capacity(4);
    if reference_config.diet != scenario_config.diet {
        changed_factors.push("diet");
    }
    if reference_config.housing != scenario_config.housing {
        changed_factors.push("housing");
    }
    if reference_config.weather != scenario_config.weather {
        changed_factors.push("weather");
    }
    if reference_config.supplement != scenario_config.supplement {
        changed_factors.push("supplement");
    }
    if changed_factors.len() != 1 {
        return Err(
            "reference and scenario configurations must differ in exactly one supported factor"
                .into(),
        );
    }

    let mut reference = FarmEngine::from_snapshot(snapshot.clone())?;
    let mut scenario = FarmEngine::from_snapshot(snapshot.clone())?;
    reference.configure(reference_config)?;
    scenario.configure(scenario_config)?;

    let base_cost = snapshot.cost;
    let start_metrics = metrics(snapshot);
    let mut rows = Vec::with_capacity(days as usize + 1);
    for day in 0..=days {
        if day > 0 {
            reference.tick(24)?;
            scenario.tick(24)?;
        }
        let reference_metrics = reference.metrics();
        let scenario_metrics = scenario.metrics();
        let reference_intake = intake_difference(&reference_metrics, &start_metrics);
        let scenario_intake = intake_difference(&scenario_metrics, &start_metrics);
        rows.push(ConfiguredComparisonRow {
            day,
            reference_weight: reference_metrics.weight,
            scenario_weight: scenario_metrics.weight,
            reference_cost: reference_metrics.cost - base_cost,
            scenario_cost: scenario_metrics.cost - base_cost,
            reference_consumption_kg_dm: reference_intake.total_kg_dm,
            scenario_consumption_kg_dm: scenario_intake.total_kg_dm,
            reference_intake_by_source_kg_dm: reference_intake,
            scenario_intake_by_source_kg_dm: scenario_intake,
            reference_pasture_kg_dm: reference_metrics.pasture,
            scenario_pasture_kg_dm: scenario_metrics.pasture,
            reference_pasture_by_paddock: reference_metrics.pasture_by_paddock,
            scenario_pasture_by_paddock: scenario_metrics.pasture_by_paddock,
        });
    }

    Ok(ConfiguredComparison {
        engine_version: "agroville-engine/1".to_owned(),
        days,
        start_weight: start_metrics.weight,
        initial_config: snapshot.config,
        herd_size: snapshot.animals.len(),
        initial_pasture_by_paddock: snapshot.pastures.clone(),
        comparison_factor: changed_factors[0].to_owned(),
        seed: snapshot.initial_seed,
        reference_config,
        scenario_config,
        rows,
        reference: reference.metrics(),
        scenario: scenario.metrics(),
        assumptions: ModelAssumptions::default(),
        validated: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Diet, Weather};

    #[cfg(feature = "history-ring")]
    #[test]
    fn history_ring_overwrites_oldest_record_and_keeps_chronological_order() {
        let mut history = Vec::with_capacity(40);
        let mut start = 0;
        for hour in 1..=83 {
            record_activity_ring(
                &mut history,
                &mut start,
                hour,
                ActivityReason::PastureHousing,
                hour as f64,
                Housing::Pasture,
                Activity::Grazing,
            );
        }

        assert_eq!(history.len(), 40);
        assert_eq!(start, 3);
        let mut chronological = history.clone();
        chronological.rotate_left(usize::from(start));
        assert_eq!(
            chronological
                .iter()
                .map(|record| record.hour)
                .collect::<Vec<_>>(),
            (44..=83).collect::<Vec<_>>()
        );
        assert_eq!(chronological.first().unwrap().observed.thirst, 44.0);
        assert_eq!(chronological.last().unwrap().observed.hour, 11);
    }

    #[cfg(feature = "history-ring")]
    #[test]
    fn snapshot_keeps_repeatedly_wrapped_history_chronological() {
        let mut engine = FarmEngine::new(2026, 1).unwrap();
        engine.state.hour = 83;
        engine.state.animals[0].history.clear();
        for hour in 1..=83 {
            record_activity_ring(
                &mut engine.state.animals[0].history,
                &mut engine.history_starts[0],
                hour,
                ActivityReason::PastureHousing,
                hour as f64,
                Housing::Pasture,
                Activity::Grazing,
            );
        }

        let snapshot = engine.snapshot();
        let history = &snapshot.animals[0].history;
        assert_eq!(
            history.iter().map(|record| record.hour).collect::<Vec<_>>(),
            (44..=83).collect::<Vec<_>>()
        );
        assert_eq!(engine.snapshot(), snapshot);
    }

    #[cfg(feature = "history-ring")]
    #[test]
    fn full_history_snapshot_restores_and_replays_with_identical_chronology() {
        let mut checkpoint = FarmEngine::new(2026, 1).unwrap().snapshot();
        checkpoint.hour = 46;
        checkpoint.animals[0].history = (7..=46)
            .map(|hour| ActivityRecord {
                hour,
                action: Activity::Grazing,
                reason: ActivityReason::PastureHousing,
                observed: ObservedActivityState {
                    hour: (hour % 24) as u8,
                    thirst: 20.0,
                    housing: Housing::Pasture,
                },
            })
            .collect();

        let mut uninterrupted = FarmEngine::from_snapshot(checkpoint.clone()).unwrap();
        assert_eq!(uninterrupted.snapshot(), checkpoint);
        let saved = uninterrupted.snapshot();
        let mut replayed = FarmEngine::from_snapshot(saved).unwrap();

        uninterrupted.tick(1).unwrap();
        replayed.tick(1).unwrap();

        let uninterrupted_snapshot = uninterrupted.snapshot();
        let replayed_snapshot = replayed.snapshot();
        assert_eq!(uninterrupted_snapshot, replayed_snapshot);
        let history = &uninterrupted_snapshot.animals[0].history;
        assert_eq!(history.len(), 40);
        assert_eq!(history.first().unwrap().hour, 8);
        assert_eq!(history.last().unwrap().hour, 47);
        assert_eq!(history.last().unwrap().action, Activity::Resting);
        assert!(history
            .windows(2)
            .all(|records| records[0].hour < records[1].hour));
    }

    #[test]
    fn native_initialization_uses_stable_ids_and_the_js_model_rng_stream() {
        let engine = FarmEngine::new(917, 2).unwrap();
        let snapshot = engine.snapshot();
        assert_eq!(
            snapshot
                .animals
                .iter()
                .map(|animal| animal.id.0)
                .collect::<Vec<_>>(),
            [1, 2]
        );
        assert_eq!(snapshot.seed, 1_949_569_679);
        assert_eq!(snapshot.animals[0].weight, 371.40174839645624);
        assert_eq!(snapshot.events[0].hour, 6);
        assert_eq!(snapshot.animals[0].history[0].action, Activity::Grazing);
    }

    #[test]
    fn feeding_consumes_shared_pasture_stock_in_animal_order() {
        let engine = FarmEngine::new(3, 5).unwrap();
        let mut snapshot = engine.snapshot();
        snapshot.pastures[0] = 0.0;
        for animal in &mut snapshot.animals {
            animal.patch = 0;
        }
        let mut engine = FarmEngine::from_snapshot(snapshot).unwrap();
        engine.tick(1).unwrap();
        let snapshot = engine.snapshot();
        assert_eq!(snapshot.pastures[0], 0.0);
        assert!((snapshot.intake.pasture_kg_dm - DAILY_PASTURE_GROWTH_KG_DM / 24.0).abs() < 1e-12);
        assert!(
            snapshot.animals[0].weight - snapshot.animals[0].initial_weight
                > snapshot.animals[4].weight - snapshot.animals[4].initial_weight
        );
    }

    #[test]
    fn weather_config_and_thirst_rules_are_applied_before_sequential_feeding() {
        let mut engine = FarmEngine::new(42, 1).unwrap();
        engine
            .configure(FarmConfig {
                diet: Diet::Balanced,
                housing: Housing::Pasture,
                weather: Weather::Hot,
                supplement: 0.0,
            })
            .unwrap();
        engine.tick(1).unwrap();
        let snapshot = engine.snapshot();
        assert!((snapshot.animals[0].thirst - 29.0).abs() < 1e-12);
        assert!(snapshot.pastures[0] < INITIAL_PASTURE_KG_DM + DAILY_PASTURE_GROWTH_KG_DM / 24.0);
        assert_eq!(engine.metrics().stress, 28);
    }

    #[test]
    fn rejects_invalid_tick_and_clamps_energy_and_weight_with_current_kernel() {
        let mut engine = FarmEngine::new(4, 1).unwrap();
        assert!(engine.tick(0).is_err());
        let mut snapshot = engine.snapshot();
        snapshot.animals[0].weight = 190.0;
        snapshot.animals[0].energy = 99.0;
        let mut engine = FarmEngine::from_snapshot(snapshot).unwrap();
        engine
            .configure(FarmConfig {
                diet: Diet::Concentrate,
                housing: Housing::Barn,
                weather: Weather::Normal,
                supplement: 4.0,
            })
            .unwrap();
        engine.tick(1).unwrap();
        let animal = &engine.snapshot().animals[0];
        assert!(animal.weight >= 200.0);
        assert!(animal.energy <= 100.0);
    }

    #[test]
    fn comparison_has_day_zero_and_preserves_the_single_housing_intervention() {
        let snapshot = FarmEngine::new(2026, 24).unwrap().snapshot();
        let result = compare_housing(&snapshot, 1).unwrap();
        assert_eq!(result.rows.len(), 2);
        assert_eq!(result.rows[0].baseline_weight, result.start_weight);
        assert_eq!(result.baseline_config.housing, Housing::Pasture);
        assert_eq!(result.scenario_config.housing, Housing::Barn);
        assert!(!result.validated);
    }

    #[test]
    fn baseline_tracks_the_current_js_oracle_for_state_metrics_and_event_order() {
        let mut engine = FarmEngine::new(417, 3).unwrap();
        engine.tick(24).unwrap();
        let snapshot = engine.snapshot();
        let metrics = engine.metrics();
        assert_eq!(snapshot.hour, 30);
        assert_eq!(snapshot.seed, 1_472_672_670);
        assert_eq!(snapshot.events[0].text, "Novo dia: peso médio 350.2 kg.");
        assert_eq!(snapshot.events[1].text, "Cacau: bebendo água.");
        assert!((metrics.weight - 350.23800803415776).abs() < 1e-12);
        assert!((metrics.intake.total_kg_dm - 23.329146766678484).abs() < 1e-12);
        assert!((metrics.pasture - 7_316.670853233314).abs() < 1e-9);
    }

    #[test]
    fn housing_comparison_tracks_current_js_day_30_oracle() {
        let snapshot = FarmEngine::new(2026, 24).unwrap().snapshot();
        let result = compare_housing(&snapshot, 30).unwrap();
        let row = result.rows.last().unwrap();
        assert!((row.baseline_weight - 380.6533587230129).abs() < 1e-12);
        assert!((row.scenario_cost - 3_862.282113561586).abs() < 1e-9);
        assert!((row.baseline_consumption_kg_dm - 5_941.97248240239).abs() < 1e-9);
        assert_eq!(row.scenario_pasture_by_paddock, [2_400.0; 4]);
        assert_eq!(row.baseline_pasture_by_paddock.len(), 4);
    }
}
