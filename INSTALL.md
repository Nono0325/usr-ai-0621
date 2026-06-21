# AquaShield 智慧水產養殖數據中心 - 安裝與部署手冊

本手冊將指引您完成 **AquaShield 智慧水產養殖數據中心** 的本地安裝與環境部署。

---

## 📋 系統環境需求

在開始安裝之前，請確保您的系統已安裝以下工具：

- **Python**: 建議版本為 `3.10` 或以上
- **Git**: 用於版本控制與代碼下載
- **瀏覽器**: 現代瀏覽器（Chrome, Edge, Firefox, Safari 等，須支援 HTML5 與 WebGL 供 3D 渲染使用）

---

## 🛠️ 安裝步驟

### 步驟 1：複製（Clone）專案倉庫
開啟您的終端機（Terminal / PowerShell），並執行以下指令下載專案代碼：

```bash
git clone https://github.com/Nono0325/usr-ai-0621.git
cd usr-ai-0621
```

---

### 步驟 2：建立並啟用虛擬環境（建議）
為了避免 Python 套件版本的衝突，強烈建議為此專案建立獨立的虛擬環境：

- **Windows 系統 (PowerShell):**
  ```powershell
  python -m venv venv
  .\venv\Scripts\Activate.ps1
  ```
  
- **macOS / Linux 系統:**
  ```bash
  python3 -m venv venv
  source venv/bin/activate
  ```

---

### 步驟 3：安裝依賴套件
在啟用虛擬環境的狀態下，安裝專案所需的 Python 函式庫：

```bash
pip install -r requirements.txt
```

---

### 步驟 4：設定 OpenAI API 金鑰
本系統包含一個支援 Tool Calling 的 AI 聊天助理。您需要設定 API Key 才能正常運作：

- **方法 A（推薦）：建立文字檔**
  在專案的根目錄（與 `manage.py` 同層）下建立名為 `gpt-5-mini-api.txt` 的檔案，並將您的 OpenAI API Key（例如 `sk-proj-...`）貼入檔案並儲存。該檔案已被加入 `.gitignore`，不會上傳至 GitHub。
  
- **方法 B：設定系統環境變數**
  您也可以在作業系統中設定環境變數 `OPENAI_API_KEY`。

---

### 步驟 5：初始化資料庫與模擬數據

1. **執行資料庫遷移（Migrations）**：
   建立並套用預設的 SQLite 資料庫結構：
   ```bash
   python manage.py migrate
   ```

2. **產生歷史模擬遙測數據（Mock Data）**：
   專案內建一個資料生成器，會自動建立 3 個預設魚池及相關的感測器歷史數據：
   ```bash
   python manage.py generate_mock_data
   ```

---

### 步驟 6：啟動本地伺服器
最後，執行 Django 的內建網頁伺服器：

```bash
python manage.py runserver
```

啟動成功後，終端機會顯示伺服器網址。請在瀏覽器中造訪：
👉 **[http://127.0.0.1:8000/](http://127.0.0.1:8000/)**

---

## 🧪 運行自動測試
您可以執行 Django 的測試指令，來驗證您的安裝與 API 狀態是否完全正常：

```bash
python manage.py test
```
若輸出 `OK`，代表所有系統 API 與模組皆運作良好！
