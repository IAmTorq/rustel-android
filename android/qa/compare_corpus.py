from pathlib import Path
import json,subprocess,math,os
from corpus_contract import validate
ROOT=Path(__file__).resolve().parent
ADB=os.environ.get('ADB','adb')
data=subprocess.run([ADB,'shell','run-as','cc.rustel.qa','cat','files/qa-corpus/results.jsonl'],capture_output=True,check=True).stdout
(ROOT/'device-corpus-results.jsonl').write_bytes(data)
expected={r['case']:r for r in json.loads((ROOT/'goldens.json').read_text(encoding='utf-8'))}
rows=[json.loads(line) for line in data.decode('utf-8').splitlines() if line.strip()]
validate(rows,expected)
issues=[];exact_audio=0;passed=0;unavailable=0;seconds=0
for row in rows:
    e=expected[row['case']];messages=[]
    if row['status']=='samples_unavailable':unavailable+=1;issues.append(row);continue
    if row['status']!='measured':issues.append(row);continue
    for field in ['haps','haps_sha256','frames','ctx']:
        if row[field]!=e[field]:messages.append(field)
    if row['audio_sha256']==e['audio_sha256']:exact_audio+=1
    else:
        for field in ['peak','rms']:
            if abs(row[field]-e[field])>0.001*max(abs(row[field]),abs(e[field]),1e-9):messages.append(field)
        a=row['audible'];b=e['audible']
        if (a is None)!=(b is None) or (a and b and any(abs(x-y)>128 for x,y in zip(a,b))):messages.append('audible')
    seconds+=row['elapsed_ms']/1000
    if messages:issues.append({'case':row['case'],'differences':messages,'actual':row,'expected':e})
    else:passed+=1
report={'totalExpected':len(expected),'completed':len(rows),'passed':passed,'samplesUnavailable':unavailable,'issues':issues,'exactAudioHashMatches':exact_audio,'measuredCaseSeconds':seconds,'method':'Exact event hash/count, source-context count and frame count; upstream cross-platform PCM policy: 0.1% peak/RMS and 128 audible frames when quantized PCM hash differs'}
(ROOT/'device-corpus-comparison.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='issues'}));print('firstIssues',json.dumps(issues[:3])[:2000])
raise SystemExit(1 if issues or unavailable else 0)
