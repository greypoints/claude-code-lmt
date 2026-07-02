#!/bin/bash
# ============================================
#  WebRTC TURN 服务器一键安装脚本
#  适用: Ubuntu 20.04 / 22.04 / 24.04
#  用法: chmod +x setup-turn.sh && sudo bash setup-turn.sh
# ============================================
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}"
echo "  ╔══════════════════════════════════╗"
echo "  ║   WebRTC TURN 服务器 一键安装   ║"
echo "  ╚══════════════════════════════════╝"
echo -e "${NC}"

# ---- 检查 root ----
if [ "$(id -u)" != "0" ]; then
    echo -e "${RED}请用 sudo bash setup-turn.sh 运行${NC}"
    exit 1
fi

# ---- 设置变量 ----
TURN_USER="${1:-webrtc}"
TURN_PASS="${2:-$(openssl rand -hex 8)}"
TURN_PORT=3478
MIN_PORT=49152
MAX_PORT=65535

# ---- 获取公网 IP ----
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ip.sb 2>/dev/null || curl -s httpbin.org/ip 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' || echo "")

if [ -z "$PUBLIC_IP" ]; then
    # 从阿里云/腾讯云 metadata 获取
    PUBLIC_IP=$(curl -s 100.100.100.200/latest/meta-data/eipv4 2>/dev/null || curl -s metadata.tencentyun.com/latest/meta-data/public-ipv4 2>/dev/null || echo "")
fi

if [ -z "$PUBLIC_IP" ]; then
    echo -e "${RED}无法自动获取公网 IP，请手动输入:${NC}"
    read -p "公网 IP: " PUBLIC_IP
fi

echo ""
echo -e "${YELLOW}配置信息:${NC}"
echo "  公网 IP:     $PUBLIC_IP"
echo "  TURN 端口:   $TURN_PORT"
echo "  用户名:      $TURN_USER"
echo "  密码:        $TURN_PASS"
echo "  媒体端口范围: $MIN_PORT - $MAX_PORT"
echo ""

# ---- 更新系统 ----
echo -e "${YELLOW}[1/5] 更新系统包...${NC}"
apt update -qq && apt upgrade -y -qq

# ---- 安装 coturn ----
echo -e "${YELLOW}[2/5] 安装 coturn...${NC}"
apt install coturn -y

# ---- 启用 coturn ----
echo -e "${YELLOW}[3/5] 启用 coturn 服务...${NC}"
sed -i 's/TURNSERVER_ENABLED=0/TURNSERVER_ENABLED=1/' /etc/default/coturn

# ---- 写入配置 ----
echo -e "${YELLOW}[4/5] 配置 coturn...${NC}"
cat > /etc/turnserver.conf << TURNEOF
# ===== WebRTC TURN 配置 =====
listening-port=${TURN_PORT}
listening-ip=0.0.0.0
external-ip=${PUBLIC_IP}

# 长期凭证认证（对应后端 .env 方式B）
lt-cred-mech
user=${TURN_USER}:${TURN_PASS}

# HMAC 动态凭证（可选，对应后端 .env 方式C）
# 取消下面两行注释即可切换：
# use-auth-secret
# static-auth-secret=change-me-to-a-random-string

realm=webrtc.example.com

# 媒体中继端口范围
min-port=${MIN_PORT}
max-port=${MAX_PORT}

# 日志
verbose
log-file=/var/log/turnserver.log
simple-log

# 性能
fingerprint
no-loopback-peers
no-multicast-peers
TURNEOF

# ---- 开放防火墙 ----
echo -e "${YELLOW}[5/5] 配置防火墙...${NC}"

# ufw
if command -v ufw &>/dev/null; then
    ufw allow ${TURN_PORT}/tcp 2>/dev/null || true
    ufw allow ${TURN_PORT}/udp 2>/dev/null || true
    ufw allow ${MIN_PORT}:${MAX_PORT}/udp 2>/dev/null || true
    echo "  ufw 规则已添加"
fi

# iptables（ufw 不工作时）
if ! command -v ufw &>/dev/null; then
    iptables -I INPUT -p tcp --dport ${TURN_PORT} -j ACCEPT
    iptables -I INPUT -p udp --dport ${TURN_PORT} -j ACCEPT
    iptables -I INPUT -p udp --dport ${MIN_PORT}:${MAX_PORT} -j ACCEPT
    echo "  iptables 规则已添加"
fi

# ---- 启动服务 ----
echo ""
systemctl restart coturn
systemctl enable coturn

sleep 2

if systemctl is-active --quiet coturn; then
    echo -e "${GREEN}"
    echo "  ╔══════════════════════════════════╗"
    echo "  ║     ✓  TURN 服务器安装成功！     ║"
    echo "  ╚══════════════════════════════════╝"
    echo ""
    echo "  公网 IP:  ${PUBLIC_IP}"
    echo "  端口:     ${TURN_PORT}"
    echo "  用户名:   ${TURN_USER}"
    echo "  密码:     ${TURN_PASS}"
    echo ""
    echo "  .env 配置（复制到 webrtc-backend/.env）:"
    echo "  ───────────────────────────────────"
    echo "  TURN_URL=turn:${PUBLIC_IP}:${TURN_PORT}?transport=udp"
    echo "  TURN_USERNAME=${TURN_USER}"
    echo "  TURN_CREDENTIAL=${TURN_PASS}"
    echo "  ───────────────────────────────────"
    echo -e "${NC}"
else
    echo -e "${RED}启动失败！检查日志: journalctl -u coturn -n 30${NC}"
    exit 1
fi

# ---- 写入结果文件 ----
cat > /root/turn-credentials.txt << INFO
=== WebRTC TURN 服务器配置 ===
公网 IP:  ${PUBLIC_IP}
端口:     ${TURN_PORT}
用户名:   ${TURN_USER}
密码:     ${TURN_PASS}

.env 配置:
TURN_URL=turn:${PUBLIC_IP}:${TURN_PORT}?transport=udp
TURN_USERNAME=${TURN_USER}
TURN_CREDENTIAL=${TURN_PASS}
INFO

echo "凭证已保存到 /root/turn-credentials.txt"
echo ""
echo -e "${YELLOW}⚠ 别忘了在云服务器控制台的「安全组/防火墙」里放行以下端口:${NC}"
echo "   TCP ${TURN_PORT}"
echo "   UDP ${TURN_PORT}"
echo "   UDP ${MIN_PORT}-${MAX_PORT}"
