<template>
  <div class="room">
    <header class="room-header">
      <span class="room-id">房间: {{ roomId }}</span>
      <span class="user-count" v-if="users.length">{{ users.length + 1 }} 人在线</span>
      <button @click="leave" class="btn-leave">离开</button>
    </header>

    <div v-if="!connected" class="status-msg">
      {{ error || '正在连接服务器...' }}
    </div>

    <div class="grid" v-else>
      <div class="video-card self">
        <video
          ref="localVideo"
          autoplay
          muted
          playsinline
        />
        <span class="label">{{ nickname }} (我)</span>
      </div>

      <div
        v-for="user in users"
        :key="user.id"
        class="video-card"
      >
        <video
          :ref="el => setRemoteVideoRef(user.id, el)"
          autoplay
          playsinline
        />
        <span class="label">{{ user.nickname }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSocket } from '../composables/useSocket.js'
import { useWebRTC } from '../composables/useWebRTC.js'

const route = useRoute()
const router = useRouter()

const roomId = route.params.roomId
const nickname = ref(route.query.nickname || '匿名')
const users = ref([])
const localVideo = ref(null)
const remoteVideoRefs = {}

const {
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
} = useSocket()

const {
  localStream,
  remoteStreams,
  fetchIceServers,
  startLocalStream,
  createPeer,
  handleOffer,
  handleAnswer,
  handleIceCandidate,
  closePeer,
  closeAll
} = useWebRTC({
  onOffer(userId, sdp) { sendOffer(userId, sdp) },
  onAnswer(userId, sdp) { sendAnswer(userId, sdp) },
  onIceCandidate(userId, candidate) { sendIceCandidate(userId, candidate) }
})

function setRemoteVideoRef(userId, el) {
  if (el) remoteVideoRefs[userId] = el
}

// watch local stream -> attach to video
watch(localStream, async (stream) => {
  await nextTick()
  if (localVideo.value && stream) {
    localVideo.value.srcObject = stream
  }
})

// watch remote streams -> attach to video elements
watch(remoteStreams, (streams) => {
  for (const [userId, stream] of streams) {
    const el = remoteVideoRefs[userId]
    if (el && el.srcObject !== stream) {
      el.srcObject = stream
    }
  }
}, { deep: false })

onMounted(async () => {
  connect()

  try {
    if (!connected.value) {
      await new Promise(resolve => socket.once('connect', resolve))
    }

    // 先获取 TURN 凭证，再开启摄像头
    await fetchIceServers()
    await startLocalStream()

    // 尝试加入已有房间，失败则创建新房间
    await joinRoom(roomId, nickname.value).catch(async () => {
      await createRoom(roomId, nickname.value)
    })
  } catch (err) {
    error.value = '初始化失败: ' + err.message
  }

  // new joiner sees existing users — impolite (initiates offer)
  socket.on('room-joined', ({ users: roomUsers }) => {
    users.value = roomUsers.filter(u => u.id !== socket.id)
    users.value.forEach(user => createPeer(user.id, false))
  })

  // existing users see new joiner — polite (accepts offer)
  socket.on('user-joined', ({ userId, nickname: nick }) => {
    users.value.push({ id: userId, nickname: nick })
    createPeer(userId, true)
  })

  socket.on('user-left', ({ userId }) => {
    users.value = users.value.filter(u => u.id !== userId)
    closePeer(userId)
  })

  socket.on('offer', ({ from, sdp }) => {
    handleOffer(from, sdp)
  })

  socket.on('answer', ({ from, sdp }) => {
    handleAnswer(from, sdp)
  })

  socket.on('ice-candidate', ({ from, candidate }) => {
    handleIceCandidate(from, candidate)
  })
})

onUnmounted(() => {
  leaveRoom()
  closeAll()
  disconnect()
})

function leave() {
  router.push('/')
}
</script>

<style scoped>
.room {
  height: 100vh;
  background: #0f0f14;
  color: #fff;
  display: flex;
  flex-direction: column;
}

.room-header {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  background: #1a1a24;
  gap: 16px;
  flex-shrink: 0;
}

.room-id {
  font-weight: 600;
}

.user-count {
  color: #888;
  font-size: 14px;
}

.btn-leave {
  margin-left: auto;
  padding: 8px 20px;
  background: #e74c3c;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.btn-leave:hover {
  background: #c0392b;
}

.status-msg {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: #888;
}

.grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 12px;
  padding: 12px;
  overflow-y: auto;
  align-content: center;
}

.video-card {
  position: relative;
  background: #1a1a24;
  border-radius: 10px;
  overflow: hidden;
  aspect-ratio: 4 / 3;
}

.video-card video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.label {
  position: absolute;
  bottom: 8px;
  left: 8px;
  background: rgba(0, 0, 0, 0.6);
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 13px;
}

.self .label {
  background: rgba(74, 108, 247, 0.8);
}
</style>
