import express from 'express'
import { createServer as createHttpServer } from 'http'
import { createServer as createHttpsServer } from 'https'
import { Server } from 'socket.io'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import 'dotenv/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(express.json())

// HTTPS 证书（自签名即可绕过浏览器 getUserMedia 限制）
let httpServer
const KEY_PATH = process.env.HTTPS_KEY || '/root/key.pem'
const CERT_PATH = process.env.HTTPS_CERT || '/root/cert.pem'

if (fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH)) {
  const httpsOpts = {
    key: fs.readFileSync(KEY_PATH),
    cert: fs.readFileSync(CERT_PATH)
  }
  httpServer = createHttpsServer(httpsOpts, app)
  console.log('[HTTPS] 已启用 (自签名证书，浏览器需点"高级→继续访问")')
} else {
  httpServer = createHttpServer(app)
  console.log('[HTTP] 未找到证书，使用 HTTP (仅 localhost 可调摄像头)')
}

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
})

// ===== ICE Server 配置（STUN + TURN）=====
// 三种配置方式（优先级 C > B > A）：
//   A: METERED_API_KEY  → Metered.ca 在线获取动态凭证
//   B: TURN_URL + TURN_USERNAME + TURN_CREDENTIAL  → 静态凭证
//   C: COTURN_SECRET + COTURN_URL  → coturn HMAC-SHA1 动态凭证（最安全）

const COTURN_SECRET = process.env.COTURN_SECRET || ''
const COTURN_URL = process.env.COTURN_URL || ''
const TURN_URL = process.env.TURN_URL || ''
const TURN_USERNAME = process.env.TURN_USERNAME || ''
const TURN_CREDENTIAL = process.env.TURN_CREDENTIAL || ''
const METERED_API_KEY = process.env.METERED_API_KEY || ''

const crypto = await import('crypto')

function hmacTurnCredential(username, secret) {
  const hmac = crypto.createHmac('sha1', secret)
  const ttl = 24 * 3600          // 24 小时有效
  const timestamp = Math.floor(Date.now() / 1000) + ttl
  const username2 = `${timestamp}:${username}`
  hmac.update(username2)
  return {
    urls: [COTURN_URL],
    username: username2,
    credential: hmac.digest('base64'),
    ttl
  }
}

async function getIceServers() {
  const servers = []

  // 始终带 Google STUN
  servers.push({ urls: 'stun:stun.l.google.com:19302' })

  // C: 自建 coturn HMAC 模式
  if (COTURN_SECRET && COTURN_URL) {
    servers.push(hmacTurnCredential('webrtc', COTURN_SECRET))
    console.log('[TURN] coturn HMAC 凭证已生成')
    return servers
  }

  // B: 静态 TURN 凭证
  if (TURN_URL && TURN_USERNAME && TURN_CREDENTIAL) {
    servers.push({
      urls: [TURN_URL],
      username: TURN_USERNAME,
      credential: TURN_CREDENTIAL
    })
    console.log('[TURN] 静态凭证已配置:', TURN_URL)
    return servers
  }

  // A: Metered.ca 在线获取
  if (METERED_API_KEY) {
    try {
      const res = await fetch(
        `https://global.relay.metered.ca/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`
      )
      if (res.ok) {
        const data = await res.json()
        servers.push({
          urls: data.uris || [],
          username: data.username || '',
          credential: data.password || '',
          ttl: data.ttl || 86400
        })
        console.log('[TURN] Metered.ca 凭证已获取')
      } else {
        console.warn('[TURN] Metered.ca API 返回错误:', res.status)
      }
    } catch (e) {
      console.warn('[TURN] Metered.ca API 请求失败:', e.message)
    }
  }

  return servers
}

// REST 端点：前端获取 ICE 配置
app.get('/api/ice-servers', async (_req, res) => {
  const servers = await getIceServers()
  res.json({ iceServers: servers })
})

// ===== 静态文件服务（生产模式，部署到服务器时使用）=====
const frontDist = path.join(__dirname, '..', 'webrtc-frontend', 'dist')
app.use(express.static(frontDist))
app.get('*', (req, res, next) => {
  // API 请求和有后缀的文件请求交给 express 自己处理
  if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/') || path.extname(req.path)) {
    return next()
  }
  // SPA 回退
  res.sendFile(path.join(frontDist, 'index.html'), (err) => {
    if (err) next()
  })
})

const rooms = new Map()

io.on('connection', (socket) => {
  socket.on('create-room', ({ roomId, nickname }) => {
    if (rooms.has(roomId)) {
      socket.emit('room-error', '房间已存在')
      return
    }
    rooms.set(roomId, {
      id: roomId,
      createdBy: socket.id,
      createdAt: Date.now(),
      users: []
    })
    joinRoom(socket, roomId, nickname)
    socket.emit('room-created', { roomId })
  })

  socket.on('join-room', ({ roomId, nickname }) => {
    const room = rooms.get(roomId)
    if (!room) {
      socket.emit('room-error', '房间不存在')
      return
    }
    joinRoom(socket, roomId, nickname)
    socket.emit('room-joined', { roomId, users: room.users })
    socket.to(roomId).emit('user-joined', {
      userId: socket.id,
      nickname
    })
  })

  socket.on('offer', ({ target, sdp }) => {
    socket.to(target).emit('offer', {
      from: socket.id,
      sdp
    })
  })

  socket.on('answer', ({ target, sdp }) => {
    socket.to(target).emit('answer', {
      from: socket.id,
      sdp
    })
  })

  socket.on('ice-candidate', ({ target, candidate }) => {
    socket.to(target).emit('ice-candidate', {
      from: socket.id,
      candidate
    })
  })

  socket.on('leave-room', () => {
    leaveRoom(socket)
  })

  socket.on('disconnect', () => {
    leaveRoom(socket)
  })
})

function joinRoom(socket, roomId, nickname) {
  socket.join(roomId)
  const room = rooms.get(roomId)
  room.users.push({ id: socket.id, nickname })
  socket.data.roomId = roomId
  socket.data.nickname = nickname
}

function leaveRoom(socket) {
  const roomId = socket.data.roomId
  if (!roomId) return
  socket.leave(roomId)
  socket.to(roomId).emit('user-left', { userId: socket.id })
  const room = rooms.get(roomId)
  if (room) {
    room.users = room.users.filter(u => u.id !== socket.id)
    if (room.users.length === 0) {
      rooms.delete(roomId)
    }
  }
  socket.data.roomId = null
}

const PORT = process.env.PORT || 3000
const proto = fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH) ? 'https' : 'http'
httpServer.listen(PORT, () => {
  console.log(`Server running on ${proto}://localhost:${PORT}`)
})
