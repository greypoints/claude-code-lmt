#!/bin/bash
# 服务器端一键更新脚本
# 用法: ssh 进服务器后执行 bash update-server.sh
set -e
cd /root/claude-code-lmt
echo "[1/3] git pull..."
git pull
echo "[2/3] 构建前端..."
cd /root/claude-code-lmt/webrtc-frontend && npx vite build
echo "[3/3] 重启服务..."
pkill -f "node server.js" 2>/dev/null || true
sleep 1
cd /root/claude-code-lmt/webrtc-backend
nohup node server.js > /var/log/webrtc.log 2>&1 &
sleep 2
curl -k https://localhost:3000/api/ice-servers
echo ""
echo "更新完成！访问 https://$(curl -s ifconfig.me):3000"
