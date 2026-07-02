@echo off
chcp 65001 >nul
echo ================================
echo   WebRTC 视频会议 — 一键启动
echo ================================
echo.

echo [1/2] 启动后端 (端口 3000)...
start "WebRTC Backend" cmd /c "cd /d "%~dp0webrtc-backend" && npm start"

echo [2/2] 启动前端 (端口 5173)...

start "WebRTC Frontend" cmd /c "cd /d "%~dp0webrtc-frontend" && npm run dev"

echo.
echo 后端: http://localhost:3000
echo 前端: http://localhost:5173
echo.
echo 窗口已打开，关闭窗口即可停止服务。
pause
