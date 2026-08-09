import type { PlatformUser } from "@prisma/client";
import type { VerifiedIdentityPayload } from "@web-chat/shared";
import { prisma } from "./db.js";

/**
 * Upserts the PlatformUser for a verified identity (lazy directory — no
 * bulk sync, see PlatformUser in schema.prisma) and resolves which
 * responder group, if any, a RoutingRule sends their role to.
 */
export async function resolveVerifiedUser(
  appId: string,
  identity: VerifiedIdentityPayload,
): Promise<{ user: PlatformUser; responderGroupId: string | null }> {
  const user = await prisma.platformUser.upsert({
    where: { appId_externalId: { appId, externalId: identity.userId } },
    create: {
      appId,
      externalId: identity.userId,
      name: identity.name,
      email: identity.email,
      role: identity.role,
    },
    update: {
      name: identity.name,
      email: identity.email,
      role: identity.role,
      verifiedAt: new Date(),
    },
  });

  let responderGroupId: string | null = null;
  if (identity.role) {
    const rule = await prisma.routingRule.findFirst({
      where: { appId, matchRole: identity.role },
      orderBy: { priority: "desc" },
    });
    responderGroupId = rule?.responderGroupId ?? null;
  }

  return { user, responderGroupId };
}
