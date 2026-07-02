import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import 'dotenv/config'

const app = express()
app.use(express.json())

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
})

// ===== ICE Server 配置（STUN + TURN）=====
// 优先使用 Metered.ca TURN（免费 0.5GB/月），留空则仅用 STUN
const METERED_API_KEY = process.env.METERED_API_KEY || ''

async function getIceServers() {
  const servers = []

  // 始终带 STUN
  servers.push({ urls: 'stun:stun.l.google.com:19302' })

  if (METERED_API_KEY) {
    try {
      // 调 Metered.ca REST API 获取临时 TURN 凭证
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
        console.log('[TURN] Metered.ca 凭证已获取，ttl=', data.ttl)
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
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
