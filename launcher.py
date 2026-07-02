#!/usr/bin/env python3
"""
WebRTC 视频会议 — 一键启动器
双击运行，自动启动后端 + 前端，实时显示运行状态
"""
import subprocess
import threading
import time
import webbrowser
import os
import sys
import signal
import tkinter as tk
from tkinter import ttk, scrolledtext

# ====== 配置 ======
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT_DIR, "webrtc-backend")
FRONTEND_DIR = os.path.join(ROOT_DIR, "webrtc-frontend")

BACKEND_PORT = 3000
FRONTEND_PORT = 5173

# 确保 Node.js 在 PATH 中
NODE_PATH = r"D:\Program Files\nodejs"
if os.path.isdir(NODE_PATH):
    os.environ["PATH"] = NODE_PATH + os.pathsep + os.environ.get("PATH", "")


class LauncherApp:
    def __init__(self, root):
        self.root = root
        self.root.title("WebRTC 视频会议 — 启动器")
        self.root.geometry("640x500")
        self.root.resizable(True, True)
        self.root.configure(bg="#1a1a24")

        self.backend_proc = None
        self.frontend_proc = None
        self.running = False

        self._build_ui()
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_ui(self):
        # 标题
        title = tk.Label(
            self.root,
            text="WebRTC 视频会议",
            font=("Microsoft YaHei", 18, "bold"),
            fg="#ffffff", bg="#1a1a24"
        )
        title.pack(pady=(16, 4))

        subtitle = tk.Label(
            self.root,
            text="一键启动信令服务器 + 前端页面",
            font=("Microsoft YaHei", 10),
            fg="#888888", bg="#1a1a24"
        )
        subtitle.pack(pady=(0, 12))

        # 按钮区
        btn_frame = tk.Frame(self.root, bg="#1a1a24")
        btn_frame.pack(pady=6)

        self.btn_start = tk.Button(
            btn_frame, text="▶  启动服务", font=("Microsoft YaHei", 11, "bold"),
            bg="#4a6cf7", fg="#ffffff", activebackground="#3b5de7",
            activeforeground="#ffffff", relief="flat", padx=24, pady=8,
            cursor="hand2", command=self.start_all
        )
        self.btn_start.pack(side="left", padx=8)

        self.btn_stop = tk.Button(
            btn_frame, text="■  停止", font=("Microsoft YaHei", 11, "bold"),
            bg="#e74c3c", fg="#ffffff", activebackground="#c0392b",
            activeforeground="#ffffff", relief="flat", padx=24, pady=8,
            cursor="hand2", command=self.stop_all, state="disabled"
        )
        self.btn_stop.pack(side="left", padx=8)

        self.btn_browser = tk.Button(
            btn_frame, text="🌐 打开页面", font=("Microsoft YaHei", 11),
            bg="#2ecc71", fg="#ffffff", activebackground="#27ae60",
            activeforeground="#ffffff", relief="flat", padx=16, pady=8,
            cursor="hand2", command=self.open_browser, state="disabled"
        )
        self.btn_browser.pack(side="left", padx=8)

        # 状态指示
        status_frame = tk.Frame(self.root, bg="#1a1a24")
        status_frame.pack(pady=(12, 4))

        self._make_status(status_frame, "后端 (端口 3000):", 0)
        self._make_status(status_frame, "前端 (端口 5173):", 1)

        # 日志区
        log_label = tk.Label(
            self.root, text="运行日志:", font=("Microsoft YaHei", 10),
            fg="#aaaaaa", bg="#1a1a24", anchor="w"
        )
        log_label.pack(fill="x", padx=20, pady=(8, 2))

        self.log_area = scrolledtext.ScrolledText(
            self.root, height=12, font=("Consolas", 9),
            bg="#0d0d14", fg="#cccccc", insertbackground="#ffffff",
            relief="flat", borderwidth=0, padx=10, pady=8
        )
        self.log_area.pack(fill="both", expand=True, padx=20, pady=(0, 16))
        self.log_area.configure(state="disabled")

    def _make_status(self, parent, label, row):
        tk.Label(
            parent, text=label, font=("Microsoft YaHei", 10),
            fg="#aaaaaa", bg="#1a1a24"
        ).grid(row=row, column=0, sticky="e", padx=(0, 8), pady=3)

        dot = tk.Canvas(parent, width=12, height=12, bg="#1a1a24", highlightthickness=0)
        dot.grid(row=row, column=1, pady=3)
        dot.create_oval(2, 2, 10, 10, fill="#555555", outline="")
        setattr(self, f"dot_{row}", dot)

        status = tk.Label(
            parent, text="未启动", font=("Microsoft YaHei", 10),
            fg="#666666", bg="#1a1a24", width=14, anchor="w"
        )
        status.grid(row=row, column=2, pady=3)
        setattr(self, f"status_{row}", status)

    def log(self, msg):
        self.log_area.configure(state="normal")
        self.log_area.insert("end", msg + "\n")
        self.log_area.see("end")
        self.log_area.configure(state="normal")

    def set_status(self, idx, text, color):
        colors = {"green": "#2ecc71", "red": "#e74c3c", "yellow": "#f39c12", "gray": "#555555"}
        getattr(self, f"dot_{idx}").delete("all")
        getattr(self, f"dot_{idx}").create_oval(2, 2, 10, 10, fill=colors.get(color, "#555"), outline="")
        getattr(self, f"status_{idx}").configure(text=text, fg="#ffffff" if color == "green" else "#cccccc")

    def _read_stream(self, pipe, prefix):
        """读取子进程输出并写入日志"""
        try:
            for line in iter(pipe.readline, ""):
                if not self.running:
                    break
                line = line.strip()
                if line:
                    self.log(f"[{prefix}] {line}")
        except Exception:
            pass
        finally:
            try:
                pipe.close()
            except Exception:
                pass

    def start_all(self):
        self.btn_start.configure(state="disabled")
        self.btn_stop.configure(state="normal")
        self.running = True

        self.log("=" * 40)
        self.log("  正在启动服务...")
        self.log("=" * 40)

        # 清掉可能残留的进程
        self._kill_port(BACKEND_PORT)

        # 启动后端
        self.set_status(0, "启动中...", "yellow")
        self.log("[后端] 启动 Node.js 信令服务器...")

        try:
            self.backend_proc = subprocess.Popen(
                ["node", "server.js"],
                cwd=BACKEND_DIR,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
            )
            threading.Thread(
                target=self._read_stream,
                args=(self.backend_proc.stdout, "后端"),
                daemon=True
            ).start()
            self.set_status(0, "运行中 ✓", "green")
            self.log("[后端] 启动成功 → http://localhost:3000")
        except Exception as e:
            self.set_status(0, "启动失败", "red")
            self.log(f"[后端] 错误: {e}")

        time.sleep(0.5)

        # 启动前端
        self.set_status(1, "启动中...", "yellow")
        self.log("[前端] 启动 Vite 开发服务器...")

        try:
            self.frontend_proc = subprocess.Popen(
                ["npx", "vite", "--host"],
                cwd=FRONTEND_DIR,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
            )
            threading.Thread(
                target=self._read_stream,
                args=(self.frontend_proc.stdout, "前端"),
                daemon=True
            ).start()

            # 等 Vite 就绪
            for _ in range(15):
                time.sleep(0.5)
                if not self.running:
                    return
                if self._port_open(FRONTEND_PORT):
                    self.set_status(1, "运行中 ✓", "green")
                    self.log(f"[前端] 启动成功 → http://localhost:{FRONTEND_PORT}")
                    break
            else:
                self.set_status(1, "运行中?", "yellow")
                self.log("[前端] 可能仍在编译中，请稍候...")
        except Exception as e:
            self.set_status(1, "启动失败", "red")
            self.log(f"[前端] 错误: {e}")

        # 全部就绪
        if self._port_open(FRONTEND_PORT) and self._port_open(BACKEND_PORT):
            self.log("=" * 40)
            self.log("  ✓ 全部就绪！浏览器访问 http://localhost:5173")
            self.log("=" * 40)
            self.btn_browser.configure(state="normal")

    def stop_all(self):
        self.running = False
        self.btn_start.configure(state="normal")
        self.btn_stop.configure(state="disabled")
        self.btn_browser.configure(state="disabled")

        self.log("[系统] 正在停止所有服务...")

        for name, proc in [("后端", self.backend_proc), ("前端", self.frontend_proc)]:
            if proc and proc.poll() is None:
                try:
                    proc.terminate()
                    try:
                        proc.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                    self.log(f"[{name}] 已停止")
                except Exception as e:
                    self.log(f"[{name}] 停止异常: {e}")

        self.backend_proc = None
        self.frontend_proc = None

        self.set_status(0, "已停止", "gray")
        self.set_status(1, "已停止", "gray")
        self.log("[系统] 所有服务已停止")

    def open_browser(self):
        webbrowser.open(f"http://localhost:{FRONTEND_PORT}")
        self.log("[系统] 已打开浏览器")

    def _port_open(self, port):
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.5)
        try:
            s.connect(("127.0.0.1", port))
            s.close()
            return True
        except Exception:
            return False

    def _kill_port(self, port):
        if sys.platform != "win32":
            return
        try:
            out = subprocess.check_output(
                f'netstat -ano | findstr ":{port} " | findstr "LISTENING"',
                shell=True, text=True, errors="replace"
            )
            for line in out.strip().split("\n"):
                parts = line.strip().split()
                if len(parts) >= 5:
                    subprocess.run(
                        ["taskkill", "/PID", parts[-1], "/F"],
                        capture_output=True,
                        creationflags=subprocess.CREATE_NO_WINDOW,
                    )
        except Exception:
            pass

    def _on_close(self):
        self.stop_all()
        self.root.destroy()


def main():
    root = tk.Tk()

    # 窗口居中
    root.update_idletasks()
    w, h = 640, 500
    x = (root.winfo_screenwidth() - w) // 2
    y = (root.winfo_screenheight() - h) // 2
    root.geometry(f"{w}x{h}+{x}+{y}")

    LauncherApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
