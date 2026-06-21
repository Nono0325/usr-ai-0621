# 🌊 AquaShield AI 智慧水產養殖數據中心

[![Python Version](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/)
[![Django Version](https://img.shields.io/badge/django-5.0%2B-green.svg)](https://www.djangoproject.com/)
[![License](https://img.shields.io/badge/license-MIT-orange.svg)](#)

**AquaShield AI** 是一款基於 Django 框架開發的智慧水產養殖數據中心與遠端監控平台。本平台整合了 **IoT 遙測接收**、**Three.js 3D 魚池模擬**、**WebAR 實境抬頭顯示器 (HUD)**、與 **OpenAI 智慧助理（支援 Tool Calling 資料庫操作）** 等重點技術，為現代養殖場提供極致美觀、反應迅速的即時監控方案。

---

## 🌟 核心特色

- **💎 磨砂玻璃擬態 UI (Frosted Glassmorphism)**：高質感的深色調看板設計，配備微動畫與霓虹提示燈。
- **🎮 Three.js 3D 模擬魚池**：即時繪製魚群悠游、水車旋轉動畫及溶氧氣泡系統，將抽象數值具象化。
- **🤖 OpenAI Tool Calling AI 助理**：右下角常駐 AI 對話框。可直接透過自然語言查詢水質狀態、新增魚池/感測器、甚至直接遠端開關實體水車。
- **📶 IoT 實體感測器上報**：提供完善的 REST API。內建 ESP32 (Arduino) 與 Python 串接範例，方便硬體工程師直接接入真實感測器。
- **🚨 智慧溶氧自動控制迴路**：自動監測水中溶氧量，低於臨界值時自動啟動水車，回升後自動關閉以達到節能效果。
- **👓 AR 實境投影 HUD 模擬器**：支援手機或視訊鏡頭開啟，在真實畫面上重疊水質指標，模擬現場巡檢視角。
- **📈 歷史趨勢與水質健檢**：支援多樣的 Chart.js 霓虹圖表及詳細數據清單，並由 AI 即時評估水質健康等級。

---

## 📁 專案檔案結構

```text
├── smart_aquaculture/     # Django 專案主設定資料夾
├── ponds/                 # 魚池管理應用程式 (Models, Views, AI Assistant, APIs)
├── templates/             # HTML 樣板 (dashboard.html, base.html)
├── static/                # 靜態資源 (CSS, JavaScript, Images)
│   ├── css/styles.css     # 玻璃擬態與動態特效 CSS 檔案
│   └── js/dashboard.js    # Three.js 3D 渲染、Chart.js、AI 聊天與即時刷新 JS 邏輯
├── manage.py              # Django 管理執行入口
├── requirements.txt       # Python 依賴套件清單
├── INSTALL.md             # 安裝與部署手冊
└── USER_GUIDE.md          # 使用者操作手冊
```

---

## 📖 快速開始與指引

請參考以下兩份專屬指南，以便快速安裝與操作：

### 🛠️ 1. [安裝與部署手冊 (INSTALL.md)](./INSTALL.md)
包含如何複製專案、設定虛擬環境、安裝套件、設定 OpenAI Key、初始化資料庫，以及啟動本地伺服器的完整說明。

### 🧭 2. [使用者操作手冊 (USER_GUIDE.md)](./USER_GUIDE.md)
詳細解說前台儀表板、3D 監控介面、AR 模式、水車自動化開關、以及與 AI 助理對話控制系統的具體指令與用法。

---

## 📄 授權條款
本專案採用 MIT 授權條款，詳情請參閱專案檔案。
