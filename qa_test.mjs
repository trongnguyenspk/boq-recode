import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  console.log("Khởi động Chromium...");
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    console.log("Mở trang web BOQ Generator...");
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });

    console.log("Đợi các thành phần UI hiển thị...");
    await page.waitForSelector('form');

    // Chụp màn hình ban đầu
    const initialScreenshotPath = path.join(__dirname, 'qa_initial.png');
    await page.screenshot({ path: initialScreenshotPath });
    console.log(`Đã chụp ảnh màn hình ban đầu tại: ${initialScreenshotPath}`);

    // Điền dữ liệu vào form
    console.log("Chọn Starter Type: Star-Delta...");
    const selectType = await page.$('form select');
    await selectType.select('Star-Delta');

    // Chờ cho các mức power tương ứng cập nhật
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log("Chọn công suất Power...");
    const selects = await page.$$('form select');
    const selectPower = selects[1];
    
    const options = await page.evaluate(el => Array.from(el.options).map(o => o.value), selectPower);
    console.log("Các mức công suất Star-Delta có sẵn:", options);
    
    // Chọn 15 hoặc giá trị có sẵn gần nhất
    const targetPower = options.includes('15') ? '15' : options[0];
    await selectPower.select(targetPower);

    console.log("Điền Load Name...");
    const inputLoadName = await page.$('form input[placeholder*="Pump 1"]');
    await inputLoadName.type('Star-Delta Test Fan');

    console.log("Chọn số lượng (Quantity)...");
    const inputQuantity = await page.$('form input[type="number"]');
    await inputQuantity.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await inputQuantity.type('3');

    console.log("Chụp màn hình trước khi nhấn nút Add...");
    const filledFormScreenshotPath = path.join(__dirname, 'qa_filled_form.png');
    await page.screenshot({ path: filledFormScreenshotPath });

    console.log("Nhấn nút ADD TO BOQ...");
    const submitButton = await page.$('form button[type="submit"]');
    await submitButton.click();

    console.log("Chờ 2 giây để động cơ logic tính toán BOM...");
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log("Kiểm tra kết quả tính toán BOM...");
    const bomItemsExist = await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('h3, h2, th, td'));
      return headings.some(el => el.textContent.includes('Star-Delta') || el.textContent.includes('Mã iBom'));
    });
    console.log("Trạng thái hiển thị BOM tính toán:", bomItemsExist ? "Thành công (Tìm thấy dữ liệu Star-Delta trong BOM)" : "Chưa thấy cập nhật");

    // Cuộn trang xuống dưới để hiển thị phần bảng BOM chi tiết
    console.log("Cuộn trang xuống dưới...");
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Chụp màn hình kết quả cuối cùng
    const finalScreenshotPath = path.join(__dirname, 'qa_final_result.png');
    await page.screenshot({ path: finalScreenshotPath });
    console.log(`Đã chụp ảnh màn hình kết quả tại: ${finalScreenshotPath}`);

  } catch (error) {
    console.error("Lỗi trong quá trình kiểm thử:", error);
  } finally {
    console.log("Đóng trình duyệt.");
    await browser.close();
  }
}

run();
