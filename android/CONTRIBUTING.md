# Contributing to the Android port

Read the root [coding guide](../CODING_STYLE.md) and
[contribution guide](../CONTRIBUTING.md) first. Their requirements apply to this
fork. Keep Android-specific behavior behind platform or feature gates and leave
desktop behavior intact unless a change explicitly addresses it.

Use a small branch from `android-port`. Describe the problem, resulting behavior,
tests run, and remaining limitations. Keep formatting separate from functional
changes when practical. Do not change audio goldens to conceal a regression or
relax a failing load test to obtain a green result.

See [BUILDING.md](docs/BUILDING.md) for prerequisites and
[TESTING.md](docs/TESTING.md) for the device matrix and known failures. A passing
mock or host test does not establish camera, speaker, keyboard or GPU behavior
on Android. Record the exact commit, APK digest, device, Android/WebView versions,
test conditions and outcome for a device run. Redact personal data before upload.

Never commit signing material, passwords, tokens, personal theme files, projects,
phone backups, sample caches, VST binaries, device serial numbers or unreviewed
logs/screenshots. Use the publication checker before a push. Personal themes can
remain a local overlay under ignored `android/app/assets/themes/`.

Open issues in this fork for Android host problems. Upstream bugs should first
be reproduced against an unmodified upstream build, with a minimal public score.
Do not automatically file port-only problems against the upstream project.

There is no automatic release publication. Before releasing an APK, complete
the production checklist in BUILDING.md, including absence of native QA entry
points and an unchanged signing identity for updates.


Write changes in the project voice: describe the trigger, resulting behavior,
relevant validation and remaining limitations. Follow the root coding guide.
Keep commit subjects concise and technical. Avoid session transcripts, operator
commentary and installation-specific narratives. Full run logs and generated
reports belong in local results or CI artifacts; keep reproducible tests in Git.
