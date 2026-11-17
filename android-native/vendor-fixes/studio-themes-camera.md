# Native camera cover crop

The vendored `rustel-studio-themes` 0.2.0 source comes from upstream commit
`7c0c9bf9c711da823d6dbd1bd043e66882217b2a` at
https://github.com/tzfm/rustel-studio-themes. Its AGPL license and README are
retained alongside the source. These are upstream theme assets, not personal
theme overlays.

`CameraPicture::cover_luma` used the larger source-to-target ratio. That made
one mapped dimension exceed the image. Negative coordinates saturated to zero,
and coordinates beyond the far edge clamped to the last pixel, producing
stretched strips on nonmatching terminal shapes. Using the smaller ratio crops
the surplus axis and covers the target with valid image coordinates.

The only source changes are that scale calculation and two inline regression
tests for wide and tall inputs. Both tests fail against the pinned upstream
calculation and pass with this correction. No audio or theme palette changes
are included. The root Cargo patch uses the vendored source, and its package is
a workspace member so the regression tests run normally.

Remove the override and vendor copy when a pinned upstream version includes
the correction, after rerunning these tests and the actual phone camera check.
