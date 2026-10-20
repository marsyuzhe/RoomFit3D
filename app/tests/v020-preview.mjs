import {chromium} from '@playwright/test';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1520,height:980}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{await page.goto('http://127.0.0.1:5204/studio');await page.locator('[data-roomfit-home]').waitFor();await page.screenshot({path:'../evidence/v020-home.png'});await page.getByRole('button',{name:'直接进入编辑器',exact:true}).click();await page.locator('[data-roomfit-canvas]').waitFor();await page.waitForTimeout(1500);await page.screenshot({path:'../evidence/v020-studio.png'});writeFileSync('../evidence/v020-preview.json',JSON.stringify({errors,cards:await page.locator('.add-card').count(),title:await page.title()},null,2));console.log(errors);}finally{await browser.close();}

