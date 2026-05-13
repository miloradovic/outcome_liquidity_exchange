'use client';

import type { ReactElement, ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { apiClient } from '@/lib/api-client';
import type { UserProfile } from '@/lib/types';

const ACCESS_TOKEN_KEY = 'olx.access-token';

type LoginPayload = {
  email: string;
  password: string;
};

type RegisterPayload = {
  email: string;
  password: string;
  username: string;
};

type AuthContextValue = {
  token: string | null;
  user: UserProfile | null;
  isHydrated: boolean;
  isAuthenticating: boolean;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  refreshProfile: () => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps): ReactElement {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const persistToken = useCallback((nextToken: string | null) => {
    setToken(nextToken);

    if (typeof window === 'undefined') {
      return;
    }

    if (nextToken) {
      window.localStorage.setItem(ACCESS_TOKEN_KEY, nextToken);
      return;
    }

    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  }, []);

  const hydrate = useCallback(async () => {
    if (typeof window === 'undefined') {
      setIsHydrated(true);
      return;
    }

    const storedToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!storedToken) {
      setIsHydrated(true);
      return;
    }

    persistToken(storedToken);

    try {
      const profile = await apiClient.getMe(storedToken);
      setUser(profile);
    } catch {
      persistToken(null);
      setUser(null);
    } finally {
      setIsHydrated(true);
    }
  }, [persistToken]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const login = useCallback(
    async (payload: LoginPayload): Promise<void> => {
      setIsAuthenticating(true);
      try {
        const result = await apiClient.login(payload);
        persistToken(result.accessToken);
        setUser(result.user);
      } finally {
        setIsAuthenticating(false);
      }
    },
    [persistToken],
  );

  const register = useCallback(
    async (payload: RegisterPayload): Promise<void> => {
      setIsAuthenticating(true);
      try {
        const result = await apiClient.register(payload);
        persistToken(result.accessToken);
        setUser(result.user);
      } finally {
        setIsAuthenticating(false);
      }
    },
    [persistToken],
  );

  const refreshProfile = useCallback(async (): Promise<void> => {
    if (!token) {
      return;
    }

    const profile = await apiClient.getMe(token);
    setUser(profile);
  }, [token]);

  const logout = useCallback(() => {
    persistToken(null);
    setUser(null);
  }, [persistToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      isHydrated,
      isAuthenticating,
      isAuthenticated: Boolean(token),
      login,
      register,
      refreshProfile,
      logout,
    }),
    [token, user, isHydrated, isAuthenticating, login, register, refreshProfile, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}