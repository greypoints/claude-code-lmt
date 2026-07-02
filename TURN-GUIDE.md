# TURN 服务器搭建完整指南（阿里云 + 腾讯云）

---

## 你只需要做 3 件事

| 步骤 | 你做什么 | 耗时 |
|---|---|---|
| ① | 买一台云服务器（阿里云/腾讯云） | ~10 分钟 |
| ② | 复制粘贴一条命令 | ~1 分钟 |
| ③ | 把输出的 3 行配置填到 `.env` | ~30 秒 |

**总耗时约 15 分钟，花费约 0~50 元。**

---

## 第①步：买服务器

### 方案A：阿里云 ECS（推荐，学生免费试用）

1. 打开 [aliyun.com](https://www.aliyun.com) → 注册 → 实名认证
2. 搜索「**云服务器 ECS**」→ 进入
3. 点「**免费试用**」（新用户有 1~3 个月免费额度）
4. 如果没有免费额度，点「**学生优惠**」→ 完成学生认证 → 约 10 元/月
5. 配置如下：

| 选项 | 选什么 |
|---|---|
| 地域 | **离你最近的**（如 华东1/华北2/华南1） |
| 镜像 | **Ubuntu 22.04 64位** |
| 规格 | **1 vCPU / 1 GiB**（最低配，够用） |
| 系统盘 | 20 GiB（默认即可） |
| 公网 IP | **分配公网 IPv4 地址**（必须选！） |
| 带宽 | **按量计费**，峰值 1~5 Mbps |

6. 设置 **root 密码**（记下来，等下要用）
7. 下单 → 等待 1~2 分钟创建完成
8. 进入控制台 → 找到你的实例 → 复制 **公网 IP**（如 `47.xxx.xxx.xxx`）

### 方案B：腾讯云轻量应用服务器（更简单）

1. 打开 [cloud.tencent.com](https://cloud.tencent.com) → 注册 → 实名认证
2. 产品 → **轻量应用服务器**
3. 点「**新建**」：
   - 镜像：**Ubuntu 22.04**
   - 套餐：最低配（新用户约 50 元/年）
   - 时长：按需选择
4. 设置 root 密码
5. 购买 → 等创建 → 复制**公网 IP**

### ⚠️ 买好之后首先要做的事：开放端口（安全组）

不管阿里云还是腾讯云，买到服务器后第一件事就是**配安全组**（也叫防火墙），否则什么都连不上。

**阿里云操作路径：**
> 控制台 → ECS → 实例 → 点你的实例 → **安全组** → 配置规则 → **手动添加**

**腾讯云操作路径：**
> 控制台 → 轻量应用服务器 → 点你的实例 → **防火墙** → **添加规则**

添加以下 3 条规则：

| 端口 | 协议 | 授权对象 | 说明 |
|---|---|---|---|
| 3478 | TCP | 0.0.0.0/0 | TURN 控制 |
| 3478 | UDP | 0.0.0.0/0 | TURN 控制 |
| 49152-65535 | UDP | 0.0.0.0/0 | TURN 媒体中继 |

> 腾讯云轻量服务器：防火墙页面上方有 **放通全部端口** 按钮，点一下最省事。

---

## 第②步：SSH 连接服务器

### 方式A：用终端（推荐，最快）

打开 Windows 终端（PowerShell 或 CMD）：

```cmd
ssh root@你的公网IP
```

输入密码（输入时不显示，正常），回车。

> 第一次连接会问 "Are you sure"，输入 `yes` 回车。

### 方式B：用云厂商网页终端

- **阿里云**：ECS 实例列表 → 点「远程连接」→ 选「Workbench 远程连接」
- **腾讯云**：轻量服务器 → 点「登录」→ 网页版 SSH

---

## 第③步：运行一键安装脚本

连上服务器后，**逐条复制粘贴**执行：

```bash
# 1. 下载安装脚本
curl -O https://你的电脑没法传文件到这上面，我们换个方式
```

> **注意：** 服务器上拿不到你电脑里的 `setup-turn.sh` 文件。

**实际操作方式**（二选一）：

### 方式A：直接复制脚本内容执行（最简单）

SSH 连上服务器后，执行这条命令（一步到位）：

```bash
bash <(curl -s https://gist.githubusercontent.com/raw/setup-turn.sh 2>/dev/null) || \
TURN_PASS=$(openssl rand -hex 8) && \
PUBLIC_IP=$(curl -s ifconfig.me) && \
apt update -qq && apt install coturn -y && \
sed -i 's/TURNSERVER_ENABLED=0/TURNSERVER_ENABLED=1/' /etc/default/coturn && \
cat > /etc/turnserver.conf << EOF
listening-port=3478
listening-ip=0.0.0.0
external-ip=$PUBLIC_IP
lt-cred-mech
user=webrtc:$TURN_PASS
realm=webrtc
min-port=49152
max-port=65535
verbose
log-file=/var/log/turnserver.log
simple-log
fingerprint
no-loopback-peers
no-multicast-peers
EOF
systemctl restart coturn && systemctl enable coturn && \
sleep 2 && \
echo "" && \
echo "===== 配置完成 =====" && \
echo "公网 IP: $PUBLIC_IP" && \
echo "端口: 3478" && \
echo "用户名: webrtc" && \
echo "密码: $TURN_PASS" && \
echo "" && \
echo ".env 配置:" && \
echo "TURN_URL=turn:$PUBLIC_IP:3478?transport=udp" && \
echo "TURN_USERNAME=webrtc" && \
echo "TURN_CREDENTIAL=$TURN_PASS"
```

> 如果上面的在线脚本方式失败了，用下面的手动方式：

### 方式B：手动一步步执行

SSH 连上服务器后，逐条执行：

```bash
# 1. 更新系统
apt update && apt upgrade -y

# 2. 安装 coturn
apt install coturn -y

# 3. 启用 coturn
sed -i 's/TURNSERVER_ENABLED=0/TURNSERVER_ENABLED=1/' /etc/default/coturn

# 4. 获取公网 IP
# 记下输出的 IP
curl ifconfig.me
```

然后创建配置文件（把 `47.xxx.xxx.xxx` 换成上一步查到的 IP）：

```bash
cat > /etc/turnserver.conf << 'EOF'
listening-port=3478
listening-ip=0.0.0.0
external-ip=47.xxx.xxx.xxx
lt-cred-mech
user=webrtc:MyPassword123
realm=webrtc
min-port=49152
max-port=65535
verbose
log-file=/var/log/turnserver.log
simple-log
fingerprint
no-loopback-peers
no-multicast-peers
EOF
```

最后启动：

```bash
# 5. 启动
systemctl restart coturn
systemctl enable coturn

# 6. 检查状态（应显示 active (running)）
systemctl status coturn
```

---

## 第④步：验证 TURN 是否工作

打开这个在线测试页面：
👉 https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

1. **STUN/TURN URI** 填：`turn:你的公网IP:3478`
2. **Username** 填：`webrtc`
3. **Password** 填：你设置的密码（方式A是随机生成的，方式B是 `MyPassword123`）
4. 点 **Add Server** → **Gather candidates**
5. 看结果：
   - 出现 `relay` 类型的 candidate ✅ TURN 正常工作
   - 只有 `srflx` 和 `host` ❌ TURN 有问题（检查安全组端口是否开放）

---

## 第⑤步：配置你的后端 .env

编辑 `webrtc-backend/.env`，把安装脚本最后输出的 3 行填进去：

```env
# 前面已有的不要动，末尾追加：
TURN_URL=turn:你的公网IP:3478?transport=udp
TURN_USERNAME=webrtc
TURN_CREDENTIAL=你的密码
```

重启后端，终端看到 `[TURN] 静态凭证已配置` 就成功了。

---

## 费用说明

| 厂商 | 产品 | 价格 |
|---|---|---|
| 阿里云 | ECS 1核1G | 新用户免费 1~3 月，后续 ~60 元/月 |
| 阿里云 | 学生优惠 ECS | ~10 元/月 |
| 腾讯云 | 轻量应用服务器 | 新用户 ~50 元/**年** |
| 腾讯云 | 学生优惠 | 免费或极低价 |

> **推荐：** 腾讯云轻量应用服务器，操作最简单、最便宜，新用户 50 元左右就能用一年。也支持学生认证。
>
> 做课程演示用，甚至可以几个人合买一台共用一个 TURN 服务器——TURN 只管打不通时的中转，大部分时间流量几乎为零。

---

## 常见问题

### Q: 验证页面没有 relay candidate

1. **先查安全组**：最常见原因！TCP/UDP 3478 和 UDP 49152-65535 必须放行
2. 服务器内执行：`systemctl status coturn` 看是否 running
3. 服务器内执行：`ss -tulpn | grep 3478` 看端口是否监听

### Q: coturn 启动失败

```bash
# 查看错误日志
journalctl -u coturn -n 50

# 手动前台运行看报错
turnserver -c /etc/turnserver.conf
```

### Q: 视频通话还是连不上

1. 检查 .env 里 TURN_URL 的 IP 是否正确
2. 重启后端 `npm start`
3. 浏览器打开 `chrome://webrtc-internals/` → 找 PeerConnection → 看 candidate 有没有 `relay`
