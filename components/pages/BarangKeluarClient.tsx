'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Upload,
  FileSpreadsheet,
  Lock,
  Search,
  X,
  ClipboardCheck,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useApp } from '@/components/context/AppContext';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ExcelImportModal, ParsedPreviewRow } from '@/components/excel/ExcelImportModal';
import { getRekapPersediaan } from '@/lib/firestore/laporan';
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
  parseExcelDateISO,
  parseFlexibleNumber,
} from '@/lib/format';
import type { Barang, RekapPersediaanRow, TransaksiPersediaan } from '@/lib/types';

interface DraftKeluarRow {
  key: string;
  tanggal: string;
  noBukti: string;
  barangId: string;
  qty: string;
  keterangan: string;
}

export function BarangKeluarClient() {
  const { user, firebaseUser, bagianList, tahun, selectedBagianId, isBagianLocked } = useApp();
  const { showToast } = useToast();

  const [rows, setRows] = useState<TransaksiPersediaan[]>([]);
  const [barangList, setBarangList] = useState<Barang[]>([]);
  const [rekapStock, setRekapStock] = useState<RekapPersediaanRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [formBagianId, setFormBagianId] = useState('');
  const [draftRows, setDraftRows] = useState<DraftKeluarRow[]>([]);
  const [saving, setSaving] = useState(false);

  const [opnameOpen, setOpnameOpen] = useState(false);
  const [opBagianId, setOpBagianId] = useState('');
  const [opTanggal, setOpTanggal] = useState(() => getDefaultDateForYear(tahun));
  const [opNoBukti, setOpNoBukti] = useState('');
  const [opBarangId, setOpBarangId] = useState('');
  const [opStokFisik, setOpStokFisik] = useState('0');
  const [opKet, setOpKet] = useState('');

  const [editItem, setEditItem] = useState<TransaksiPersediaan | null>(null);
  const [editTanggal, setEditTanggal] = useState('');
  const [editNoBukti, setEditNoBukti] = useState('');
  const [editBarangId, setEditBarangId] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editKet, setEditKet] = useState('');

  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TransaksiPersediaan | null>(null);

  const loadAll = useCallback(async () => {
    if (!user) return;
    try {
      const [trxData, brgData, rekData] = await Promise.all([
        listTransaksi(user, {
          tahun,
          requestedBagianId: selectedBagianId,
          jenisList: ['KELUAR', 'OPNAME_MASUK', 'OPNAME_KELUAR'],
        }),
        listBarang(),
        getRekapPersediaan(user, {
          tahun,
          bulanDari: 1,
          bulanSampai: 12,
          requestedBagianId: selectedBagianId,
        }),
      ]);
      setRows(trxData);
      setBarangList(brgData);
      setRekapStock(rekData);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal memuat transaksi barang keluar.',
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
          (r.keterangan || '').toLowerCase().includes(q)
        );
      })
    : rows;

  const getAvailableStock = (bagianId: string, barangId: string) => {
    const found = rekapStock.find(
      (r) => r.bagianId === bagianId && r.barangId === barangId
    );
    return found ? found.saldoAkhir : 0;
  };

  const getUnitHarga = (bagianId: string, barangId: string) => {
    const found = rekapStock.find(
      (r) => r.bagianId === bagianId && r.barangId === barangId
    );
    if (found && found.hargaSatuan > 0) return found.hargaSatuan;
    return barangList.find((b) => b.id === barangId)?.hargaStandar || 0;
  };

  const activeFormBagian =
    isBagianLocked && user?.bagianId
      ? user.bagianId
      : formBagianId || (selectedBagianId !== 'ALL' ? selectedBagianId : bagianList[0]?.id || '');

  const openNewKeluar = () => {
    const defBagian =
      isBagianLocked && user?.bagianId
        ? user.bagianId
        : selectedBagianId !== 'ALL'
        ? selectedBagianId
        : bagianList[0]?.id || '';
    setFormBagianId(defBagian);
    setDraftRows([
      {
        key: `${Date.now()}`,
        tanggal: getDefaultDateForYear(tahun),
        noBukti: '',
        barangId: barangList[0]?.id || '',
        qty: '1',
        keterangan: '',
      },
    ]);
    setFormOpen(true);
  };

  const addDraftKeluarRow = () => {
    setDraftRows((prev) => {
      const last = prev[prev.length - 1];
      return [
        ...prev,
        {
          key: `${Date.now()}-${Math.random()}`,
          tanggal: last?.tanggal || getDefaultDateForYear(tahun),
          noBukti: last?.noBukti || '',
          barangId: barangList[0]?.id || '',
          qty: '1',
          keterangan: '',
        },
      ];
    });
  };

  const openOpnameModal = () => {
    const defBagian =
      isBagianLocked && user?.bagianId
        ? user.bagianId
        : selectedBagianId !== 'ALL'
        ? selectedBagianId
        : bagianList[0]?.id || '';
    const firstBarang = barangList[0]?.id || '';
    setOpBagianId(defBagian);
    setOpTanggal(getDefaultDateForYear(tahun));
    setOpNoBukti(`BA-SO/001/${tahun}`);
    setOpBarangId(firstBarang);
    setOpStokFisik(String(getAvailableStock(defBagian, firstBarang)));
    setOpKet('Penyesuaian hasil Stock Opname fisik');
    setOpnameOpen(true);
  };

  const handleSaveBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firebaseUser) return;
    if (!activeFormBagian) {
      showToast('Pilih Gudang Bagian terlebih dahulu.', 'error');
      return;
    }
    if (
      draftRows.some(
        (d) =>
          !d.tanggal ||
          !d.noBukti.trim() ||
          !d.barangId ||
          !Number.isFinite(Number(d.qty)) ||
          Number(d.qty) <= 0
      )
    ) {
      showToast(
        'Tanggal, Nomor Bukti, Barang, dan Qty (> 0) wajib valid pada setiap baris.',
        'error'
      );
      return;
    }
    setSaving(true);
    try {
      const inserted = await createTransaksiBatch(user, firebaseUser.uid, {
        mode: 'KELUAR',
        bagianId: activeFormBagian,
        items: draftRows.map((d) => ({
          tanggal: d.tanggal,
          noBukti: d.noBukti.trim(),
          barangId: d.barangId,
          qty: Number(d.qty),
          hargaSatuan: getUnitHarga(activeFormBagian, d.barangId),
          keterangan: d.keterangan.trim() || 'Pemakaian internal bagian',
        })),
      });
      showToast(`Berhasil mencatat ${inserted} item Barang Keluar.`, 'success');
      setFormOpen(false);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mencatat pemakaian barang.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOpname = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firebaseUser) return;
    if (!opBagianId || !opBarangId || !opTanggal || !opNoBukti.trim()) {
      showToast('Gudang Bagian, Barang, Tanggal, dan Nomor BA Opname wajib diisi.', 'error');
      return;
    }
    const stokFisik = Number(opStokFisik);
    if (!Number.isFinite(stokFisik) || stokFisik < 0) {
      showToast('Stok fisik hasil hitung harus berupa angka >= 0.', 'error');
      return;
    }
    setSaving(true);
    try {
      const currentSaldo = getAvailableStock(opBagianId, opBarangId);
      const diff = stokFisik - currentSaldo;
      if (Math.abs(diff) < 0.0001) {
        showToast('Stok fisik sudah sama dengan saldo sistem (tidak ada selisih).', 'info');
        setOpnameOpen(false);
        return;
      }

      await createTransaksiBatch(user, firebaseUser.uid, {
        mode: 'OPNAME',
        bagianId: opBagianId,
        tanggal: opTanggal,
        noBukti: opNoBukti.trim(),
        keterangan: opKet.trim() || 'Penyesuaian hasil Stock Opname fisik',
        items: [
          {
            barangId: opBarangId,
            qty: Math.abs(diff),
            hargaSatuan: getUnitHarga(opBagianId, opBarangId),
            jenisOpname: diff > 0 ? 'OPNAME_MASUK' : 'OPNAME_KELUAR',
          },
        ],
      });
      showToast('Penyesuaian Stock Opname dicatat pada Kartu Persediaan.', 'success');
      setOpnameOpen(false);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan stock opname.', 'error');
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
    setEditKet(item.keterangan || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItem || !user || !firebaseUser) return;
    if (!editTanggal || !editNoBukti.trim() || !editBarangId) {
      showToast('Tanggal, Nomor Bukti, dan Barang wajib diisi.', 'error');
      return;
    }
    const parsedQty = Number(editQty);
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      showToast('Jumlah barang keluar harus berupa angka valid lebih dari 0.', 'error');
      return;
    }
    setSaving(true);
    try {
      const hargaSatuan =
        editBarangId === editItem.barangId
          ? editItem.hargaSatuan
          : getUnitHarga(editItem.bagianId, editBarangId);

      await updateTransaksi(user, firebaseUser.uid, {
        id: editItem.id,
        tanggal: editTanggal,
        noBukti: editNoBukti.trim(),
        barangId: editBarangId,
        qty: Number(editQty),
        hargaSatuan,
        keterangan: editKet,
      });
      showToast('Transaksi barang keluar diperbarui dan saldo dihitung ulang.', 'success');
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
      showToast('Transaksi dihapus dan saldo dihitung ulang.', 'success');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus transaksi.', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleDownloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const sample = [
      {
        tanggal: getDefaultDateForYear(tahun),
        no_bukti: `SPB/099/${tahun}`,
        kode_atau_nama_barang: barangList[0]?.kodeBarang || 'BHP-001',
        qty: 2,
        keterangan: 'Pemakaian subbag tata usaha',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template_Barang_Keluar');
    XLSX.writeFile(wb, `Template_Barang_Keluar_${tahun}.xlsx`);
    showToast('Template Excel Barang Keluar diunduh.', 'success');
  };

  const handleParseImport = (rawRows: Record<string, unknown>[]): ParsedPreviewRow[] => {
    const targetBagian =
      isBagianLocked && user?.bagianId
        ? user.bagianId
        : selectedBagianId !== 'ALL'
        ? selectedBagianId
        : bagianList[0]?.id || '';

    return rawRows.map((raw, idx) => {
      const tgl = parseExcelDateISO(
        raw.tanggal ?? raw.Tanggal,
        getDefaultDateForYear(tahun)
      );
      const bukti = String(raw.no_bukti ?? raw.No_Bukti ?? '').trim();
      const itemKey = String(
        raw.kode_atau_nama_barang ?? raw.kode_barang ?? raw.nama_barang ?? ''
      ).trim();
      const qty = parseFlexibleNumber(raw.qty ?? raw.Qty ?? 0);
      const ket = String(raw.keterangan ?? raw.Keterangan ?? '').trim();

      const matched = barangList.find(
        (b) =>
          b.kodeBarang.toLowerCase() === itemKey.toLowerCase() ||
          b.nama.toLowerCase() === itemKey.toLowerCase()
      );

      let error = '';
      if (!targetBagian) error = 'Gudang Bagian belum tersedia';
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) error = 'Tanggal harus YYYY-MM-DD';
      else if (!bukti) error = 'No Bukti kosong';
      else if (!matched) error = `Barang "${itemKey}" tidak ditemukan`;
      else if (!Number.isFinite(qty) || qty <= 0) error = 'Qty harus > 0';

      return {
        rowNumber: idx + 2,
        valid: !error,
        error,
        raw: {
          bagianId: targetBagian,
          jenis: 'KELUAR',
          tanggal: tgl,
          noBukti: bukti,
          barangId: matched?.id,
          qty,
          keterangan: ket,
        },
        display: {
          tanggal: tgl,
          noBukti: bukti || '-',
          barang: matched ? matched.nama : itemKey || '-',
          qty: Number.isFinite(qty) ? qty : 0,
          keterangan: ket || '-',
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
          keterangan: string;
        };
        const ket = raw.keterangan || 'Pemakaian internal bagian';
        const gk = `${raw.bagianId}||${raw.tanggal}||${raw.noBukti}||${ket}`;
        const existing = grouped.get(gk) || {
          bagianId: raw.bagianId,
          tanggal: raw.tanggal,
          noBukti: raw.noBukti,
          keterangan: ket,
          items: [],
        };
        existing.items.push({
          barangId: raw.barangId,
          qty: raw.qty,
          hargaSatuan: getUnitHarga(raw.bagianId, raw.barangId),
        });
        grouped.set(gk, existing);
      }

      let inserted = 0;
      for (const [, grp] of grouped) {
        inserted += await createTransaksiBatch(user, firebaseUser.uid, {
          mode: 'KELUAR',
          bagianId: grp.bagianId,
          tanggal: grp.tanggal,
          noBukti: grp.noBukti,
          keterangan: grp.keterangan,
          items: grp.items,
        });
      }
      showToast(`Berhasil mengimpor ${inserted} baris Barang Keluar.`, 'success');
      await loadAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengimpor barang keluar.';
      showToast(msg, 'error');
      throw err;
    }
  };

  if (user && user.role === 'Pengurus Barang') {
    return (
      <AppShell title="Barang Keluar & Stock Opname">
        <div className="bg-white rounded-xl border border-amber-200 p-6 text-sm text-amber-800">
          Menu Barang Keluar &amp; Stock Opname hanya tersedia untuk Superadmin dan Admin Persediaan. Pengurus Barang memiliki akses khusus pada menu Plafon &amp; Rekon serta pelaporan.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Barang Keluar & Stock Opname"
      subtitle={`Tahun Anggaran ${tahun} · Pencatatan Pemakaian Internal & Penyesuaian Stok Fisik`}
    >
      <div className="bg-white rounded-xl border border-amber-200/80 overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-amber-500 to-orange-500" />
        <div className="px-5 py-4 bg-gradient-to-r from-amber-50/75 via-white to-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-amber-600/70 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari barang, no SPB, keterangan..."
              className="w-full h-9 pl-9 pr-3 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
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
              className="h-9 px-3 inline-flex items-center gap-1.5 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 whitespace-nowrap"
            >
              <Upload className="w-4 h-4" />
              <span>Import Excel</span>
            </button>
            <button
              type="button"
              onClick={openOpnameModal}
              className="h-9 px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 whitespace-nowrap"
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>Stock Opname</span>
            </button>
            <button
              type="button"
              onClick={openNewKeluar}
              className="h-9 px-4 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Catat Barang Keluar</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm text-left">
            <thead className="bg-amber-50/50 border-b border-amber-100 text-xs text-amber-950">
              <tr>
                <th className="px-4 py-3 font-semibold">Tanggal</th>
                <th className="px-4 py-3 font-semibold">No. Bukti</th>
                <th className="px-4 py-3 font-semibold">Jenis</th>
                <th className="px-4 py-3 font-semibold">Bagian</th>
                <th className="px-4 py-3 font-semibold">Nama Barang</th>
                <th className="px-4 py-3 font-semibold text-right">Qty</th>
                <th className="px-4 py-3 font-semibold text-right">Nilai Estimasi</th>
                <th className="px-4 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Memuat transaksi keluar & opname...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Belum ada pemakaian barang atau stock opname pada Tahun {tahun}.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr key={r.id} className="hover:bg-amber-50/30 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-slate-700">
                      {formatDateID(r.tanggal)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">
                      {r.noBukti}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold">
                      <span
                        className={
                          r.jenis === 'OPNAME_MASUK'
                            ? 'text-emerald-700'
                            : r.jenis === 'OPNAME_KELUAR'
                            ? 'text-rose-700'
                            : 'text-amber-800'
                        }
                      >
                        {r.jenis === 'KELUAR'
                          ? 'Pemakaian'
                          : r.jenis === 'OPNAME_MASUK'
                          ? 'Opname (+)'
                          : 'Opname (-)'}
                      </span>
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
                    <td
                      className={`px-4 py-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                        r.jenis === 'OPNAME_MASUK' ? 'text-emerald-700' : 'text-amber-800'
                      }`}
                    >
                      {r.jenis === 'OPNAME_MASUK' ? '+' : '-'}
                      {formatNumber(r.qty)} {r.satuan}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                      {formatRupiah(r.totalNilai)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {r.isLocked ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                          <Lock className="w-3.5 h-3.5" /> Terkunci
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditModal(r)}
                            className="p-1.5 text-slate-500 hover:text-amber-700 rounded-md hover:bg-amber-50 mr-1"
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

      {/* Multi-row Barang Keluar modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSaveBatch}
            className="w-full max-w-6xl max-h-[90vh] flex flex-col bg-white rounded-xl border border-slate-200 shadow-xl"
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Input Pemakaian Barang (Multi-Baris)
                </h3>
                <p className="text-xs text-slate-500">
                  Saldo stok dicek otomatis agar tidak negatif pada Kartu Persediaan
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

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Gudang Bagian
                  </label>
                  <select
                    value={activeFormBagian}
                    disabled={isBagianLocked}
                    onChange={(e) => setFormBagianId(e.target.value)}
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
                  Tanggal dan Nomor BAST/Nota/SPB diatur per baris. Menambah baris akan menyalin tanggal dan nomor bukti dari baris sebelumnya.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Daftar Item Pemakaian ({draftRows.length} Baris)
                  </span>
                  <button
                    type="button"
                    onClick={addDraftKeluarRow}
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
                        <th className="px-3 py-2 font-semibold min-w-[165px]">No. BAST / Nota / SPB</th>
                        <th className="px-3 py-2 font-semibold min-w-[230px]">Barang (Tersedia di Gudang)</th>
                        <th className="px-3 py-2 font-semibold w-28">Qty Keluar</th>
                        <th className="px-3 py-2 font-semibold min-w-[180px]">Keterangan Pemakaian</th>
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
                                setDraftRows((prev) =>
                                  prev.map((x) =>
                                    x.key === row.key ? { ...x, tanggal: e.target.value } : x
                                  )
                                )
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
                                setDraftRows((prev) =>
                                  prev.map((x) =>
                                    x.key === row.key ? { ...x, noBukti: e.target.value } : x
                                  )
                                )
                              }
                              placeholder={`SPB/001/${tahun}`}
                              className="w-full h-9 px-2 font-mono border border-slate-300 rounded-md"
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={row.barangId}
                              onChange={(e) =>
                                setDraftRows((prev) =>
                                  prev.map((x) =>
                                    x.key === row.key ? { ...x, barangId: e.target.value } : x
                                  )
                                )
                              }
                              className="w-full h-9 px-2 border border-slate-300 rounded-md bg-white"
                            >
                              {barangList.map((b) => {
                                const avail = getAvailableStock(activeFormBagian, b.id);
                                return (
                                  <option key={b.id} value={b.id}>
                                    {b.kodeBarang} · {b.nama} [Stok: {avail} {b.satuan}]
                                  </option>
                                );
                              })}
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min={0.01}
                              step="any"
                              required
                              value={row.qty}
                              onChange={(e) =>
                                setDraftRows((prev) =>
                                  prev.map((x) =>
                                    x.key === row.key ? { ...x, qty: e.target.value } : x
                                  )
                                )
                              }
                              className="w-full h-9 px-2 text-right font-mono border border-slate-300 rounded-md"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={row.keterangan}
                              onChange={(e) =>
                                setDraftRows((prev) =>
                                  prev.map((x) =>
                                    x.key === row.key ? { ...x, keterangan: e.target.value } : x
                                  )
                                )
                              }
                              placeholder="Misal: Pemakaian Rapat / Subbag"
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

            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3 bg-slate-50 rounded-b-xl">
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
                {saving ? 'Menyimpan...' : 'Simpan Barang Keluar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Stock Opname Modal */}
      {opnameOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSaveOpname}
            className="w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Pencatatan Stock Opname Fisik
              </h3>
              <button
                type="button"
                onClick={() => setOpnameOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Gudang Bagian
              </label>
              <select
                value={opBagianId}
                disabled={isBagianLocked}
                onChange={(e) => {
                  const newBag = e.target.value;
                  setOpBagianId(newBag);
                  setOpStokFisik(String(getAvailableStock(newBag, opBarangId)));
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tanggal Opname
                </label>
                <input
                  type="date"
                  required
                  value={opTanggal}
                  onChange={(e) => setOpTanggal(e.target.value)}
                  className="w-full h-10 px-3 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor BA Opname
                </label>
                <input
                  type="text"
                  required
                  value={opNoBukti}
                  onChange={(e) => setOpNoBukti(e.target.value)}
                  className="w-full h-10 px-3 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Item Barang</label>
              <select
                value={opBarangId}
                onChange={(e) => {
                  const brgId = e.target.value;
                  setOpBarangId(brgId);
                  setOpStokFisik(String(getAvailableStock(opBagianId, brgId)));
                }}
                className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {barangList.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.kodeBarang} · {b.nama} ({b.satuan})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div>
                <p className="text-xs text-slate-500">Saldo di Aplikasi</p>
                <p className="text-lg font-bold font-mono tabular-nums text-slate-900">
                  {formatNumber(getAvailableStock(opBagianId, opBarangId))}
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Stok Fisik Hasil Hitung
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  required
                  value={opStokFisik}
                  onChange={(e) => setOpStokFisik(e.target.value)}
                  className="w-full h-9 px-3 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Keterangan</label>
              <input
                type="text"
                value={opKet}
                onChange={(e) => setOpKet(e.target.value)}
                className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpnameOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800"
              >
                Simpan Penyesuaian Opname
              </button>
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
              <h3 className="text-base font-bold text-slate-900">
                {editItem.jenis === 'KELUAR'
                  ? 'Edit Barang Keluar'
                  : 'Edit Penyesuaian Stock Opname'}
              </h3>
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
                  No. Bukti (BAST / Nota / SPB)
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
                    {b.kodeBarang} · {b.nama} ({b.satuan})
                  </option>
                ))}
              </select>
            </div>
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
                className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ExcelImportModal
        open={importOpen}
        title="Import Massal Transaksi Barang Keluar"
        description="Kolom template: tanggal (YYYY-MM-DD), no_bukti, kode_atau_nama_barang, qty, keterangan"
        columns={[
          { key: 'tanggal', label: 'Tanggal' },
          { key: 'noBukti', label: 'No Bukti' },
          { key: 'barang', label: 'Barang' },
          { key: 'qty', label: 'Qty', align: 'right' },
          { key: 'keterangan', label: 'Keterangan' },
        ]}
        onParseRows={handleParseImport}
        onConfirmImport={handleConfirmImport}
        onClose={() => setImportOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Hapus Transaksi Keluar"
        message={`Hapus catatan "${deleteTarget?.noBukti}" (${deleteTarget?.barangNama})?`}
        confirmLabel="Hapus"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppShell>
  );
}
