from pathlib import Path
import os, subprocess, zipfile, shutil, hashlib, json, tarfile, sys
root=Path(__file__).resolve().parent
repo=root.parent
jdk=Path(os.environ['JAVA_HOME'])/'bin'
sdk=Path(os.environ['ANDROID_SDK_ROOT'])
ndk=Path(os.environ['ANDROID_NDK_HOME'])
tools=sdk/'build-tools'/os.environ.get('ANDROID_BUILD_TOOLS','32.0.0')
android=sdk/'platforms'/os.environ.get('ANDROID_COMPILE_PLATFORM','android-32')/'android.jar'
app=root/'app'
build=root/'apk-build'
build.mkdir(exist_ok=True)
qa='--qa' in sys.argv
output=root/'dist/qa' if qa else root/'dist/release'
output.mkdir(parents=True,exist_ok=True)
log=[]
def run(*args):
    command=[str(a) for a in args]
    result=subprocess.run(command,capture_output=True,text=True,encoding='utf-8',errors='replace')
    log.append(' '.join(command)+'\n'+result.stdout+result.stderr)
    (root/'apk-build.log').write_text('\n'.join(log),encoding='utf-8')
    if result.returncode:raise RuntimeError(result.stdout+result.stderr)
    return result.stdout
for name in ['classes','dex','generated']:
    folder=build/name
    folder.mkdir(exist_ok=True)
    for old in folder.rglob('*'):
        if old.is_file():
            assert old.resolve().is_relative_to(build.resolve())
            old.unlink()
run(tools/'aapt2.exe','compile','--dir',app/'res','-o',build/'resources.zip')
manifest=app/'AndroidManifest.xml'
if qa:
    content=manifest.read_text(encoding='utf-8').replace('package="cc.rustel.android"','package="cc.rustel.qa"')
    content=content.replace('android:label="Rustel"','android:label="Rustel QA" android:debuggable="true"')
    content=content.replace('android:name=".MainActivity"','android:name="cc.rustel.android.MainActivity"').replace('android:name=".PlaybackService"','android:name="cc.rustel.android.PlaybackService"')
    manifest=build/'qa-manifest.xml';manifest.write_text(content,encoding='utf-8')
run(tools/'aapt2.exe','link','-o',build/'unsigned.apk','--manifest',manifest,'--custom-package','cc.rustel.android','-I',android,'-R',build/'resources.zip','-A',app/'assets','--java',build/'generated')
sources=list((app/'src').rglob('*.java'))+list((build/'generated').rglob('*.java'))
run(jdk/'javac.exe','-encoding','UTF-8','-source','8','-target','8','-bootclasspath',str(android)+os.pathsep+str(tools/'core-lambda-stubs.jar'),'-d',build/'classes',*sources)
with zipfile.ZipFile(build/'classes.jar','w',zipfile.ZIP_DEFLATED) as z:
    for p in (build/'classes').rglob('*.class'):z.write(p,p.relative_to(build/'classes').as_posix())
