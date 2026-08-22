-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_App" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "secretKey" TEXT NOT NULL,
    "orgId" TEXT,
    "webhookUrl" TEXT,
    "preChatFields" TEXT,
    "ticketingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "widgetChatEnabled" BOOLEAN NOT NULL DEFAULT true,
    "teamChatEnabled" BOOLEAN NOT NULL DEFAULT true,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_App" ("createdAt", "id", "name", "orgId", "preChatFields", "publicKey", "secretKey", "teamChatEnabled", "ticketingEnabled", "webhookUrl", "widgetChatEnabled") SELECT "createdAt", "id", "name", "orgId", "preChatFields", "publicKey", "secretKey", "teamChatEnabled", "ticketingEnabled", "webhookUrl", "widgetChatEnabled" FROM "App";
DROP TABLE "App";
ALTER TABLE "new_App" RENAME TO "App";
CREATE UNIQUE INDEX "App_publicKey_key" ON "App"("publicKey");
CREATE UNIQUE INDEX "App_secretKey_key" ON "App"("secretKey");
CREATE UNIQUE INDEX "App_orgId_key" ON "App"("orgId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
