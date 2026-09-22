import { io, type Socket } from 'socket.io-client';

/**
 * Connects to the live-session server. Socket.IO reconnects by itself after a
 * dropped connection (locked screen, Wi-Fi hiccup); the server then sends the
 * current state again.
 */
export function connectLive(auth: Record<string, unknown>): Socket {
  return io({ auth, reconnectionDelayMax: 4000 });
}

/** Server clock minus this device's clock, from the quickest of a few round trips. */
export async function measureOffset(socket: Socket): Promise<number> {
  let best = { roundTrip: Infinity, offset: 0 };
  for (let i = 0; i < 3; i++) {
    const sent = Date.now();
    const serverNow = (await socket.timeout(3000).emitWithAck('clock')) as number;
    const roundTrip = Date.now() - sent;
    if (roundTrip < best.roundTrip) best = { roundTrip, offset: serverNow - (sent + roundTrip / 2) };
  }
  return best.offset;
}
