-- CreateTable
CREATE TABLE "ShareToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "issuedByUserId" TEXT,
    "issuedByLabel" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShareToken_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShareToken_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ShareToken_token_key" ON "ShareToken"("token");

-- CreateIndex
CREATE INDEX "ShareToken_appId_conversationId_idx" ON "ShareToken"("appId", "conversationId");
