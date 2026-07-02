import { io } from 'socket.io-client'
import { ref } from 'vue'

// VITE_SOCKET_URL 仅在开发环境跨域时需要（如 Vite 5173 → 后端 3000）
// 生产部署时前后端同域，自动用当前页面地址
const URL = import.meta.env.DEV
  ? (import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000')
  : window.location.origin

export function useSocket() {
  const socket = io(URL, { autoConnect: false })
  const connected = ref(false)
  const error = ref('')

  socket.on('connect', () => {
    connected.value = true
  })

  socket.on('disconnect', () => {
    connected.value = false
  })

  socket.on('connect_error', () => {
    error.value = '无法连接到服务器'
  })

  function connect() {
    socket.connect()
  }

  function disconnect() {
    socket.disconnect()
  }

  function createRoom(roomId, nickname) {
    return new Promise((resolve, reject) => {
      socket.emit('create-room', { roomId, nickname })
      socket.once('room-created', resolve)
      socket.once('room-error', reject)
    })
  }

  function joinRoom(roomId, nickname) {
    return new Promise((resolve, reject) => {
      socket.emit('join-room', { roomId, nickname })
      socket.once('room-joined', resolve)
      socket.once('room-error', reject)
    })
  }

  function leaveRoom() {
    socket.emit('leave-room')
  }

  function sendOffer(target, sdp) {
    socket.emit('offer', { target, sdp })
  }

  function sendAnswer(target, sdp) {
    socket.emit('answer', { target, sdp })
  }

  function sendIceCandidate(target, candidate) {
    socket.emit('ice-candidate', { target, candidate })
  }

  return {
    socket,
    connected,
    error,
    connect,
    disconnect,
    createRoom,
    joinRoom,
    leaveRoom,
    sendOffer,
    sendAnswer,
    sendIceCandidate
  }
}
