'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Search,
  Download,
  Upload,
  FileSpreadsheet,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useApp } from '@/components/context/AppContext';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ExcelImportModal, ParsedPreviewRow } from '@/components/excel/ExcelImportModal';
import {
  deleteBarang,
  importBarangBatch,
  listBarang,
  listKategori,
  saveBarang,
} from '@/lib/firestore/master';
import { formatRupiah, parseFlexibleNumber } from '@/lib/format';
import type { Barang, Kategori } from '@/lib/types';

export function MasterBarangClient() {
  const { user, firebaseUser } = useApp();
  const { showToast } = useToast();

  const [rows, setRows] = useState<Barang[]>([]);
  const [kategoriList, setKategoriList] = useState<Kategori[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Barang | null>(null);
  const [kodeBarang, setKodeBarang] = useState('');
  const [nama, setNama] = useState('');
  const [satuan, setSatuan] = useState('Rim');
  const [hargaStandar, setHargaStandar] = useState('0');
  const [stokMinimum, setStokMinimum] = useState('0');
  const [kategoriId, setKategoriId] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Barang | null>(null);

  const canEdit = user?.role === 'Superadmin' || user?.role === 'Pengurus Barang';

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [brgData, kats] = await Promise.all([listBarang(search), listKategori()]);
      setRows(brgData);
      setKategoriList(kats);
      if (kats.length > 0) {
        setKategoriId((prev) => prev || kats[0].id);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat katalog barang.', 'error');
    } finally {
      setLoading(false);
    }
  }, [user, search, showToast]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(t);
  }, [loadData]);

  const openCreate = () => {
    setEditing(null);
    setKodeBarang(`BHP-${String(rows.length + 1).padStart(3, '0')}`);
    setNama('');
    setSatuan('Rim');
    setHargaStandar('0');
    setStokMinimum('0');
    setKategoriId(kategoriList[0]?.id || '');
    setModalOpen(true);
  };

  const openEdit = (item: Barang) => {
    setEditing(item);
    setKodeBarang(item.kodeBarang);
    setNama(item.nama);
    setSatuan(item.satuan);
    setHargaStandar(String(item.hargaStandar));
    setStokMinimum(String(item.stokMinimum));
    setKategoriId(item.kategoriId);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firebaseUser) return;
    const parsedHarga = Number(hargaStandar);
    const parsedStokMin = Number(stokMinimum);
    if (!Number.isFinite(parsedHarga) || parsedHarga < 0) {
      showToast('Harga standar harus berupa angka valid >= 0.', 'error');
      return;
    }
    if (!Number.isFinite(parsedStokMin) || parsedStokMin < 0) {
      showToast('Stok minimum harus berupa angka valid >= 0.', 'error');
      return;
    }
    setSaving(true);
    try {
      await saveBarang(user, firebaseUser.uid, {
        id: editing?.id,
        kodeBarang,
        nama,
        satuan,
        hargaStandar: parsedHarga,
        stokMinimum: parsedStokMin,
        kategoriId,
      });
      showToast(
        editing ? 'Barang berhasil diperbarui.' : 'Barang baru berhasil ditambahkan.',
        'success'
      );
      setModalOpen(false);
      void loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan barang.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !user) return;
    try {
      await deleteBarang(user, deleteTarget.id);
      showToast('Barang berhasil dihapus.', 'success');
      void loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus barang.', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleDownloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const sample = [
      {
        kode_barang: 'BHP-101',
        nama_barang: 'Contoh Kertas HVS A4 80gr',
        satuan: 'Rim',
        harga_standar: 60000,
        stok_minimum: 0,
        kategori: kategoriList[0]?.nama || 'Alat Tulis Kantor (ATK)',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template_Master_Barang');
    XLSX.writeFile(wb, 'Template_Master_Barang_BHP.xlsx');
    showToast('Template Excel berhasil diunduh.', 'success');
  };

  const handleExportCatalog = async () => {
    const XLSX = await import('xlsx');
    const data = rows.map((r, idx) => ({
      No: idx + 1,
      Kode_Barang: r.kodeBarang,
      Nama_Barang: r.nama,
      Kategori: r.kategoriNama || '',
      Kode_Rekening: r.kodeRekening || '',
      Satuan: r.satuan,
      Harga_Standar: r.hargaStandar,
      Stok_Minimum: r.stokMinimum,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Katalog_Barang_BHP');
    XLSX.writeFile(wb, 'Katalog_Master_Barang_Setda_Demak.xlsx');
    showToast('Katalog barang berhasil diekspor ke Excel.', 'success');
  };

  const handleParseImportRows = (rawRows: Record<string, unknown>[]): ParsedPreviewRow[] => {
    const existingCodes = new Set(rows.map((r) => r.kodeBarang.toUpperCase()));
    return rawRows.map((raw, idx) => {
      const kode = String(raw.kode_barang ?? raw.Kode_Barang ?? raw.kode ?? '')
        .trim()
        .toUpperCase();
      const namaBrg = String(raw.nama_barang ?? raw.Nama_Barang ?? raw.nama ?? '').trim();
      const sat = String(raw.satuan ?? raw.Satuan ?? '').trim();
      const rawHarga = raw.harga_standar ?? raw.Harga_Standar ?? raw.harga;
      const parsedHarga =
        rawHarga !== undefined && rawHarga !== '' ? parseFlexibleNumber(rawHarga) : 0;
      const harga = parsedHarga;
      const rawMin = raw.stok_minimum ?? raw.Stok_Minimum;
      const parsedMin =
        rawMin !== undefined && rawMin !== '' ? parseFlexibleNumber(rawMin) : 0;
      const min = Number.isFinite(parsedMin) ? Math.max(0, parsedMin) : 0;
      const kat = String(raw.kategori ?? raw.Kategori ?? '').trim();

      let error = '';
      if (!kode || !namaBrg || !sat) {
        error = 'Kode, Nama, dan Satuan wajib diisi';
      } else if (existingCodes.has(kode)) {
        error = `Kode ${kode} sudah ada`;
      } else if (!Number.isFinite(harga) || harga < 0) {
        error = 'Harga tidak valid';
      } else if (!Number.isFinite(parsedMin) || parsedMin < 0) {
        error = 'Stok minimum tidak valid';
      }

      return {
        rowNumber: idx + 2,
        valid: !error,
        error,
        raw: {
          kodeBarang: kode,
          nama: namaBrg,
          satuan: sat,
          hargaStandar: harga,
          stokMinimum: min,
          kategoriNama: kat,
        },
        display: {
          kodeBarang: kode || '-',
          nama: namaBrg || '-',
          satuan: sat || '-',
          hargaStandar: formatRupiah(Number.isFinite(harga) ? harga : 0),
          kategoriNama: kat || kategoriList[0]?.nama || '-',
        },
      };
    });
  };

  const handleConfirmImport = async (validRows: ParsedPreviewRow[]) => {
    if (!user || !firebaseUser) return;
    try {
      const inserted = await importBarangBatch(
        user,
        firebaseUser.uid,
        validRows.map((r) => ({
          kodeBarang: String(r.raw.kodeBarang || ''),
          nama: String(r.raw.nama || ''),
          satuan: String(r.raw.satuan || ''),
          hargaStandar: Number(r.raw.hargaStandar || 0),
          stokMinimum: Math.max(0, Number(r.raw.stokMinimum ?? 0) || 0),
          kategoriNama: String(r.raw.kategoriNama || ''),
        }))
      );
      showToast(`Berhasil mengimpor ${inserted} barang baru ke Firestore.`, 'success');
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengimpor data barang.';
      showToast(msg, 'error');
      throw err;
    }
  };

  return (
    <AppShell
      title="Katalog Master Barang BHP"
      subtitle="Daftar standar item Barang Habis Pakai beserta impor dan ekspor Excel (.xlsx)"
      hideGlobalBagianFilter
    >
      <div className="bg-white rounded-xl border border-violet-200/80 overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-violet-500 to-purple-600" />
        <div className="px-5 py-4 bg-gradient-to-r from-violet-50/75 via-white to-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-violet-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari kode, nama, kategori..."
              className="w-full h-9 pl-9 pr-3 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="h-9 px-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4 text-slate-500" />
              <span>Template Excel</span>
            </button>
            <button
              type="button"
              onClick={handleExportCatalog}
              className="h-9 px-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>Export Excel</span>
            </button>
            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
                  className="h-9 px-3 inline-flex items-center gap-1.5 text-xs font-medium text-violet-800 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 whitespace-nowrap"
                >
                  <Upload className="w-4 h-4" />
                  <span>Import Massal</span>
                </button>
                <button
                  type="button"
                  onClick={openCreate}
                  className="h-9 px-4 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Barang</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-violet-50/50 border-b border-violet-100 text-xs text-violet-950">
              <tr>
                <th className="px-4 py-3 font-semibold">Kode</th>
                <th className="px-4 py-3 font-semibold">Nama Barang</th>
                <th className="px-4 py-3 font-semibold">Kategori & Rekening</th>
                <th className="px-4 py-3 font-semibold">Satuan</th>
                <th className="px-4 py-3 font-semibold text-right">Harga Standar</th>
                <th className="px-4 py-3 font-semibold text-right">Stok Min.</th>
                {canEdit && <th className="px-4 py-3 font-semibold text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Memuat katalog barang...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Tidak ada data barang yang sesuai pencarian.
                  </td>
                </tr>
              ) : (
                rows.map((item) => (
                  <tr key={item.id} className="hover:bg-violet-50/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-violet-800">
                      {item.kodeBarang}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{item.nama}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <div>{item.kategoriNama}</div>
                      <div className="font-mono text-slate-400">{item.kodeRekening}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{item.satuan}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                      {formatRupiah(item.hargaStandar)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                      {item.stokMinimum > 0 ? (
                        <span className="font-semibold text-amber-700">{item.stokMinimum}</span>
                      ) : (
                        <span className="font-sans text-xs text-slate-400">Nonaktif</span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
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
            className="w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editing ? 'Edit Master Barang' : 'Tambah Barang Baru'}
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
                  Kode Barang
                </label>
                <input
                  type="text"
                  required
                  value={kodeBarang}
                  onChange={(e) => setKodeBarang(e.target.value.toUpperCase())}
                  className="w-full h-10 px-3 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Satuan</label>
                <input
                  type="text"
                  required
                  value={satuan}
                  onChange={(e) => setSatuan(e.target.value)}
                  placeholder="Rim / Buah / Botol"
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Barang</label>
              <input
                type="text"
                required
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kategori</label>
              <select
                value={kategoriId}
                onChange={(e) => setKategoriId(e.target.value)}
                className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {kategoriList.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.kodeRekening} — {k.nama}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Harga Standar (Rp)
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={hargaStandar}
                  onChange={(e) => setHargaStandar(e.target.value)}
                  className="w-full h-10 px-3 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Batas Stok Minimum Alert
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Number(stokMinimum) > 0}
                      onChange={(e) => setStokMinimum(e.target.checked ? '5' : '0')}
                      className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                    />
                    <span>Aktifkan Alert</span>
                  </label>
                </div>
                <input
                  type="number"
                  min={0}
                  required
                  value={stokMinimum}
                  onChange={(e) => setStokMinimum(e.target.value)}
                  className="w-full h-10 px-3 text-sm font-mono border border-slate-300 rounded-lg"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Isi 0 untuk menonaktifkan alert (misal BBM atau Makan &amp; Minum yang sekali masuk langsung habis).
                </p>
              </div>
            </div>

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
                className="px-4 py-2 text-sm font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ExcelImportModal
        open={importOpen}
        title="Import Massal Katalog Barang BHP"
        description="Unggah file Excel sesuai template (kode_barang, nama_barang, satuan, harga_standar, stok_minimum, kategori)"
        columns={[
          { key: 'kodeBarang', label: 'Kode' },
          { key: 'nama', label: 'Nama Barang' },
          { key: 'satuan', label: 'Satuan' },
          { key: 'hargaStandar', label: 'Harga Standar', align: 'right' },
          { key: 'kategoriNama', label: 'Kategori' },
        ]}
        onParseRows={handleParseImportRows}
        onConfirmImport={handleConfirmImport}
        onClose={() => setImportOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Hapus Barang"
        message={`Apakah Anda yakin ingin menghapus "${deleteTarget?.nama}"?`}
        confirmLabel="Hapus"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppShell>
  );
}
