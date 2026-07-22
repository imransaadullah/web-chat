import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";

let io: SocketIOServer | undefined;

export function initRealtime(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    // Widget joins its own conversation's room once it has a conversationId.
    // Dashboard joins the app-wide room to hear about *new* conversations.
    socket.on("join:conversation", (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
    });
    socket.on("join:app", (appId: string) => {
      socket.join(`app:${appId}`);
    });
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error("Realtime server not initialized yet");
  return io;
}

/** Emit a new message to everyone watching this conversation. */
export function emitMessage(conversationId: string, message: unknown) {
  getIO().to(`conversation:${conversationId}`).emit("message:new", message);
}

/** Emit a new conversation to the app-wide room (dashboard inbox). */
export function emitConversation(appId: string, conversation: unknown) {
  getIO().to(`app:${appId}`).emit("conversation:new", conversation);
}

/** Emit a conversation update (status change, assignment, ticket, etc). */
export function emitConversationUpdate(appId: string, conversation: unknown) {
  getIO()
    .to(`app:${appId}`)
    .emit("conversation:update", conversation);
}
