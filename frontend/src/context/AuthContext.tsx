import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

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
