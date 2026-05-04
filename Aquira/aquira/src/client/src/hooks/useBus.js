'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  useBus — React hook per il Central Data Bus AQUIRA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Connessione singola condivisa (via BusProvider) al bus ws://host:3000/bus.
 *  Espone:
 *    - connected    {boolean}
 *    - peers        {Array}  lista peer da bus.welcome / bus.peer_joined
 *    - publish(type, payload, to?)  — invia messaggio sul bus
 *    - subscribe(type, handler)     — ascolta un topic (auto-cleanup su unmount)
 *
 *  USO:
 *    const { connected, publish, subscribe } = useBus();
 *
 *    // Inviare un comando alla camera
 *    publish('camera.command', { cmd: 'start', camId: 'cam0', quality: 'high' }, 'cpp');
 *
 *    // Ricevere lo stato camera
 *    useEffect(() => {
 *      return subscribe('camera.status', (payload) => {
 *        console.log('camera status:', payload);
 *      });
 *    }, [subscribe]);
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useContext } from 'react';
import { BusContext }  from './BusProvider';

/**
 * Hook principale — deve essere usato dentro un componente avvolto da <BusProvider>.
 */
export function useBus() {
    const ctx = useContext(BusContext);
    if (!ctx) {
        throw new Error('useBus() deve essere usato dentro <BusProvider>');
    }
    return ctx;
}
