import {cpSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const out=resolve('static/vendor/ocr');mkdirSync(out,{recursive:true});
for(const name of readdirSync('node_modules/tesseract.js-core'))if(/\.(wasm|js)$/.test(name))cpSync(resolve('node_modules/tesseract.js-core',name),resolve(out,name));
cpSync('node_modules/tesseract.js/dist/worker.min.js',resolve(out,'worker.min.js'));
for(const [src,name] of [['node_modules/tesseract.js/LICENSE.md','TESSERACT-JS-LICENSE'],['node_modules/tesseract.js-core/LICENSE','CORE-LICENSE'],['../assets/ocr/LICENSE','DATA-LICENSE'],['../assets/ocr/eng.traineddata','eng.traineddata']]){if(!existsSync(src))throw new Error(`Missing offline OCR resource ${src}`);cpSync(src,resolve(out,name));}
