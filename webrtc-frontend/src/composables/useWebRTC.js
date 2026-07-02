import { ref, shallowRef } from 'vue'

// 默认 STUN（首次调用前用，后续从后端获取 TURN 凭证后替换）
const FALLBACK_ICE = [{ urls: 'stun:stun.l.google.com:19302' }]

export function useWebRTC(socketCallbacks) {
  const localStream = shallowRef(null)
  const remoteStreams = ref(new Map())
  const peers = new Map()

  let iceServers = [...FALLBACK_ICE]

  // 从后端获取最新的 ICE 配置（含 TURN 临时凭证）
  async function fetchIceServers() {
    try {
      const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin
      const httpUrl = socketUrl.replace(/^http/, 'http') // ws → http
      const base = import.meta.env.VITE_API_BASE || httpUrl
      const res = await fetch(`${base}/api/ice-servers`)
      if (res.ok) {
        const data = await res.json()
        if (data.iceServers?.length) {
          iceServers = data.iceServers
          console.log('[WebRTC] ICE 配置已更新:', iceServers.map(s => s.urls).flat())
          return iceServers
        }
      }
    } catch (e) {
      console.warn('[WebRTC] 获取 ICE 配置失败，使用默认 STUN:', e.message)
    }
    return FALLBACK_ICE
  }

  async function startLocalStream() {
    localStream.value = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    })
    return localStream.value
  }

  function stopLocalStream() {
    if (localStream.value) {
      localStream.value.getTracks().forEach(t => t.stop())
      localStream.value = null
    }
  }

  function createPeerConfig() {
    return { iceServers }
  }

  function createPeer(userId, polite) {
    if (peers.has(userId)) return peers.get(userId)

    const pc = new RTCPeerConnection(createPeerConfig())
    peers.set(userId, { pc, polite, makingOffer: false, ignoreOffer: false })

    if (localStream.value) {
      localStream.value.getTracks().forEach(track => {
        pc.addTrack(track, localStream.value)
      })
    }

    pc.ontrack = (event) => {
      const stream = event.streams[0]
      const streams = new Map(remoteStreams.value)
      streams.set(userId, stream)
      remoteStreams.value = streams
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketCallbacks.onIceCandidate(userId, event.candidate)
      }
    }

    pc.onnegotiationneeded = async () => {
      const entry = peers.get(userId)
      if (!entry) return
      try {
        entry.makingOffer = true
        await pc.setLocalDescription()
        socketCallbacks.onOffer(userId, pc.localDescription)
      } catch (err) {
        console.error('negotiation error:', err)
      } finally {
        entry.makingOffer = false
      }
    }

    return entry
  }

  async function handleOffer(userId, sdp) {
    let entry = peers.get(userId)
    if (!entry) entry = createPeer(userId, false)

    const { pc } = entry
    const readyForOffer =
      !entry.makingOffer &&
      (pc.signalingState === 'stable' || entry.ignoreOffer)

    if (!readyForOffer) {
      entry.ignoreOffer = !entry.polite
      return
    }
    entry.ignoreOffer = false

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp))
      await pc.setLocalDescription()
      socketCallbacks.onAnswer(userId, pc.localDescription)
    } catch (err) {
      console.error('handleOffer error:', err)
    }
  }

  async function handleAnswer(userId, sdp) {
    const entry = peers.get(userId)
    if (!entry) return
    try {
      await entry.pc.setRemoteDescription(new RTCSessionDescription(sdp))
    } catch (err) {
      console.error('handleAnswer error:', err)
    }
  }

  function handleIceCandidate(userId, candidate) {
    const entry = peers.get(userId)
    if (!entry) return
    entry.pc.addIceCandidate(new RTCIceCandidate(candidate))
  }

  function closePeer(userId) {
    const entry = peers.get(userId)
    if (entry) {
      entry.pc.close()
      peers.delete(userId)
      const streams = new Map(remoteStreams.value)
      streams.delete(userId)
      remoteStreams.value = streams
    }
  }

  function closeAll() {
    peers.forEach((_, userId) => closePeer(userId))
    stopLocalStream()
  }

  return {
    localStream,
    remoteStreams,
    fetchIceServers,
    startLocalStream,
    stopLocalStream,
    createPeer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    closePeer,
    closeAll
  }
}
