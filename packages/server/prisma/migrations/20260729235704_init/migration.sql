-- CreateTable
CREATE TABLE "ConversationParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'support',
    "status" TEXT NOT NULL DEFAULT 'open',
    "visitorId" TEXT,
    "visitorName" TEXT,
    "visitorEmail" TEXT,
    "initialContextId" TEXT,
    "assignedAgentId" TEXT,
    "verifiedUserId" TEXT,
    "responderGroupId" TEXT,
    "title" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Conversation_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Conversation_verifiedUserId_fkey" FOREIGN KEY ("verifiedUserId") REFERENCES "PlatformUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Conversation_responderGroupId_fkey" FOREIGN KEY ("responderGroupId") REFERENCES "ResponderGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Conversation" ("appId", "assignedAgentId", "createdAt", "id", "initialContextId", "responderGroupId", "status", "updatedAt", "verifiedUserId", "visitorEmail", "visitorId", "visitorName") SELECT "appId", "assignedAgentId", "createdAt", "id", "initialContextId", "responderGroupId", "status", "updatedAt", "verifiedUserId", "visitorEmail", "visitorId", "visitorName" FROM "Conversation";
DROP TABLE "Conversation";
ALTER TABLE "new_Conversation" RENAME TO "Conversation";
CREATE INDEX "Conversation_appId_status_idx" ON "Conversation"("appId", "status");
CREATE INDEX "Conversation_appId_responderGroupId_idx" ON "Conversation"("appId", "responderGroupId");
CREATE INDEX "Conversation_appId_kind_idx" ON "Conversation"("appId", "kind");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ConversationParticipant_userId_idx" ON "ConversationParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationParticipant_conversationId_userId_key" ON "ConversationParticipant"("conversationId", "userId");
