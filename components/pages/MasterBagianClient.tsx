'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useApp } from '@/components/context/AppContext';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { deleteBagian, listBagian, saveBagian } from '@/lib/firestore/master';
import type { Bagian } from '@/lib/types';

export function MasterBagianClient() {
  const { user, firebaseUser, refreshContext } = useApp();
  const { showToast } = useToast();
  const [rows, setRows] = useState<Bagian[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Bagian | null>(null);
  const [kode, setKode] = useState('');
  const [nama, setNama] = useState('');
  const [kepalaBagian, setKepalaBagian] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Bagian | null>(null);

  const canEdit = user?.role === 'Superadmin' || user?.role === 'Pengurus Barang';

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const data = await listBagian();
      setRows(data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat data Bagian.', 'error');
    } finally {
      setLoading(false);
    }
  }, [user, showToast]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(t);
  }, [loadData]);

  const openCreate = () => {
    setEditing(null);
    setKode('');
    setNama('');
    setKepalaBagian('');
    setModalOpen(true);
  };

  const openEdit = (item: Bagian) => {
    setEditing(item);
    setKode(item.kode);
    setNama(item.nama);
    setKepalaBagian(item.kepalaBagian);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firebaseUser) return;
    setSaving(true);
    try {
      await saveBagian(user, firebaseUser.uid, {
        id: editing?.id,
        kode,
        nama,
        kepalaBagian,
      });
      showToast(
        editing ? 'Data Bagian berhasil diperbarui.' : 'Bagian baru berhasil ditambahkan.',
        'success'
      );
      setModalOpen(false);
      await loadData();
      await refreshContext();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan data Bagian.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !user) return;
    try {
      await deleteBagian(user, deleteTarget.id);
      showToast('Bagian berhasil dihapus.', 'success');
      await loadData();
      await refreshContext();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus Bagian.', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <AppShell
      title="Master Bagian / Gudang Desentralisasi"
      subtitle="Kelola daftar Bagian di lingkungan Sekretariat Daerah Kabupaten Demak"
      hideGlobalBagianFilter
    >
      <div className="bg-white rounded-xl border border-violet-200/80 overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-violet-500 to-purple-600" />
        <div className="px-5 py-4 bg-gradient-to-r from-violet-50/75 via-white to-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Daftar Bagian Setda Demak</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Setiap Bagian memiliki gudang persediaan dan plafon anggaran mandiri
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={openCreate}
              className="h-9 px-4 inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Bagian</span>
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-violet-50/50 border-b border-violet-100 text-xs text-violet-950">
              <tr>
                <th className="px-5 py-3 font-semibold">Kode</th>
                <th className="px-5 py-3 font-semibold">Nama Bagian</th>
                <th className="px-5 py-3 font-semibold">Kepala Bagian</th>
                {canEdit && <th className="px-5 py-3 font-semibold text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                    Memuat data Bagian...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                    Belum ada data Bagian.
                  </td>
                </tr>
              ) : (
                rows.map((item) => (
                  <tr key={item.id} className="hover:bg-violet-50/30 transition-colors">
                    <td className="px-5 py-3 font-mono font-semibold text-violet-800">
                      {item.kode}
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-900">{item.nama}</td>
                    <td className="px-5 py-3 text-slate-600">{item.kepalaBagian || '-'}</td>
                    {canEdit && (
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="p-1.5 text-slate-500 hover:text-violet-700 rounded-md hover:bg-violet-50 mr-1"
                          aria-label={`Edit ${item.nama}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
                          className="p-1.5 text-slate-500 hover:text-red-600 rounded-md hover:bg-red-50"
                          aria-label={`Hapus ${item.nama}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
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
            className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editing ? 'Edit Bagian' : 'Tambah Bagian Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kode Bagian
              </label>
              <input
                type="text"
                required
                value={kode}
                onChange={(e) => setKode(e.target.value.toUpperCase())}
                placeholder="Contoh: PEM"
                className="w-full h-10 px-3 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Bagian
              </label>
              <input
                type="text"
                required
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                placeholder="Contoh: Bagian Tata Pemerintahan"
                className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Kepala Bagian (Opsional)
              </label>
              <input
                type="text"
                value={kepalaBagian}
                onChange={(e) => setKepalaBagian(e.target.value)}
                placeholder="Contoh: Drs. Ahmad, M.Si."
                className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Hapus Bagian"
        message={`Apakah Anda yakin ingin menghapus "${deleteTarget?.nama}"?`}
        confirmLabel="Hapus"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppShell>
  );
}
