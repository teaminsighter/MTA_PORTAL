import { redirect } from "next/navigation";
import { AlertOctagon, LogIn } from "lucide-react";
import { auth, signIn } from "@/lib/auth";

/*
 * Sign-in page. Neumorphic on the same warm-neutral surface as the rest
 * of the app so the brand feel is present before authentication.
 *
 * If already signed in, redirect to the origin the middleware tried to
 * reach (`?from=…`) or to /inbox.
 *
 * Sign-in errors from Auth.js surface as `?error=…`. The common one is
 * `AccessDenied` — returned when the email isn't in the users allowlist
 * or is inactive — and gets a plain-English hint below the button.
 */

interface Props {
  searchParams: Promise<{ from?: string; error?: string }>;
}

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: Props) {
  const { from, error } = await searchParams;
  const session = await auth();
  if (session?.user) {
    redirect(from && from.startsWith("/") ? from : "/inbox");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="neu-raised p-8 w-full max-w-md flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="neu-raised-sm h-10 w-10 flex items-center justify-center">
            <span className="accent-text font-bold t-section">M</span>
          </div>
          <div className="flex flex-col">
            <span className="accent-text font-bold t-section leading-none">
              MTA
            </span>
            <span className="t-caption text-text-muted leading-tight">
              Consultant portal
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="t-section">Sign in</h1>
          <p className="t-body text-text-muted">
            Sign in with your Google account. Access is limited to the MTA
            team allowlist.
          </p>
        </div>

        {error ? <SignInError code={error} /> : null}

        <form
          action={async () => {
            "use server";
            const redirectTo =
              from && from.startsWith("/") ? from : "/inbox";
            await signIn("google", { redirectTo });
          }}
        >
          <button
            type="submit"
            className="btn-accent-glass w-full justify-center"
          >
            <LogIn size={16} />
            Continue with Google
          </button>
        </form>

        <p className="t-caption text-text-subtle">
          Your Google email must be verified and pre-approved. If you were
          just added, ask the admin to activate your account.
        </p>
      </div>
    </main>
  );
}

/*
 * Auth.js standard error codes that a sign-in flow can surface. Anything
 * unrecognised is treated as a generic failure.
 */
function SignInError({ code }: { code: string }) {
  const msg =
    code === "AccessDenied"
      ? "Your Google account isn't on the allowlist, or it's marked inactive. Ask an admin to add you."
      : code === "OAuthCallbackError" || code === "OAuthSignInError"
        ? "Google sign-in didn't complete. Try again; if it persists, check the OAuth credentials."
        : "Sign-in failed. Please try again.";

  return (
    <div
      role="alert"
      className="neu-inset-sm p-3 flex items-start gap-3 text-danger"
    >
      <AlertOctagon size={16} className="mt-0.5 shrink-0" />
      <span className="t-body">{msg}</span>
    </div>
  );
}
