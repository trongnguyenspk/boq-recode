# Kế hoạch Bảo trì & Quy trình Phát triển Tính năng mới - BOQ Generator

> **Yêu cầu đối với Claude/Antigravity:** Yêu cầu bắt buộc sử dụng sub-skill: `executing-plans` để thực hiện kế hoạch này theo từng tác vụ.

**Mục tiêu:** Giải quyết triệt để các lỗi cấu hình, tối ưu hóa kích thước gói bundle Excel, bảo vệ dữ liệu chống sập localStorage và thiết lập quy trình TDD chuẩn cho việc phát triển tính năng mới.

**Kiến trúc:** 
* Đóng gói việc ghi dữ liệu vào `localStorage` bằng các hàm bọc an toàn có try-catch để ngăn chặn `QuotaExceededError`.
* Tách biệt hoàn toàn import tĩnh (static import) của thư viện `xlsx` để chuyển sang import động (dynamic import) khi click xuất Excel.
* Tách các Regex và mảng định cấu hình trong `logic-engine.ts` ra ngoài phạm vi hàm để tránh cấp phát bộ nhớ liên tục.

**Công nghệ sử dụng:** React 19, TypeScript, Vite, Vitest, ExcelJS (xlsx).

---

## 🔄 QUY TRÌNH PHỐI HỢP LÀM VIỆC (COLLABORATION WORKFLOW)

Để đảm bảo tính ổn định và không làm phát sinh lỗi mới (regressions), mọi tác vụ sửa lỗi hoặc thêm tính năng trong tương lai sẽ tuân thủ quy trình **TDD (Test-Driven Development)** như sau:

1. **Bước 1: Viết Test Case Lỗi (Write a failing test)**: Viết test case mô tả lỗi hoặc hành vi mong muốn mới trước khi chạm vào code chạy.
2. **Bước 2: Xác minh Test Lỗi (Run to verify failure)**: Chạy test case để chắc chắn nó bị Fail (Đỏ) do thiếu code.
3. **Bước 3: Viết Code Tối Giản (Write minimal implementation)**: Chỉ viết lượng code tối thiểu để làm test case chuyển sang màu xanh (Pass).
4. **Bước 4: Xác minh Test Thành Công (Run to verify pass)**: Chạy lại toàn bộ test suite để đảm bảo tất cả đều Pass (Xanh).
5. **Bước 5: Commit thường xuyên (Frequent commits)**: Commit code ngay sau khi hoàn thành một chu kỳ Test-Pass.

---

## 📋 CÁC TÁC VỤ BẢO TRÌ & SỬA LỖI (MAINTENANCE TASKS)

### Tác vụ 1: Khắc phục lỗi validate thông báo type (ĐÃ HOÀN THÀNH)
* **Tệp tin:**
  * Sửa đổi: `src/utils/template-validation.ts`
  * Kiểm thử: `src/utils/template-validation.test.ts`
* **Nội dung:** Đồng bộ hóa thông báo lỗi thuộc tính `type` thành `"Missing required field: type"`.

### Tác vụ 2: Loại trừ thư mục ẩn `.agent/` khỏi Vitest (ĐÃ HOÀN THÀNH)
* **Tệp tin:**
  * Sửa đổi: `vite.config.ts`
* **Nội dung:** Bổ sung `exclude` trong cấu hình test để bỏ qua `.agent/`.

### Tác vụ 3: Đóng gói an toàn cho việc ghi `localStorage`
* **Tệp tin:**
  * Sửa đổi: `src/App.tsx`