run(jdk/'java.exe','-cp',tools/'lib/d8.jar','com.android.tools.r8.D8','--lib',android,'--min-api','31','--output',build/'dex',build/'classes.jar')
binary=Path(os.environ.get('CARGO_TARGET_DIR',repo/'target'))/'aarch64-linux-android/local/librustel_android.so'
assert binary.is_file(),'Native Android engine has not finished building'
native_sources=list((repo/'crates').rglob('*.rs'))+list((repo/'android-native').rglob('*.rs'))
assert binary.stat().st_mtime >= max(p.stat().st_mtime for p in native_sources), 'Native engine needs rebuilding after source changes'
with zipfile.ZipFile(build/'unsigned.apk') as original, zipfile.ZipFile(build/'assembled.apk','w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for info in original.infolist(): z.writestr(info,original.read(info.filename))
    z.write(binary,'lib/arm64-v8a/librustel_android.so')
    for p in (build/'dex').glob('*.dex'):z.write(p,p.name)
run(tools/'zipalign.exe','-f','4',build/'assembled.apk',build/'aligned.apk')
sidecar=json.loads(Path(str(binary)+'.build.json').read_text(encoding='utf-8-sig'))
assert sidecar['qa']==qa, 'Rebuild the native library for the requested QA/production mode'
assert sidecar['sha256'].lower()==hashlib.sha256(binary.read_bytes()).hexdigest()
key=Path(os.environ.get('RUSTEL_KEYSTORE',root/'signing/qa-only.jks'))
if not qa:
    assert 'RUSTEL_KEYSTORE' in os.environ and key.is_file(), 'Production requires an existing private signing key'
    assert 'RUSTEL_STORE_PASSWORD' in os.environ and 'RUSTEL_KEY_PASSWORD' in os.environ
else:
    os.environ.setdefault('RUSTEL_STORE_PASSWORD','android')
    os.environ.setdefault('RUSTEL_KEY_PASSWORD','android')
    if not key.exists():
        assert '--new-qa-key' in sys.argv, 'Use --new-qa-key once to create a disposable QA signing identity'
        key.parent.mkdir(parents=True,exist_ok=True)
        run(jdk/'keytool.exe','-genkeypair','-keystore',key,'-storepass:env','RUSTEL_STORE_PASSWORD','-keypass:env','RUSTEL_KEY_PASSWORD','-alias',os.environ.get('RUSTEL_KEY_ALIAS','rustel'),'-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Rustel Disposable QA Build')
run(sys.executable,root/'prepare-source.py')
# Re-link assets after the source bundle is regenerated, then retain dex/native files.
with zipfile.ZipFile(build/'aligned.apk') as original, zipfile.ZipFile(build/'with-source.apk','w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for info in original.infolist():
        if info.filename!='assets/rustel-android-source.tar.gz':
            z.writestr(info,original.read(info.filename))
    z.write(app/'assets/rustel-android-source.tar.gz','assets/rustel-android-source.tar.gz')
run(tools/'zipalign.exe','-f','4',build/'with-source.apk',build/'source-aligned.apk')
apk=output/('Rustel-QA.apk' if qa else 'Rustel-Android.apk')
run(jdk/'java.exe','-jar',tools/'lib/apksigner.jar','sign','--v2-signing-enabled','true','--v3-signing-enabled','true','--ks',key,'--ks-key-alias',os.environ.get('RUSTEL_KEY_ALIAS','rustel'),'--ks-pass','env:RUSTEL_STORE_PASSWORD','--key-pass','env:RUSTEL_KEY_PASSWORD','--out',apk,build/'source-aligned.apk')
verification=run(jdk/'java.exe','-jar',tools/'lib/apksigner.jar','verify','--verbose','--print-certs',apk)
v2verification=run(jdk/'java.exe','-jar',tools/'lib/apksigner.jar','verify','--verbose','--min-sdk-version','24','--max-sdk-version','27',apk)
alignment=run(tools/'zipalign.exe','-c','-v','4',apk)
metadata=run(tools/'aapt.exe','dump','badging',apk)
readelf=ndk/'toolchains/llvm/prebuilt/windows-x86_64/bin/llvm-readelf.exe'
elf=run(readelf,'-h','-l','-d',binary)
assert 'AArch64' in elf
if not qa:
    symbols=run(readelf,'--dyn-syms','--wide',binary)
    assert 'nativeQaRun' not in symbols, 'QA native entry point is present in production'
assert all(line.strip().endswith('0x4000') for line in elf.splitlines() if line.strip().startswith('LOAD'))
assert "native-code: 'arm64-v8a'" in metadata
assert "targetSdkVersion:'35'" in metadata
import xml.etree.ElementTree as ET
version=ET.parse(app/'AndroidManifest.xml').getroot().attrib['{http://schemas.android.com/apk/res/android}versionCode']
assert "versionCode='"+version+"'" in metadata
assert ("application-label:'Rustel QA'" if qa else "application-label:'Rustel'") in metadata
assert ("package: name='cc.rustel.qa'" if qa else "package: name='cc.rustel.android'") in metadata
assert 'Verified using v2 scheme (APK Signature Scheme v2): true' in v2verification
assert 'Verified using v3 scheme (APK Signature Scheme v3): true' in verification
with zipfile.ZipFile(apk) as z:
    assert z.testzip() is None
    for p in (app/'assets/themes').glob('*.json'):
        assert z.read('assets/themes/'+p.name)==p.read_bytes()
    assert not any('/cache/samples/' in n for n in z.namelist())
    print('Native ARM64 APK and ZIP contents verified')
sha=hashlib.sha256(apk.read_bytes()).hexdigest()
Path(str(apk)+'.sha256').write_text(sha+'  '+apk.name+'\n',encoding='utf-8')
(output/'APK-VALIDATION.txt').write_text(verification+'\nV2 verification with older verifier range:\n'+v2verification+'\n'+metadata+'\n'+elf+'\nAPK ZIP CRC verified. See android/docs/TESTING.md for device coverage and unresolved issues.\n',encoding='utf-8')
print(json.dumps({'apk':str(apk),'bytes':apk.stat().st_size,'sha256':sha,'signature':'v2 + v3 verified','alignment':'ELF 16 KiB, APK ZIP 4 bytes'}))
