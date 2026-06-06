#!/usr/bin/env python3
"""
PDF to PNG converter with a small Tkinter interface and CLI mode.

GUI:
    python3 tools/pdf_to_png_app.py

CLI:
    python3 tools/pdf_to_png_app.py input.pdf output_dir --dpi 200
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import threading
from pathlib import Path
from tkinter import BooleanVar, IntVar, StringVar, Tk, filedialog, messagebox, ttk


APP_TITLE = "PDF 轉 PNG"
DEFAULT_DPI = 200
KNOWN_RUNTIME_BIN = (
    Path.home()
    / ".cache/codex-runtimes/codex-primary-runtime/dependencies/bin"
)


def find_binary(name: str) -> str | None:
    env_name = name.upper().replace("-", "_")
    if os.environ.get(env_name):
        return os.environ[env_name]

    found = shutil.which(name)
    if found:
        return found

    candidate = KNOWN_RUNTIME_BIN / name
    if candidate.exists():
        return str(candidate)

    return None


def require_pdftoppm() -> str:
    pdftoppm = find_binary("pdftoppm")
    if not pdftoppm:
        raise RuntimeError(
            "找不到 pdftoppm。請安裝 Poppler，或把 pdftoppm 路徑設到 PDFTOPPM 環境變數。"
        )
    return pdftoppm


def get_page_count(pdf_path: Path) -> int | None:
    pdfinfo = find_binary("pdfinfo")
    if not pdfinfo:
        return None

    try:
        result = subprocess.run(
            [pdfinfo, str(pdf_path)],
            check=True,
            text=True,
            capture_output=True,
        )
    except subprocess.CalledProcessError:
        return None

    match = re.search(r"^Pages:\s+(\d+)$", result.stdout, re.MULTILINE)
    return int(match.group(1)) if match else None


def convert_pdf_to_png(
    pdf_path: Path,
    output_dir: Path,
    dpi: int = DEFAULT_DPI,
    first_page: int | None = None,
    last_page: int | None = None,
    overwrite: bool = False,
    progress: callable | None = None,
) -> list[Path]:
    if not pdf_path.exists():
        raise FileNotFoundError(f"找不到 PDF：{pdf_path}")
    if pdf_path.suffix.lower() != ".pdf":
        raise ValueError("請選擇 .pdf 檔案。")
    if dpi < 36 or dpi > 1200:
        raise ValueError("DPI 請設定在 36 到 1200 之間。")
    if first_page is not None and first_page < 1:
        raise ValueError("起始頁必須大於 0。")
    if last_page is not None and last_page < 1:
        raise ValueError("結束頁必須大於 0。")
    if first_page and last_page and first_page > last_page:
        raise ValueError("起始頁不可大於結束頁。")

    pdftoppm = require_pdftoppm()
    output_dir.mkdir(parents=True, exist_ok=True)

    prefix = output_dir / pdf_path.stem
    if not overwrite and list(output_dir.glob(f"{pdf_path.stem}-*.png")):
        raise FileExistsError(
            f"輸出資料夾已經有 {pdf_path.stem}-*.png。請勾選覆蓋，或改用其他資料夾。"
        )

    command = [pdftoppm, "-png", "-r", str(dpi)]
    if first_page:
        command.extend(["-f", str(first_page)])
    if last_page:
        command.extend(["-l", str(last_page)])
    command.extend([str(pdf_path), str(prefix)])

    if progress:
        progress("開始轉檔...")

    subprocess.run(command, check=True, text=True, capture_output=True)

    outputs = sorted(output_dir.glob(f"{pdf_path.stem}-*.png"))
    if progress:
        progress(f"完成：輸出 {len(outputs)} 張 PNG")

    return outputs


class PdfToPngApp:
    def __init__(self, root: Tk) -> None:
        self.root = root
        self.root.title(APP_TITLE)
        self.root.geometry("620x420")
        self.root.minsize(560, 390)

        self.pdf_path = StringVar()
        self.output_dir = StringVar()
        self.dpi = IntVar(value=DEFAULT_DPI)
        self.first_page = StringVar()
        self.last_page = StringVar()
        self.overwrite = BooleanVar(value=False)
        self.status = StringVar(value="選擇 PDF 後即可轉成逐頁 PNG。")
        self.page_count = StringVar(value="")

        self._build()

    def _build(self) -> None:
        self.root.columnconfigure(0, weight=1)
        frame = ttk.Frame(self.root, padding=18)
        frame.grid(row=0, column=0, sticky="nsew")
        frame.columnconfigure(1, weight=1)

        title = ttk.Label(frame, text=APP_TITLE, font=("TkDefaultFont", 20, "bold"))
        title.grid(row=0, column=0, columnspan=3, sticky="w", pady=(0, 18))

        ttk.Label(frame, text="PDF 檔案").grid(row=1, column=0, sticky="w", pady=6)
        ttk.Entry(frame, textvariable=self.pdf_path).grid(row=1, column=1, sticky="ew", padx=8)
        ttk.Button(frame, text="選擇", command=self.choose_pdf).grid(row=1, column=2)

        ttk.Label(frame, text="輸出資料夾").grid(row=2, column=0, sticky="w", pady=6)
        ttk.Entry(frame, textvariable=self.output_dir).grid(row=2, column=1, sticky="ew", padx=8)
        ttk.Button(frame, text="選擇", command=self.choose_output_dir).grid(row=2, column=2)

        options = ttk.Frame(frame)
        options.grid(row=3, column=0, columnspan=3, sticky="ew", pady=(16, 8))
        options.columnconfigure(5, weight=1)

        ttk.Label(options, text="DPI").grid(row=0, column=0, sticky="w")
        ttk.Spinbox(options, from_=36, to=1200, increment=50, textvariable=self.dpi, width=7).grid(
            row=0, column=1, sticky="w", padx=(8, 18)
        )

        ttk.Label(options, text="頁碼").grid(row=0, column=2, sticky="w")
        ttk.Entry(options, textvariable=self.first_page, width=7).grid(row=0, column=3, padx=(8, 4))
        ttk.Label(options, text="到").grid(row=0, column=4)
        ttk.Entry(options, textvariable=self.last_page, width=7).grid(row=0, column=5, sticky="w", padx=(4, 18))

        ttk.Checkbutton(options, text="覆蓋同名輸出", variable=self.overwrite).grid(
            row=0, column=6, sticky="e"
        )

        ttk.Label(frame, textvariable=self.page_count, foreground="#555").grid(
            row=4, column=0, columnspan=3, sticky="w", pady=(4, 12)
        )

        self.convert_button = ttk.Button(frame, text="開始轉檔", command=self.convert)
        self.convert_button.grid(row=5, column=0, columnspan=3, sticky="ew", pady=(8, 12))

        self.progress = ttk.Progressbar(frame, mode="indeterminate")
        self.progress.grid(row=6, column=0, columnspan=3, sticky="ew", pady=(0, 12))

        status_box = ttk.Label(frame, textvariable=self.status, wraplength=560, justify="left")
        status_box.grid(row=7, column=0, columnspan=3, sticky="ew")

    def choose_pdf(self) -> None:
        selected = filedialog.askopenfilename(
            title="選擇 PDF",
            filetypes=[("PDF files", "*.pdf"), ("All files", "*.*")],
        )
        if not selected:
            return

        pdf = Path(selected)
        self.pdf_path.set(str(pdf))
        if not self.output_dir.get():
            self.output_dir.set(str(pdf.with_suffix("")))

        count = get_page_count(pdf)
        self.page_count.set(f"頁數：{count}" if count else "頁數：無法讀取，但仍可嘗試轉檔")

    def choose_output_dir(self) -> None:
        selected = filedialog.askdirectory(title="選擇輸出資料夾")
        if selected:
            self.output_dir.set(selected)

    def convert(self) -> None:
        try:
            pdf = Path(self.pdf_path.get()).expanduser()
            output = Path(self.output_dir.get()).expanduser()
            dpi = int(self.dpi.get())
            first = self._optional_page(self.first_page.get())
            last = self._optional_page(self.last_page.get())
        except ValueError as exc:
            messagebox.showerror(APP_TITLE, str(exc))
            return

        self.convert_button.configure(state="disabled")
        self.progress.start(10)
        self.status.set("轉檔中...")

        thread = threading.Thread(
            target=self._convert_worker,
            args=(pdf, output, dpi, first, last),
            daemon=True,
        )
        thread.start()

    def _convert_worker(
        self,
        pdf: Path,
        output: Path,
        dpi: int,
        first: int | None,
        last: int | None,
    ) -> None:
        try:
            outputs = convert_pdf_to_png(
                pdf,
                output,
                dpi=dpi,
                first_page=first,
                last_page=last,
                overwrite=self.overwrite.get(),
                progress=self._set_status_threadsafe,
            )
        except Exception as exc:
            self.root.after(0, self._finish_with_error, str(exc))
            return

        self.root.after(0, self._finish_success, output, len(outputs))

    def _finish_success(self, output: Path, count: int) -> None:
        self.progress.stop()
        self.convert_button.configure(state="normal")
        self.status.set(f"完成：已輸出 {count} 張 PNG 到 {output}")
        messagebox.showinfo(APP_TITLE, f"完成，已輸出 {count} 張 PNG。")

    def _finish_with_error(self, message: str) -> None:
        self.progress.stop()
        self.convert_button.configure(state="normal")
        self.status.set(f"失敗：{message}")
        messagebox.showerror(APP_TITLE, message)

    def _set_status_threadsafe(self, message: str) -> None:
        self.root.after(0, self.status.set, message)

    @staticmethod
    def _optional_page(value: str) -> int | None:
        cleaned = value.strip()
        if not cleaned:
            return None
        number = int(cleaned)
        if number < 1:
            raise ValueError("頁碼必須大於 0。")
        return number


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert PDF pages to PNG images.")
    parser.add_argument("pdf", nargs="?", type=Path, help="PDF file to convert")
    parser.add_argument("output_dir", nargs="?", type=Path, help="Directory for PNG output")
    parser.add_argument("--dpi", type=int, default=DEFAULT_DPI, help="Output resolution")
    parser.add_argument("--first-page", type=int, help="First page to convert, starting from 1")
    parser.add_argument("--last-page", type=int, help="Last page to convert, starting from 1")
    parser.add_argument("--overwrite", action="store_true", help="Allow existing same-name PNG files")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    if args.pdf:
        output_dir = args.output_dir or args.pdf.with_suffix("")
        outputs = convert_pdf_to_png(
            args.pdf,
            output_dir,
            dpi=args.dpi,
            first_page=args.first_page,
            last_page=args.last_page,
            overwrite=args.overwrite,
            progress=print,
        )
        print(f"Done: {len(outputs)} PNG files written to {output_dir}")
        return 0

    root = Tk()
    PdfToPngApp(root)
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
