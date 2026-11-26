'use client';

import React, { useState } from 'react';
import { Save, Upload, Trash2 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useApp } from '@/components/context/AppContext';
import { useToast } from '@/components/ui/Toast';
import { InstansiLogo } from '@/components/ui/InstansiLogo';
import { KopSurat } from '@/components/ui/KopSurat';
import { saveInstansi } from '@/lib/firestore/master';
import type { InstansiConfig } from '@/lib/types';

function compressImageDataUrl(file: File, maxWidth: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const src = typeof reader.result === 'string' ? reader.result : '';
      if (!src) {
        reject(new Error('File gambar tidak valid.'));
        return;
      }
      const img = new window.Image();
      img.onerror = () => reject(new Error('Format gambar tidak didukung browser.'));
      img.onload = () => {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const pngOrWebp =
          file.type === 'image/png'
            ? canvas.toDataURL('image/png')
            : canvas.toDataURL('image/jpeg', 0.85);
        if (pngOrWebp.length <= 440_000) {
          resolve(pngOrWebp);
          return;
        }
        const jpg = canvas.toDataURL('image/jpeg', 0.72);
        resolve(jpg);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

const EMPTY_INSTANSI: InstansiConfig = {
  id: 'default',
  namaInstansi: '',
  subInstansi: '',
  alamat: '',
  telepon: '',
  fax: '',
  website: '',
  email: '',
  logoUrl: '',
  kopSuratUrl: '',
  namaPimpinan: '',
  jabatanPimpinan: '',
  nipPimpinan: '',
  namaPengurus: '',
  jabatanPengurus: '',
  nipPengurus: '',
};

export function PengaturanInstansiClient() {
  const { user, firebaseUser, instansi, refreshContext } = useApp();
  const { showToast } = useToast();

  const [draft, setDraft] = useState<InstansiConfig | null>(null);
  const [saving, setSaving] = useState(false);

  const form = draft ?? instansi ?? EMPTY_INSTANSI;
  const setForm = (updater: InstansiConfig | ((prev: InstansiConfig) => InstansiConfig)) => {
    setDraft((prev) => {
      const base = prev ?? instansi ?? EMPTY_INSTANSI;
      return typeof updater === 'function' ? updater(base) : updater;
    });
  };

  const handleImageUpload = (field: 'logoUrl' | 'kopSuratUrl') => async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3_000_000) {
      showToast('Ukuran file gambar maksimal 3 MB.', 'error');
      return;
    }
    try {
      const maxWidth = field === 'logoUrl' ? 420 : 1200;
      const compressed = await compressImageDataUrl(file, maxWidth);
      if (compressed.length > 440_000) {
        showToast(
          'Gambar masih terlalu besar setelah kompresi. Gunakan gambar beresolusi lebih kecil.',
          'error'
        );
        return;
      }
      setForm((prev) => ({ ...prev, [field]: compressed }));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memproses gambar.', 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firebaseUser) return;
    setSaving(true);
    try {
      await saveInstansi(user, firebaseUser.uid, form);
      await refreshContext();
      showToast(
        'Pengaturan Instansi, Logo, dan Kop Surat berhasil disinkronkan ke Firestore.',
        'success'
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal menyimpan pengaturan instansi.',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  if (user && user.role !== 'Superadmin') {
    return (
      <AppShell title="Pengaturan Instansi" hideGlobalBagianFilter>
        <div className="bg-white rounded-xl border border-red-200 p-6 text-sm text-red-700">
          Halaman ini hanya dapat diakses oleh Superadmin.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Pengaturan Instansi & Dokumen"
      subtitle="Logo dan Kop Surat otomatis tersinkronisasi ke halaman Login, Header, dan Berita Acara PDF"
      hideGlobalBagianFilter
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white rounded-xl border border-indigo-200 overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-slate-700 via-indigo-600 to-slate-800" />
            <div className="px-6 py-4 bg-gradient-to-r from-slate-50 via-indigo-50/50 to-white border-b border-indigo-100">
              <h2 className="text-sm font-bold text-slate-900">
                Identitas Instansi &amp; Alamat
              </h2>
            </div>
            <div className="p-6 space-y-4">

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Instansi Induk
                </label>
                <input
                  type="text"
                  required
                  value={form.namaInstansi}
                  onChange={(e) => setForm({ ...form, namaInstansi: e.target.value })}
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Sub Instansi / Perangkat Daerah
                </label>
                <input
                  type="text"
                  required
                  value={form.subInstansi}
                  onChange={(e) => setForm({ ...form, subInstansi: e.target.value })}
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alamat Lengkap
              </label>
              <input
                type="text"
                value={form.alamat}
                onChange={(e) => setForm({ ...form, alamat: e.target.value })}
                className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Telepon</label>
                <input
                  type="text"
                  value={form.telepon}
                  onChange={(e) => setForm({ ...form, telepon: e.target.value })}
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Fax</label>
                <input
                  type="text"
                  value={form.fax}
                  onChange={(e) => setForm({ ...form, fax: e.target.value })}
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Website</label>
                <input
                  type="text"
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Resmi
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 pt-4">
              Pejabat Penandatangan Default Berita Acara
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Jabatan Pimpinan
                </label>
                <input
                  type="text"
                  value={form.jabatanPimpinan}
                  onChange={(e) => setForm({ ...form, jabatanPimpinan: e.target.value })}
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Pimpinan
                </label>
                <input
                  type="text"
                  value={form.namaPimpinan}
                  onChange={(e) => setForm({ ...form, namaPimpinan: e.target.value })}
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  NIP Pimpinan
                </label>
                <input
                  type="text"
                  value={form.nipPimpinan}
                  onChange={(e) => setForm({ ...form, nipPimpinan: e.target.value })}
                  className="w-full h-10 px-3 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Jabatan Pengurus Barang
                </label>
                <input
                  type="text"
                  value={form.jabatanPengurus}
                  onChange={(e) => setForm({ ...form, jabatanPengurus: e.target.value })}
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Pengurus Barang
                </label>
                <input
                  type="text"
                  value={form.namaPengurus}
                  onChange={(e) => setForm({ ...form, namaPengurus: e.target.value })}
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  NIP Pengurus Barang
                </label>
                <input
                  type="text"
                  value={form.nipPengurus}
                  onChange={(e) => setForm({ ...form, nipPengurus: e.target.value })}
                  className="w-full h-10 px-3 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-xl border border-indigo-200 overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-slate-700 via-indigo-600 to-slate-800" />
              <div className="p-6 space-y-4">
              <h2 className="text-sm font-bold text-slate-900">Logo Instansi</h2>
              <div className="flex items-center gap-4">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <InstansiLogo logoUrl={form.logoUrl} size={64} />
                </div>
                <div className="space-y-2">
                  <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer">
                    <Upload className="w-4 h-4" />
                    <span>Unggah Logo (PNG/JPG)</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload('logoUrl')}
                      className="hidden"
                    />
                  </label>
                  {form.logoUrl && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, logoUrl: '' })}
                      className="ml-2 inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Reset Default
                    </button>
                  )}
                  <p className="text-[11px] text-slate-500">
                    Ditampilkan di halaman Login, Sidebar, dan Kop Surat teks.
                  </p>
                </div>
              </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-indigo-200 overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-slate-700 via-indigo-600 to-slate-800" />
              <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">Gambar Kop Surat Resmi</h2>
                {form.kopSuratUrl && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, kopSuratUrl: '' })}
                    className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Hapus Kop Gambar
                  </button>
                )}
              </div>

              <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>Unggah Gambar Kop Surat (Opsional)</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload('kopSuratUrl')}
                  className="hidden"
                />
              </label>
              <p className="text-[11px] text-slate-500">
                Jika belum diunggah, sistem otomatis menggunakan Kop Surat teks resmi dengan
                Logo Instansi di atas.
              </p>

              <div className="border border-slate-200 rounded-lg p-3 bg-white overflow-hidden">
                <p className="text-[11px] font-semibold text-slate-400 mb-2">Pratinjau Kop Surat</p>
                <div className="scale-[0.82] origin-top-left w-[122%]">
                  <KopSurat instansi={form} />
                </div>
              </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full h-11 px-5 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Menyimpan...' : 'Simpan Pengaturan Instansi'}</span>
            </button>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
