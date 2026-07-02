import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import 'dotenv/config'

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
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
