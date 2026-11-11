import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { auth } from '../firebase.js';
import { api, type StudentProfile, formatErrorMessage } from '../api.js';

interface AuthContextType {
  user: User | null;
  profile: StudentProfile | null;
  role: string | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
  signIn: (email: string, pass: string) => Promise<void>;
  signUp: (email: string, pass: string, prn: string) => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) {
      setProfile(null);
      setRole(null);
      return;
    }
    try {
      const tokenResult = await auth.currentUser.getIdTokenResult(true);
      const claimRole = (tokenResult.claims.role as string | undefined) ?? null;
      const effectiveRole =
        claimRole || (auth.currentUser.email === 'admin@campus.edu' ? 'admin' : null);
      setRole(effectiveRole);

      if (effectiveRole === 'admin') {
        setProfile({
          uid: auth.currentUser.uid,
          name: 'Campus Accounts Admin',
          email: auth.currentUser.email,
          prn: 'ADMIN',
          role: 'admin',
          status: 'approved',
          walletAddress: '',
          balance: '0',
          passkeyRegistered: true,
          pinSet: true,
        });
      } else if (effectiveRole === 'user' || !effectiveRole) {
        const data = await api.getMe();
        setProfile(data);
        if (data.role) setRole(data.role);
      }
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const tokenResult = await currentUser.getIdTokenResult();
          const claimRole = (tokenResult.claims.role as string | undefined) ?? null;
          const effectiveRole =
            claimRole || (currentUser.email === 'admin@campus.edu' ? 'admin' : null);
          setRole(effectiveRole);

          if (effectiveRole === 'admin') {
            setProfile({
              uid: currentUser.uid,
              name: 'Campus Accounts Admin',
              email: currentUser.email,
              prn: 'ADMIN',
              role: 'admin',
              status: 'approved',
              walletAddress: '',
              balance: '0',
              passkeyRegistered: true,
              pinSet: true,
            });
          } else if (effectiveRole === 'user' || !effectiveRole) {
            const data = await api.getMe();
            setProfile(data);
            if (data.role) setRole(data.role);
          }
        } catch {
          setProfile(null);
        }
      } else {
        setProfile(null);
        setRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, pass: string) => {
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      await refreshProfile();
    } catch (err) {
      const message = formatErrorMessage(err);
      setError(message);
      throw err;
    }
  };

  const signUp = async (email: string, pass: string, prn: string) => {
    setError(null);
    try {
      await createUserWithEmailAndPassword(auth, email, pass);
      await api.signupProfile(prn);
      await refreshProfile();
    } catch (err) {
      const message = formatErrorMessage(err);
      setError(message);
      throw err;
    }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setProfile(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role,
        loading,
        refreshProfile,
        logout,
        signIn,
        signUp,
        error,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
