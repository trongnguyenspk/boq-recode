/**
 * Chụp ảnh UI cho tài liệu hướng dẫn (docs/img/).
 * Chạy: npm run build && node e2e/capture-docs.cjs
 */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require('playwright');
const XLSX = require('xlsx');
const ROOT = path.join(process.cwd(), 'dist');
const OUT = path.join(process.cwd(), 'docs', 'img');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2','.png':'image/png' };
const server = http.createServer((req,res)=>{ let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html'; let fp=path.join(ROOT,p); if(!fs.existsSync(fp)||fs.statSync(fp).isDirectory())fp=path.join(ROOT,'index.html'); res.setHeader('Content-Type',MIME[path.extname(fp)]||'application/octet-stream'); fs.createReadStream(fp).pipe(res); });

const log = [];
async function shot(page, name){ await page.screenshot({ path: path.join(OUT, name), fullPage: true }); log.push('  ✓ '+name); }
async function click(page, opts){ try { await page.getByRole('button', opts).first().click({ timeout: 4000 }); return true; } catch { return false; } }

(async () => {
  await new Promise(r=>server.listen(0,r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const url = `http://localhost:${port}/`;
  await page.goto(url, { waitUntil:'networkidle', timeout:30000 });
  await page.evaluate(()=>{ try{localStorage.clear();}catch{} });
  await page.reload({ waitUntil:'networkidle' });
  await page.waitForTimeout(700);

  // 01 — màn hình chính (Input Wizard, Detail rỗng)
  await shot(page, '01-man-hinh-chinh.png');

  // 02 — thêm starter -> Detail có vật tư
  await click(page, { name: /ADD TO BOQ/i });
  await page.waitForTimeout(500);
  await click(page, { name: /ADD TO BOQ/i }); // thêm cái thứ 2 cho phong phú
  await page.waitForTimeout(500);
  await shot(page, '02-detail-view.png');

  // 03 — Summary
  if (await click(page, { name: /Xem Tổng hợp/i })) { await page.waitForTimeout(500); await shot(page, '03-summary-view.png'); await click(page, { name: /Xem Chi tiết/i }); await page.waitForTimeout(300); }

  // 04 — Export Options modal
  if (await click(page, { name: /Export BOQ/i })) {
    await page.waitForTimeout(500);
    if (await page.getByText('Export Options').count()) await shot(page, '04-export-options.png');
    await click(page, { name: /^Cancel$/i }); await page.waitForTimeout(300);
  }

  // 05 — Nhập Input: modal quyết định giá trị lạ (ChoiceDialog)
  {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([{ Type:'DOL', Brand:'ZZBRAND_LẠ', Power:'5.5', Quantity:1, LoadName:'Bơm 1' }]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const xp = path.join(os.tmpdir(), 'doc-import.xlsx'); XLSX.writeFile(wb, xp);
    page.once('filechooser', fc => fc.setFiles(xp).catch(()=>{}));
    await click(page, { name: /Nhập Input/i });
    try { await page.getByText('Giá trị lạ trong file').waitFor({ timeout: 6000 }); await shot(page, '05-nhap-input-gia-tri-la.png'); } catch {}
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  }

  // 06 — xoá starter: ConfirmDialog
  {
    const trash = page.locator('button[title="Xóa bộ khởi động này"]');
    if (await trash.count()) {
      await trash.first().click(); await page.waitForTimeout(400);
      if (await page.getByText('Xoá bộ khởi động').count()) await shot(page, '06-xac-nhan-xoa-starter.png');
      await click(page, { name: /^Huỷ$/ }); await page.waitForTimeout(300);
    }
  }

  // 07 — Back-up/Restore
  if (await click(page, { name: /Back-up\/Restore/i })) {
    await page.waitForTimeout(500);
    if (await page.getByText('Back-up / Restore').count()) await shot(page, '07-backup-restore.png');
    await click(page, { name: /^(Close|Đóng)$/i }); await page.waitForTimeout(300);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  }

  // === ADMIN ===
  if (await click(page, { name: /^Admin$/i })) {
    await page.waitForTimeout(600);
    // 08 — Product Library
    if (await page.getByText('Admin Panel').count()) await shot(page, '08-admin-product-library.png');
    // 09 — Add Product form
    if (await click(page, { name: /Add Product/i })) { await page.waitForTimeout(400); await shot(page, '09-admin-add-product.png'); await click(page, { name: /^Cancel$/i }); await page.waitForTimeout(300); }
    // 10 — Starter Templates tab
    if (await click(page, { name: /Starter Templates/i })) {
      await page.waitForTimeout(500); await shot(page, '10-admin-starter-templates.png');
      // 11 — Add Component form (mở tier đầu tiên)
      if (await click(page, { name: /Add Component/i })) { await page.waitForTimeout(400); await shot(page, '11-admin-add-component.png'); await click(page, { name: /^Cancel$/i }); await page.waitForTimeout(300); }
    }
    // 12 — Match Key Manager tab
    if (await click(page, { name: /Match Key Manager/i })) {
      await page.waitForTimeout(500);
      // chọn 1 match key trong sidebar
      const keyBtn = page.locator('button').filter({ hasText: /_/ });
      try { await keyBtn.first().click({ timeout: 2000 }); } catch {}
      await page.waitForTimeout(400);
      await shot(page, '12-admin-match-key.png');
      // 13 — Brand Manager
      if (await click(page, { name: /^Brands$/i })) { await page.waitForTimeout(400); if (await page.getByText('Manage Brands').count()) await shot(page, '13-admin-brands.png'); await click(page, { name: /^Close$/i }); await page.waitForTimeout(300); }
    }
    await click(page, { name: /^(Close|Đóng)$/i }); await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
  }

  await browser.close(); server.close();
  console.log('\n=== CAPTURE ===\n'+log.join('\n')+'\n\nSaved to docs/img/');
})().catch(e=>{ console.error('CAPTURE CRASH:', e.message); process.exit(1); });
