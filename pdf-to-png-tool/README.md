# PDF 轉 PNG 工具

這是一個給 macOS 使用的小工具，可以把 PDF 每一頁轉成 PNG 圖檔。

## 功能

- 圖形介面：選 PDF、選輸出資料夾、按開始轉檔
- 命令列模式：適合批次處理
- 可調整 DPI
- 可指定頁碼範圍
- 支援多頁 PDF

## 安裝需求

macOS 通常已內建 Python 3 和 Tkinter。另需安裝 Poppler，提供 `pdftoppm` 轉檔工具。

如果你的 iMac 有 Homebrew：

```bash
brew install poppler
```

## 圖形介面使用

下載 repository 後，雙擊：

```text
PDF轉PNG.command
```

如果 macOS 阻擋執行，可以在 Terminal 進入此資料夾後執行：

```bash
chmod +x PDF轉PNG.command
./PDF轉PNG.command
```

## 命令列使用

```bash
python3 pdf_to_png_app.py "input.pdf" "output-folder" --dpi 200
```

只轉第 3 頁到第 8 頁：

```bash
python3 pdf_to_png_app.py "input.pdf" "output-folder" --first-page 3 --last-page 8
```

允許覆蓋同名輸出：

```bash
python3 pdf_to_png_app.py "input.pdf" "output-folder" --overwrite
```

## 輸出格式

輸出檔名會依照 PDF 名稱產生，例如：

```text
my-slides-01.png
my-slides-02.png
my-slides-03.png
```
