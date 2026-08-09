-- AlterTable
ALTER TABLE "App" ADD COLUMN "preChatFields" TEXT;

-- CreateTable
CREATE TABLE "PlatformUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "role" TEXT,
    "verifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlatformUser_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResponderGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResponderGroup_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoutingRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appId" TEXT NOT NULL,
    "matchRole" TEXT NOT NULL,
    "responderGroupId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoutingRule_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RoutingRule_responderGroupId_fkey" FOREIGN KEY ("responderGroupId") REFERENCES "ResponderGroup" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "visitorId" TEXT NOT NULL,
    "visitorName" TEXT,
    "visitorEmail" TEXT,
    "initialContextId" TEXT,
    "assignedAgentId" TEXT,
    "verifiedUserId" TEXT,
    "responderGroupId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Conversation_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Conversation_verifiedUserId_fkey" FOREIGN KEY ("verifiedUserId") REFERENCES "PlatformUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Conversation_responderGroupId_fkey" FOREIGN KEY ("responderGroupId") REFERENCES "ResponderGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Conversation" ("appId", "assignedAgentId", "createdAt", "id", "initialContextId", "status", "updatedAt", "visitorEmail", "visitorId", "visitorName") SELECT "appId", "assignedAgentId", "createdAt", "id", "initialContextId", "status", "updatedAt", "visitorEmail", "visitorId", "visitorName" FROM "Conversation";
DROP TABLE "Conversation";
ALTER TABLE "new_Conversation" RENAME TO "Conversation";
CREATE INDEX "Conversation_appId_status_idx" ON "Conversation"("appId", "status");
CREATE INDEX "Conversation_appId_responderGroupId_idx" ON "Conversation"("appId", "responderGroupId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PlatformUser_appId_role_idx" ON "PlatformUser"("appId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformUser_appId_externalId_key" ON "PlatformUser"("appId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ResponderGroup_appId_key_key" ON "ResponderGroup"("appId", "key");

-- CreateIndex
CREATE INDEX "RoutingRule_appId_matchRole_idx" ON "RoutingRule"("appId", "matchRole");
