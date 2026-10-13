//! Deterministic, headless implementation of the supported FarmEngine path.

use crate::environment::{environmental_stress, weather_rules};
use crate::feeding::calculate_feeding;
use crate::state::{
    Activity, ActivityReason, ActivityRecord, AnimalState, FarmConfig, FarmEvent, FarmMetrics,
    FarmSnapshot, IntakeMetrics, IntakeTotals, ObservedActivityState, BALANCED_PRICE,
    CONCENTRATE_PRICE, DAILY_PASTURE_GROWTH_KG_DM, GAIN_FACTOR, INITIAL_PASTURE_KG_DM,
    MAINTENANCE_KG_DM, PASTURE_CAP_KG_DM, SUPPLEMENT_PRICE,
};
use crate::{update_metabolism, EntityId, EntityIdAllocator, Housing, SeedStreams, SeededRng};
use serde::{Deserialize, Serialize};

const NAMES: [&str; 24] = [
    "Aurora", "Bento", "Cacau", "Dália", "Estrela", "Figo", "Gaia", "Hugo", "Íris",
    "Joca", "Kiara", "Luna", "Milo", "Nina", "Oliva", "Pingo", "Quinoa", "Rubi", "Sol",
    "Teca", "Uva", "Vento", "Wally", "Zara",
];
const PATCH_BOUNDS: [Bounds; 4] = [
    Bounds { x: 35.0, y: 45.0, w: 135.0, h: 100.0 },
    Bounds { x: 200.0, y: 45.0, w: 135.0, h: 100.0 },
    Bounds { x: 35.0, y: 180.0, w: 135.0, h: 100.0 },
    Bounds { x: 200.0, y: 180.0, w: 135.0, h: 100.0 },
];
const BARN_BOUNDS: Bounds = Bounds { x: 392.0, y: 186.0, w: 132.0, h: 98.0 };

#[derive(Clone, Copy)]
struct Bounds {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(Clone, Debug)]
pub struct FarmEngine {
    state: FarmSnapshot,
    model_rng: SeededRng,
    locomotion_rng: SeededRng,
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
        let mut streams = SeedStreams::new(seed);
        let mut id_allocator = EntityIdAllocator::new(1);
        let mut animals = Vec::with_capacity(count);
        for index in 0..count {
            let weight = 330.0 + streams.model.next_f64() * 70.0;
            let patch = (index % 4) as u32;
            let bounds = PATCH_BOUNDS[patch as usize];
            let x = bounds.x + 10.0 + streams.locomotion.next_f64() * (bounds.w - 20.0);
            let y = bounds.y + 10.0 + streams.locomotion.next_f64() * (bounds.h - 20.0);
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
                x,
                y,
                target_x: x,
                target_y: y,
                history: Vec::new(),
            };
            record_activity(&mut animal, 6, ActivityReason::PastureHousing, 20.0, Housing::Pasture);
            animals.push(animal);
        }
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
                locomotion_seed: streams.locomotion.state(),
            },
            model_rng: streams.model,
            locomotion_rng: streams.locomotion,
        };
        engine.sync_rng_states();
        Ok(engine)
    }

    pub fn from_snapshot(snapshot: FarmSnapshot) -> Result<Self, String> {
        snapshot.validate()?;
        let model_rng = SeededRng::new(snapshot.seed);
        let locomotion_rng = SeededRng::new(snapshot.locomotion_seed);
        Ok(Self { state: snapshot, model_rng, locomotion_rng })
    }

    pub fn snapshot(&self) -> FarmSnapshot {
        let mut result = self.state.clone();
        result.seed = self.model_rng.state();
        result.locomotion_seed = self.locomotion_rng.state();
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
            for index in 0..self.state.animals.len() {
                self.place(index);
            }
            self.log(if config.housing == Housing::Barn {
                "Rebanho transferido para o confinamento.".to_owned()
            } else {
                "Rebanho voltou ao pasto.".to_owned()
            }, None);
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
            self.log(format!("Suplementação: {} kg de MS/animal/dia.", config.supplement), None);
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
            self.state.hour = self.state.hour.checked_add(1)
                .ok_or_else(|| "simulation hour exhausted".to_owned())?;
            let time = (self.state.hour % 24) as u8;
            let config = self.state.config;
            let environment = weather_rules(config.weather);
            for pasture in &mut self.state.pastures {
                *pasture = ( *pasture + DAILY_PASTURE_GROWTH_KG_DM * environment.pasture_growth_multiplier / 24.0)
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
                    metabolism_input[offset + 3] =
                        if animal.action == Activity::Resting { 1.0 } else { 0.0 };

                    let event = if animal.action != previous_action {
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

                    let bounds = bounds_for(config.housing, patch_index);
                    animal.target_x = bounds.x
                        + 10.0
                        + self.locomotion_rng.next_f64() * (bounds.w - 20.0);
                    animal.target_y = bounds.y
                        + 10.0
                        + self.locomotion_rng.next_f64() * (bounds.h - 20.0);
                    animal.x = clamp(
                        animal.x + (animal.target_x - animal.x) * 0.15,
                        bounds.x + 8.0,
                        bounds.x + bounds.w - 8.0,
                    );
                    animal.y = clamp(
                        animal.y + (animal.target_y - animal.y) * 0.15,
                        bounds.y + 8.0,
                        bounds.y + bounds.h - 8.0,
                    );
                    event
                };
                if let Some((text, animal_id)) = activity_event {
                    self.log(text, Some(animal_id));
                }
            }

            update_metabolism(&metabolism_input, &mut metabolism_output)
                .map_err(str::to_owned)?;
            for (index, animal) in self.state.animals.iter_mut().enumerate() {
                animal.weight = metabolism_output[index * 2];
                animal.energy = metabolism_output[index * 2 + 1];
            }
            self.sync_rng_states();
            if time == 6 {
                self.log(format!("Novo dia: peso médio {:.1} kg.", self.metrics().weight), None);
            }
        }
        Ok(())
    }

    fn random_locomotion(&mut self) -> f64 {
        let result = self.locomotion_rng.next_f64();
        self.state.locomotion_seed = self.locomotion_rng.state();
        result
    }

    fn place(&mut self, index: usize) {
        let patch = self.state.animals[index].patch as usize;
        let bounds = bounds_for(self.state.config.housing, patch);
        let x = bounds.x + 10.0 + self.random_locomotion() * (bounds.w - 20.0);
        let y = bounds.y + 10.0 + self.random_locomotion() * (bounds.h - 20.0);
        let animal = &mut self.state.animals[index];
        animal.x = x;
        animal.y = y;
        animal.target_x = x;
        animal.target_y = y;
    }

    fn log(&mut self, text: String, animal_id: Option<EntityId>) {
        self.state.events.insert(0, FarmEvent { hour: self.state.hour, text, animal_id });
        self.state.events.truncate(100);
    }

    fn sync_rng_states(&mut self) {
        self.state.seed = self.model_rng.state();
        self.state.locomotion_seed = self.locomotion_rng.state();
    }
}

