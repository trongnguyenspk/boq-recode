# 03. Hướng Dẫn Setup Môi Trường Phát Triển

**Phiên bản:** 1.0  
**Cập nhật:** 07/12/2025  
**Độ khó:** Beginner

---

## Mục Lục

1. [Yêu Cầu Hệ Thống](#1-yêu-cầu-hệ-thống)
2. [Cài Đặt Prerequisites](#2-cài-đặt-prerequisites)
3. [Clone & Setup Project](#3-clone--setup-project)
4. [Chạy Development Server](#4-chạy-development-server)
5. [Build Production](#5-build-production)
6. [VS Code Setup](#6-vs-code-setup)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Yêu Cầu Hệ Thống

### 1.1 Phần Cứng Tối Thiểu

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | Dual-core | Quad-core+ |
| RAM | 4GB | 8GB+ |
| Disk | 2GB free | 10GB+ SSD |
| OS | Windows 10 | Windows 10/11 |

### 1.2 Phần Mềm Cần Thiết

✅ **Bắt buộc:**
- Node.js (v18.0.0 trở lên)
- npm (đi kèm Node.js)
- Git (cho version control)
- Code Editor (khuyến nghị VS Code)

⚪ **Tùy chọn:**
- GitHub Desktop (GUI for Git)
- Postman (test APIs - future)

---

## 2. Cài Đặt Prerequisites

### 2.1 Node.js & npm

**Bước 1:** Tải Node.js

```
1. Vào https://nodejs.org/
2. Download "LTS" version (hiện tại: v20.x.x)
3. Chạy installer
4. ✅ Tick "Automatically install necessary tools"
5. Hoàn tất cài đặt
```

**Bước 2:** Verify installation

```bash
# Check Node.js version
node --version
# Output: v20.11.0 (hoặc tương tự)

# Check npm version
npm --version
# Output: 10.2.4 (hoặc tương tự)
```

**Fix nếu lỗi "command not found":**
1. Restart terminal/PowerShell
2. Nếu vẫn lỗi: Add Node.js vào PATH manually
   - Search "Environment Variables"
   - Edit PATH → Add `C:\Program Files\nodejs\`

### 2.2 Git

**Cài đặt:**

```
1. Vào https://git-scm.com/download/win
2. Download Git for Windows
3. Chạy installer (giữ default options)
4. Hoàn tất
```

**Verify:**
```bash
git --version
# Output: git version 2.43.0.windows.1
```

**Cấu hình lần đầu:**
```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### 2.3 VS Code (Khuyến nghị)

**Cài đặt:**
```
1. Vào https://code.visualstudio.com/
2. Download for Windows
3. Install với options:
   ✅ Add "Open with Code" to context menu
   ✅ Add to PATH
4. Khởi động VS Code
```

---

## 3. Clone & Setup Project

### 3.1 Clone Repository

**Option 1: HTTPS (Dễ hơn)**
```bash
# Navigate to workspace
cd "C:\Users\Admin\Desktop\Ghi chu du an\BOQ-Qwen"

# Clone (nếu có GitHub repo)
git clone https://github.com/nguyentrongtht-prog/boq-generator.git
cd boq-generator
```

**Option 2: Local folder (Hiện tại)**
```bash
# Folder đã có sẵn
cd "C:\Users\Admin\Desktop\Ghi chu du an\BOQ-Qwen\boq-app"
```

### 3.2 Cài Đặt Dependencies

```bash
# Install tất cả packages từ package.json
npm install

# Quá trình sẽ:
# 1. Đọc package.json
# 2. Download dependencies (~150MB)
# 3. Tạo node_modules/ folder
# 4. Tạo package-lock.json
# ⏱️ Thời gian: 2-5 phút (tùy network)
```

**Output mong đợi:**
```
added 245 packages in 3m
```

**Nếu gặp lỗi:**
```bash
# Clear cache và thử lại
npm cache clean --force
npm install
```

### 3.3 Verify Setup

**Check structure:**
```bash
# List folders
ls

# Sẽ thấy:
# 📁 node_modules  ← Dependencies
# 📁 src           ← Source code
# 📁 public        ← Static files
# 📄 package.json
# 📄 vite.config.ts
```

---

## 4. Chạy Development Server

### 4.1 Khởi Động

```bash
npm run dev
```

**Output:**
```
VITE v5.4.2  ready in 342 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.1.100:5173/
  ➜  press h + enter to show help
```

### 4.2 Truy Cập App

1. Mở browser (Chrome/Edge)
2. Vào `http://localhost:5173`
3. Sẽ thấy BOQ Generator interface

**🎉 DONE! App đã chạy!**

### 4.3 Hot Module Replacement (HMR)

**Test HMR:**
1. Giữ browser mở
2. Edit file: `src/App.tsx`
3. Thay đổi text "BOQ Generator" → "My BOQ App"
4. **Save file**
5. Browser tự động reload! (không cần F5)

**Lợi ích:**
- ✅ Thấy thay đổi INSTANT
- ✅ Giữ state (không mất data đang nhập)
- ✅ Tăng productivity x10

### 4.4 Dừng Server

```bash
# Trong terminal đang chạy npm run dev:
Ctrl + C

# Hoặc đóng terminal window
```

---

## 5. Build Production

### 5.1 Build Command

```bash
npm run build
```

**Process:**
```
1. TypeScript type checking...     ✅
2. Vite bundling...                 ✅
3. Minifying JavaScript...          ✅
4. Generating CSS...                ✅
5. Optimizing assets...             ✅

Output:
✓ built in 12.34s
dist/index.html                   0.45 kB
dist/assets/index-abc123.css      23.45 kB
dist/assets/index-xyz789.js      456.78 kB
```

### 5.2 Preview Production Build

```bash
npm run preview
```

App sẽ chạy tại `http://localhost:4173`

**Khác biệt vs `npm run dev`:**
| Feature | dev | preview |
|---------|-----|---------|
| Source | Source files | Bundled files |
| Speed | Instant | Normal load |
| Size | Not optimized | Minified |
| Env | Development | Production-like |

### 5.3 Deploy

**Option 1: Static Hosting (Vercel - Dễ nhất)**
```bash
1. Tạo account tại vercel.com
2. Install Vercel CLI: npm i -g vercel
3. Deploy: vercel
4. Follow prompts
5. ✅ Live tại https://your-app.vercel.app
```

**Option 2: GitHub Pages**
```bash
1. Push code lên GitHub
2. Settings → Pages → Source: GitHub Actions
3. Tạo workflow file (details in docs/29-deployment.md)
4. ✅ Live tại https://username.github.io/boq-generator
```

---

## 6. VS Code Setup

### 6.1 Extensions Khuyến Nghị

**Cài đặt:**
1. Mở VS Code
2. Sidebar → Extensions (Ctrl+Shift+X)
3. Search & Install các extensions sau:

#### Essential (Bắt buộc)
- **ES7+ React/Redux/React-Native snippets** - Code snippets
- **Tailwind CSS IntelliSense** - Tailwind autocomplete
- **TypeScript Vue Plugin (Volar)** - Better TS support

#### Recommended
- **Prettier** - Code formatter
- **ESLint** - Linting
- **Path Intellisense** - Auto-complete file paths
- **Git Graph** - Visualize Git history

### 6.2 Settings

**File → Preferences → Settings** (hoặc Ctrl+,)

**Format on Save:**
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode"
}
```

**Tailwind IntelliSense:**
```json
{
  "tailwindCSS.experimental.classRegex": [
    ["cn\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"]
  ]
}
```

### 6.3 Keyboard Shortcuts Hữu Ích

| Shortcut | Action |
|----------|--------|
| `Ctrl + P` | Quick file open |
| `Ctrl + Shift + P` | Command palette |
| `Ctrl + B` | Toggle sidebar |
| `Ctrl + `` ` | Toggle terminal |
| `Alt + Shift + F` | Format document |
| `F2` | Rename symbol |
| `Ctrl + Click` | Go to definition |

---

## 7. Troubleshooting

### 7.1 Common Issues

#### ❌ "EACCES: permission denied"

```bash
# Windows: Run PowerShell as Administrator
# Hoặc fix npm permissions:
npm config set prefix ~/.npm-global
```

#### ❌ "Port 5173 already in use"

```bash
# Option 1: Kill process
netstat -ano | findstr :5173
taskkill /PID <PID> /F

# Option 2: Change port
# Edit vite.config.ts:
server: { port: 3000 }
```

#### ❌ "Module not found"

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

#### ❌ TypeScript errors

```bash
# Clear TypeScript cache
# Delete .tsbuildinfo files
rm **/*.tsbuildinfo

# Restart TS server in VS Code:
Ctrl+Shift+P → "TypeScript: Restart TS Server"
```

### 7.2 Performance Issues

**Slow npm install:**
```bash
# Use faster mirror (Vietnam)
npm config set registry https://registry.npmmirror.com
```

**Slow dev server:**
```bash
# Disable source maps in dev
# vite.config.ts:
build: {
  sourcemap: false
}
```

### 7.3 Git Issues

**"fatal: not a git repository":**
```bash
# Initialize Git
git init
```

**Merge conflicts:**
```bash
# See conflicts
git status

# Edit files, then:
git add .
git commit -m "Resolve conflicts"
```

---

## 📚 Next Steps

✅ **Environment ready!** Giờ có thể:
1. [Đọc Codebase Structure](./04-codebase-structure.md)
2. [Học Logic Engine](./06-logic-engine.md)
3. [Tạo Feature Mới](./16-new-features.md)

**Happy Coding! 🚀**

---

**Hết Document 03**
