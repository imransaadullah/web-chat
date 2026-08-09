/*
  Warnings:

  - Added the required column `updatedAt` to the `Ticket` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Message" ADD COLUMN "attachmentName" TEXT;
ALTER TABLE "Message" ADD COLUMN "attachmentSize" INTEGER;
ALTER TABLE "Message" ADD COLUMN "attachmentType" TEXT;
ALTER TABLE "Message" ADD COLUMN "attachmentUrl" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_App" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "secretKey" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "preChatFields" TEXT,
    "ticketingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "widgetChatEnabled" BOOLEAN NOT NULL DEFAULT true,
    "teamChatEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_App" ("createdAt", "id", "name", "preChatFields", "publicKey", "secretKey", "webhookUrl") SELECT "createdAt", "id", "name", "preChatFields", "publicKey", "secretKey", "webhookUrl" FROM "App";
DROP TABLE "App";
ALTER TABLE "new_App" RENAME TO "App";
CREATE UNIQUE INDEX "App_publicKey_key" ON "App"("publicKey");
CREATE UNIQUE INDEX "App_secretKey_key" ON "App"("secretKey");
CREATE TABLE "new_Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "externalRef" TEXT,
    "externalUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Ticket_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Ticket" ("conversationId", "createdAt", "updatedAt", "externalRef", "externalUrl", "id", "title") SELECT "conversationId", "createdAt", "createdAt", "externalRef", "externalUrl", "id", "title" FROM "Ticket";
DROP TABLE "Ticket";
ALTER TABLE "new_Ticket" RENAME TO "Ticket";
CREATE UNIQUE INDEX "Ticket_conversationId_key" ON "Ticket"("conversationId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
