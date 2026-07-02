#!/bin/bash
# ==========================================
#  部署到腾讯云服务器
#  用法: bash deploy.sh
# ==========================================
SERVER="81.70.188.213"
USER="root"

echo "=== 上传代码到服务器 ==="

# 上传后端
echo "[1/4] 上传 webrtc-backend..."
scp -r webrtc-backend/server.js webrtc-backend/package.json webrtc-backend/package-lock.json webrtc-backend/.env ${USER}@${SERVER}:/root/webrtc-backend/

# 上传前端 dist
echo "[2/4] 上传前端构建产物..."
scp -r webrtc-frontend/dist ${USER}@${SERVER}:/root/webrtc-frontend/

# 安装依赖
echo "[3/4] 安装 Node.js 依赖..."
ssh ${USER}@${SERVER} "cd /root/webrtc-backend && npm install --production"

# 重启服务
echo "[4/4] 启动服务..."
ssh ${USER}@${SERVER} "pkill -f 'node server.js' 2>/dev/null; cd /root/webrtc-backend && nohup node server.js > /var/log/webrtc.log 2>&1 &"

echo ""
echo "=== 部署完成 ==="
echo "访问: http://${SERVER}:3000"
echo "查看日志: ssh ${USER}@${SERVER} 'tail -f /var/log/webrtc.log'"
