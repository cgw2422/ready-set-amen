import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

/**
 * A server component on purpose. Reading the query string here — rather than
 * with useSearchParams inside the form — keeps the form in the server-rendered
 * HTML. It is the front door of the app, often opened on a bad connection, so
 * it should not need JavaScript to appear.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; invite?: string }>;
}) {
  const { reset, invite } = await searchParams;
  return <LoginForm justReset={reset === "1"} invite={invite ?? ""} />;
}
