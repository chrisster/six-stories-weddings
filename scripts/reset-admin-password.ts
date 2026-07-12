/**
 * One-off admin password reset using the Supabase service-role key.
 *
 * Usage (run in your own terminal so secrets never leave your machine):
 *
 *   export NEXT_PUBLIC_SUPABASE_URL='https://<your-project>.supabase.co'
 *   export SUPABASE_SERVICE_ROLE_KEY='<service_role key from Supabase → Settings → API>'
 *   npx tsx scripts/reset-admin-password.ts sixstoriesstudio@gmail.com
 *
 * You will be prompted for the new password (input is hidden). Nothing is
 * printed except a success/failure message.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRole) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email) {
  console.error("Usage: tsx scripts/reset-admin-password.ts <email>");
  process.exit(1);
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    stdout.write(question);
    stdin.resume();
    if (stdin.isTTY) stdin.setRawMode(true);

    let input = "";
    const onData = (chunk: Buffer) => {
      const char = chunk.toString("utf8");
      if (char === "\n" || char === "\r" || char === "\u0004") {
        if (stdin.isTTY) stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        stdout.write("\n");
        resolve(input);
      } else if (char === "\u0003") {
        // Ctrl-C
        stdout.write("\n");
        process.exit(1);
      } else if (char === "\u007f" || char === "\b") {
        input = input.slice(0, -1);
      } else {
        input += char;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const supabase = createClient(url!, serviceRole!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let user: { id: string; email?: string } | null = null;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => (u.email || "").toLowerCase() === email);
    if (match) {
      user = match;
      break;
    }
    if (data.users.length < 200) break;
  }

  if (!user) {
    console.error(`No auth user found for ${email}.`);
    process.exit(1);
  }

  const password =
    process.env.NEW_PASSWORD && process.env.NEW_PASSWORD.length >= 8
      ? process.env.NEW_PASSWORD
      : await promptHidden("New password (min 8 chars, hidden): ");

  if (!password || password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
  });

  if (error) {
    console.error(`Failed to update password: ${error.message}`);
    process.exit(1);
  }

  console.log(`Password updated for ${email}. You can sign in now.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
