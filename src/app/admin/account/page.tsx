import { AccountPasswordForm } from "@/components/admin/account-password-form";

export default function AccountPage() {
  return (
    <div className="space-y-6">
      <section className="soft-panel p-5">
        <p className="text-xs tracking-[0.25em] text-muted-foreground uppercase">Account</p>
        <h2 className="title-cinematic mt-2 text-3xl font-semibold">Change password</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Set a new password for your Six Stories Studio login.
        </p>
        <AccountPasswordForm />
      </section>
    </div>
  );
}
