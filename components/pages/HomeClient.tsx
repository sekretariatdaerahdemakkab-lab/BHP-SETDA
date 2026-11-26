'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/context/AppContext';

export function HomeClient() {
  const router = useRouter();
  const { user, loadingAuth } = useApp();

  useEffect(() => {
    if (!loadingAuth) {
      router.replace(user ? '/dashboard' : '/login');
    }
  }, [loadingAuth, user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-2 border-teal-700 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