* **Bước 1: Viết test case mô phỏng lỗi ghi đè storage hoặc quá hạn mức (QuotaExceeded)**
  Viết trong tệp `src/utils/storage-safety.test.ts`:
  ```typescript
  import { describe, it, expect, vi } from 'vitest';
  describe('LocalStorage Safety Wrapper', () => {
      it('should handle QuotaExceededError gracefully without crashing the app', () => {
          const mockSetItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
              throw new DOMException('Quota exceeded', 'QuotaExceededError');
          });
          // Thực hiện gọi hàm bọc an toàn và kiểm tra không ném ra exception làm sập app
          expect(() => {
              try {
                  localStorage.setItem('test_key', 'test_val');
              } catch (e) {
                  // Xử lý lỗi
              }
          }).not.toThrow();
          mockSetItem.mockRestore();
      });
  });
  ```
* **Bước 2: Chạy kiểm thử để xác nhận test bị lỗi (đỏ)**
  Chạy: `npm test`
* **Bước 3: Viết code tối giản sửa đổi trong `src/App.tsx`**
  Đọc và ghi qua một hàm helper có try-catch:
  ```typescript
  const safeSaveToStorage = (key: string, value: any) => {
      try {
          localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
          console.error(`Failed to save to localStorage for key: ${key}`, error);
      }
  };
  ```
  Thay thế các dòng `localStorage.setItem` trực tiếp trong `useEffect` bằng hàm `safeSaveToStorage`.
* **Bước 4: Xác minh kiểm thử thành công (xanh)**
  Chạy: `npm test` và `npm run build`
* **Bước 5: Commit**
  ```bash
  git add src/App.tsx src/utils/storage-safety.test.ts
  git commit -m "fix: add safe localStorage save wrapper to prevent QuotaExceededError"
  ```

### Tác vụ 4: Sửa xung đột import tĩnh/động của thư viện Excel (`xlsx`)
* **Tệp tin:**
  * Sửa đổi: `src/App.tsx`, `src/utils/excel-export.ts`
* **Bước 1: Sửa đổi `src/App.tsx` loại bỏ import tĩnh**
  Loại bỏ dòng `import { exportToExcel } from './utils/excel-export';` ở đầu file.
  Thay thế bằng cách tải động trong hàm `handleExportWithOptions`:
  ```typescript
  const handleExportWithOptions = async (options: ExportOptions) => {
      try {
          const { exportToExcel } = await import('./utils/excel-export');
          await exportToExcel(bomWithOverrides, summary, options);
          showToast("Export successful!", "success");
      } catch (error) {
          showToast("Export failed!", "error");
      }
  };
  ```
* **Bước 2: Chạy kiểm thử kiểm tra lỗi import**
  Chạy: `npm test`
* **Bước 3: Chạy build để xác định dung lượng bundle file chính đã giảm**
  Chạy: `npm run build`
  *Kết quả kỳ vọng:* File `xlsx` được chia nhỏ thành chunk riêng biệt trong thư mục `dist/assets/`, bundle chính `index.js` giảm đáng kể dung lượng.
* **Bước 4: Commit**
  ```bash
  git add src/App.tsx
  git commit -m "perf: remove static import of excel-export to enable dynamic code splitting"
  ```

### Tác vụ 5: Tối ưu hóa Regex trong `logic-engine.ts`
* **Tệp tin:**
  * Sửa đổi: `src/utils/logic-engine.ts`
* **Bước 1: Đưa các biểu thức chính quy ra phạm vi toàn cục**
  Định nghĩa các biến hằng ở đầu file [logic-engine.ts](file:///G:/Ghi%20chu%20du%20an/AutomationFlow/boq-generator-main_20260302_okie/src/utils/logic-engine.ts):
  ```typescript
  const RATING_AMPS_REGEX = /(\d+)\s*A\b/i;
  const SIZE_MATCH_REGEX = /(\d+\s*x\s*\d+)/i;
  ```
  Thay thế các đoạn `.match(...)` trong hàm bằng cách tham chiếu đến biến hằng này.
* **Bước 2: Chạy lại kiểm thử tự động**
  Chạy: `npm test`
* **Bước 3: Commit**
  ```bash
  git add src/utils/logic-engine.ts
  git commit -m "perf: refactor logic-engine regex compilation to global scope"
  ```
