'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Trash2,
  Pencil,
  Upload,
  FileSpreadsheet,
  Lock,
  Search,
  X,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useApp } from '@/components/context/AppContext';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ExcelImportModal, ParsedPreviewRow } from '@/components/excel/ExcelImportModal';
import { listPlafonWithRealisasi } from '@/lib/firestore/anggaran';
import { listBarang } from '@/lib/firestore/master';
import {
  createTransaksiBatch,
  deleteTransaksi,
  listTransaksi,
  updateTransaksi,
} from '@/lib/firestore/transaksi';
import {
  formatDateID,
  formatNumber,
  formatRupiah,
  getDefaultDateForYear,
} from '@/lib/format';
import type { Barang, PlafonAnggaran, TransaksiPersediaan } from '@/lib/types';

interface DraftMasukRow {
  key: string;
  tanggal: string;
  noBukti: string;
  barangId: string;
  qty: string;
  hargaSatuan: string;
  plafonId: string;
  keterangan: string;
}

export function BarangMasukClient() {
  const { user, firebaseUser, bagianList, tahun, selectedBagianId, isBagianLocked } = useApp();
  const { showToast } = useToast();

  const [rows, setRows] = useState<TransaksiPersediaan[]>([]);
  const [barangList, setBarangList] = useState<Barang[]>([]);
  const [plafonList, setPlafonList] = useState<PlafonAnggaran[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [formBagianId, setFormBagianId] = useState('');
  const [draftRows, setDraftRows] = useState<DraftMasukRow[]>([]);
  const [saving, setSaving] = useState(false);

  const [editItem, setEditItem] = useState<TransaksiPersediaan | null>(null);
  const [editTanggal, setEditTanggal] = useState('');
  const [editNoBukti, setEditNoBukti] = useState('');
  const [editBarangId, setEditBarangId] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editHarga, setEditHarga] = useState('');
  const [editPlafonId, setEditPlafonId] = useState('');
  const [editKet, setEditKet] = useState('');

  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TransaksiPersediaan | null>(null);

  const loadAll = useCallback(async () => {
    if (!user) return;
    try {
      const [trxData, brgData, plfData] = await Promise.all([
        listTransaksi(user, {
          tahun,
          requestedBagianId: selectedBagianId,
          jenisList: ['MASUK'],
        }),
        listBarang(),
        listPlafonWithRealisasi(user, tahun, selectedBagianId),
      ]);
      setRows(trxData);
      setBarangList(brgData);
      setPlafonList(plfData);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal memuat transaksi barang masuk.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [user, tahun, selectedBagianId, showToast]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadAll();
    }, 0);
    return () => clearTimeout(t);
  }, [loadAll]);

  const filteredRows = search.trim()
    ? rows.filter((r) => {
        const q = search.trim().toLowerCase();
        return (
          (r.noBukti || '').toLowerCase().includes(q) ||
          (r.barangNama || '').toLowerCase().includes(q) ||
          (r.barangKode || '').toLowerCase().includes(q) ||
          (r.bagianNama || '').toLowerCase().includes(q) ||
          (r.keterangan || '').toLowerCase().includes(q) ||
          (r.plafonKegiatan || '').toLowerCase().includes(q)
        );
      })
    : rows;

  const activeFormBagian =
    isBagianLocked && user?.bagianId
      ? user.bagianId
      : formBagianId || (selectedBagianId !== 'ALL' ? selectedBagianId : bagianList[0]?.id || '');

  const filteredPlafonForBagian = plafonList.filter(
    (p) => p.bagianId === activeFormBagian
  );

  const openNewModal = () => {
    const defBagian =
      isBagianLocked && user?.bagianId
        ? user.bagianId
        : selectedBagianId !== 'ALL'
        ? selectedBagianId
        : bagianList[0]?.id || '';
    const firstBarang = barangList[0];
    const firstPlafon = plafonList.find((p) => p.bagianId === defBagian);

    setFormBagianId(defBagian);
    setDraftRows([
      {
        key: `${Date.now()}`,
        tanggal: getDefaultDateForYear(tahun),
        noBukti: '',
        barangId: firstBarang?.id || '',
        qty: '1',
        hargaSatuan: String(firstBarang?.hargaStandar || 0),
        plafonId: firstPlafon?.id || '',
        keterangan: '',
      },
    ]);
    setFormOpen(true);
  };

  const addDraftRow = () => {
    const firstBarang = barangList[0];
    const firstPlafon = filteredPlafonForBagian[0];
    setDraftRows((prev) => {
      const last = prev[prev.length - 1];
      return [
        ...prev,
        {
          key: `${Date.now()}-${Math.random()}`,
          tanggal: last?.tanggal || getDefaultDateForYear(tahun),
          noBukti: last?.noBukti || '',
          barangId: firstBarang?.id || '',
          qty: '1',
          hargaSatuan: String(firstBarang?.hargaStandar || 0),
          plafonId: last?.plafonId ?? (firstPlafon?.id || ''),
          keterangan: '',
        },
      ];
    });
  };

  const updateDraftRow = (key: string, patch: Partial<DraftMasukRow>) => {
    setDraftRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if (patch.barangId) {
          const found = barangList.find((b) => b.id === patch.barangId);
          if (found) next.hargaSatuan = String(found.hargaStandar);
        }
        return next;
      })
    );
  };

  const handleSaveBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firebaseUser) return;
    if (draftRows.some((d) => !d.tanggal || !d.noBukti.trim())) {
      showToast('Tanggal dan Nomor BAST/Nota wajib diisi pada setiap baris.', 'error');
      return;
    }
    setSaving(true);
    try {
      const totalInserted = await createTransaksiBatch(user, firebaseUser.uid, {
        mode: 'MASUK',
        bagianId: activeFormBagian,
        items: draftRows.map((d) => ({
          tanggal: d.tanggal,
          noBukti: d.noBukti.trim(),
          barangId: d.barangId,
          qty: Number(d.qty),
          hargaSatuan: Number(d.hargaSatuan),
          plafonId: d.plafonId || null,
          keterangan: d.keterangan.trim(),
        })),
      });

      showToast(`Berhasil mencatat ${totalInserted} item Barang Masuk.`, 'success');
      setFormOpen(false);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan barang masuk.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (item: TransaksiPersediaan) => {
    setEditItem(item);
    setEditTanggal(item.tanggal);
    setEditNoBukti(item.noBukti);
    setEditBarangId(item.barangId);
    setEditQty(String(item.qty));
    setEditHarga(String(item.hargaSatuan));
    setEditPlafonId(item.plafonId || '');
    setEditKet(item.keterangan);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItem || !user || !firebaseUser) return;
    setSaving(true);
    try {
      await updateTransaksi(user, firebaseUser.uid, {
        id: editItem.id,
        tanggal: editTanggal,
        noBukti: editNoBukti,
        barangId: editBarangId,
        qty: Number(editQty),
        hargaSatuan: Number(editHarga),
        plafonId: editPlafonId || null,
        keterangan: editKet,
      });
      showToast('Transaksi barang masuk diperbarui.', 'success');
      setEditItem(null);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memperbarui transaksi.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !user || !firebaseUser) return;
    try {
      await deleteTransaksi(user, firebaseUser.uid, deleteTarget.id);
      showToast('Transaksi berhasil dihapus dan saldo kartu persediaan dihitung ulang.', 'success');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus transaksi.', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleDownloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const defDate = getDefaultDateForYear(tahun);
    const sample = [
      {
        tanggal: defDate,
        no_bukti: `BAST/099/${tahun}`,
        kode_atau_nama_barang: barangList[0]?.kodeBarang || 'BHP-001',
        qty: 10,
        harga_satuan: barangList[0]?.hargaStandar || 56000,
        keterangan: 'Belanja persediaan rutin',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template_Barang_Masuk');
    XLSX.writeFile(wb, `Template_Barang_Masuk_${tahun}.xlsx`);
    showToast('Template Excel Barang Masuk diunduh.', 'success');
  };

  const handleParseImport = (rawRows: Record<string, unknown>[]): ParsedPreviewRow[] => {
    const targetBagian =
      isBagianLocked && user?.bagianId
        ? user.bagianId
        : selectedBagianId !== 'ALL'
        ? selectedBagianId
        : bagianList[0]?.id || '';
    const defaultPlafon = plafonList.find((p) => p.bagianId === targetBagian)?.id || null;

    return rawRows.map((raw, idx) => {
      const tgl = String(raw.tanggal ?? raw.Tanggal ?? getDefaultDateForYear(tahun))
        .trim()
        .slice(0, 10);
      const bukti = String(raw.no_bukti ?? raw.No_Bukti ?? '').trim();
      const itemKey = String(
        raw.kode_atau_nama_barang ?? raw.kode_barang ?? raw.nama_barang ?? ''
      ).trim();
      const qty = Number(raw.qty ?? raw.Qty ?? 0);
      const harga = Number(raw.harga_satuan ?? raw.Harga_Satuan ?? 0);
      const ket = String(raw.keterangan ?? raw.Keterangan ?? '').trim();

      const matched = barangList.find(
        (b) =>
          b.kodeBarang.toLowerCase() === itemKey.toLowerCase() ||
          b.nama.toLowerCase() === itemKey.toLowerCase()
      );

      let error = '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) error = 'Tanggal harus YYYY-MM-DD';
      else if (!bukti) error = 'No Bukti kosong';
      else if (!matched) error = `Barang "${itemKey}" tidak ditemukan`;
      else if (!Number.isFinite(qty) || qty <= 0) error = 'Qty harus > 0';
      else if (!Number.isFinite(harga) || harga <= 0) error = 'Harga Satuan harus > 0';

      return {
        rowNumber: idx + 2,
        valid: !error,
        error,
        raw: {
          bagianId: targetBagian,
          jenis: 'MASUK',
          tanggal: tgl,
          noBukti: bukti,
          barangId: matched?.id,
          qty,
          hargaSatuan: harga,
          plafonId: defaultPlafon,
          keterangan: ket,
        },
        display: {
          tanggal: tgl,
          noBukti: bukti || '-',
          barang: matched ? matched.nama : itemKey || '-',
          qty: Number.isFinite(qty) ? qty : 0,
          harga: formatRupiah(Number.isFinite(harga) ? harga : 0),
        },
      };
    });
  };

  const handleConfirmImport = async (validRows: ParsedPreviewRow[]) => {
    if (!user || !firebaseUser) return;
    try {
      const grouped = new Map<
        string,
        {
          bagianId: string;
          tanggal: string;
          noBukti: string;
          plafonId: string | null;
          keterangan: string;
          items: Array<{ barangId: string; qty: number; hargaSatuan: number }>;
        }
      >();
      for (const r of validRows) {
        const raw = r.raw as {
          bagianId: string;
          tanggal: string;
          noBukti: string;
          barangId: string;
          qty: number;
          hargaSatuan: number;
          plafonId: string | null;
          keterangan: string;
        };
        const gk = `${raw.bagianId}||${raw.tanggal}||${raw.noBukti}||${raw.plafonId || ''}||${raw.keterangan || ''}`;
        const existing = grouped.get(gk) || {
          bagianId: raw.bagianId,
          tanggal: raw.tanggal,
          noBukti: raw.noBukti,
          plafonId: raw.plafonId || null,
          keterangan: raw.keterangan || '',
          items: [],
        };
        existing.items.push({
          barangId: raw.barangId,
          qty: raw.qty,
          hargaSatuan: raw.hargaSatuan,
        });
        grouped.set(gk, existing);
      }

      let inserted = 0;
      for (const [, grp] of grouped) {
        inserted += await createTransaksiBatch(user, firebaseUser.uid, {
          mode: 'MASUK',
          bagianId: grp.bagianId,
          tanggal: grp.tanggal,
          noBukti: grp.noBukti,
          plafonId: grp.plafonId,
          keterangan: grp.keterangan,
          items: grp.items,
        });
      }
      showToast(`Berhasil mengimpor ${inserted} baris Barang Masuk.`, 'success');
      await loadAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengimpor barang masuk.';
      showToast(msg, 'error');
      throw err;
    }
  };

  if (user && user.role === 'Pengurus Barang') {
    return (
      <AppShell title="Transaksi Barang Masuk (Pengadaan)">
        <div className="bg-white rounded-xl border border-amber-200 p-6 text-sm text-amber-800">
          Menu Barang Masuk hanya tersedia untuk Superadmin dan Admin Persediaan. Pengurus Barang memiliki akses khusus pada menu Plafon &amp; Rekon serta pelaporan.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Transaksi Barang Masuk (Pengadaan)"
      subtitle={`Tahun Anggaran ${tahun} · Pencatatan Belanja Bendahara & Pembaruan Otomatis Kartu Persediaan`}
    >
      <div className="bg-white rounded-xl border border-emerald-200/80 overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-teal-500" />
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-50/75 via-white to-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-emerald-600/70 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari barang, no bukti, keterangan..."
              className="w-full h-9 pl-9 pr-3 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
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
              onClick={() => setImportOpen(true)}
              className="h-9 px-3 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 whitespace-nowrap"
            >
              <Upload className="w-4 h-4" />
              <span>Import Excel</span>
            </button>
            <button
              type="button"
              onClick={openNewModal}
              className="h-9 px-4 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Input Barang Masuk</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm text-left">
            <thead className="bg-emerald-50/50 border-b border-emerald-100 text-xs text-emerald-950">
              <tr>
                <th className="px-4 py-3 font-semibold">Tanggal</th>
                <th className="px-4 py-3 font-semibold">No. Bukti (BAST/Nota)</th>
                <th className="px-4 py-3 font-semibold">Bagian</th>
                <th className="px-4 py-3 font-semibold">Nama Barang</th>
                <th className="px-4 py-3 font-semibold text-right">Qty</th>
                <th className="px-4 py-3 font-semibold text-right">Harga Satuan</th>
                <th className="px-4 py-3 font-semibold text-right">Total Nilai</th>
                <th className="px-4 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Memuat transaksi barang masuk...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Belum ada transaksi barang masuk pada Tahun {tahun}.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr key={r.id} className="hover:bg-emerald-50/30 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-slate-700">
                      {formatDateID(r.tanggal)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs font-semibold text-slate-900">
                        {r.noBukti}
                      </div>
                      {r.plafonKegiatan && (
                        <div className="text-[11px] text-slate-500 truncate max-w-[200px]">
                          {r.plafonKegiatan}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                      {r.bagianKode} · {r.bagianNama}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{r.barangNama}</div>
                      {r.keterangan && (
                        <div className="text-[11px] text-slate-500">{r.keterangan}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-emerald-700 whitespace-nowrap">
                      +{formatNumber(r.qty)} {r.satuan}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                      {formatRupiah(r.hargaSatuan)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatRupiah(r.totalNilai)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {r.isLocked ? (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700"
                          title="Periode Terkunci oleh Rekonsiliasi"
                        >
                          <Lock className="w-3.5 h-3.5" /> Terkunci
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditModal(r)}
                            className="p-1.5 text-slate-500 hover:text-emerald-700 rounded-md hover:bg-emerald-50 mr-1"
                            aria-label="Edit transaksi"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(r)}
                            className="p-1.5 text-slate-500 hover:text-red-600 rounded-md hover:bg-red-50"
                            aria-label="Hapus transaksi"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Multi-Row Input Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSaveBatch}
            className="w-full max-w-6xl xl:max-w-7xl max-h-[90vh] flex flex-col bg-white rounded-xl border border-slate-200 shadow-xl"
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Input Barang Masuk (Satuan / Multi-Baris)
                </h3>
                <p className="text-xs text-slate-500">
                  Otomatis memperbarui Kartu Persediaan dan realisasi Pos Plafon Anggaran
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Gudang Bagian
                  </label>
                  <select
                    value={activeFormBagian}
                    disabled={isBagianLocked}
                    onChange={(e) => {
                      const nextBagian = e.target.value;
                      const nextFirstPlafon = plafonList.find((p) => p.bagianId === nextBagian);
                      setFormBagianId(nextBagian);
                      setDraftRows((prev) =>
                        prev.map((row) => ({
                          ...row,
                          plafonId: nextFirstPlafon?.id || '',
                        }))
                      );
                    }}
                    className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
                  >
                    {bagianList.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.kode} — {b.nama}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-slate-500 pb-2">
                  Tanggal dan Nomor BAST/Nota diatur per baris. Menambah baris akan menyalin tanggal dan nomor BAST/Nota dari baris sebelumnya.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Daftar Item Barang Masuk ({draftRows.length} Baris)
                  </span>
                  <button
                    type="button"
                    onClick={addDraftRow}
                    className="h-8 px-3 inline-flex items-center gap-1 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Baris
                  </button>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 font-semibold min-w-[140px]">Tanggal</th>
                        <th className="px-3 py-2 font-semibold min-w-[165px]">No. BAST / Nota</th>
                        <th className="px-3 py-2 font-semibold min-w-[200px]">Item Barang</th>
                        <th className="px-3 py-2 font-semibold w-24">Qty</th>
                        <th className="px-3 py-2 font-semibold w-32">Harga Satuan</th>
                        <th className="px-3 py-2 font-semibold min-w-[190px]">Pos Plafon Anggaran</th>
                        <th className="px-3 py-2 font-semibold min-w-[140px]">Keterangan</th>
                        <th className="px-3 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {draftRows.map((row) => (
                        <tr key={row.key}>
                          <td className="p-2">
                            <input
                              type="date"
                              required
                              value={row.tanggal}
                              onChange={(e) =>
                                updateDraftRow(row.key, { tanggal: e.target.value })
                              }
                              className="w-full h-9 px-2 font-mono border border-slate-300 rounded-md"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              required
                              value={row.noBukti}
                              onChange={(e) =>
                                updateDraftRow(row.key, { noBukti: e.target.value })
                              }
                              placeholder={`BAST/001/${tahun}`}
                              className="w-full h-9 px-2 font-mono border border-slate-300 rounded-md"
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={row.barangId}
                              onChange={(e) =>
                                updateDraftRow(row.key, { barangId: e.target.value })
                              }
                              className="w-full h-9 px-2 border border-slate-300 rounded-md bg-white"
                            >
                              {barangList.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.kodeBarang} · {b.nama} ({b.satuan})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min={0.01}
                              step="any"
                              required
                              value={row.qty}
                              onChange={(e) => updateDraftRow(row.key, { qty: e.target.value })}
                              className="w-full h-9 px-2 text-right font-mono border border-slate-300 rounded-md"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min={1}
                              required
                              value={row.hargaSatuan}
                              onChange={(e) =>
                                updateDraftRow(row.key, { hargaSatuan: e.target.value })
                              }
                              className="w-full h-9 px-2 text-right font-mono border border-slate-300 rounded-md"
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={row.plafonId}
                              onChange={(e) =>
                                updateDraftRow(row.key, { plafonId: e.target.value })
                              }
                              className="w-full h-9 px-2 border border-slate-300 rounded-md bg-white"
                            >
                              <option value="">(Tanpa Pos Plafon)</option>
                              {filteredPlafonForBagian.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.kodeRekening} — {p.namaKegiatan}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={row.keterangan}
                              onChange={(e) =>
                                updateDraftRow(row.key, { keterangan: e.target.value })
                              }
                              placeholder="Opsional"
                              className="w-full h-9 px-2 border border-slate-300 rounded-md"
                            />
                          </td>
                          <td className="p-2 text-center">
                            {draftRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setDraftRows((prev) => prev.filter((x) => x.key !== row.key))
                                }
                                className="p-1 text-slate-400 hover:text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50 rounded-b-xl">
              <div className="text-sm font-semibold text-slate-900 font-mono tabular-nums">
                Total Nilai:{' '}
                {formatRupiah(
                  draftRows.reduce(
                    (a, r) => a + (Number(r.qty) || 0) * (Number(r.hargaSatuan) || 0),
                    0
                  )
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Barang Masuk'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Edit Modal */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Edit Barang Masuk</h3>
              <button
                type="button"
                onClick={() => setEditItem(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal</label>
                <input
                  type="date"
                  required
                  value={editTanggal}
                  onChange={(e) => setEditTanggal(e.target.value)}
                  className="w-full h-10 px-3 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  No. Bukti
                </label>
                <input
                  type="text"
                  required
                  value={editNoBukti}
                  onChange={(e) => setEditNoBukti(e.target.value)}
                  className="w-full h-10 px-3 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Barang</label>
              <select
                value={editBarangId}
                onChange={(e) => setEditBarangId(e.target.value)}
                className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {barangList.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.kodeBarang} · {b.nama}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Qty</label>
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  required
                  value={editQty}
                  onChange={(e) => setEditQty(e.target.value)}
                  className="w-full h-10 px-3 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Harga Satuan
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={editHarga}
                  onChange={(e) => setEditHarga(e.target.value)}
                  className="w-full h-10 px-3 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pos Plafon Anggaran
              </label>
              <select
                value={editPlafonId}
                onChange={(e) => setEditPlafonId(e.target.value)}
                className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">(Tanpa Pos Plafon)</option>
                {plafonList
                  .filter((p) => p.bagianId === editItem.bagianId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.kodeRekening} — {p.namaKegiatan}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Keterangan</label>
              <input
                type="text"
                value={editKet}
                onChange={(e) => setEditKet(e.target.value)}
                className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditItem(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800"
              >
                Simpan Perubahan
              </button>
            </div>
          </form>
        </div>
      )}

      <ExcelImportModal
        open={importOpen}
        title="Import Massal Transaksi Barang Masuk"
        description="Kolom template: tanggal (YYYY-MM-DD), no_bukti, kode_atau_nama_barang, qty, harga_satuan, keterangan"
        columns={[
          { key: 'tanggal', label: 'Tanggal' },
          { key: 'noBukti', label: 'No Bukti' },
          { key: 'barang', label: 'Barang' },
          { key: 'qty', label: 'Qty', align: 'right' },
          { key: 'harga', label: 'Harga Satuan', align: 'right' },
        ]}
        onParseRows={handleParseImport}
        onConfirmImport={handleConfirmImport}
        onClose={() => setImportOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Hapus Transaksi Barang Masuk"
        message={`Hapus transaksi "${deleteTarget?.noBukti}" (${deleteTarget?.barangNama})? Kartu persediaan akan dihitung ulang otomatis.`}
        confirmLabel="Hapus"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppShell>
  );
}
