import { ref, shallowRef } from 'vue'

const ICE_SERVERS = import.meta.env.VITE_ICE_SERVERS
  ? import.meta.env.VITE_ICE_SERVERS.split(',').map(url => ({ urls: url.trim() }))
  : [{ urls: 'stun:stun.l.google.com:19302' }]

export function useWebRTC(socketCallbacks) {
  const localStream = shallowRef(null)
  const remoteStreams = ref(new Map())
  const peers = new Map()

  let pcConfig = { iceServers: ICE_SERVERS }

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

  function createPeer(userId, polite) {
    if (peers.has(userId)) return peers.get(userId)

    const pc = new RTCPeerConnection(pcConfig)
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
    if (!entry) {
      entry = createPeer(userId, false)
    }

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
