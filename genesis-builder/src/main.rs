use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

#[derive(Deserialize, Debug, Serialize, Clone)]
struct Meta { name: String, symbol: String, decimals: u8, version: String, description: Option<String> }

#[derive(Deserialize, Debug, Serialize, Clone)]
struct Distribution { mining_pct: f64, treasury_pct: f64, vc_premine_pct: f64 }

#[derive(Deserialize, Debug, Serialize, Clone)]
struct Emission { start_reward_per_block: f64, monthly_reduction_pct: f64 }

#[derive(Deserialize, Debug, Serialize, Clone)]
struct Treasury { vest_years: u32 }

#[derive(Deserialize, Debug, Serialize, Clone)]
struct Supply {
    total_supply: u64,
    distribution: Distribution,
    emission: Emission,
    treasury: Treasury,
}

#[derive(Deserialize, Debug, Serialize, Clone)]
struct TokenSpec {
    meta: Meta,
    supply: Supply,
}

#[derive(Deserialize, Debug, Serialize, Clone)]
struct Allocation {
    address: String,
    label: String,
    amount: u64,
}

#[derive(Serialize, Debug)]
struct Genesis {
    meta: Meta,
    total_supply: u64,
    allocations: Vec<Allocation>,
    emission: Emission,
    treasury_vesting_years: u32,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("Building Genesis File...");

    // 1) YAML laden
    let spec_path = PathBuf::from("configs/token-spec.yaml");
    let spec_str = fs::read_to_string(&spec_path)
        .map_err(|e| format!("token-spec.yaml nicht gefunden unter {:?}: {}", spec_path, e))?;
    let spec: TokenSpec = serde_yaml::from_str(&spec_str)
        .map_err(|e| format!("Fehler beim Parsen von token-spec.yaml: {}", e))?;

    // 2) CSV laden
    let alloc_path = PathBuf::from("configs/genesis_allocation.csv");
    let mut rdr = csv::Reader::from_path(&alloc_path)
        .map_err(|e| format!("genesis_allocation.csv nicht gefunden unter {:?}: {}", alloc_path, e))?;
    let mut allocs: Vec<Allocation> = Vec::new();
    for result in rdr.deserialize() {
        let record: Allocation = result?;
        allocs.push(record);
    }

    // 3) Plausibilitäts-Check
    let sum_alloc: u128 = allocs.iter().map(|a| a.amount as u128).sum();
    if sum_alloc > spec.supply.total_supply as u128 {
        return Err(format!(
            "Summe der Allocations ({}) > total_supply ({})",
            sum_alloc, spec.supply.total_supply
        ).into());
    }

    // 4) Zusammenführen
    let genesis = Genesis {
        meta: spec.meta.clone(),
        total_supply: spec.supply.total_supply,
        allocations: allocs,
        emission: spec.supply.emission.clone(),
        treasury_vesting_years: spec.supply.treasury.vest_years,
    };

    // 5) JSON schreiben
    let out = serde_json::to_string_pretty(&genesis)?;
    fs::write("genesis.json", &out)?;

    println!("Genesis File created: genesis.json");
    Ok(())
}
