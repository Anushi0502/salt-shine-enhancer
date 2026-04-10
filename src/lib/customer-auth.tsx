import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type AuthSession,
  fetchSession,
  isAuthConfigured,
  loginWithEmail,
  logoutSession,
  onAuthStateChange,
  signupWithEmail,
} from "@/services/customer-auth";

const CUSTOMER_AUTH_STORAGE_KEY = "salt-customer-auth-session-v2";

type CustomerAccessMode = "login" | "signup";
type CustomerAccessReason = "checkout" | "orders" | "account";

type CustomerAuthContextValue = {
  status: "loading" | "authenticated" | "anonymous";
  session: AuthSession | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthSession>;
  signup: (payload: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    consent: boolean;
  }) => Promise<AuthSession>;
  logout: () => Promise<void>;
  setSession: (session: AuthSession | null) => void;
};

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null);

function readStoredSession(): AuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(CUSTOMER_AUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as AuthSession;
    return parsed || null;
  } catch {
    return null;
  }
}

function persistSession(session: AuthSession | null): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!session) {
    window.localStorage.removeItem(CUSTOMER_AUTH_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(CUSTOMER_AUTH_STORAGE_KEY, JSON.stringify(session));
}

function isSessionValid(session: AuthSession | null): boolean {
  if (!session) {
    return false;
  }
  if (!session.accessToken) {
    return false;
  }
  if (session.expiresAt) {
    const timestamp = Date.parse(session.expiresAt);
    if (!Number.isNaN(timestamp) && Date.now() > timestamp) {
      return false;
    }
  }
  return true;
}

export function buildCustomerAccessPath(options?: {
  mode?: CustomerAccessMode;
  next?: string | null;
  reason?: CustomerAccessReason;
}): string {
  const params = new URLSearchParams();
  const mode = options?.mode || "login";
  const next = String(options?.next || "").trim();
  const reason = String(options?.reason || "").trim();

  params.set("mode", mode);

  if (next) {
    params.set("next", next);
  }

  if (reason) {
    params.set("reason", reason);
  }

  return `/customer-access?${params.toString()}`;
}

export function CustomerAuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(() => {
    const stored = readStoredSession();
    return isSessionValid(stored) ? stored : null;
  });
  const [status, setStatus] = useState<"loading" | "authenticated" | "anonymous">(() =>
    isSessionValid(readStoredSession()) ? "authenticated" : "anonymous",
  );

  useEffect(() => {
    persistSession(session);
    setStatus(isSessionValid(session) ? "authenticated" : "anonymous");
  }, [session]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== CUSTOMER_AUTH_STORAGE_KEY) {
        return;
      }

      const next = readStoredSession();
      setSession(isSessionValid(next) ? next : null);
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!isAuthConfigured()) {
      return;
    }

    let cancelled = false;
    setStatus((current) => (current === "authenticated" ? current : "loading"));

    fetchSession()
      .then((fresh) => {
        if (cancelled) {
          return;
        }
        if (fresh && isSessionValid(fresh)) {
          setSession(fresh);
          return;
        }
        setSession(null);
      })
      .catch(() => {
        if (!cancelled) {
          setStatus(isSessionValid(session) ? "authenticated" : "anonymous");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAuthConfigured()) {
      return () => undefined;
    }

    return onAuthStateChange((next) => {
      setSession(isSessionValid(next) ? next : null);
    });
  }, []);

  const value = useMemo<CustomerAuthContextValue>(
    () => ({
      status,
      session,
      isAuthenticated: isSessionValid(session),
      login: async (email, password) => {
        const fresh = await loginWithEmail(email, password);
        setSession(fresh);
        return fresh;
      },
      signup: async (payload) => {
        const fresh = await signupWithEmail(payload);
        setSession(fresh);
        return fresh;
      },
      logout: async () => {
        setSession(null);
        await logoutSession();
      },
      setSession,
    }),
    [session, status],
  );

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth() {
  const context = useContext(CustomerAuthContext);

  if (!context) {
    throw new Error("useCustomerAuth must be used within CustomerAuthProvider");
  }

  return context;
}
