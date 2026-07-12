import { redirect } from "next/navigation";

// The login form lives on the root route ("/"). Keep /login working by
// forwarding to it so there is a single sign-in page.
export default function LoginRedirectPage() {
  redirect("/");
}
