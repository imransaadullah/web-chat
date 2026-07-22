import { io, type Socket } from "socket.io-client";
import { SERVER_URL } from "./api";

let socket: Socket | undefined;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SERVER_URL, { transports: ["websocket", "polling"] });
  }
  return socket;
}
