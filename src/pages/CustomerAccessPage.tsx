import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import Reveal from "@/components/storefront/Reveal";
import { getRuntimeContext } from "@/lib/theme-assets";
import { buildCustomerAccessPath, useCustomerAuth } from "@/lib/customer-auth";
import { isAuthConfigured } from "@/services/customer-auth";

function resolveNextTarget(rawNext: string | null): string {
  const next = String(rawNext || "").trim();
  if (!next) {
    return "/";
  }

  if (/^https?:\/\//i.test(next)) {
    return next;
  }

  return next.startsWith("/") ? next : "/";
}

const ACCESS_CONTENT = {
  checkout: {
    eyebrow: "Secure checkout access",
    title: "Sign in before checkout",
    subtitle: "Use your SALT account to continue into the protected checkout flow.",
  },
  orders: {
    eyebrow: "Order history access",
    title: "Sign in to view orders",
    subtitle: "Your order timeline is available after customer login.",
  },
  account: {
    eyebrow: "Customer account",
    title: "Sign in or create an account",
    subtitle: "Use your SALT account to sync your cart and protect order access.",
  },
} as const;

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

const signupSchema = z
  .object({
    firstName: z.string().min(1, "First name is required.").max(48),
    lastName: z.string().max(64).optional(),
    email: z.string().email("Enter a valid email address."),
    password: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string().min(8, "Confirm your password."),
    consent: z.literal(true, {
      errorMap: () => ({ message: "Consent is required to continue." }),
    }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

const CustomerAccessPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, signup, isAuthenticated, logout } = useCustomerAuth();
  const runtimeContext = getRuntimeContext();
  const [authError, setAuthError] = useState<string | null>(null);
  const baseAuthConfigured = isAuthConfigured();

  const pathname = location.pathname.toLowerCase();
  const modeFromPath = pathname === "/signup" || pathname === "/register" ? "signup" : "login";
  const mode = searchParams.get("mode") === "signup" ? "signup" : modeFromPath;
  const reasonParam = searchParams.get("reason");
  const reason = reasonParam === "checkout" || reasonParam === "orders" ? reasonParam : "account";
  const nextTarget = resolveNextTarget(searchParams.get("next"));
  const content = ACCESS_CONTENT[reason];

  const privacyHref = runtimeContext.privacyPolicyUrl || "/policies/privacy-policy";
  const termsHref = runtimeContext.contactPolicyUrl || "/policies/terms-of-service";

  const returnToNext = () => {
    if (/^https?:\/\//i.test(nextTarget)) {
      window.location.assign(nextTarget);
      return;
    }

    navigate(nextTarget, { replace: true });
  };

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
    mode: "onBlur",
  });

  const signupForm = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
      consent: false,
    },
    mode: "onBlur",
  });

  const activeForm = mode === "signup" ? signupForm : loginForm;
  const isSubmitting = activeForm.formState.isSubmitting;
  const errors = activeForm.formState.errors;

  const onLogin = loginForm.handleSubmit(async (values) => {
    setAuthError(null);
    if (!baseAuthConfigured) {
      setAuthError("Auth backend is not configured.");
      return;
    }
    try {
      await login(values.email, values.password);
      returnToNext();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to sign in right now.");
    }
  });

  const onSignup = signupForm.handleSubmit(async (values) => {
    setAuthError(null);
    if (!baseAuthConfigured) {
      setAuthError("Auth backend is not configured.");
      return;
    }
    try {
      const session = await signup({
        email: values.email,
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName || undefined,
        consent: values.consent,
      });
      if (session.pendingConfirmation) {
        setAuthError("Check your email to confirm the account, then sign in.");
        return;
      }
      returnToNext();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to create the account right now.");
    }
  });

  const helperText = useMemo(() => {
    if (reason === "checkout") {
      return "Sign in to continue into the secure checkout flow.";
    }
    if (reason === "orders") {
      return "Sign in to view your saved orders and account history.";
    }
    return "Sign in or create an account to continue.";
  }, [reason]);

  return (
    <section className="mx-auto mt-8 w-[min(760px,94vw)] pb-12 sm:mt-10">
      <Reveal>
        <div className="salt-panel-shell rounded-[1.8rem] p-5 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                {content.eyebrow}
              </p>
              <h1 className="mt-2 font-display text-[clamp(2.1rem,5vw,3.4rem)] leading-[0.94]">
                {content.title}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                {content.subtitle}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-border/70 bg-card/75 p-1.5 text-[0.72rem] uppercase tracking-[0.14em]">
              <Link
                to={buildCustomerAccessPath({ mode: "login", next: nextTarget, reason })}
                className={`px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                  mode === "login"
                    ? "rounded-full bg-[hsl(var(--salt-ink))] text-white"
                    : "text-muted-foreground"
                }`}
              >
                Login
              </Link>
              <Link
                to={buildCustomerAccessPath({ mode: "signup", next: nextTarget, reason })}
                className={`px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                  mode === "signup"
                    ? "rounded-full bg-[hsl(var(--salt-ink))] text-white"
                    : "text-muted-foreground"
                }`}
              >
                Sign up
              </Link>
            </div>
          </div>

          <div className="mt-6 rounded-[1.4rem] border border-border/70 bg-background/85 p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {helperText}
            </p>

            {authError ? (
              <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {authError}
              </p>
            ) : null}

            {mode === "login" ? (
              <form onSubmit={onLogin} className="mt-4 grid gap-4">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Email
                  </label>
                  <input
                    type="email"
                    {...loginForm.register("email")}
                    placeholder="name@email.com"
                    className="salt-form-control mt-2 h-12 w-full rounded-full bg-card/90 px-4 text-sm"
                  />
                  {errors.email ? (
                    <p className="mt-2 text-xs text-destructive">{errors.email.message as string}</p>
                  ) : null}
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Password
                  </label>
                  <input
                    type="password"
                    {...loginForm.register("password")}
                    placeholder="Enter your password"
                    className="salt-form-control mt-2 h-12 w-full rounded-full bg-card/90 px-4 text-sm"
                  />
                  {errors.password ? (
                    <p className="mt-2 text-xs text-destructive">{errors.password.message as string}</p>
                  ) : null}
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="salt-primary-cta h-12 justify-center px-6 text-[0.7rem] font-semibold uppercase tracking-[0.16em]"
                >
                  {isSubmitting ? "Signing in" : "Continue"}
                </button>
              </form>
            ) : (
              <form onSubmit={onSignup} className="mt-4 grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      First name
                    </label>
                    <input
                      type="text"
                      {...signupForm.register("firstName")}
                      placeholder="First name"
                      className="salt-form-control mt-2 h-12 w-full rounded-full bg-card/90 px-4 text-sm"
                    />
                    {errors.firstName ? (
                      <p className="mt-2 text-xs text-destructive">
                        {errors.firstName.message as string}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Last name
                    </label>
                    <input
                      type="text"
                      {...signupForm.register("lastName")}
                      placeholder="Last name"
                      className="salt-form-control mt-2 h-12 w-full rounded-full bg-card/90 px-4 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Email
                  </label>
                  <input
                    type="email"
                    {...signupForm.register("email")}
                    placeholder="name@email.com"
                    className="salt-form-control mt-2 h-12 w-full rounded-full bg-card/90 px-4 text-sm"
                  />
                  {errors.email ? (
                    <p className="mt-2 text-xs text-destructive">{errors.email.message as string}</p>
                  ) : null}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Password
                    </label>
                    <input
                      type="password"
                      {...signupForm.register("password")}
                      placeholder="Create password"
                      className="salt-form-control mt-2 h-12 w-full rounded-full bg-card/90 px-4 text-sm"
                    />
                    {errors.password ? (
                      <p className="mt-2 text-xs text-destructive">
                        {errors.password.message as string}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Confirm password
                    </label>
                    <input
                      type="password"
                      {...signupForm.register("confirmPassword")}
                      placeholder="Confirm password"
                      className="salt-form-control mt-2 h-12 w-full rounded-full bg-card/90 px-4 text-sm"
                    />
                    {errors.confirmPassword ? (
                      <p className="mt-2 text-xs text-destructive">
                        {errors.confirmPassword.message as string}
                      </p>
                    ) : null}
                  </div>
                </div>
                <label className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card/70 px-4 py-3 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    {...signupForm.register("consent")}
                    className="mt-0.5 h-4 w-4 rounded border-border/70 text-primary"
                  />
                  <span>
                    By continuing, you agree to the{" "}
                    <a href={privacyHref} className="underline decoration-primary/40 underline-offset-2">
                      terms
                    </a>{" "}
                    and acknowledge the{" "}
                    <a
                      href={privacyHref}
                      className="underline decoration-primary/40 underline-offset-2"
                    >
                      privacy policy
                    </a>
                    .
                  </span>
                </label>
                {errors.consent ? (
                  <p className="text-xs text-destructive">{errors.consent.message as string}</p>
                ) : null}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="salt-primary-cta h-12 justify-center px-6 text-[0.7rem] font-semibold uppercase tracking-[0.16em]"
                >
                  {isSubmitting ? "Creating account" : "Create account"}
                </button>
              </form>
            )}

            {!baseAuthConfigured ? (
              <div className="mt-4 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-xs text-muted-foreground">
                Auth backend is not configured. Set `VITE_SUPABASE_URL` and
                `VITE_SUPABASE_ANON_KEY` to enable sign in/sign up.
              </div>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Link to="/" className="salt-outline-chip h-10 px-4 py-0 text-[0.68rem]">
                Back to shop
              </Link>
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={logout}
                  className="salt-outline-chip h-10 px-4 py-0 text-[0.68rem]"
                >
                  Log out
                </button>
              ) : null}
            </div>
            <span className="text-[0.66rem] uppercase tracking-[0.14em]">
              {mode === "signup" ? "Already a member?" : "New to SALT?"}
              {" "}
              <Link
                to={buildCustomerAccessPath({
                  mode: mode === "signup" ? "login" : "signup",
                  next: nextTarget,
                  reason,
                })}
                className="font-semibold text-foreground"
              >
                {mode === "signup" ? "Sign in" : "Create account"}
              </Link>
            </span>
          </div>
        </div>
      </Reveal>
    </section>
  );
};

export default CustomerAccessPage;
