<template>
  <div class="home">
    <h1>WebRTC 视频会议</h1>
    <form @submit.prevent="joinRoom">
      <input
        v-model="nickname"
        placeholder="输入昵称"
        required
        maxlength="20"
      />
      <div class="actions">
        <input
          v-model="roomId"
          placeholder="房间号（留空则创建新房间）"
          maxlength="20"
        />
        <div class="buttons">
          <button type="button" @click="createRoom" class="btn-primary">
            创建房间
          </button>
          <button type="submit" :disabled="!roomId" class="btn-secondary">
            加入房间
          </button>
        </div>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const nickname = ref('')
const roomId = ref('')

function createRoom() {
  if (!nickname.value.trim()) return
  const id = Math.random().toString(36).slice(2, 8)
  navigate(id)
}

function joinRoom() {
  if (!nickname.value.trim() || !roomId.value.trim()) return
  navigate(roomId.value.trim())
}

function navigate(id) {
  router.push({
    path: `/room/${id}`,
    query: { nickname: nickname.value.trim() }
  })
}
</script>

<style scoped>
.home {
  max-width: 420px;
  margin: 80px auto;
  text-align: center;
  padding: 40px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.08);
}
h1 {
  margin-bottom: 32px;
  font-size: 24px;
  color: #1a1a2e;
}
input {
  width: 100%;
  padding: 12px;
  margin-bottom: 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 15px;
  box-sizing: border-box;
}
input:focus {
  outline: none;
  border-color: #4a6cf7;
}
.actions {
  margin-top: 8px;
}
.buttons {
  display: flex;
  gap: 12px;
}
.buttons button {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  cursor: pointer;
}
.btn-primary {
  background: #4a6cf7;
  color: #fff;
}
.btn-primary:hover {
  background: #3b5de7;
}
.btn-secondary {
  background: #e8ecf4;
  color: #333;
}
.btn-secondary:hover {
  background: #d5dae8;
}
.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
