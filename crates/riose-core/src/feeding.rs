//! Existing illustrative feeding calculations, kept in JavaScript arithmetic order.

use crate::{Diet, Housing};

pub const BASE_DEMAND_KG_DM: f64 = 8.0;
pub const SUPPLEMENT_PRICE: f64 = 1.8;
pub const BALANCED_PRICE: f64 = 1.6;
pub const CONCENTRATE_PRICE: f64 = 2.1;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FeedingResult {
    pub forage_kg_dm: f64,
    pub barn_base_feed_kg_dm: f64,
    pub supplement_kg_dm: f64,
    pub diet_extra_kg_dm: f64,
    pub pasture_after_feeding_kg_dm: f64,
    pub barn_base_cost: f64,
    pub additional_feed_cost: f64,
    pub energy_intake_kg_dm: f64,
}

pub fn calculate_feeding(
    weight_kg: f64,
    housing: Housing,
    heat_factor: f64,
    pasture_available_kg_dm: f64,
    diet: Diet,
    supplement_kg_dm_per_day: f64,
) -> FeedingResult {
    let demand = BASE_DEMAND_KG_DM * (weight_kg / 360.0) * heat_factor / 24.0;
    let mut forage = 0.0;
    let mut barn_base_feed = 0.0;
    let mut pasture_after_feeding = pasture_available_kg_dm;
    let mut barn_base_cost = 0.0;

    if housing == Housing::Pasture {
        forage = demand.min(pasture_available_kg_dm);
        pasture_after_feeding -= forage;
    } else {
        barn_base_feed = demand;
        barn_base_cost = demand * 0.65;
    }

    let supplement = supplement_kg_dm_per_day / 24.0;
    let diet_extra = match diet {
        Diet::Pasture => 0.0,
        Diet::Balanced => 1.8 / 24.0,
        Diet::Concentrate => 3.2 / 24.0,
    };
    let diet_price = match diet {
        Diet::Balanced => BALANCED_PRICE,
        Diet::Pasture | Diet::Concentrate => CONCENTRATE_PRICE,
    };
    let additional_feed_cost = supplement * SUPPLEMENT_PRICE + diet_extra * diet_price;
    let energy_intake = forage + barn_base_feed + supplement * 1.2 + diet_extra * 1.35;

    FeedingResult {
        forage_kg_dm: forage,
        barn_base_feed_kg_dm: barn_base_feed,
        supplement_kg_dm: supplement,
        diet_extra_kg_dm: diet_extra,
        pasture_after_feeding_kg_dm: pasture_after_feeding,
        barn_base_cost,
        additional_feed_cost,
        energy_intake_kg_dm: energy_intake,
    }
}
