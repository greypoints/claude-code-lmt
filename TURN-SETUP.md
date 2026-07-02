# TURN 服务器配置指南

配置 TURN 后，不同 WiFi / 4G / 5G 下的设备可以互相视频通话。

不配 TURN：仅同 WiFi 可用（STUN 直连）。
配了 TURN：任何网络都可用（TURN 中继转发）。

---

## 方式一：Twilio TURN（推荐，免费额度 5GB）

### 步骤

1. 打开 https://console.twilio.com → 注册账号
2. 左侧菜单 → **Develop** → **Network Traversal**
3. 点击 **Create Network Traversal Service**，随便起个名字（如 `webrtc-demo`），点 Create
4. 创建后看到：
   ```
   TURN URL:     turn:global.turn.twilio.com:3478?transport=udp
   STUN URL:     stun:global.stun.twilio.com:3478?transport=udp
   ```
5. 左侧菜单 → **Develop** → **API Keys** → **Create API Key**，起名 → Create
6. 复制 **SID**（用户名）和 **Secret**（密码）

### 配置 .env

编辑 `webrtc-backend/.env`：
```env
# 方式B：静态凭证
TURN_URL=turn:global.turn.twilio.com:3478?transport=udp
TURN_USERNAME=你的SID（如 SKxxxxxx）
TURN_CREDENTIAL=你的Secret
```

---

## 方式二：Xirsys TURN（免费 500MB/月）

### 步骤

1. 打开 https://xirsys.com → Sign Up
2. 登录 → Dashboard → **+ New Application** → 起名 → Create
3. 进入应用 → 左侧 **Static Credentials** → 点击 **+ Create Static Credential**
4. 看到：
   ```
   urls:       turn:xx.xx.xx.xx:3478?transport=udp
   username:   xxx
   credential: xxx
   ```

### 配置 .env

```env
TURN_URL=turn:xx.xx.xx.xx:3478?transport=udp
TURN_USERNAME=xxx
TURN_CREDENTIAL=xxx
```

---

## 方式三：自建 coturn（完全免费，需一台有公网 IP 的服务器）

### 服务器安装（Ubuntu/Debian）

```bash
# 安装
sudo apt update && sudo apt install coturn -y

# 启用
sudo sed -i 's/TURNSERVER_ENABLED=0/TURNSERVER_ENABLED=1/' /etc/default/coturn

# 编辑配置
sudo nano /etc/turnserver.conf
```

### turnserver.conf 内容

```
listening-port=3478
listening-ip=0.0.0.0
external-ip=你的服务器公网IP

# 方式一：长期凭证模式（对应后端方式B）
lt-cred-mech
user=webrtc:your-password-here

# 方式二：HMAC 动态凭证模式（对应后端方式C）
# use-auth-secret
# static-auth-secret=your-secret-key

realm=webrtc.example.com
min-port=49152
max-port=65535
verbose
```

### 启动

```bash
sudo systemctl restart coturn
sudo systemctl status coturn

# 检查端口
sudo ss -tulpn | grep 3478
```

### 防火墙开放端口

```bash
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 49152:65535/udp
```

**云服务器**（阿里云/腾讯云）还需要在安全组里放行：TCP 3478、UDP 3478、UDP 49152-65535。

### 验证 TURN 是否工作

打开 https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
- STUN/TURN URI 填 `turn:你的服务器IP:3478`
- Username / Password 填你的凭证
- 点 Add Server → Gather candidates
- 看到 `relay` 类型的 candidate 说明 TURN 正常工作

### 配置 .env

长期凭证模式：
```env
TURN_URL=turn:你的服务器IP:3478?transport=udp
TURN_USERNAME=webrtc
TURN_CREDENTIAL=your-password-here
```

HMAC 动态凭证模式（更安全）：
```env
COTURN_SECRET=your-secret-key
COTURN_URL=turn:你的服务器IP:3478?transport=udp
```

---

## 方式四：Cloudflare TURN（免费）

1. 打开 https://dash.cloudflare.com → 注册
2. 左侧 **Calls** → 创建应用
3. 获取 TURN 凭证

---

## 验证 TURN 配置是否生效

### 方法1：看后端终端

启动后端后，终端应输出：
```
[TURN] 静态凭证已配置: turn:xxx:3478
```

### 方法2：Chrome 开发者工具

1. 打开 `chrome://webrtc-internals/`
2. 进行视频通话
3. 找到你的 PeerConnection → 展开 `Stats` → 看 `candidateType`
4. 出现 `relay` 说明 TURN 正在使用

### 方法3：直接调 API

```bash
curl http://localhost:3000/api/ice-servers
# 应返回包含 TURN 的完整 ICE 配置
```
