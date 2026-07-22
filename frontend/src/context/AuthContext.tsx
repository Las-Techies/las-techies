import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import { QUIZ_ATTEMPT_STORAGE_KEY } from "../features/quiz/types";

export type UserRole = "new_hire" | "manager";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<Session | null>;
  signUp: (
    email: string,
    password: string,
    role: UserRole,
    firstName: string,
    lastName: string
  ) => Promise<Session | null>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  setRole: (role: UserRole) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
      }
    );

    return () => subscription.subscription.unsubscribe();
  }, []);

  // Explicit login for a returning user — no fallback to signUp, so a wrong
  // password reports as a login failure instead of a confusing "already
  // registered" error.
  async function signIn(email: string, password: string): Promise<Session | null> {
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) {
      throw new Error("Incorrect email or password. Please try again.");
    }
    return result.data.session;
  }

  // Explicit account creation — stashes the selected role + name in
  // user_metadata so it rides along in the JWT for requireAuth to read.
  async function signUp(
    email: string,
    password: string,
    role: UserRole,
    firstName: string,
    lastName: string
  ): Promise<Session | null> {
    const result = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role, first_name: firstName, last_name: lastName },
      },
    });
    if (result.error) {
      if (/already registered|already exists/i.test(result.error.message)) {
        throw new Error(
          "An account with this email already exists. Try logging in instead."
        );
      }
      throw result.error;
    }
    return result.data.session;
  }

  async function signOut() {
    await supabase.auth.signOut();
    // Clear any quiz attempt cached in this browser so the next user to log in
    // here doesn't inherit a previous person's results (the Results page keys
    // "have they attempted the quiz?" off this).
    localStorage.removeItem(QUIZ_ATTEMPT_STORAGE_KEY);
  }

  // Sends a password-reset email. Supabase redirects the user back here
  // with a recovery token after they click the link in that email.
  async function resetPassword(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) throw error;
  }

  // Redirects to Google; Supabase bounces the user back to redirectTo with a
  // session already established. Google doesn't know about "manager" vs
  // "new hire", so role starts unset — LoginPage prompts for it afterward.
  async function signInWithGoogle(): Promise<void> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        scopes:
          "openid email profile https://www.googleapis.com/auth/drive.readonly",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
    if (error) throw error;
  }

  // Fills in the role for a Google account after the fact, since Google
  // sign-in has no equivalent of the New Hire/Manager picker on signup.
  async function setRole(role: UserRole): Promise<void> {
    const { error } = await supabase.auth.updateUser({ data: { role } });
    if (error) throw error;
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signIn,
        signUp,
        signOut,
        resetPassword,
        signInWithGoogle,
        setRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
