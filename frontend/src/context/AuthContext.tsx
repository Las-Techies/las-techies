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
  signInWithRole: (
    email: string,
    password: string,
    role: UserRole
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

  async function signInWithRole(
    email: string,
    password: string,
    role: UserRole
  ): Promise<Session | null> {
    // Try to sign in first; if the account doesn't exist yet, create it and
    // stash the selected role in user_metadata so it rides along in the JWT.
    const signIn = await supabase.auth.signInWithPassword({ email, password });
    if (!signIn.error) {
      return signIn.data.session;
    }

    const signUp = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role } },
    });
    if (signUp.error) {
      throw signUp.error;
    }
    return signUp.data.session;
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
        signInWithRole,
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
