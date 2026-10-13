//! The demonstrative FarmEngine weather rules and stress diagnostic.

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Weather {
    #[default]
    Normal,
    Hot,
    Rain,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WeatherRules {
    pub heat_multiplier: f64,
    pub pasture_growth_multiplier: f64,
    pub thirst_per_hour: f64,
}

pub fn weather_rules(weather: Weather) -> WeatherRules {
    match weather {
        Weather::Normal => WeatherRules {
            heat_multiplier: 1.0,
            pasture_growth_multiplier: 1.0,
            thirst_per_hour: 5.0,
        },
        Weather::Hot => WeatherRules {
            heat_multiplier: 0.8,
            pasture_growth_multiplier: 0.65,
            thirst_per_hour: 9.0,
        },
        Weather::Rain => WeatherRules {
            heat_multiplier: 1.0,
            pasture_growth_multiplier: 1.3,
            thirst_per_hour: 5.0,
        },
    }
}

pub fn environmental_stress(weather: Weather, housing: crate::Housing) -> u8 {
    if weather == Weather::Hot {
        28
    } else if housing == crate::Housing::Barn {
        12
    } else {
        5
    }
}
