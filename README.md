# BOQ Generator

**Automated Bill of Quantities System** - Công cụ tự động tạo bảng khối lượng công việc cho hệ thống điện.

## 📋 Tính năng chính

- ✅ **BOQ Builder**: Tạo BOQ tự động từ templates (DOL, Star-Delta, Star-Delta w/ Timer...)
- ✅ **Common Logic**: Quản lý logic phụ thuộc giữa các nhóm thiết bị
- ✅ **Auto Selection**: Tự động chọn vật tư co nhiệt, thanh cái, MCT/PCT theo rating
- ✅ **Export Excel**: Xuất bảng chi tiết và tổng hợp ra Excel
- ✅ **Backup/Restore**: Sao lưu và phục hồi database
- ✅ **Admin Panel**: Quản lý thư viện sản phẩm, templates, brands

## 🚀 Cài đặt

```bash
# Clone repository
git clone <your-repo-url>
cd boq-app

# Cài dependencies
npm install

# Chạy development server
npm run dev

# Build cho production
npm run build
```

## 📦 Công nghệ sử dụng

- **React 18** + **TypeScript**
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Lucide React** - Icons
- **ExcelJS** - Excel export

## 📁 Cấu trúc thư mục

```
boq-app/
├── src/
│   ├── components/        # React components
│   ├── data/             # Static data & configs
│   ├── utils/            # Helper functions
│   ├── types/            # TypeScript types
│   └── hooks/            # Custom React hooks
├── public/               # Static assets
└── package.json
```

## 🗄️ Data Storage

App sử dụng `localStorage` để lưu:
- Common Logic Groups
- Logic Configuration
- Product Library
- Templates & Brands

**Backup**: Dùng tính năng "Back-up/Restore" để export/import data

## 🔧 Development

```bash
# Start dev server
npm run dev

# Type check
npm run type-check

# Build
npm run build
```

## 📝 License

Private project

## 👤 Author

Your Name
"# boq-generator" 
