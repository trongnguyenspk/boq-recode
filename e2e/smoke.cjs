/**
 * P/E2E: full smoke test — chạy bản build headless trong cloud, điều khiển thật,
 * screenshot + assert. Chạy: `npm run build && node e2e/smoke.cjs`.
 */
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(process.cwd(), 'dist');
const SHOTS = path.join(process.cwd(), 'e2e', 'screenshots');
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2','.png':'image/png' };
const server = http.createServer((req,res)=>{ let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html'; let fp=path.join(ROOT,p); if(!fs.existsSync(fp)||fs.statSync(fp).isDirectory())fp=path.join(ROOT,'index.html'); res.setHeader('Content-Type',MIME[path.extname(fp)]||'application/octet-stream'); fs.createReadStream(fp).pipe(res); });

let pass=0, fail=0; const log=[];
function check(name, cond){ if(cond){pass++; log.push('  ✓ '+name);} else {fail++; log.push('  ✗ FAIL: '+name);} }

(async () => {
  await new Promise(r=>server.listen(0,r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors=[]; page.on('console',m=>{if(m.type()==='error')errors.push(m.text());}); page.on('pageerror',e=>errors.push('PAGEERR:'+e.message));
  const url = `http://localhost:${port}/`;

  // Step 1: load fresh
  await page.goto(url,{waitUntil:'networkidle',timeout:30000});
  await page.evaluate(()=>{ try{localStorage.clear();}catch{} });
  await page.reload({waitUntil:'networkidle'});
  await page.waitForTimeout(600);
  check('app loads (Input Wizard)', await page.locator('text=Input Wizard').count()>0);
  check('no Common Logic tab (P2-del)', await page.locator('button:has-text("Common Logic")').count()===0);
  check('powerLabel field present (P1.2b)', await page.getByPlaceholder(/biến tần/i).count()>0);

  // Step 2: add a starter with defaults (DOL, first power, Schneider)
  await page.getByRole('button',{name:/ADD TO BOQ/i}).click();
  await page.waitForTimeout(500);
  const detailAfterAdd = await page.locator('text=No starters added yet').count();
  check('starter added -> Detail no longer empty', detailAfterAdd===0);
  const trash = page.locator('button[title="Xóa bộ khởi động này"]');
  check('starter row rendered (delete btn present)', await trash.count()>0);
  await page.screenshot({path:path.join(SHOTS,'01-after-add-starter.png'),fullPage:true});

  // Step 3: P4.3 — delete starter opens ConfirmDialog (not native confirm)
  await trash.first().click();
  await page.waitForTimeout(300);
  const dialog = page.getByRole('dialog');
  check('P4.3 ConfirmDialog appears on delete', await dialog.count()>0);
  check('dialog has "Xoá bộ khởi động" title', await page.locator('text=Xoá bộ khởi động').count()>0);
  await page.screenshot({path:path.join(SHOTS,'02-confirm-dialog.png'),fullPage:true});
  // Cancel -> starter stays
  await page.getByRole('button',{name:'Huỷ'}).click();
  await page.waitForTimeout(300);
  check('Cancel keeps starter (no write on cancel)', await trash.count()>0 && await dialog.count()===0);
  // Confirm -> starter removed
  await trash.first().click(); await page.waitForTimeout(200);
  await page.getByRole('button',{name:'Xoá'}).click();
  await page.waitForTimeout(400);
  check('Confirm removes starter', await page.locator('text=No starters added yet').count()>0);

  check('no console errors during smoke', errors.length===0);

  await browser.close(); server.close();
  console.log('\n=== E2E SMOKE ===\n'+log.join('\n'));
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  if(errors.length) console.log('CONSOLE ERRORS:', errors.slice(0,8).join(' | '));
  process.exit(fail?1:0);
})().catch(e=>{ console.error('SMOKE CRASH:', e.message); process.exit(2); });
