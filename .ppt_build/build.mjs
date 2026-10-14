import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {PresentationFile,FileBlob} from 'file:///C:/Users/rehan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const base='E:/Fontys/S1/Ch1/SleepQualityAnalysis';
process.env.RUNTIME_NODE_MODULES='C:/Users/rehan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const skill='C:/Users/rehan/.codex/plugins/cache/openai-primary-runtime/presentations/26.1007.11041/skills/presentations';
const p=await PresentationFile.importPptx(await FileBlob.load('E:/Fontys/S1/Ch1/sleep_project_2c_processing.pptx'));
for(const s of p.slides.items){
 for(const sh of s.shapes.items){
  if(sh.text){
   sh.text.replace('steps, active minutes','steps, heart rate');
   sh.text.replace('sleep, daytime, check-ins','sleep, heart rate, steps');
   sh.text.replace('To: Database (daily_values), read by the Web dashboard (macro block 3)','To: Database (daily_values), fetched by Python Backend and sent to Frontend');
  }
 }
 for(const t of s.tables.items){
  console.log('table',t.id);
 }
}
// Keep the existing component table, adding heart rate to the activity processing row.
const t=p.slides.items[1].tables.items[0];
if(t){t.cells.set(5,0,'Heart rate and steps');t.cells.set(5,1,'Daily steps and heart rate summaries, with valid sample counts.');t.cells.set(5,2,'From stored heart rate and activity records.');t.cells.set(5,3,'Merged table to daily values');}
const s=p.slides.add(); s.background.fill='#FFFFFF';
function box(name,text,x,y,w,h,fill='#F5F3FF',size=19,bold=false){
 const sh=s.shapes.add({geometry:'rect',name,position:{left:x,top:y,width:w,height:h},fill,line:{fill:fill==='none'?'none':'#A78BFA',width:fill==='none'?0:1.3}});
 sh.text=text;sh.text.style={fontFamily:'Calibri',fontSize:size,color:'#1F2937',bold,alignment:'center',verticalAlignment:'middle'};sh.text.insets=8;return sh;
}
function link(a,b,from='right',to='left'){return s.shapes.connect(a,b,{fromSide:from,toSide:to,kind:'straight',line:{fill:'#334155',width:1.5},tail:{type:'triangle',width:'med',length:'med'}});}
box('title','2c Processing: database to frontend',34,16,1210,42,'none',30,true);
box('subtitle','Stored values feed the daily and weekly dashboard',34,63,1210,28,'none',18);
box('frontend-request-label','Frontend',34,105,265,32,'none',20,true);
box('backend-label','Python Backend',350,105,570,32,'none',20,true);
box('database-label','Database',975,105,265,32,'none',20,true);
const req=box('request','Select day or week\nSend HTTP GET request',34,150,265,80,'#FFFFFF',20);
const val=box('validate','Validate date range\nand participant',355,150,270,80);
const query=box('query','Fetch daily_values\nSQL SELECT by date',685,150,270,80);
const db=box('database','daily_values\nSleep, heart rate, steps',1010,150,235,80,'#EFF6FF',19);
link(req,val);link(val,query);link(query,db);
const read=box('records','Read returned records\ninto a pandas table',1010,290,235,80,'#F5F3FF',18);
const clean=box('prepare','Align dates and units\nKeep missing values null',685,290,270,80);
const summary=box('aggregate','Build daily or weekly output\nTotals, averages, valid counts',355,290,270,80,'#F5F3FF',18);
const json=box('json','Create JSON response\nDates, metrics, gap flags',34,290,265,80,'#F5F3FF',18);
link(db,read,'bottom','top');link(read,clean,'left','right');link(clean,summary,'left','right');link(summary,json,'left','right');
const front=box('frontend','Frontend receives JSON\nMap output to dashboard displays',34,425,1211,65,'#EFF6FF',22,true);
link(json,front,'bottom','top');
const sleep=box('sleep-output','Sleep display\nDuration, bedtime, wake time\nAvailable stages or awakenings',34,555,355,98,'#FFFFFF',20);
const heart=box('heart-output','Heart rate display\nResting bpm when available\nDaily and weekly trends',462,555,355,98,'#FFFFFF',20);
const steps=box('step-output','Steps count display\nDaily count and weekly total\nDays with data',890,555,355,98,'#FFFFFF',20);
link(front,sleep,'bottom','top');link(front,heart,'bottom','top');link(front,steps,'bottom','top');
box('gap-note','Missing data stays missing. Weekly averages use valid days only.',34,673,1210,26,'none',17);
s.speakerNotes.text='Dashboard retrieval flow: the frontend requests a selected date range. Python validates access and reads daily_values from the database. It aligns stored data, builds daily or weekly summaries, and serializes JSON. The frontend maps the returned output to sleep, heart rate and steps displays. Resting heart rate remains null when unavailable. Intraday heart rate charts require a separate sample retrieval endpoint. This slide extends the original processing and storage flow.';
for(let i=0;i<p.slides.items.length;i++){const b=await p.export({slide:p.slides.items[i],format:'png',scale:1});await fs.writeFile(path.join(base,`.ppt_build/final${i+1}.png`),new Uint8Array(await b.arrayBuffer()));}
const candidate=path.join(base,'.ppt_build/candidate.pptx');await(await PresentationFile.exportPptx(p)).save(candidate);
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')).href);
console.log(await finalizePresentation({workspaceDir:base,candidatePath:candidate,finalPath:path.join(base,'output/sleep_project_2c_processing_updated.pptx'),pythonExecutable:'C:/Users/rehan/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','12192000,6858000'],explicitTotalSlideCount:4,verifyArtifactToolImport:true,receiptPath:path.join(base,'.ppt_build/validation.json')}));
