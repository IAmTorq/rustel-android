//! Android clipboard through the hosting activity, with the editor's usual fallback.
use jni::{
    JavaVM,
    objects::{JObject, JString, JValue},
};
#[derive(Debug)]
pub enum Error {
    #[expect(
        dead_code,
        reason = "Shared clipboard retry arms also match arboard's busy variant"
    )]
    ClipboardOccupied,
    Platform(String),
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ClipboardOccupied => f.write_str("ClipboardOccupied"),
            Self::Platform(message) => write!(f, "Platform({message:?})"),
        }
    }
}
pub struct Clipboard;
impl Clipboard {
    pub fn new() -> Result<Self, Error> {
        Ok(Self)
    }
    pub fn get_text(&mut self) -> Result<String, Error> {
        with_env(|env, context| {
            let result = env
                .call_method(context, "readClipboard", "()Ljava/lang/String;", &[])?
                .l()?;
            if result.is_null() {
                return Ok(String::new());
            }
            Ok(env.get_string(&JString::from(result))?.into())
        })
    }
    pub fn set_text(&mut self, text: String) -> Result<(), Error> {
        with_env(|env, context| {
            let value = JObject::from(env.new_string(text)?);
            env.call_method(
                context,
                "writeClipboard",
                "(Ljava/lang/String;)V",
                &[JValue::Object(&value)],
            )?;
            Ok(())
        })
    }
}
fn with_env<T>(
    f: impl FnOnce(&mut jni::JNIEnv<'_>, &JObject<'_>) -> jni::errors::Result<T>,
) -> Result<T, Error> {
    let ctx = ndk_context::android_context();
    let vm =
        unsafe { JavaVM::from_raw(ctx.vm().cast()) }.map_err(|e| Error::Platform(e.to_string()))?;
    let mut env = vm
        .attach_current_thread()
        .map_err(|e| Error::Platform(e.to_string()))?;
    let context = unsafe { JObject::from_raw(ctx.context().cast()) };
    let result = f(&mut env, &context);
    if result.is_err() {
        let _ = env.exception_clear();
    }
    // `context` is the host's global reference; JObject does not delete it.
    result.map_err(|e| Error::Platform(e.to_string()))
}
