import { OWNER_EMAIL } from "../src/lib/admin/env";
import { createServiceClient } from "../src/lib/admin/supabase";

const service = createServiceClient();
const email = OWNER_EMAIL;

async function findUserId(target: string): Promise<string | null> {
  for (let page = 1; page <= 10; page += 1) {
    const listed = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (listed.error) throw listed.error;
    const found = listed.data.users.find((user) => user.email?.toLowerCase() === target);
    if (found) return found.id;
    if (listed.data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  let userId = await findUserId(email);
  if (!userId) {
    const password = process.env.OWNER_PASSWORD?.trim() ?? "";
    if (password.length < 8) {
      console.error(`Create ${email} in the Supabase dashboard, set a password there, then run this again.`);
      console.error("For local setup only, you can set OWNER_PASSWORD in .env.local and this script will create the user.");
      process.exit(1);
    }
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) {
      console.error(created.error?.message ?? "Could not create the owner.");
      process.exit(1);
    }
    userId = created.data.user.id;
    console.log(`Created ${email}. The password is only in Supabase.`);
  }

  const saved = await service.from("admin_users").upsert({ user_id: userId }, { onConflict: "user_id" });
  if (saved.error) {
    console.error(saved.error.message);
    process.exit(1);
  }
  console.log(`Allowlisted ${email}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Could not allowlist the owner.");
  process.exit(1);
});
