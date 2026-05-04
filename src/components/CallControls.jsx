import React, { useRef, useEffect } from 'react';

/**
 * Voice call controls bound to a specific researcher.
 * Uses the useWebRTC hook for WebRTC audio calls via Coturn STUN/TURN.
 *
 * Props:
 *  - researcher: { employee_id, researcher_name }
 *  - webrtc: { callState, initiateCall, endCall, setRemoteAudioElement, remoteEmployeeId, error }
 */
export default function CallControls({ researcher, webrtc }) {
  const audioRef = useRef(null);
  const {
    callState,
    remoteEmployeeId,
    error,
    initiateCall,
    endCall,
    setRemoteAudioElement,
  } = webrtc;

  // Bind remote audio element
  useEffect(() => {
    if (audioRef.current) {
      setRemoteAudioElement(audioRef.current);
    }
  }, [setRemoteAudioElement]);

  const isInCall = callState === 'active' || callState === 'ringing' || callState === 'connecting';
  const isCallWithThisResearcher = remoteEmployeeId === researcher.employee_id;

  const handleCall = () => {
    if (isInCall) {
      endCall();
    } else {
      initiateCall(researcher.employee_id);
    }
  };

  const getStatusText = () => {
    if (!isCallWithThisResearcher && isInCall) {
      return 'In call with another researcher';
    }
    switch (callState) {
      case 'connecting': return 'Connecting...';
      case 'ringing': return 'Ringing...';
      case 'active': return 'Call active';
      case 'ended': return 'Call ended';
      default: return 'Ready';
    }
  };

  const getButtonStyle = () => {
    if (isInCall && isCallWithThisResearcher) return styles.endBtn;
    if (isInCall && !isCallWithThisResearcher) return styles.disabledBtn;
    return styles.callBtn;
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <strong>Voice Call</strong>
        <span style={styles.statusText}>{getStatusText()}</span>
      </div>

      <div style={styles.controls}>
        <button
          onClick={handleCall}
          disabled={isInCall && !isCallWithThisResearcher}
          style={getButtonStyle()}
        >
          {isInCall && isCallWithThisResearcher ? 'End Call' : 'Call'}
        </button>

        {callState === 'active' && isCallWithThisResearcher && (
          <div style={styles.activeIndicator}>
            <span style={styles.pulseDot} />
            <span style={styles.callTimer}>
              {researcher.researcher_name || researcher.employee_id}
            </span>
          </div>
        )}
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {/* Hidden audio element for remote audio playback */}
      <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />
    </div>
  );
}

const styles = {
  container: {
    padding: '12px 16px',
    borderTop: '1px solid #eee',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
    fontSize: '13px',
  },
  statusText: {
    fontSize: '11px',
    color: '#888',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  callBtn: {
    padding: '8px 24px',
    backgroundColor: '#4caf50',
    color: '#fff',
    border: 'none',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  endBtn: {
    padding: '8px 24px',
    backgroundColor: '#f44336',
    color: '#fff',
    border: 'none',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  disabledBtn: {
    padding: '8px 24px',
    backgroundColor: '#ccc',
    color: '#666',
    border: 'none',
    borderRadius: '20px',
    fontSize: '13px',
    cursor: 'not-allowed',
  },
  activeIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  pulseDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#4caf50',
    animation: 'pulse 1.5s infinite',
  },
  callTimer: {
    fontSize: '12px',
    color: '#333',
  },
  error: {
    marginTop: '8px',
    padding: '6px 8px',
    backgroundColor: '#fdecea',
    color: '#b71c1c',
    borderRadius: '4px',
    fontSize: '12px',
  },
};
