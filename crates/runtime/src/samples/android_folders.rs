//! Host-authorized Android document folders. Scores cannot create grants.
use super::SourceRule;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{OnceLock, RwLock};
use url::Url;

struct FolderGrant {
    name: String,
    base: String,
    source: SourceRule,
}

static FOLDERS: OnceLock<RwLock<Vec<FolderGrant>>> = OnceLock::new();
static GENERATION: AtomicU64 = AtomicU64::new(0);
static CHANGED: AtomicBool = AtomicBool::new(false);

pub(super) fn generation() -> u64 {
    GENERATION.load(Ordering::Acquire)
}
pub(super) fn has_grants() -> bool {
    FOLDERS
        .get()
        .is_some_and(|folders| folders.read().is_ok_and(|folders| !folders.is_empty()))
}
#[cfg(target_os = "android")]
pub fn take_android_sample_folder_change() -> bool {
    CHANGED.swap(false, Ordering::AcqRel)
}

pub fn set_android_sample_folder(name: &str, base: Option<&str>) -> Result<(), String> {
    if name.is_empty()
        || name.len() > 128
        || name.starts_with('.')
        || name
            .chars()
            .any(|c| c == '/' || c == '\\' || c.is_control())
    {
        return Err("Choose a folder alias without path separators".into());
    }
    let mut source = None;
    if let Some(base) = base {
        let url = Url::parse(base).map_err(|e| e.to_string())?;
        if url.scheme() != "http"
            || url.host_str() != Some("127.0.0.1")
            || url.port().is_none()
            || !url.path().ends_with('/')
            || url.query().is_some()
            || url.fragment().is_some()
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return Err("Invalid host sample-folder endpoint".into());
        }
        source = Some(SourceRule::parse(base)?);
    }
    let mut folders = FOLDERS
        .get_or_init(Default::default)
        .write()
        .map_err(|_| "Sample folder registry unavailable")?;
    if let Some(index) = folders.iter().position(|grant| grant.name == name) {
        if base == Some(folders[index].base.as_str()) {
            return Ok(());
        }
        folders.remove(index);
    } else if base.is_none() {
        return Ok(());
    }
    if let (Some(base), Some(source)) = (base, source) {
        if folders.len() >= 32 {
            return Err("At most 32 sample folders can be granted".into());
        }
        folders.push(FolderGrant {
            name: name.to_owned(),
            base: base.to_owned(),
            source,
        });
    }

    GENERATION.fetch_add(1, Ordering::Release);
    CHANGED.store(true, Ordering::Release);
    Ok(())
}

pub(super) fn resolve(folder: &str, file: &str) -> Result<Option<(String, String)>, String> {
    let mut pieces = folder.split('/');
    let name = pieces.next().unwrap_or_default();
    let folders = FOLDERS
        .get_or_init(Default::default)
        .read()
        .map_err(|_| "Sample folder registry unavailable")?;
    let Some(grant) = folders.iter().find(|grant| grant.name == name) else {
        return Ok(None);
    };
    let base = &grant.base;
    let mut url = Url::parse(base).map_err(|e| e.to_string())?;
    {
        let mut path = url
            .path_segments_mut()
            .map_err(|_| "Invalid folder endpoint")?;
        path.pop_if_empty();
        for part in pieces.filter(|p| !p.is_empty()).chain(
            file.split('/')
                .filter(|p| !p.is_empty() || !file.is_empty()),
        ) {
            if part.is_empty()
                || part.starts_with('.')
                || part.contains('\\')
                || part.chars().any(char::is_control)
            {
                return Err("Sample path must stay inside the granted folder".into());
            }
            path.push(part);
        }
        if file.is_empty() {
            path.push("");
        }
    }
    Ok(Some((url.to_string(), base.clone())))
}

