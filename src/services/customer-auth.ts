import { getSupabaseClient, isSupabaseConfigured } from "@/services/supabase";

export type AuthUser = {
  id?: string;
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
};

export type AuthSession = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  user?: AuthUser;
  pendingConfirmation?: boolean;
};

export function isAuthConfigured(): boolean {
  return isSupabaseConfigured();
}

function normalizeUser(user: unknown): AuthUser | undefined {
  if (!user || typeof user !== "object") {
    return undefined;
  }
  const payload = user as Record<string, unknown>;
  const metadata = (payload.user_metadata as Record<string, unknown>) || {};
  const appMetadata = (payload.app_metadata as Record<string, unknown>) || {};

  return {
    id: payload.id ? String(payload.id) : undefined,
    email: payload.email ? String(payload.email) : undefined,
    name: metadata.name
      ? String(metadata.name)
      : appMetadata.name
        ? String(appMetadata.name)
        : undefined,
    firstName: metadata.first_name
      ? String(metadata.first_name)
      : metadata.firstName
        ? String(metadata.firstName)
        : undefined,
    lastName: metadata.last_name
      ? String(metadata.last_name)
      : metadata.lastName
        ? String(metadata.lastName)
        : undefined,
  };
}

function normalizeSession(data: {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  user?: unknown;
} | null): AuthSession | null {
  if (!data) {
    return null;
  }

  return {
    accessToken: data.access_token || undefined,
    refreshToken: data.refresh_token || undefined,
    expiresAt: data.expires_at ? new Date(data.expires_at * 1000).toISOString() : undefined,
    user: normalizeUser(data.user),
  };
}

export async function loginWithEmail(email: string, password: string): Promise<AuthSession> {
  if (!isSupabaseConfigured()) {
    throw new Error("Auth backend is not configured.");
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    throw new Error(error.message || "Login failed.");
  }

  const session = normalizeSession(data.session);
  if (!session) {
    throw new Error("Login failed. No session returned.");
  }

  return session;
}

export async function signupWithEmail(payload: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  consent: boolean;
}): Promise<AuthSession> {
  if (!isSupabaseConfigured()) {
    throw new Error("Auth backend is not configured.");
  }

  const supabase = getSupabaseClient();
  const emailRedirectTo =
    typeof window === "undefined"
      ? undefined
      : `${window.location.origin}/customer-access?mode=login&reason=account`;

  const { data, error } = await supabase.auth.signUp({
    email: payload.email,
    password: payload.password,
    options: {
      emailRedirectTo,
      data: {
        first_name: payload.firstName,
        last_name: payload.lastName,
        consent: payload.consent,
      },
    },
  });

  if (error) {
    throw new Error(error.message || "Sign up failed.");
  }

  const session = normalizeSession(data.session);
  if (session) {
    return session;
  }

  return {
    user: normalizeUser(data.user),
    pendingConfirmation: true,
  };
}

export async function fetchSession(): Promise<AuthSession | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    return null;
  }

  return normalizeSession(data.session);
}

export async function logoutSession(): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const supabase = getSupabaseClient();
  await supabase.auth.signOut();
}

export function onAuthStateChange(callback: (session: AuthSession | null) => void): () => void {
  if (!isSupabaseConfigured()) {
    return () => undefined;
  }

  const supabase = getSupabaseClient();
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(normalizeSession(session));
  });

  return () => {
    data.subscription.unsubscribe();
  };
}
