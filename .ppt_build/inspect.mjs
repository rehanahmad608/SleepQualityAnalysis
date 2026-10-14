import fs from 'node:fs/promises';
import {PresentationFile,FileBlob} from 'file:///C:/Users/rehan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const p=await PresentationFile.importPptx(await FileBlob.load('E:/Fontys/S1/Ch1/sleep_project_2c_processing.pptx'));
console.log((await p.inspect({kind:'slide,shape,textbox',maxChars:4000})).ndjson);
for(let i=0;i<p.slides.items.length;i++){await fs.writeFile(`.ppt_build/source${i+1}.png`,new Uint8Array(await (await p.export({slide:p.slides.items[i],format:'png',scale:1})).arrayBuffer()));}

