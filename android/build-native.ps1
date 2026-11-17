param([switch]$Qa, [switch]$KeepSymbols, [ValidateSet('build', 'clippy')][string]$Command = 'build')
$ErrorActionPreference = 'Stop'
if ($KeepSymbols -and (-not $Qa -or $Command -ne 'build')) {
    throw '-KeepSymbols is available only for a QA build.'
}
$repo = Split-Path $PSScriptRoot -Parent
foreach ($required in @('ANDROID_NDK_HOME', 'JAVA_HOME', 'LIBCLANG_PATH')) {
    if (-not [Environment]::GetEnvironmentVariable($required)) {
        throw "Set $required first. See android/docs/BUILDING.md."
    }
}
$llvm = Join-Path $env:ANDROID_NDK_HOME 'toolchains\llvm\prebuilt\windows-x86_64\bin'
$sysroot = Join-Path $env:ANDROID_NDK_HOME 'toolchains\llvm\prebuilt\windows-x86_64\sysroot'
$env:PATH = "$llvm;$env:JAVA_HOME\bin;" + $env:PATH
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = Join-Path $llvm 'aarch64-linux-android31-clang.cmd'
$env:CC_aarch64_linux_android = $env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER
$env:CXX_aarch64_linux_android = Join-Path $llvm 'aarch64-linux-android31-clang++.cmd'
$env:AR_aarch64_linux_android = Join-Path $llvm 'llvm-ar.exe'
$env:BINDGEN_EXTRA_CLANG_ARGS_aarch64_linux_android = '--target=aarch64-linux-android31 --sysroot="' + $sysroot.Replace('\','/') + '"'
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS = '-C link-arg=-Wl,-z,max-page-size=16384'
if (-not $env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR = Join-Path $repo 'target' }
$env:CARGO_INCREMENTAL = '0'
$env:CARGO_NET_GIT_FETCH_WITH_CLI = 'true'
# The original fork URL is unavailable; the same locked commit exists here.
$env:GIT_CONFIG_COUNT = '1'
$env:GIT_CONFIG_KEY_0 = 'url.https://github.com/colinmarc/pulseaudio-rs.insteadOf'
$env:GIT_CONFIG_VALUE_0 = 'https://github.com/undy-aeon/pulseaudio-rs'
$env:BUILD_REVISION = 'c60f974b4bc4f3e1fbb79d7982089aa15451b6fe-android-port'
$features = @()
if ($Qa) { $features = @('--features', 'qa') }
$lint = @()
if ($Command -eq 'clippy') { $lint = @('--', '-D', 'warnings') }
if ($KeepSymbols) {
    # Apply only to the final crate, keeping dependency compilation unchanged.
    & cargo +1.98.1 rustc --locked --manifest-path (Join-Path $repo 'Cargo.toml') --profile local --target aarch64-linux-android -p rustel-android @features -- -C strip=none
} else {
    & cargo +1.98.1 $Command --locked --manifest-path (Join-Path $repo 'Cargo.toml') --profile local --target aarch64-linux-android -p rustel-android @features @lint
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($Command -eq 'build') {
    $binary = Join-Path $env:CARGO_TARGET_DIR 'aarch64-linux-android\local\librustel_android.so'
    @{qa=[bool]$Qa;sha256=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash} |
        ConvertTo-Json | Set-Content -LiteralPath "$binary.build.json"
}
