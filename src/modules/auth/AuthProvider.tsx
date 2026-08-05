"use client";

import React, {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { useRouter } from 'next/navigation';
import type { User as SupabaseAuthUser, AuthChangeEvent, Session } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import {
  User,
  Tenant,
  SubscriptionPlan,
} from '@/modules/core/lib/data';
import {
  ROLES as ROLES_DEFAULT,
  Permission,
  PLANS,
} from '@/modules/core/lib/permissions';

interface AuthContextType {
  user: User | null;
  /** Raw Supabase auth user (session identity). */
  authUser: SupabaseAuthUser | null;
  authLoading: boolean;
  tenants: Tenant[];
  currentTenantId: string | null;
  /**
   * Fila de la empresa activa. De acá salen el plan contratado y las excepciones
   * de módulos que puso el super-admin. `tenants` (la lista) solo la carga el
   * super-admin, así que esto es lo único que tiene un usuario normal.
   */
  currentTenant: Tenant | null;
  subscription: SubscriptionPlan | null;
  login: (email: string, pass: string) => Promise<any>;
  logout: () => void;
  sendPasswordReset: (email: string) => Promise<void>;
  reauthenticateAndChangeEmail: (
    currentPass: string,
    newEmail: string
  ) => Promise<void>;
  reauthenticateAndChangePassword: (
    currentPass: string,
    newPass: string
  ) => Promise<void>;
  can: (permission: Permission) => boolean;
  setCurrentTenantId: (tenantId: string | null) => void;
  getTenantId: () => string | null | undefined;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authUser, setAuthUser] = useState<SupabaseAuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentTenantId, _setCurrentTenantId] = useState<string | null>(null);
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionPlan | null>(null);
  const router = useRouter();

  const can = useCallback(
    (permission: Permission): boolean => {
      if (!user) return false;
      if (
        user.role === 'super-admin' ||
        user.role === 'admin' ||
        user.role === 'operations'
      )
        return true;
      const userPermissions = ROLES_DEFAULT[user.role]?.permissions;
      return !!userPermissions?.includes(permission);
    },
    [user]
  );

  const setCurrentTenantId = useCallback((tenantId: string | null) => {
    _setCurrentTenantId(tenantId);
    if (user?.role === 'super-admin') {
      if (tenantId) {
        localStorage.setItem('selectedTenantId', tenantId);
      } else {
        localStorage.removeItem('selectedTenantId');
      }
    }
  }, [user]);

  // Fetch the app-level user profile from public.users
  const fetchUserProfile = useCallback(
    async (authUserId: string): Promise<User | null> => {
      const sb = getSupabaseBrowserClient();
      const { data, error } = await sb
        .from('users')
        .select('*')
        .eq('id', authUserId)
        .single();
      if (error || !data) return null;
      return data as User;
    },
    []
  );

  // Listen for auth state changes
  useEffect(() => {
    const sb = getSupabaseBrowserClient();

    const handleSession = async (authUser: SupabaseAuthUser | null) => {
      setAuthLoading(true);
      setAuthUser(authUser);

      if (authUser) {
        const profile = await fetchUserProfile(authUser.id);
        if (profile) {
          setUser(profile);
          if (profile.role !== 'super-admin') {
            _setCurrentTenantId(profile.tenantId);
          } else {
            const savedTenantId = localStorage.getItem('selectedTenantId');
            _setCurrentTenantId(savedTenantId);
          }
        } else {
          // Auth user exists but has no app profile — sign out and surface the error
          console.error('AuthProvider: usuario autenticado sin perfil en public.users. uid:', authUser.id);
          await sb.auth.signOut();
          setUser(null);
          _setCurrentTenantId(null);
          // Redirect to login with an error param so the page can show a message
          if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
            window.location.href = '/login?error=no_profile';
          }
        }
      } else {
        setUser(null);
        _setCurrentTenantId(null);
      }

      setAuthLoading(false);
    };

    // Get initial session
    (async () => {
      const { data } = await sb.auth.getSession();
      handleSession(data.session?.user ?? null);
    })();

    const { data: { subscription: authListener } } = sb.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        // TOKEN_REFRESHED is a silent background event — running the full auth flow
        // would briefly set authLoading=true, causing a full-screen flash on every refresh.
        if (_event === 'TOKEN_REFRESHED') return;
        handleSession(session?.user ?? null);
      }
    );

    return () => authListener.unsubscribe();
  }, [fetchUserProfile]);

  // Fetch all tenants for super-admin (realtime)
  useEffect(() => {
    if (user?.role !== 'super-admin') {
      setTenants([]);
      return;
    }

    const sb = getSupabaseBrowserClient();

    const fetchTenants = async () => {
      const { data } = await sb.from('tenants').select('*');
      if (data) {
        setTenants(data as Tenant[]);
        const saved = localStorage.getItem('selectedTenantId');
        if (saved && (data as Tenant[]).some((t) => t.tenantId === saved)) {
          _setCurrentTenantId(saved);
        } else {
          _setCurrentTenantId(null);
        }
      }
    };

    fetchTenants();

    const channel = sb
      .channel('tenants-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tenants' },
        () => fetchTenants()
      )
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [user]);

  // Fila de la empresa activa (plan + módulos habilitados), en realtime.
  // Va aparte de `tenants` porque esa lista solo la carga el super-admin: un
  // usuario normal necesita igual su propia fila para saber qué módulos ve.
  useEffect(() => {
    const tenantToUse =
      user?.role === 'super-admin' ? currentTenantId : user?.tenantId;

    const sb = getSupabaseBrowserClient();

    const fetchTenant = async () => {
      if (!tenantToUse) { setCurrentTenant(null); return; }
      const { data } = await sb
        .from('tenants')
        .select('*')
        .eq('tenantId', tenantToUse)
        .maybeSingle();
      setCurrentTenant((data as Tenant | null) ?? null);
    };

    fetchTenant();

    // Sin empresa activa (super-admin en vista global) no hay a qué suscribirse.
    if (!tenantToUse) return;

    const channel = sb
      .channel(`tenant-row-${tenantToUse}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tenants',
          filter: `tenantId=eq.${tenantToUse}`,
        },
        () => fetchTenant()
      )
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [currentTenantId, user]);

  // Subscribe to current tenant's subscription plan
  useEffect(() => {
    const tenantToUse =
      user?.role === 'super-admin' ? currentTenantId : user?.tenantId;

    if (!tenantToUse) {
      setSubscription(
        user?.role === 'super-admin'
          ? (PLANS.enterprise as SubscriptionPlan)
          : null
      );
      return;
    }

    const sb = getSupabaseBrowserClient();

    const fetchSubscription = async () => {
      const { data } = await sb
        .from('subscriptions')
        .select('*')
        .eq('id', tenantToUse)
        .single();
      // Fail-closed: un tenant sin fila en `subscriptions` recibe el plan más
      // restrictivo (`basic`), no `professional`. Evita regalar features de pago
      // ante datos faltantes o un fallo transitorio de la consulta.
      setSubscription(
        data ? (data as SubscriptionPlan) : (PLANS.basic as SubscriptionPlan)
      );
    };

    fetchSubscription();

    const channel = sb
      .channel(`subscription-${tenantToUse}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscriptions',
          filter: `id=eq.${tenantToUse}`,
        },
        () => fetchSubscription()
      )
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [currentTenantId, user]);

  const getTenantId = useCallback(() => {
    if (!user) return undefined;
    return user.role === 'super-admin' ? currentTenantId : user.tenantId;
  }, [user, currentTenantId]);

  const login = useCallback(async (email: string, pass: string) => {
    const sb = getSupabaseBrowserClient();
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
    return data;
  }, []);

  const logout = useCallback(async () => {
    const sb = getSupabaseBrowserClient();
    await sb.auth.signOut();
    setUser(null);
    _setCurrentTenantId(null);
    localStorage.removeItem('selectedTenantId');
    window.location.href = '/login';
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const sb = getSupabaseBrowserClient();
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  }, []);

  const reauthenticateAndChangeEmail = useCallback(async (
    currentPass: string,
    newEmail: string
  ) => {
    const sb = getSupabaseBrowserClient();
    // Verify current password first
    const currentEmail = authUser?.email;
    if (!currentEmail) throw new Error('No hay usuario autenticado.');
    const { error: signInError } = await sb.auth.signInWithPassword({
      email: currentEmail,
      password: currentPass,
    });
    if (signInError) throw new Error('Contraseña actual incorrecta.');

    const { error } = await sb.auth.updateUser({ email: newEmail });
    if (error) throw error;

    // Also update profile table
    if (authUser) {
      await sb.from('users').update({ email: newEmail }).eq('id', authUser.id);
    }
  }, [authUser]);

  const reauthenticateAndChangePassword = useCallback(async (
    currentPass: string,
    newPass: string
  ) => {
    const sb = getSupabaseBrowserClient();
    const currentEmail = authUser?.email;
    if (!currentEmail) throw new Error('No hay usuario autenticado.');
    const { error: signInError } = await sb.auth.signInWithPassword({
      email: currentEmail,
      password: currentPass,
    });
    if (signInError) throw new Error('Contraseña actual incorrecta.');

    const { error } = await sb.auth.updateUser({ password: newPass });
    if (error) throw error;
  }, [authUser]);

  const value = useMemo<AuthContextType>(() => ({
    user,
    authUser,
    authLoading,
    tenants,
    currentTenantId,
    setCurrentTenantId,
    currentTenant,
    subscription,
    login,
    logout,
    sendPasswordReset,
    can,
    getTenantId,
    reauthenticateAndChangeEmail,
    reauthenticateAndChangePassword,
  }), [
    user,
    authUser,
    authLoading,
    tenants,
    currentTenantId,
    setCurrentTenantId,
    currentTenant,
    subscription,
    login,
    logout,
    sendPasswordReset,
    can,
    getTenantId,
    reauthenticateAndChangeEmail,
    reauthenticateAndChangePassword,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
