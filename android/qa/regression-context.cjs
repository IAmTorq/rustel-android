// Run only against the explicitly selected disposable QA set.
const d=require('./device.cjs'),fs=require('fs'),path=require('path');
const directory=process.env.RUSTEL_QA_SET_DIRECTORY;
if(!directory||!/^files\/config\/sets\/(?:QA_|Rustel_QA_)[^/]+$/.test(directory))throw Error('Set RUSTEL_QA_SET_DIRECTORY to a disposable QA set under files/config/sets');
const results=process.env.RUSTEL_QA_RESULTS;
if(!results||!path.isAbsolute(results))throw Error('Set RUSTEL_QA_RESULTS to an absolute private results directory');
fs.mkdirSync(results,{recursive:true});
const last=d.prefs().last_set;
if(!last||!last.endsWith('/'+directory))throw Error('Open the selected disposable QA set before running');
const apk=d.shell('pm','path','cc.rustel.qa').trim().replace(/^package:/,'');
if(!apk.endsWith('/base.apk')||apk.includes('\n'))throw Error('Expected one installed QA base APK');
const digest=d.shell('sha256sum',apk).trim().split(/\s/)[0];
if(!/^[a-f0-9]{64}$/.test(digest))throw Error('Could not hash installed QA APK');
module.exports={directory,result:n=>path.join(results,n),digest};
