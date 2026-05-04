import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Custom hook for WebSocket chat and live location feed.
 *
 * @param {string} url        — WebSocket endpoint (wss://...)
 * @param {object} options
 * @param {boolean} options.enabled      — connect only when true
 * @param {number}  options.reconnectMs  — delay between reconnect attempts (default 3000)
 * @param {number}  options.maxRetries   — max consecutive retries (default 10)
 */
export default function useWebSocket(url, options = {}) {
  const { enabled = true, reconnectMs = 3000, maxRetries = 10 } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const retriesRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const unmountedRef = useRef(false);

  const connect = useCallback(() => {
    if (unmountedRef.current || !enabled || !url) return;

    const token = localStorage.getItem('access_token');
    if (!token) {
      setError('No auth token');
      return;
    }

    // Append JWT as query param for WebSocket auth
    const separator = url.includes('?') ? '&' : '?';
    const wsUrl = `${url}${separator}token=${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmountedRef.current) return;
        setIsConnected(true);
        setError(null);
        retriesRef.current = 0;
      };

      ws.onmessage = (event) => {
        if (unmountedRef.current) return;
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
        } catch {
          setLastMessage({ raw: event.data });
        }
      };

      ws.onerror = () => {
        if (unmountedRef.current) return;
        setError('WebSocket error');
      };

      ws.onclose = (event) => {
        if (unmountedRef.current) return;
        setIsConnected(false);
        wsRef.current = null;

        // Reconnect unless explicitly closed (code 1000) or max retries hit
        if (event.code !== 1000 && retriesRef.current < maxRetries) {
          retriesRef.current += 1;
          reconnectTimerRef.current = setTimeout(connect, reconnectMs);
        }
      };
    } catch (err) {
      setError(err.message);
    }
  }, [url, enabled, reconnectMs, maxRetries]);

  const sendMessage = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      wsRef.current.send(payload);
      return true;
    }
    return false;
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    if (enabled) {
      connect();
    }
    return () => {
      unmountedRef.current = true;
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return { isConnected, lastMessage, error, sendMessage, disconnect };
}