fn bounds_for(housing: Housing, patch: usize) -> Bounds {
    if housing == Housing::Barn { BARN_BOUNDS } else { PATCH_BOUNDS[patch] }
}

fn clamp(value: f64, min: f64, max: f64) -> f64 {
    value.max(min).min(max)
}

fn activity_label(activity: Activity) -> &'static str {
    match activity {
        Activity::Grazing => "pastando",
        Activity::Feeding => "no cocho",
        Activity::Drinking => "bebendo água",
        Activity::Resting => "descansando",
    }
}

fn record_activity(
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

pub fn metrics(snapshot: &FarmSnapshot) -> FarmMetrics {
    let count = snapshot.animals.len() as f64;
    let weight = snapshot.animals.iter().map(|animal| animal.weight).sum::<f64>() / count;
    let gain = snapshot.animals.iter()
        .map(|animal| animal.weight - animal.initial_weight)
        .sum::<f64>() / count;
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Diet, Weather};

    #[test]
    fn native_initialization_uses_stable_ids_and_the_two_js_rng_streams() {
        let engine = FarmEngine::new(917, 2).unwrap();
        let snapshot = engine.snapshot();
        assert_eq!(snapshot.animals.iter().map(|animal| animal.id.0).collect::<Vec<_>>(), [1, 2]);
        assert_eq!(snapshot.seed, 1_949_569_679);
        assert_eq!(snapshot.animals[0].weight, 371.40174839645624);
        assert_eq!(snapshot.locomotion_seed, 2_052_957_951);
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
        engine.configure(FarmConfig { diet: Diet::Balanced, housing: Housing::Pasture, weather: Weather::Hot, supplement: 0.0 }).unwrap();
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
        engine.configure(FarmConfig { diet: Diet::Concentrate, housing: Housing::Barn, weather: Weather::Normal, supplement: 4.0 }).unwrap();
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
        assert_eq!(snapshot.locomotion_seed, 2_374_808_501);
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
