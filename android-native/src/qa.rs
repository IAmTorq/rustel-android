//! Debug-only on-device corpus runner. Not compiled into ordinary APKs.
use rustel_fraction::Fraction;
use rustel_runtime::{ScoreSampleAccess, Session, SessionConfig};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
    time::Instant,
};
static RUNNING: AtomicBool = AtomicBool::new(false);
fn hex(bytes: impl AsRef<[u8]>) -> String {
    bytes.as_ref().iter().map(|b| format!("{b:02x}")).collect()
}
pub fn start(folder: PathBuf) -> bool {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return false;
    }
    let spawned = std::thread::Builder::new()
        .name("Rustel QA corpus".into())
        .stack_size(64 * 1024 * 1024)
        .spawn(move || {
            let result = std::panic::catch_unwind(|| run(&folder));
            let error = match result {
                Ok(Ok(())) => None,
                Ok(Err(e)) => Some(e),
                Err(_) => Some("corpus worker panic".into()),
            };
            if let Some(error) = error {
                let _ = fs::write(
                    folder.join("fatal.json"),
                    serde_json::json!({"error":error}).to_string(),
                );
            }
            RUNNING.store(false, Ordering::SeqCst);
        });
    if spawned.is_err() {
        RUNNING.store(false, Ordering::SeqCst);
        return false;
    }
    true
}
fn run(folder: &std::path::Path) -> Result<(), String> {
    let cases: Vec<serde_json::Value> =
        serde_json::from_slice(&fs::read(folder.join("cases.json")).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    let mut output = fs::File::create(folder.join("results.jsonl")).map_err(|e| e.to_string())?;
    let started = Instant::now();
    let mut passed = 0;
    let mut failed = 0;
    let mut unavailable = 0;
    for (index, case) in cases.iter().enumerate() {
        if folder.join("cancel").exists() {
            break;
        }
        let name = case["case"].as_str().ok_or("case has no name")?;
        let source = case["source"].as_str().ok_or("case has no source")?;
        let duration = case["dur"].as_f64().ok_or("case has no duration")?;
        let begin = Instant::now();
        let result = std::panic::catch_unwind(|| measure(source, duration));
        let mut value = match result {
            Ok(Ok(value)) => {
                if value["status"] == "samples_unavailable" {
                    unavailable += 1;
                } else {
                    passed += 1;
                }
                value
            }
            Ok(Err(error)) => {
                failed += 1;
                serde_json::json!({"status":"failed","error":error})
            }
            Err(_) => {
                failed += 1;
                serde_json::json!({"status":"failed","error":"panic"})
            }
        };
        value["case"] = name.into();
        value["elapsed_ms"] = serde_json::json!(begin.elapsed().as_secs_f64() * 1000.0);
        writeln!(output, "{value}").map_err(|e| e.to_string())?;
        output.flush().map_err(|e| e.to_string())?;
        let status = serde_json::json!({"index":index+1,"total":cases.len(),"measured":passed,"failed":failed,"samples_unavailable":unavailable,"case":name,"elapsed_secs":started.elapsed().as_secs_f64(),"complete":index+1==cases.len()});
        fs::write(folder.join("status.json"), status.to_string()).map_err(|e| e.to_string())?;
    }
    Ok(())
}
fn measure(source: &str, duration: f64) -> Result<serde_json::Value, String> {
    let mut access = ScoreSampleAccess::denied();
    access.permit_builtin_sources();
    let config = SessionConfig::default().with_score_sample_access(access);
    let channels = usize::from(config.channels);
    let mut session = Session::with_config(config).map_err(|e| format!("session: {e}"))?;
    session.set_direct_diagnostic_logging(false);
    session
        .enable_default_samples()
        .map_err(|e| format!("samples: {e}"))?;
    session
        .evaluate(source)
        .map_err(|e| format!("evaluate: {e}"))?;
    let haps = session
        .query(Fraction::ZERO, Fraction::new(4, 1))
        .map_err(|e| format!("query: {e}"))?;
    let mut hash = Sha256::new();
    let mut context = 0;
    for hap in &haps {
        hash.update(hap.show().as_bytes());
        hash.update(b"\n");
        context += hap.context.len();
    }
    let haps_hash = hex(hash.finalize());
    let pcm = session
        .render_pcm(duration)
        .map_err(|e| format!("render: {e}"))?;
    let failures = session.take_sample_failures();
    if !failures.is_empty() {
        return Ok(
            serde_json::json!({"status":"samples_unavailable","errors":failures.into_iter().map(|f|f.message).collect::<Vec<_>>()}),
        );
    }
    if channels == 0 || pcm.len() % channels != 0 {
        return Err("invalid channel/frame count".into());
    }
    let mut peak = 0f32;
    let mut sum = 0f64;
    let mut first = None;
    let mut last = None;
    let mut hash = Sha256::new();
    for (i, &sample) in pcm.iter().enumerate() {
        if !sample.is_finite() {
            return Err("non-finite PCM".into());
        }
        peak = peak.max(sample.abs());
        sum += f64::from(sample) * f64::from(sample);
        if sample.abs() >= 1e-7 {
            let frame = i / channels;
            if first.is_none() {
                first = Some(frame);
            }
            last = Some(frame);
        }
        hash.update(((sample * 64.0).round() as i32).to_le_bytes());
    }
    let rms = (sum / pcm.len().max(1) as f64).sqrt();
    Ok(
        serde_json::json!({"status":"measured","dur":duration,"frames":pcm.len()/channels,"haps":haps.len(),"haps_sha256":haps_hash,"ctx":context,"peak":peak,"rms":rms,"audible":first.zip(last),"audio_sha256":hex(hash.finalize())}),
    )
}
