# Local sample folders on Android

Open phone Settings > Sample folders > Add folder. Choose the parent folder in
Android's folder picker, allow access, and give it an alias such as `Samples`.
The grant includes its subfolders. Files stay in their original location and
are read on demand; selecting a folder does not copy the whole pack into the app.

For this example layout:

```text
Samples/
  zero.wav
  one.wav
  Voices/spell.wav
  Voices/wrong.wav
  Voices/right.wav
```

Register the files with the normal sample-map API:

```javascript
samples({
  zero: 'zero.wav',
  one: 'one.wav',
  spell: 'Voices/spell.wav',
  wrong: 'Voices/wrong.wav',
  right: 'Voices/right.wav'
}, 'local:Samples/');

s("zero one spell wrong right").slow(4)
```

The keys are sound names used by the score. Values are filenames relative to
the base folder. Use the exact filename, including its extension, and forward
slashes for subfolders. Spaces and Unicode filenames are supported. The folder
alias is case-sensitive. A missing file reports a loading error; it does not
silently substitute another sample.

A subfolder can be the common base:

```javascript
samples({ spell: 'spell.wav', wrong: 'wrong.wav' }, 'local:Samples/Voices/');
```

The shared loader also accepts indexed arrays and note-mapped banks:

```javascript
samples({
  drums: ['Drums/kick.wav', 'Drums/snare.wav'],
  keys: { c3: 'Keys/c3.wav', g3: 'Keys/g3.wav' }
}, 'local:Samples/');

s("drums:0 drums:1")
// Or: note("c3 g3").s("keys")
```

These definitions use Rustel's normal bank selection, pitch mapping, sample
playback and effects. Android does not implement another sampler or notation
language. Remote sample packs and their normal download behavior are unchanged.

To discover a granted directory as banks, use `samples('local:Samples/Drums/')`.
Directory entries are sorted consistently before indexed banks are registered.
Folder scans and manifests remain bounded by the sample loader's limits.

Folder access is saved across app restarts and upgrades. In Sample folders,
Refresh reloads the folder endpoint; save and play the score again to reload its
sample definitions. Remove access revokes the grant and keeps the original
files. Folder grants are read-only. Another device or app installation must grant
its own folder, using the same alias if it shares the score.

On desktop, `local:` maps resolve beneath the host-selected local sample root,
using the existing Permissions page or `--allow-local-samples`. A Windows drive
path is not an Android location. The Android alias identifies the selected
document tree rather than exposing a drive or storage-provider URI in the score.
