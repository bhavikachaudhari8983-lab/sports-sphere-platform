// Creates the first super admin on a fresh production database (or promotes an existing staff account).
// The password comes from an environment variable so it never appears in the shell history or process list:
//   SUPER_ADMIN_PASSWORD='a long passphrase' npm run staff:super-admin -- director@mitwpu.edu.in "Director of Sports"
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { audit } from "../src/lib/audit";

async function main() {
  const [emailArg, ...nameParts] = process.argv.slice(2);
  const email = emailArg?.trim().toLowerCase();
  const name = nameParts.join(" ").trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Usage: npm run staff:super-admin -- <email> "<full name>"');

  const existing = await prisma.staffUser.findUnique({ where: { email } });
  if (existing) {
    await prisma.staffUser.update({ where: { email }, data: { role: "SUPER_ADMIN", active: true } });
    await audit({ actor: { type: "SYSTEM" }, action: "STAFF_CHANGED", summary: `Staff ${email} promoted to super admin (command line)` });
    console.log(`${email} is now a super admin.`);
    return;
  }
  const password = process.env.SUPER_ADMIN_PASSWORD ?? "";
  if (!name) throw new Error('Give the full name for a new account: npm run staff:super-admin -- <email> "<full name>"');
  if (password.length < 12) throw new Error("Set SUPER_ADMIN_PASSWORD to a password of at least 12 characters.");
  await prisma.staffUser.create({ data: { email, name, role: "SUPER_ADMIN", passwordHash: await bcrypt.hash(password, 12) } });
  await audit({ actor: { type: "SYSTEM" }, action: "STAFF_CHANGED", summary: `Super admin account created: ${email} (command line)` });
  console.log(`Super admin ${email} created. Sign in at /staff/login.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
