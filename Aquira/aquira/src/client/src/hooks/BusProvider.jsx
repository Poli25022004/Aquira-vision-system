/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BusProvider — Connessione condivisa al Central Data Bus AQUIRA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Una sola connessione WebSocket per tutta l'app (condivisa via Context).
 *  I componenti figli accedono al bus tramite useBus().
 *
 *  Funzionalità:
 *    - Riconnessione automatica con backoff esponenziale + jitter
 *    - Handshake join con role 'dashboard'
 *    - Queue messaggi offline — inviati non appena si riconnette
 *    - Dispatch topic-based con wildcard '*'
 *    - Stato: connected | error | reconnecting
 *    - Ping client-side per rilevare connessione silenziosamente morta
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, {
    createContext,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';

const BUS_URL           = 'ws://localhost:3000/bus';
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS  = 30_000;
const DASHBOARD_ROLE    = 'dashboard';
const DASHBOARD_ID      = `dash-${Math.random().toString(36).slice(2, 8)}`;

// Ping client-side ogni 20s per rilevare connessioni zombie
const CLIENT_PING_INTERVAL = 20_000;
const CLIENT_PONG_TIMEOUT  = 5_000;

export const BusContext = createContext(null);

/** Backoff con jitter: evita thundering herd dopo riavvio server */
function nextBackoff(current) {
    const doubled = Math.min(current * 2, RECONNECT_MAX_MS);
    // ±20% jitter
    const jitter = doubled * 0.2 * (Math.random() * 2 - 1);
    return Math.round(doubled + jitter);
}

export function BusProvider({ children }) {
    const wsRef           = useRef(null);
    const handlersRef     = useRef({});   // { [type]: Set<handler> }
    const sendQueueRef    = useRef([]);   // messaggi in attesa di connessione
    const reconnectTimer  = useRef(null);
    const pingTimer       = useRef(null);
    const pongTimer       = useRef(null);
    const backoffRef      = useRef(RECONNECT_BASE_MS);
    const mountedRef      = useRef(true);
    const connectingRef   = useRef(false); // evita doppie connessioni parallele

    const [connected,     setConnected]     = useState(false);
    const [peers,         setPeers]         = useState([]);
    const [reconnecting,  setReconnecting]  = useState(false);
    const [lastError,     setLastError]     = useState(null);

    // ── Dispatch interno ─────────────────────────────────────────────────────

    const dispatch = useCallback((msg) => {
        // Topic specifico
        const specific = handlersRef.current[msg.type];
        if (specific) {
            specific.forEach(h => {
                try { h(msg.payload, msg); } catch (e) { console.error('[Bus] handler error:', e); }
            });
        }
        // Wildcard
        const wildcards = handlersRef.current['*'];
        if (wildcards) {
            wildcards.forEach(h => {
                try { h(msg.payload, msg); } catch (e) { console.error('[Bus] wildcard error:', e); }
            });
        }
    }, []);

    // ── Ping client-side ─────────────────────────────────────────────────────

    const stopPing = useCallback(() => {
        clearInterval(pingTimer.current);
        clearTimeout(pongTimer.current);
        pingTimer.current  = null;
        pongTimer.current  = null;
    }, []);

    const startPing = useCallback((ws) => {
        stopPing();
        // Invia un ping applicativo ogni CLIENT_PING_INTERVAL.
        // Se il server non risponde entro CLIENT_PONG_TIMEOUT forziamo riconnessione.
        // Usiamo un ping applicativo (type:'ping') perché i browser non espongono
        // il ping WebSocket nativo — solo il server lo può inviare.
        pingTimer.current = setInterval(() => {
            if (!ws || ws.readyState !== WebSocket.OPEN) return;
            try { ws.send(JSON.stringify({ type: 'ping' })); } catch { return; }
            pongTimer.current = setTimeout(() => {
                console.warn('[Bus] Ping timeout — connessione zombie, forzo chiusura');
                try { ws.close(4000, 'ping timeout'); } catch {}
            }, CLIENT_PONG_TIMEOUT);
        }, CLIENT_PING_INTERVAL);
    }, [stopPing]);

    // ── Connessione ──────────────────────────────────────────────────────────

    const connect = useCallback(() => {
        if (!mountedRef.current) return;
        if (connectingRef.current) return;
        if (wsRef.current?.readyState <= WebSocket.OPEN) return;

        connectingRef.current = true;
        let ws;
        try {
            ws = new WebSocket(BUS_URL);
        } catch (err) {
            connectingRef.current = false;
            setLastError(err.message);
            return;
        }
        wsRef.current = ws;

        ws.onopen = () => {
            if (!mountedRef.current) { ws.close(); return; }
            connectingRef.current = false;
            backoffRef.current    = RECONNECT_BASE_MS;
            setReconnecting(false);
            setLastError(null);

            // Handshake join
            ws.send(JSON.stringify({ type: 'join', role: DASHBOARD_ROLE, id: DASHBOARD_ID }));

            // Avvia ping client-side
            startPing(ws);

            // Flush coda messaggi offline
            const queue = sendQueueRef.current.splice(0);
            queue.forEach(m => {
                try { ws.send(JSON.stringify(m)); } catch { /* ignora */ }
            });
        };

        ws.onmessage = (evt) => {
            if (!mountedRef.current) return;
            // Qualsiasi messaggio dal server = connessione viva
            clearTimeout(pongTimer.current);

            let msg;
            try { msg = JSON.parse(evt.data); } catch { return; }

            switch (msg.type) {
                case 'pong':
                    clearTimeout(pongTimer.current);
                    return;

                case 'bus.welcome':
                    setConnected(true);
                    setPeers(msg.payload?.peers || []);
                    return;

                case 'bus.peer_joined':
                    setPeers(prev => {
                        // evita duplicati
                        const exists = prev.some(p => p.role === msg.payload?.role && p.id === msg.payload?.id);
                        return exists ? prev : [...prev, msg.payload];
                    });
                    return;

                case 'bus.peer_left':
                    setPeers(prev => prev.filter(
                        p => !(p.role === msg.payload?.role && p.id === msg.payload?.id)
                    ));
                    return;

                case 'bus.error':
                    console.warn('[Bus] Server error:', msg.payload);
                    return;

                default:
                    dispatch(msg);
            }
        };

        ws.onclose = (evt) => {
            connectingRef.current = false;
            stopPing();
            setConnected(false);
            setPeers([]);
            wsRef.current = null;

            if (!mountedRef.current) return;

            const cleanClose = evt.code === 1000 || evt.code === 1001;
            if (cleanClose) return; // shutdown volontario — non riconnettersi

            setReconnecting(true);
            const delay = backoffRef.current;
            backoffRef.current = nextBackoff(delay);
            console.log(`[Bus] Disconnesso (code=${evt.code}). Riconnessione in ${delay}ms…`);
            reconnectTimer.current = setTimeout(connect, delay);
        };

        ws.onerror = (err) => {
            connectingRef.current = false;
            const msg = err?.message || 'connection error';
            setLastError(msg);
            console.warn('[Bus] WS error:', msg);
            // onclose seguirà automaticamente
        };
    }, [dispatch, startPing, stopPing]);

    // ── Montaggio / smontaggio ────────────────────────────────────────────────

    useEffect(() => {
        mountedRef.current = true;
        connect();
        return () => {
            mountedRef.current = false;
            clearTimeout(reconnectTimer.current);
            stopPing();
            const ws = wsRef.current;
            if (ws) {
                ws.close(1000, 'component unmount');
                wsRef.current = null;
            }
        };
    }, [connect, stopPing]);

    // ── API pubblica ──────────────────────────────────────────────────────────

    /**
     * Invia un messaggio sul bus.
     * Se il WebSocket non è connesso, accoda per l'invio alla prossima connessione.
     */
    const publish = useCallback((type, payload, to = null) => {
        const msg = { type, payload, ...(to ? { to } : {}) };
        const ws  = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify(msg)); } catch { sendQueueRef.current.push(msg); }
        } else {
            // Max 50 messaggi in coda (evita memory leak se offline a lungo)
            if (sendQueueRef.current.length < 50) {
                sendQueueRef.current.push(msg);
            }
        }
    }, []);

    /**
     * Registra un handler per un topic.
     * Restituisce la funzione di cleanup — usare nel return di useEffect.
     */
    const subscribe = useCallback((type, handler) => {
        if (!handlersRef.current[type]) {
            handlersRef.current[type] = new Set();
        }
        handlersRef.current[type].add(handler);
        return () => {
            handlersRef.current[type]?.delete(handler);
            if (handlersRef.current[type]?.size === 0) {
                delete handlersRef.current[type];
            }
        };
    }, []);

    // ── Context value ─────────────────────────────────────────────────────────

    const value = {
        connected,
        reconnecting,
        lastError,
        peers,
        publish,
        subscribe,
    };

    return (
        <BusContext.Provider value={value}>
            {children}
        </BusContext.Provider>
    );
}
