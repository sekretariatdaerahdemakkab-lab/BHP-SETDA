'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Eye, EyeOff, KeyRound, Lock, ShieldCheck, User, UserCog } from 'lucide-react';
import { useApp } from '@/components/context/AppContext';
import { InstansiLogo } from '@/components/ui/InstansiLogo';
import { useToast } from '@/components/ui/Toast';
import {
  bootstrapInitialSuperadmin,
  checkBootstrapInitialized,
  signInWithUsernamePassword,
} from '@/lib/firestore/auth-profile';

export function LoginClient() {
  const router = useRouter();
  const { user, instansi, loadingAuth, authError, clearAuthError } = useApp();
  const { showToast } = useToast();

  const [checkingBootstrap, setCheckingBootstrap] = useState(true);
  const [bootstrapInitialized, setBootstrapInitialized] = useState(true);
  const [mode, setMode] = useState<'login' | 'bootstrap'>('login');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [setupUsername, setSetupUsername] = useState('superadmin');
  const [setupNama, setSetupNama] = useState('Superadmin Setda Demak');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!loadingAuth && user) {
      router.replace('/dashboard');
    }
  }, [loadingAuth, user, router]);

  useEffect(() => {
    let active = true;
    const loadStatus = async () => {
      try {
        const initialized = await checkBootstrapInitialized();
        if (!active) return;
        setBootstrapInitialized(initialized);
        setMode(initialized ? 'login' : 'bootstrap');
      } finally {
        if (active) setCheckingBootstrap(false);
      }
    };
    const t = setTimeout(() => {
      void loadStatus();
    }, 0);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, []);

  const displayedError = localError || authError;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    clearAuthError();
    setSubmitting(true);
    try {
      await signInWithUsernamePassword(username, password);
      showToast('Login berhasil. Memuat data Cloud Firestore...', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login gagal.';
      setLocalError(msg);
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    clearAuthError();
    if (setupPassword !== setupConfirm) {
      const msg = 'Konfirmasi password Superadmin tidak sama.';
      setLocalError(msg);
      showToast(msg, 'error');
      return;
    }
    setSubmitting(true);
    try {
      await bootstrapInitialSuperadmin({
        username: setupUsername,
        namaLengkap: setupNama,
        password: setupPassword,
      });
      setBootstrapInitialized(true);
      showToast('Akun Superadmin berhasil dibuat dan diaktifkan di Cloud Firestore.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat akun Superadmin awal.';
      setLocalError(msg);
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-teal-50/40 to-sky-50/50 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-4xl bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <div className="lg:col-span-5 bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 text-white p-8 flex flex-col justify-between">
          <div>
            <div className="h-1 w-16 rounded-full bg-gradient-to-r from-teal-400 to-sky-400 mb-6" />
            <div className="flex items-center gap-3.5">
              <div className="p-2 bg-white rounded-xl shrink-0">
                <InstansiLogo
                  logoUrl={instansi?.logoUrl}
                  alt={instansi?.namaInstansi || 'Logo Kabupaten Demak'}
                  size={44}
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold tracking-wider text-teal-400 uppercase truncate">
                  {instansi?.namaInstansi || 'PEMERINTAH KABUPATEN DEMAK'}
                </p>
                <p className="text-sm font-bold text-white truncate">
                  {instansi?.subInstansi || 'SEKRETARIAT DAERAH'}
                </p>
              </div>
            </div>

            <div className="mt-10">
              <h1 className="text-2xl font-bold tracking-tight text-white leading-snug text-balance">
                SIP-BHP SETDA DEMAK
              </h1>
              <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                Sistem Informasi Persediaan Barang Habis Pakai terpadu dengan sinkronisasi 
                lintas-perangkat, multi-gudang per Bagian, Kartu Persediaan dinamis,
                monitoring Plafon Anggaran, dan Rekonsiliasi Fungsional Bendahara.
              </p>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-teal-900/70 space-y-2 text-xs text-slate-400">
            <p className="font-semibold text-teal-200">Alamat Instansi</p>
            <p>{instansi?.alamat || 'Jl. Kyai Singkil No. 7 Demak, Jawa Tengah 59511'}</p>
            {instansi?.telepon && <p>Telp. {instansi.telepon}</p>}
          </div>
        </div>

        <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center">
          {!checkingBootstrap && !bootstrapInitialized && (
            <div className="mb-5 flex rounded-lg border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode('bootstrap');
                  setLocalError('');
                  clearAuthError();
                }}
                className={`flex-1 h-9 px-3 rounded-md text-xs font-semibold transition-colors ${
                  mode === 'bootstrap'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Aktivasi Superadmin Awal
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setLocalError('');
                  clearAuthError();
                }}
                className={`flex-1 h-9 px-3 rounded-md text-xs font-semibold transition-colors ${
                  mode === 'login'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Masuk dengan Username
              </button>
            </div>
          )}

          {mode === 'bootstrap' && !bootstrapInitialized ? (
            <>
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 mb-1.5">
                  <UserCog className="w-4 h-4" />
                  <span>Pengaturan Awal Sistem</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900">Buat Akun Superadmin</h2>
                <p className="mt-1.5 text-sm text-slate-500">
                  Belum ada akun Superadmin terdaftar. Buat username dan password Superadmin pertama
                  untuk mengelola Master Data dan mendaftarkan akun pengelola Bagian/Setda.
                </p>
              </div>

              {displayedError && (
                <div
                  role="alert"
                  className="mt-5 flex items-start gap-2.5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 leading-relaxed"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{displayedError}</span>
                </div>
              )}

              <form onSubmit={handleBootstrap} className="mt-6 space-y-4">
                <div>
                  <label
                    htmlFor="setup-username"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Username Superadmin
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="setup-username"
                      type="text"
                      required
                      minLength={3}
                      maxLength={40}
                      pattern="[a-z0-9._-]+"
                      autoComplete="username"
                      value={setupUsername}
                      onChange={(e) => setSetupUsername(e.target.value.toLowerCase())}
                      placeholder="superadmin"
                      className="w-full h-11 pl-10 pr-3 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Gunakan huruf kecil, angka, titik (.), garis bawah (_), atau tanda hubung (-).
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="setup-nama"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Nama Lengkap Superadmin
                  </label>
                  <input
                    id="setup-nama"
                    type="text"
                    required
                    maxLength={120}
                    value={setupNama}
                    onChange={(e) => setSetupNama(e.target.value)}
                    placeholder="Superadmin Setda Demak"
                    className="w-full h-11 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label
                      htmlFor="setup-password"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="setup-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        value={setupPassword}
                        onChange={(e) => setSetupPassword(e.target.value)}
                        placeholder="Min. 6 karakter"
                        className="w-full h-11 pl-10 pr-9 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="setup-confirm"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Konfirmasi Password
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="setup-confirm"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        value={setupConfirm}
                        onChange={(e) => setSetupConfirm(e.target.value)}
                        placeholder="Ulangi password"
                        className="w-full h-11 pl-10 pr-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || loadingAuth}
                  className="w-full h-11 px-5 flex items-center justify-center gap-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors disabled:opacity-50"
                >
                  <span>
                    {submitting || loadingAuth
                      ? 'Mengaktifkan Superadmin...'
                      : 'Aktifkan & Masuk sebagai Superadmin'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </>
          ) : (
            <>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Masuk ke Sistem</h2>
                <p className="mt-1.5 text-sm text-slate-500">
                  Masukkan username dan password Anda.
                </p>
              </div>

              {displayedError && (
                <div
                  role="alert"
                  className="mt-5 flex items-start gap-2.5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 leading-relaxed"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{displayedError}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="mt-6 space-y-4">
                <div>
                  <label
                    htmlFor="login-username"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Username
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-username"
                      type="text"
                      required
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase())}
                      placeholder="contoh: superadmin atau bag_umum"
                      className="w-full h-11 pl-10 pr-3 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Masukkan password"
                      className="w-full h-11 pl-10 pr-10 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || loadingAuth}
                  className="w-full h-11 px-5 flex items-center justify-center gap-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors disabled:opacity-50"
                >
                  <span>
                    {submitting || loadingAuth ? 'Memverifikasi Akun...' : 'Masuk ke SIP-BHP'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs text-slate-600 leading-relaxed">
                <div className="flex items-center gap-2 font-semibold text-slate-800">
                  <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0" />
                  <span>Informasi Akses Pengguna</span>
                </div>
                <p>
                  <strong>Pengelola BHP Bagian &amp; Setda:</strong> Akun (username dan password)
                  dibuat dan dikelola langsung oleh <strong>Superadmin</strong>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
