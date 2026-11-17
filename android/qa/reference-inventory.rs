//! Host-side inventory input, not evidence that each function was exercised.
use rustel_studio::reference::{Reference, engine_knows};
use serde_json::json;

fn main() {
    let documented = Reference::load_all();
    let supported = Reference::load(engine_knows());
    let mut registered: Vec<_> = rustel_runtime::lint::known_names().iter().collect();
    registered.sort();
    let entries: Vec<_> = (0..documented.len())
        .filter_map(|index| documented.entry(index))
        .map(|entry| {
            json!({
                "name": entry.name,
                "synonyms": entry.synonyms,
                "tags": entry.tags,
                "parameters": entry.params.iter().map(|parameter| json!({
                    "name": parameter.name,
                    "type": parameter.r#type,
                })).collect::<Vec<_>>(),
                "nameFoundInHostReference": supported.lookup(&entry.name).is_some(),
                "deprecated": entry.deprecated,
                "snippet": entry.snippet.is_some(),
            })
        })
        .collect();
    println!(
        "{}",
        json!({
            "schema": 1,
            "profile": format!("{} host Studio default features; not Android capability proof", std::env::consts::OS),
            "registeredNames": registered,
            "documentedEntries": entries,
        })
    );
}
