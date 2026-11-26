'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth, testFirestoreConnection } from '@/lib/firebase';
import { getCurrentYear } from '@/lib/format';
import { resolveAuthenticatedSession } from '@/lib/firestore/auth-profile';
import { getAvailableYears } from '@/lib/firestore/laporan';
import { getInstansi, listBagian } from '@/lib/firestore/master';
import type { Bagian, InstansiConfig, UserProfile } from '@/lib/types';

interface AppContextValue {
  user: UserProfile | null;
  firebaseUser: FirebaseUser | null;
  instansi: InstansiConfig | null;
  bagianList: Bagian[];
  availableYears: number[];
  tahun: number;
  setTahun: (y: number) => void;
  selectedBagianId: string;
  setSelectedBagianId: (id: string) => void;
  isBagianLocked: boolean;
  loadingAuth: boolean;
  authError: string;
  clearAuthError: () => void;
  refreshContext: () => Promise<UserProfile | null>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [instansi, setInstansi] = useState<InstansiConfig | null>(null);
  const [bagianList, setBagianList] = useState<Bagian[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>(() => {
    const cur = getCurrentYear();
    return [cur + 2, cur + 1, cur, cur - 1, cur - 2];
  });
  const [tahun, setTahun] = useState<number>(() => getCurrentYear());
  const [selectedBagianId, setSelectedBagianIdState] = useState<string>('ALL');
  const [loadingAuth, setLoadingAuth] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string>('');

  const isBagianLocked = user?.role === 'Admin Persediaan';

  const loadWorkspaceData = useCallback(async (fbUser: FirebaseUser): Promise<UserProfile | null> => {
    const profile = await resolveAuthenticatedSession(fbUser);
    const [instData, bagData, yrs] = await Promise.all([
      getInstansi(),
      listBagian(),
      getAvailableYears(profile),
    ]);

    setUser(profile);
    setInstansi(instData);
    setBagianList(bagData);
    if (yrs.length > 0) {
      setAvailableYears(yrs);
    }
    if (profile.role === 'Admin Persediaan' && profile.bagianId) {
      setSelectedBagianIdState(profile.bagianId);
    }
    setAuthError('');
    return profile;
  }, []);

  const refreshContext = useCallback(async (): Promise<UserProfile | null> => {
    const current = auth.currentUser;
    if (!current) {
      setUser(null);
      return null;
    }
    try {
      return await loadWorkspaceData(current);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat profil pengguna.';
      setAuthError(msg);
      return null;
    } finally {
      setLoadingAuth(false);
    }
  }, [loadWorkspaceData]);

  useEffect(() => {
    testFirestoreConnection();

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (!fbUser) {
        setUser(null);
        setBagianList([]);
        setSelectedBagianIdState('ALL');
        setLoadingAuth(false);
        return;
      }

      setLoadingAuth(true);
      try {
        await loadWorkspaceData(fbUser);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal memverifikasi akses Firestore.';
        setAuthError(msg);
        setUser(null);
        await signOut(auth).catch(() => {});
      } finally {
        setLoadingAuth(false);
      }
    });

    return () => unsubscribe();
  }, [loadWorkspaceData]);

  const setSelectedBagianId = useCallback(
    (id: string) => {
      if (isBagianLocked && user?.bagianId) {
        setSelectedBagianIdState(user.bagianId);
        return;
      }
      setSelectedBagianIdState(id);
    },
    [isBagianLocked, user]
  );

  const logout = useCallback(async () => {
    await signOut(auth);
    setUser(null);
    setFirebaseUser(null);
    setBagianList([]);
    setSelectedBagianIdState('ALL');
  }, []);

  const clearAuthError = useCallback(() => setAuthError(''), []);

  const effectiveBagianId =
    isBagianLocked && user?.bagianId ? user.bagianId : selectedBagianId;

  return (
    <AppContext.Provider
      value={{
        user,
        firebaseUser,
        instansi,
        bagianList,
        availableYears,
        tahun,
        setTahun,
        selectedBagianId: effectiveBagianId,
        setSelectedBagianId,
        isBagianLocked,
        loadingAuth,
        authError,
        clearAuthError,
        refreshContext,
        logout,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