pub(super) fn active_base(url: &Url) -> Option<String> {
    FOLDERS
        .get()?
        .read()
        .ok()?
        .iter()
        .find(|grant| grant.source.allows(url))
        .map(|grant| grant.base.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn named_folder_maps_encode_filenames_and_revoke_access() {
        let name = "QA_sample_alias";
        let base = "http://127.0.0.1:45123/test-alias-token/";
        set_android_sample_folder(name, Some(base)).unwrap();
        let (url, grant) = resolve("QA_sample_alias/Drums/", "kick + é.wav")
            .unwrap()
            .unwrap();
        assert_eq!(grant, base);
        let denied = super::super::ScoreSampleAccess::denied();
        assert!(denied.is_denied());
        assert!(denied.approve_remote(&url).is_err());
        let mut allowed = denied.clone();
        allowed.permit_android_sample_folders();
        assert!(!allowed.is_denied());
        assert!(matches!(
            allowed.approve_remote(&url).unwrap().1,
            super::super::ScoreFetchAccess::AndroidFolder { .. }
        ));
        assert!(
            allowed
                .approve_remote("https://example.com/private.wav")
                .is_err()
        );

        assert_eq!(
            url,
            "http://127.0.0.1:45123/test-alias-token/Drums/kick%20+%20%C3%A9.wav"
        );
        assert!(active_base(&Url::parse(&url).unwrap()).is_some());
        assert!(
            active_base(&Url::parse("http://127.0.0.1:45123/other-token/kick.wav").unwrap())
                .is_none()
        );
        set_android_sample_folder(name, None).unwrap();
        assert!(resolve("QA_sample_alias/", "kick.wav").unwrap().is_none());
        assert!(active_base(&Url::parse(&url).unwrap()).is_none());
    }

    #[test]
    fn named_folder_maps_refuse_traversal_and_absolute_files() {
        let name = "QA_sample_traversal";
        set_android_sample_folder(name, Some("http://127.0.0.1:45124/traversal-token/")).unwrap();
        for file in [
            "../outside.wav",
            "/outside.wav",
            "a/../../b.wav",
            "a\\..\\b.wav",
            ".hidden.wav",
        ] {
            assert!(resolve("QA_sample_traversal/", file).is_err(), "{file}");
        }
        assert!(resolve("QA_sample_traversal/../", "kick.wav").is_err());
        assert!(
            resolve("QA_sample_traversal/", "")
                .unwrap()
                .unwrap()
                .0
                .ends_with('/')
        );
        set_android_sample_folder(name, None).unwrap();
    }

    #[test]
    fn granted_maps_use_shared_registration_and_read_current_bytes_without_remote_cache() {
        use super::super::{
            CacheFetchScope, PublicationGate, SampleLibrary, ScoreCache, ScoreCacheKind,
            ScoreFetchAccess, ScoreSampleAccess, fetch_score_source_cached_with_budget,
        };
        use std::io::{BufRead, BufReader, Write};
        use std::net::TcpListener;
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let base = format!("http://{}/qa-file-token/", listener.local_addr().unwrap());
        let name = "QA_live_file_reads";
        set_android_sample_folder(name, Some(&base)).unwrap();
        let map = r#"{"zero":"zero.wav","numbers":["zero.wav","one.wav"],"keys":{"c3":"zero.wav","g3":"one.wav"}}"#;
        let local_base = "local:QA_live_file_reads/sub folder/";
        let library = SampleLibrary::empty();
        let denied = ScoreSampleAccess::denied();
        assert!(
            library
                .register_score_custom(map, Some(local_base), &denied)
                .is_err()
        );
        let mut allowed = denied.clone();
        allowed.permit_android_sample_folders();
        library
            .register_score_custom(map, Some(local_base), &allowed)
            .unwrap();
        for bank in ["zero", "numbers", "keys"] {
            assert!(library.knows(bank), "{bank}");
        }
        let (url, _) = resolve("QA_live_file_reads/sub folder/", "zero.wav")
            .unwrap()
            .unwrap();
        let (_, grant) = allowed.approve_remote(&url).unwrap();
        assert!(matches!(grant, ScoreFetchAccess::AndroidFolder { .. }));
        assert!(matches!(
            denied.regrant(&url, &grant),
            ScoreFetchAccess::Withdrawn
        ));
        let server = std::thread::spawn(move || {
            for body in ["first", "newer"] {
                let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
                let (mut stream, _) = loop {
                    match listener.accept() {
                        Ok(connection) => break connection,
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                            assert!(
                                std::time::Instant::now() < deadline,
                                "sample request timed out"
                            );
                            std::thread::sleep(std::time::Duration::from_millis(5));
                        }
                        Err(error) => panic!("sample connection: {error}"),
                    }
                };
                stream
                    .set_read_timeout(Some(std::time::Duration::from_secs(2)))
                    .unwrap();
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut request = String::new();
                reader.read_line(&mut request).unwrap();
                assert!(request.starts_with("GET /qa-file-token/sub%20folder/zero.wav "));
                loop {
                    let mut header = String::new();
                    reader.read_line(&mut header).unwrap();
                    if header == "\r\n" || header.is_empty() {
                        break;
                    }
                }
                write!(
                    stream,
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                )
                .unwrap();
            }
        });
        let cache_root = std::env::temp_dir().join(format!(
            "rustel-document-no-cache-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let cache = ScoreCache::new(cache_root.clone());
        let publication = PublicationGate::new();
        for expected in [b"first", b"newer"] {
            let budget = crate::sample_fetch::FetchBudget::for_one_fetch();
            let bytes = fetch_score_source_cached_with_budget(
                &cache,
                &url,
                &grant,
                ScoreCacheKind::Audio,
                1024,
                CacheFetchScope {
                    budget: &budget,
                    publication: &publication,
                },
                |bytes| Ok(bytes.to_vec()),
            )
            .unwrap();
            assert_eq!(bytes, expected);
        }
        server.join().unwrap();
        assert!(
            !cache_root.exists(),
            "local document bytes must not enter remote cache"
        );
        set_android_sample_folder(name, None).unwrap();
        assert!(matches!(
            allowed.regrant(&url, &grant),
            ScoreFetchAccess::Withdrawn
        ));
        let budget = crate::sample_fetch::FetchBudget::for_one_fetch();
        assert!(
            super::super::fetch_score_source_with_budget(&url, &grant, 1024, &budget, || {})
                .unwrap_err()
                .contains("access was removed")
        );
    }

    #[test]
    fn only_host_loopback_folder_endpoints_can_be_registered() {
        for base in [
            "https://example.com/token/",
            "http://localhost:80/token/",
            "http://127.0.0.1/token/",
            "http://127.0.0.1:80/token/?q=1",
            "file:///tmp/",
        ] {
            assert!(set_android_sample_folder("QA_bad_endpoint", Some(base)).is_err());
        }
        for alias in ["", "../escape", ".hidden", "one/two"] {
            assert!(set_android_sample_folder(alias, None).is_err());
        }
    }
}
