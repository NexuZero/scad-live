import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Custom hook for WebRTC audio calls via the signaling server.
 *
 * @param {string} signalingUrl  — WSS signaling endpoint
 * @param {object} options
 * @param {boolean} options.enabled
 */
export default function useWebRTC(signalingUrl, options = {}) {
  const { enabled = true } = options;

  const [callState, setCallState] = useState('idle'); // idle | connecting | ringing | active | ended
  const [remoteEmployeeId, setRemoteEmployeeId] = useState(null);
  const [error, setError] = useState(null);
  const [turnServers, setTurnServers] = useState([]);

  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const unmountedRef = useRef(false);

  // Incoming call handler — can be overridden via onIncomingCall
  const incomingCallHandlerRef = useRef(null);

  const getRTCConfig = useCallback(() => {
    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      ...turnServers,
    ];
    return {
      iceServers,
      // Enforce DTLS-SRTP
      sdpSemantics: 'unified-plan',
    };
  }, [turnServers]);

  const connectSignaling = useCallback(() => {
    if (unmountedRef.current || !enabled || !signalingUrl) return;

    const token = localStorage.getItem('access_token');
    if (!token) return;

    const separator = signalingUrl.includes('?') ? '&' : '?';
    const wsUrl = `${signalingUrl}${separator}token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setError(null);
    };

    ws.onmessage = async (event) => {
      if (unmountedRef.current) return;
      try {
        const msg = JSON.parse(event.data);
        await handleSignalingMessage(msg);
      } catch (err) {
        setError(`Signaling error: ${err.message}`);
      }
    };

    ws.onerror = () => setError('Signaling connection error');
    ws.onclose = () => {
      if (!unmountedRef.current && enabled) {
        setTimeout(connectSignaling, 5000);
      }
    };
  }, [signalingUrl, enabled]);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(getRTCConfig());

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'ice-candidate',
          candidate: event.candidate,
          target: remoteEmployeeId,
        }));
      }
    };

    pc.ontrack = (event) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallState('active');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        endCall();
      }
    };

    pcRef.current = pc;
    return pc;
  }, [getRTCConfig, remoteEmployeeId]);

  const handleSignalingMessage = useCallback(async (msg) => {
    switch (msg.type) {
      case 'turn-credentials': {
        setTurnServers([{
          urls: msg.urls,
          username: msg.username,
          credential: msg.credential,
        }]);
        break;
      }
      case 'offer': {
        setRemoteEmployeeId(msg.from);
        setCallState('ringing');
        if (incomingCallHandlerRef.current) {
          incomingCallHandlerRef.current(msg.from);
        }
        // Auto-answer for now — can be gated by UI
        const pc = createPeerConnection();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await pc.createAnswer();

        // Enforce DTLS-SRTP by modifying SDP if needed
        answer.sdp = enforceDtlsSrtp(answer.sdp);
        await pc.setLocalDescription(answer);

        wsRef.current?.send(JSON.stringify({
          type: 'answer',
          sdp: pc.localDescription,
          target: msg.from,
        }));
        setCallState('active');
        break;
      }
      case 'answer': {
        if (pcRef.current) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          setCallState('active');
        }
        break;
      }
      case 'ice-candidate': {
        if (pcRef.current && msg.candidate) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
        }
        break;
      }
      case 'call-ended': {
        endCall();
        break;
      }
      default:
        break;
    }
  }, [createPeerConnection]);

  const initiateCall = useCallback(async (employeeId) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Signaling not connected');
      return;
    }

    setRemoteEmployeeId(employeeId);
    setCallState('connecting');

    try {
      const pc = createPeerConnection();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      offer.sdp = enforceDtlsSrtp(offer.sdp);
      await pc.setLocalDescription(offer);

      wsRef.current.send(JSON.stringify({
        type: 'offer',
        sdp: pc.localDescription,
        target: employeeId,
      }));
      setCallState('ringing');
    } catch (err) {
      setError(`Call failed: ${err.message}`);
      setCallState('idle');
    }
  }, [createPeerConnection]);

  const endCall = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN && remoteEmployeeId) {
      wsRef.current.send(JSON.stringify({
        type: 'call-ended',
        target: remoteEmployeeId,
      }));
    }
    setCallState('ended');
    setTimeout(() => setCallState('idle'), 1000);
  }, [remoteEmployeeId]);

  const setOnIncomingCall = useCallback((handler) => {
    incomingCallHandlerRef.current = handler;
  }, []);

  const setRemoteAudioElement = useCallback((element) => {
    remoteAudioRef.current = element;
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    if (enabled) connectSignaling();
    return () => {
      unmountedRef.current = true;
      endCall();
      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
      }
    };
  }, [enabled, connectSignaling]);

  return {
    callState,
    remoteEmployeeId,
    error,
    initiateCall,
    endCall,
    setOnIncomingCall,
    setRemoteAudioElement,
  };
}

/**
 * Ensure SDP enforces DTLS-SRTP by requiring fingerprint-based key exchange.
 * Removes any SDES crypto lines to prevent fallback to non-DTLS.
 */
function enforceDtlsSrtp(sdp) {
  if (!sdp) return sdp;
  // Remove SDES crypto lines — force DTLS only
  return sdp.replace(/a=crypto:.*\r?\n/g, '');
}
