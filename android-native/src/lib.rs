#![cfg(target_os = "android")]

use jni::{
    JNIEnv,
    objects::{GlobalRef, JByteArray, JIntArray, JObject, JString},
    sys::{jbyteArray, jint},
};
mod allocator;
#[cfg(feature = "qa")]
mod qa;
#[cfg(feature = "qa")]
#[unsafe(no_mangle)]
pub extern "system" fn Java_cc_rustel_android_MainActivity_nativeQaRun(
    mut env: JNIEnv,
    _this: JObject,
    folder: JString,
) -> jni::sys::jboolean {
    let Ok(folder) = env.get_string(&folder) else {
        return 0;
    };
    qa::start(std::path::PathBuf::from(String::from(folder))) as jni::sys::jboolean
}
use std::{
    io::Write,
    os::fd::FromRawFd,
    sync::{
        Arc, Mutex, OnceLock,
        atomic::{AtomicBool, AtomicI32, Ordering},
    },
};
static ACTIVITY: Mutex<Option<GlobalRef>> = Mutex::new(None);
static CONTEXT: OnceLock<()> = OnceLock::new();
static INITIAL_ACTIVITY: OnceLock<GlobalRef> = OnceLock::new();
static READER: AtomicI32 = AtomicI32::new(-1);
static RUNNING: AtomicBool = AtomicBool::new(false);
static CANCEL: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);
static LAST_ERROR: Mutex<String> = Mutex::new(String::new());
#[unsafe(no_mangle)]
pub extern "system" fn Java_cc_rustel_android_MainActivity_nativeAudioRoutes(
    env: JNIEnv,
    _this: JObject,
    default_wireless: jni::sys::jboolean,
    wireless_ids: JIntArray,
) {
    let Ok(length) = env.get_array_length(&wireless_ids) else {
        let _ = env.exception_clear();
        rustel_audio::device::set_android_output_routes(false, &[]);
        return;
    };
    if !(0..=128).contains(&length) {
        rustel_audio::device::set_android_output_routes(false, &[]);
        return;
    }
    let mut ids = vec![0; length as usize];
    if env
        .get_int_array_region(&wireless_ids, 0, &mut ids)
        .is_err()
    {
        let _ = env.exception_clear();
        rustel_audio::device::set_android_output_routes(false, &[]);
        return;
    }
    rustel_audio::device::set_android_output_routes(default_wireless != 0, &ids);
}
#[unsafe(no_mangle)]
pub extern "system" fn Java_cc_rustel_android_MainActivity_nativeImportPattern(
    mut env: JNIEnv,
    _this: JObject,
    path: JString,
    name: JString,
    open: jni::sys::jboolean,
) -> jni::sys::jboolean {
    let Ok(path) = env.get_string(&path) else {
        return 0;
    };
    let path = std::path::PathBuf::from(String::from(path));
    let Ok(name) = env.get_string(&name) else {
        return 0;
    };
    let mode = if open != 0 {
        rustel_studio::android_pattern_import::Mode::Open
    } else {
        rustel_studio::android_pattern_import::Mode::Import
    };
    rustel_studio::android_pattern_import::submit(path, String::from(name), mode)
        as jni::sys::jboolean
}
fn diagnostic(home: &str, message: &str) {
    let path = std::path::Path::new(home).join("startup.log");
    if std::fs::metadata(&path).is_ok_and(|m| m.len() > 1024 * 1024) {
        let _ = std::fs::write(&path, "");
    }
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let _ = writeln!(file, "{:?}: {message}", std::time::SystemTime::now());
    }
}
fn stage<T>(name: &str, result: std::io::Result<T>) -> Result<T, String> {
    result.map_err(|e| format!("{name}: {e}"))
}
#[unsafe(no_mangle)]
pub extern "system" fn Java_cc_rustel_android_MainActivity_nativeUiTheme(
    env: JNIEnv,
    _this: JObject,
) -> jni::sys::jstring {
    env.new_string(rustel_studio::android_controls::ui_palette_json())
        .map(|s| s.into_raw())
        .unwrap_or(std::ptr::null_mut())
}
#[unsafe(no_mangle)]
pub extern "system" fn Java_cc_rustel_android_MainActivity_nativeActions(
    env: JNIEnv,
    _this: JObject,
) -> jni::sys::jstring {
    env.new_string(rustel_studio::android_controls::actions_json())
        .map(|s| s.into_raw())
        .unwrap_or(std::ptr::null_mut())
}
#[unsafe(no_mangle)]
pub extern "system" fn Java_cc_rustel_android_MainActivity_nativePiano(
    _env: JNIEnv,
    _this: JObject,
) -> jni::sys::jboolean {
    rustel_studio::android_controls::piano() as jni::sys::jboolean
}
#[unsafe(no_mangle)]
pub extern "system" fn Java_cc_rustel_android_MainActivity_nativeLastError(
    env: JNIEnv,
    _this: JObject,
) -> jni::sys::jstring {
    env.new_string(LAST_ERROR.lock().unwrap().as_str())
        .map(|s| s.into_raw())
        .unwrap_or(std::ptr::null_mut())
}
#[unsafe(no_mangle)]
pub extern "system" fn Java_cc_rustel_android_MainActivity_nativeStop(
    _env: JNIEnv,
    _this: JObject,
) {
    if let Some(cancel) = CANCEL.lock().unwrap().as_ref() {
        cancel.store(true, Ordering::Release);
    }
    rustel_studio::android_terminal::close();
}
#[unsafe(no_mangle)]
pub extern "system" fn Java_cc_rustel_android_MainActivity_nativeStart(
    mut env: JNIEnv,
    activity: JObject,
    home: JString,
    cols: jint,
    rows: jint,
) -> jint {
    if RUNNING.swap(true, Ordering::SeqCst) {
        // A recreated Activity must not attach a second reader to the old
        // session's closing pipe. The host retries without blocking its UI.
        return -2;
    }
    let mut folder = String::new();
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(
        || -> Result<i32, String> {
            folder = env
                .get_string(&home)
                .map_err(|e| format!("Read app directory: {e}"))?
                .into();
            diagnostic(
                &folder,
                "android.11 starting; direct event queue, Downloads Open and pattern import, app-owned output pipe, no PTY/ioctl/process-stdio replacement",
            );
            if !allocator::verify() {
                return Err("Audio callback allocator failed its startup positive control".into());
            }
            diagnostic(
                &folder,
                "Audio callback tripwire allocator armed (allocation and free positive control passed)",
            );
            let vm = env.get_java_vm().map_err(|e| e.to_string())?;
            let activity = env.new_global_ref(activity).map_err(|e| e.to_string())?;
            let initial = env
                .new_global_ref(activity.as_obj())
                .map_err(|e| e.to_string())?;
            let _ = INITIAL_ACTIVITY.set(initial);
            let raw = INITIAL_ACTIVITY.get().unwrap().as_obj().as_raw();
            CONTEXT.get_or_init(|| unsafe {
                ndk_context::initialize_android_context(
                    vm.get_java_vm_pointer().cast(),
                    raw.cast(),
                );
            });
            *ACTIVITY.lock().unwrap() = Some(activity);
            // A pipe carries display bytes only. Android retains ownership of
            // stdin/stdout/stderr and its process/session/signal configuration.
            let mut fds = [-1; 2];
            if unsafe { libc::pipe2(fds.as_mut_ptr(), libc::O_CLOEXEC) } < 0 {
                return Err(format!(
                    "Create display pipe: {}",
                    std::io::Error::last_os_error()
                ));
            }
            rustel_runtime::stdio::install_android_output(unsafe {
                std::fs::File::from_raw_fd(fds[1])
            });
            let old = READER.swap(fds[0], Ordering::SeqCst);
            if old >= 0 {
                unsafe {
                    libc::close(old);
                }
            }
            rustel_studio::android_terminal::configure(
                cols.clamp(60, 500) as u16,
                rows.clamp(10, 500) as u16,
            );
            unsafe {
                std::env::set_var("HOME", &folder);
                std::env::set_var("RUSTEL_CONFIG_DIR", format!("{folder}/config"));
                std::env::set_var("RUSTEL_MUSIC_DIR", format!("{folder}/Music"));
                std::env::set_var("TERM", "xterm-256color");
                std::env::set_var("COLORTERM", "truecolor");
                std::env::set_var("RUST_BACKTRACE", "1");
            }
            let cancelled = Arc::new(AtomicBool::new(false));
            *CANCEL.lock().unwrap() = Some(Arc::clone(&cancelled));
            let home = folder.clone();
            stage("Start studio thread",std::thread::Builder::new().name("Rustel Studio".into()).stack_size(16*1024*1024).spawn(move||{
            diagnostic(&home,"Display bridge ready; AAudio low-latency enabled, automatic native burst sizing; starting Studio");
            let result=std::panic::catch_unwind(||{
                let options=rustel_studio::StudioOptions {
                    path: None,
                    performance_events: cfg!(feature="qa"),
                    cancellation: Some(cancelled),
                    build_features: &["android","studio","device-audio","midi","extensions","opus","mp3-export","hydra","video","osc","remote-control","themes"],
                    ..Default::default()
                };
                rustel_studio::run(options)
            });
            let message=match result{Ok(Ok(()))=>String::new(),Ok(Err(e))=>e.to_string(),Err(_)=>"The native studio stopped unexpectedly. Saved projects are preserved.".into()};
            diagnostic(&home,&format!("Studio stopped: {message}"));
            *LAST_ERROR.lock().unwrap()=message.clone();
            rustel_studio::android_terminal::close();
            rustel_runtime::stdio::close_android_output();
            let context=ndk_context::android_context();
            if let Ok(vm)=unsafe{jni::JavaVM::from_raw(context.vm().cast())}
                && let Ok(mut env)=vm.attach_current_thread()
                && let Ok(text)=env.new_string(message)
            {
                        let text=JObject::from(text);let activity=ACTIVITY.lock().unwrap();
                        if let Some(activity)=activity.as_ref(){let _=env.call_method(activity.as_obj(),"onStudioExit","(Ljava/lang/String;)V",&[jni::objects::JValue::Object(&text)]);}
                        let _=env.exception_clear();
            }
            // Keep the old Activity callback ahead of a replacement start.
            RUNNING.store(false,Ordering::SeqCst);
        }))?;
            Ok(fds[0])
        },
    ));
    match result {
        Ok(Ok(fd)) => fd,
        failure => {
            let message = match failure {
                Ok(Err(message)) => message,
                _ => "Native startup panicked before Studio opened".into(),
            };
            diagnostic(&folder, &message);
            *LAST_ERROR.lock().unwrap() = message;
            rustel_runtime::stdio::close_android_output();
            let fd = READER.swap(-1, Ordering::SeqCst);
            if fd >= 0 {
                unsafe {
                    libc::close(fd);
                }
            }
            RUNNING.store(false, Ordering::SeqCst);
            -1
        }
    }
}
#[unsafe(no_mangle)]
pub extern "system" fn Java_cc_rustel_android_MainActivity_nativeRead(
    env: JNIEnv,
    _this: JObject,
) -> jbyteArray {
    let fd = READER.load(Ordering::SeqCst);
    if fd < 0 {
        return std::ptr::null_mut();
    }
    // Camera-colored frames can exceed 32 KiB; reduce bridge round trips.
    let mut buffer = [0u8; 131072];
    let length = loop {
        let n = unsafe { libc::read(fd, buffer.as_mut_ptr().cast(), buffer.len()) };
        if n < 0 && std::io::Error::last_os_error().kind() == std::io::ErrorKind::Interrupted {
            continue;
        }
        break n;
    };
    if length <= 0 {
        if READER
            .compare_exchange(fd, -1, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
        {
            unsafe {
                libc::close(fd);
            }
        }
        return std::ptr::null_mut();
    }
    env.byte_array_from_slice(&buffer[..length as usize])
        .map(|a| a.into_raw())
        .unwrap_or(std::ptr::null_mut())
}
#[unsafe(no_mangle)]
pub extern "system" fn Java_cc_rustel_android_MainActivity_nativeWrite(
    env: JNIEnv,
    _this: JObject,
    data: JByteArray,
) {
    if let Ok(bytes) = env.convert_byte_array(&data) {
        rustel_studio::android_terminal::send(&bytes);
    }
}
#[unsafe(no_mangle)]
pub extern "system" fn Java_cc_rustel_android_MainActivity_nativeResize(
    _env: JNIEnv,
    _this: JObject,
    cols: jint,
    rows: jint,
) {
    rustel_studio::android_terminal::resize(cols.clamp(60, 500) as u16, rows.clamp(10, 500) as u16);
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_cc_rustel_android_MainActivity_nativeReferenceRegion(
    env: JNIEnv,
    _this: JObject,
) -> jni::sys::jstring {
    env.new_string(format!(
        "{:?}",
        rustel_studio::android_terminal::reference_region()
    ))
    .map(|s| s.into_raw())
    .unwrap_or(std::ptr::null_mut())
}
