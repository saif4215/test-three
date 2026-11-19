/**
 * Creates the first (or an additional) administrator, or resets a password.
 *
 *   npm run admin:create -- --email you@your-domain.org --name "Your Name" --role owner
 *   npm run admin:create -- --email you@your-domain.org --reset
 *
 * The password is read from the ADMIN_PASSWORD environment variable if set, otherwise prompted for with hidden
 * input. It is never accepted as a command-line argument (those end up in shell history and process lists).
 */
import readline from "node:readline";
import { loadEnv } from "./_env";
loadEnv();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const w = rl as unknown as { _writeToOutput: (s: string) => void };
    w._writeToOutput = (s: string) => {
      if (s.includes(question)) process.stdout.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const { closePool, pool } = await import("../src/lib/db");
  const { runMigrations } = await import("../src/lib/migrate");
  const { createAdminUser, findAdminByEmail, setAdminPassword, countAdmins } = await import("../src/lib/admins");
  const { checkPassword } = await import("../src/lib/password-policy");
  await runMigrations(pool());

  const email = arg("email");
  if (!email) throw new Error('Missing --email. Example: npm run admin:create -- --email you@your-domain.org --name "Your Name" --role owner');
  const reset = process.argv.includes("--reset");
  const role = (arg("role") ?? ((await countAdmins()) === 0 ? "owner" : "admin")) as "owner" | "admin" | "staff";
  if (!["owner", "admin", "staff"].includes(role)) throw new Error("--role must be owner, admin or staff");

  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    password = await promptHidden("New password (min 12 characters): ");
    const again = await promptHidden("Repeat password: ");
    if (password !== again) throw new Error("Passwords did not match.");
  }
  const problem = checkPassword(password, email);
  if (problem) throw new Error(problem);

  if (reset) {
    const existing = await findAdminByEmail(email);
    if (!existing) throw new Error(`No administrator with email ${email}.`);
    await setAdminPassword(existing.id, password, false);
    console.log(`Password updated for ${existing.email}. All their sessions were signed out.`);
  } else {
    await createAdminUser({ email, name: arg("name") ?? "", password, role });
    console.log(`Created ${role} account for ${email}. Sign in at /admin/login`);
  }
  await closePool();
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
