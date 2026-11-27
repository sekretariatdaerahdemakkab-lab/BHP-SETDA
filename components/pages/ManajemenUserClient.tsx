'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, KeyRound, Eye, EyeOff } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useApp } from '@/components/context/AppContext';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  changeCurrentUserPassword,
  createStaffUserAccount,
  deleteUserAccount,
  listUsers,
  updateStaffUserAccount,
} from '@/lib/firestore/auth-profile';
import type { UserProfile, UserRole } from '@/lib/types';

const ROLES: UserRole[] = [
  'Superadmin',
  'Pengurus Barang',
  'Admin Persediaan',
];

export function ManajemenUserClient() {
  const { user, bagianList } = useApp();
  const { showToast } = useToast();

  const [rows, setRows] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserProfile | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [namaLengkap, setNamaLengkap] = useState('');
  const [role, setRole] = useState<UserRole>('Admin Persediaan');
  const [bagianId, setBagianId] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null);

  const loadUsers = useCallback(async () => {
    if (!user || user.role !== 'Superadmin') return;
    try {
      const data = await listUsers(user);
      setRows(data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat daftar user.', 'error');
    } finally {
      setLoading(false);
    }
  }, [user, showToast]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadUsers();
    }, 0);
    return () => clearTimeout(t);
  }, [loadUsers]);

  const needsBagian = role === 'Admin Persediaan';

  const openCreate = () => {
    setEditing(null);
    setUsername('');
    setPassword('');
    setShowPassword(false);
    setNamaLengkap('');
    setRole('Admin Persediaan');
    setBagianId(bagianList[0]?.id || '');
    setActive(true);
    setModalOpen(true);
  };

  const openEdit = (item: UserProfile) => {
    setEditing(item);
    setUsername(item.username);
    setPassword('');
    setShowPassword(false);
    setNamaLengkap(item.namaLengkap);
    setRole(item.role);
    setBagianId(item.bagianId || bagianList[0]?.id || '');
    setActive(item.active);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (needsBagian && !bagianId) {
      showToast('Pilihan Bagian wajib dipilih untuk akun Admin Persediaan.', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateStaffUserAccount(user, {
          id: editing.id,
          namaLengkap,
          role,
          bagianId: needsBagian ? bagianId : null,
          active,
        });
        showToast('Data akun user berhasil diperbarui di Firestore.', 'success');
      } else {
        await createStaffUserAccount(user, {
          username,
          password,
          namaLengkap,
          role,
          bagianId: needsBagian ? bagianId : null,
          active,
        });
        showToast(
          `Akun "${username.trim().toLowerCase()}" berhasil dibuat dan langsung aktif untuk login.`,
          'success'
        );
      }
      setModalOpen(false);
      await loadUsers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan user.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangeOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      showToast('Konfirmasi password baru tidak sama.', 'error');
      return;
    }
    setSavingPw(true);
    try {
      await changeCurrentUserPassword(currentPassword, newPassword);
      showToast('Password akun Anda berhasil diperbarui.', 'success');
      setPwModalOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengubah password.', 'error');
    } finally {
      setSavingPw(false);
    }
  };

  const closePasswordModal = () => {
    setPwModalOpen(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
  };

  const handleDelete = async () => {
    if (!deleteTarget || !user) return;
    try {
      await deleteUserAccount(user, deleteTarget.id);
      showToast('Profil akun pengguna berhasil dihapus dari Firestore.', 'success');
      await loadUsers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus user.', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  if (user && user.role !== 'Superadmin') {
    return (
      <AppShell title="Manajemen User" hideGlobalBagianFilter>
        <div className="bg-white rounded-xl border border-red-200 p-6 text-sm text-red-700">
          Halaman ini hanya dapat diakses oleh Superadmin.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Manajemen User & Hak Akses"
      subtitle="Daftarkan akun pengelola BHP Bagian dan Setda dengan Username & Password dari antarmuka Superadmin"
      hideGlobalBagianFilter
    >
      <div className="bg-white rounded-xl border border-indigo-200 overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-slate-700 via-indigo-600 to-slate-800" />
        <div className="px-5 py-4 bg-gradient-to-r from-slate-50 via-indigo-50/50 to-white border-b border-indigo-100 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Daftar Akun Pengguna</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Akun Admin Persediaan otomatis terkunci ke Bagiannya masing-masing
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPwModalOpen(true)}
              className="h-9 px-3.5 inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 whitespace-nowrap"
            >
              <KeyRound className="w-4 h-4 text-indigo-600" />
              <span>Ubah Password Saya</span>
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="h-9 px-4 inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah User</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm text-left">
            <thead className="bg-indigo-50/70 border-b border-indigo-100 text-xs text-indigo-950">
              <tr>
                <th className="px-4 py-3 font-semibold">Username (Login)</th>
                <th className="px-4 py-3 font-semibold">Nama Lengkap</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Bagian Terkait</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Memuat daftar user...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Belum ada pengguna terdaftar.
                  </td>
                </tr>
              ) : (
                rows.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                      {u.username}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{u.namaLengkap}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`text-xs font-semibold ${
                          u.role === 'Superadmin'
                            ? 'text-teal-700'
                            : u.role === 'Pengurus Barang'
                            ? 'text-indigo-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {u.bagianNama ? `${u.bagianKode} · ${u.bagianNama}` : 'Setda Pusat (Semua)'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`text-xs font-semibold ${
                          u.active ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      >
                        {u.active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEdit(u)}
                        className="p-1.5 text-slate-500 hover:text-indigo-700 rounded-md hover:bg-indigo-50 mr-1"
                        aria-label={`Edit ${u.username}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {u.id !== user?.id && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(u)}
                          className="p-1.5 text-slate-500 hover:text-red-600 rounded-md hover:bg-red-50"
                          aria-label={`Hapus ${u.username}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSave}
            className="w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editing ? 'Edit Akun User' : 'Daftarkan Akun Pengelola Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Username (Login)
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={40}
                  pattern="[a-z0-9._-]+"
                  disabled={Boolean(editing)}
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="contoh: admin.umum"
                  className="w-full h-10 px-3 text-sm font-mono border border-slate-300 rounded-lg disabled:bg-slate-100 disabled:text-slate-500"
                />
                {!editing ? (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Huruf kecil, angka, titik (.), garis bawah (_), atau (-).
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Username akun aktif tidak dapat diubah.
                  </p>
                )}
              </div>

              {!editing ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Password Awal
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 6 karakter"
                      className="w-full h-10 pl-3 pr-9 text-sm border border-slate-300 rounded-lg"
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
              ) : (
                <div className="flex items-center">
                  <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5 leading-relaxed">
                    Password ditetapkan saat pendaftaran akun. Untuk memblokir akses segera,
                    nonaktifkan status akun di bawah.
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Lengkap &amp; Gelar
              </label>
              <input
                type="text"
                required
                maxLength={120}
                value={namaLengkap}
                onChange={(e) => setNamaLengkap(e.target.value)}
                placeholder="Contoh: Budi Santoso, S.Kom"
                className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => {
                    const nextRole = e.target.value as UserRole;
                    setRole(nextRole);
                    if (nextRole === 'Admin Persediaan' && !bagianId) {
                      setBagianId(bagianList[0]?.id || '');
                    }
                  }}
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pilihan Bagian
                </label>
                <select
                  value={needsBagian ? bagianId : ''}
                  disabled={!needsBagian}
                  onChange={(e) => setBagianId(e.target.value)}
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {!needsBagian ? (
                    <option value="">Setda Pusat (Akses Semua)</option>
                  ) : bagianList.length === 0 ? (
                    <option value="">Belum ada Master Bagian</option>
                  ) : (
                    bagianList.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.kode} — {b.nama}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
              />
              <span>Akun Aktif (dapat login ke sistem)</span>
            </label>

            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : 'Buat Akun User'}
              </button>
            </div>
          </form>
        </div>
      )}

      {pwModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleChangeOwnPassword}
            className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Ubah Password Akun Saya</h3>
              <button
                type="button"
                onClick={closePasswordModal}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password Saat Ini
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password Baru (Min. 6 Karakter)
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Konfirmasi Password Baru
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={closePasswordModal}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingPw}
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingPw ? 'Menyimpan...' : 'Perbarui Password'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Hapus User"
        message={`Hapus profil akun "${deleteTarget?.username}" (${deleteTarget?.namaLengkap})? Pengguna tersebut tidak akan bisa mengakses data sistem lagi.`}
        confirmLabel="Hapus"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppShell>
  );
}
