import { io, type Socket } from "socket.io-client";
import { DEFAULT_SERVER_URL } from "./api";

// Keyed by URL, not a single module-level singleton — an embedder (see
// Dashboard.tsx) may point at a different web-chat server than the
// standalone app's build-time default, and a standalone app and an embedded
// one could in principle both be mounted in the same page.
const sockets = new Map<string, Socket>();

export function getSocket(serverUrl: string = DEFAULT_SERVER_URL): Socket {
  let socket = sockets.get(serverUrl);
  if (!socket) {
    socket = io(serverUrl, { transports: ["websocket", "polling"] });
    sockets.set(serverUrl, socket);
  }
  return socket;
}
