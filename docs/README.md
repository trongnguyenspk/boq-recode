# BOQ Generator — Tài liệu

Cập nhật: 2026-09-13 (sau đợt recode). Ứng dụng bóc khối lượng vật tư tủ điện — **SPA client-only** (không máy chủ, dữ liệu trong `localStorage`).

## Tài liệu hiện có

| Tài liệu | Dành cho | Nội dung |
|---|---|---|
| [**HUONG-DAN-SU-DUNG.md**](./HUONG-DAN-SU-DUNG.md) | **Người dùng cuối** | Hướng dẫn thao tác đầy đủ: dự án, nhập phụ tải, sinh BOQ, export/import, backup/restore, Admin (product/template/match key/brand), có ảnh UI. **Đọc file này trước.** |
| [03-dev-environment.md](./03-dev-environment.md) | Dev | Cài đặt môi trường, `npm run dev/build/preview`, troubleshooting. |

## Ngăn xếp công nghệ (thực tế)

React 19 · TypeScript 5.9 · Vite 7 · Tailwind CSS 4 · **zustand 5** (state + persist) · **SheetJS `xlsx` 0.18.5** (đọc/ghi Excel) · lucide-react · vitest 4. Không backend, không Redux, không ExcelJS.

## Mô hình dữ liệu (tóm tắt)

Ba tầng: **Match Key** (khóa generic, không nhãn hiệu) → **Product** (sản phẩm thật theo Match Key + Brand, trong `boq_library`) → **BOMItem** (dòng BOQ sinh ra). **Starter template** = công thức vật tư `{ StarterType → { tier → dòng } }`; công suất là **text hiển thị** (`powerLabel`) tách khỏi khóa chọn tier (`tierKey`).

`localStorage`: `boq_library`, `boq_templates`, `boq_brands`, `boq_matchkey_meta`, `boq_projects`, `boq_theme`.

## Ghi chú về tài liệu cũ

Bộ tài liệu dev trước đây (Logic Engine, Common Logic, Codebase Structure, Data Layer, State Management, Storage/Backup, Feature Guides, Testing/Advanced, QUICK-REFERENCE, Project Overview, và README "~1,000 trang") đã bị **gỡ bỏ** trong đợt dọn dẹp 2026-09-13: chúng mô tả **kiến trúc TRƯỚC recode** — **Common Logic / Logic Engine đã bị xóa hẳn**, công suất từng là số để tính toán, dùng ExcelJS, có native dialog — nên không còn đúng với app hiện tại và gây hiểu sai. Ngoài ra README cũ ghi số trang mục tiêu (ảo), không phản ánh thực tế.

**Nguồn chính xác nhất về hành vi hiện tại là mã nguồn trong `src/`** và tài liệu người dùng ở trên.

*(Xem lại nội dung dev cũ nếu cần: `git log`/`git show` các commit trước 2026-09-13.)*
