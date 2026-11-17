# Vendored xterm WebGL renderer patches

xterm.js 6.0.0 / addon-webgl 0.19.0, MIT. Original compiled asset SHA256:
`b85f8d4b3e9756bebb757e3fe47134d70f03ea3d6b187624426d2e2b65dec06c`.

Source: https://github.com/xtermjs/xterm.js/blob/6.0.0/addons/addon-webgl/src/TextureAtlas.ts
Bundled asset: android/app/assets/addon-webgl.js (its MIT license is adjacent).

Local changes:
- clearTexture checks all pages, releases extra canvas backing stores, shrinks
  the retained page and discards stale packing/overflow pointers.
- AtlasPage.clear releases its old glyph list and used-pixel count.
- GPU uploads check canvas identity as well as version. Removed texture slots
  are reduced to 1x1 storage so a reused slot cannot retain stale glyphs.
- With transparency enabled, contrast ratio 1 and non-inverted text, the glyph
  cache key omits background RGB/mode bits. Drawing still receives original
  attributes; background rectangles retain their colors. Inverse, dim and
  extended style attributes retain their semantic cache distinctions.
- RGB ASCII, box/block drawing and braille with no extended styles or inverse
  use white glyph masks and per-instance GPU tint. Color emoji, combined glyphs,
  contrast-corrected text, inverse and extended underline colors retain the
  upstream colored-glyph path. Color/geometry comparisons cover both paths.

The Android helper schedules public clearTextureAtlas calls between frames at
most twice per second after the pixel threshold is reached. Its threshold is
a maintenance trigger, not a hard bound on memory allocated within one frame.
The current 1,200-frame test plateaus at 262,144 atlas pixels for RGB masks and
4,194,304 for the inverse fallback, with repeated eviction exercised separately.
See android/docs/TESTING.md for the limits of device evidence.

To regenerate, obtain the exact upstream tag and npm artifact, verify the
original digest, apply the changes above to TextureAtlas.ts, build the add-on,
then run wrapper/color/inverse/Unicode and sustained GPU tests. The readable
source changes are xterm-webgl-cache.patch and xterm-webgl-tint.patch; apply in
that order. Do not overwrite the bundled patch with an unmodified npm add-on.
The exact compiled transformation is reproducible with
`python android/patch-webgl.py ORIGINAL_ADDON.js`; webgl.patch.json pins both
digests and each edit. Obtain the original from the npm @xterm/addon-webgl
0.19.0 package (package/lib/addon-webgl.js).

The current compiled digest is pinned as patchedSha256 in android/webgl.patch.json.
