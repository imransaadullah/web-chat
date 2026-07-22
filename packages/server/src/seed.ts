import "dotenv/config";
import { nanoid } from "nanoid";
import { prisma } from "./db.js";

async function main() {
  const app = await prisma.app.create({
    data: {
      name: "Demo App",
      publicKey: `pk_${nanoid(24)}`,
      secretKey: `sk_${nanoid(32)}`,
    },
  });

  console.log("Seeded demo app:\n");
  console.log(`  appId:      ${app.id}`);
  console.log(`  publicKey:  ${app.publicKey}   (use in the widget snippet)`);
  console.log(`  secretKey:  ${app.secretKey}   (use in the dashboard / webhooks — keep secret)`);
  console.log("\nPaste the publicKey into packages/dashboard's login and the widget demo page.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
