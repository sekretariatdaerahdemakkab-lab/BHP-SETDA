'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, ArrowRight, Lock, X } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useApp } from '@/components/context/AppContext';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { getRekapPersediaan } from '@/lib/firestore/laporan';
import { listBagian, listBarang } from '@/lib/firestore/master';
import { createMutasi, deleteMutasi, listMutasi, updateMutasi } from '@/lib/firestore/transaksi';
import {
  formatDateID,
  formatNumber,
  formatRupiah,
  getDefaultDateForYear,
} from '@/lib/format';
import type { Bagian, Barang, RekapPersediaanRow } from '@/lib/types';

interface MutasiRow {
  id: string;
  refMutasiId: string;
  tanggal: string;
  noBukti: string;
  bagianAsalId: string;
  bagianAsalKode: string;
  bagianAsalNama: string;
  bagianTujuanId: string;
  bagianTujuanKode: string;
  bagianTujuanNama: string;
  barangId: string;
  barangKode: string;
  barangNama: string;
  satuan: string;
  qty: number;
  totalNilai: number;
  keterangan: string;
  isLocked: boolean;
}

export function MutasiGudangClient() {
  const { user, firebaseUser, bagianList, tahun, selectedBagianId, isBagianLocked } = useApp();
  const { showToast } = useToast();

  const [rows, setRows] = useState<MutasiRow[]>([]);
  const [allBagian, setAllBagian] = useState<Bagian[]>([]);
  const [barangList, setBarangList] = useState<Barang[]>([]);
  const [rekapStock, setRekapStock] = useState<RekapPersediaanRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [bagianAsalId, setBagianAsalId] = useState('');
  const [bagianTujuanId, setBagianTujuanId] = useState('');
  const [tanggal, setTanggal] = useState(() => getDefaultDateForYear(tahun));
  const [noBukti, setNoBukti] = useState('');
  const [barangId, setBarangId] = useState('');
  const [qty, setQty] = useState('1');
  const [keterangan, setKeterangan] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingMutasi, setEditingMutasi] = useState<MutasiRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MutasiRow | null>(null);

  const canEdit = user?.role === 'Superadmin' || user?.role === 'Admin Persediaan';

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [mutList, bagData, brgData, rekData] = await Promise.all([
        listMutasi(user, tahun, selectedBagianId),
        listBagian(),
        listBarang(),
        getRekapPersediaan(user, {
          tahun,
          bulanDari: 1,
          bulanSampai: 12,
          requestedBagianId: selectedBagianId,
        }),
      ]);

      const bagMap = new Map(bagData.map((b) => [b.id, b]));
      const dedup = new Map<string, (typeof mutList)[number]>();
      for (const m of mutList) {
        const refKey = m.refMutasiId || m.id;
        const existing = dedup.get(refKey);
        if (!existing || m.jenis === 'MUTASI_KELUAR') {
          dedup.set(refKey, m);
        }
      }

      const mappedRows: MutasiRow[] = Array.from(dedup.values()).map((t) => {
        const asalId = t.jenis === 'MUTASI_KELUAR' ? t.bagianId : t.tujuanBagianId || '';
        const tujuanId = t.jenis === 'MUTASI_KELUAR' ? t.tujuanBagianId || '' : t.bagianId;
        const bagAsal = bagMap.get(asalId);
        const bagTujuan = bagMap.get(tujuanId);
        return {
          id: t.id,
          refMutasiId: t.refMutasiId || t.id,
          tanggal: t.tanggal,
          noBukti: t.noBukti,
          bagianAsalId: asalId,
          bagianAsalKode: bagAsal?.kode || '',
          bagianAsalNama: bagAsal?.nama || '-',
          bagianTujuanId: tujuanId,
          bagianTujuanKode: bagTujuan?.kode || '',
          bagianTujuanNama: bagTujuan?.nama || '-',
          barangId: t.barangId,
          barangKode: t.barangKode || '',
          barangNama: t.barangNama || '-',
          satuan: t.satuan || '-',
          qty: t.qty,
          totalNilai: t.totalNilai,
          keterangan: t.keterangan,
          isLocked: Boolean(t.isLocked),
        };
      });

      setRows(mappedRows);
      setAllBagian(bagData);
      setBarangList(brgData);
      setRekapStock(rekData);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal memuat riwayat mutasi gudang.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [user, tahun, selectedBagianId, showToast]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(t);
  }, [loadData]);

  const openModal = () => {
    const asal =
      isBagianLocked && user?.bagianId
        ? user.bagianId
        : selectedBagianId !== 'ALL'
        ? selectedBagianId
        : allBagian[0]?.id || '';
    const tujuan = allBagian.find((b) => b.id !== asal)?.id || '';
    setEditingMutasi(null);
    setBagianAsalId(asal);
    setBagianTujuanId(tujuan);
    setTanggal(getDefaultDateForYear(tahun));
    setNoBukti(`BA-MUT/001/${tahun}`);
    setBarangId(barangList[0]?.id || '');
    setQty('1');
    setKeterangan('');
    setModalOpen(true);
  };

  const openEditModal = (r: MutasiRow) => {
    setEditingMutasi(r);
    setBagianAsalId(r.bagianAsalId);
    setBagianTujuanId(r.bagianTujuanId);
    setTanggal(r.tanggal);
    setNoBukti(r.noBukti);
    setBarangId(r.barangId);
    setQty(String(r.qty));
    setKeterangan(r.keterangan || '');
    setModalOpen(true);
  };

  const getStokAsal = (bagId: string, brgId: string) => {
    const f = rekapStock.find((r) => r.bagianId === bagId && r.barangId === brgId);
    return f ? f.saldoAkhir : 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firebaseUser) return;
    if (bagianAsalId === bagianTujuanId) {
      showToast('Gudang Bagian Asal dan Tujuan tidak boleh sama.', 'error');
      return;
    }
    setSaving(true);
    try {
      const stockEntry = rekapStock.find(
        (r) => r.bagianId === bagianAsalId && r.barangId === barangId
      );
      const hargaSatuan =
        stockEntry && stockEntry.hargaSatuan > 0
          ? stockEntry.hargaSatuan
          : barangList.find((b) => b.id === barangId)?.hargaStandar || 0;

      if (editingMutasi) {
        await updateMutasi(user, firebaseUser.uid, {
          refMutasiId: editingMutasi.refMutasiId,
          tujuanBagianId: bagianTujuanId,
          tanggal,
          noBukti,
          barangId,
          qty: Number(qty),
          hargaSatuan,
          keterangan,
        });
        showToast(
          'Mutasi antar bagian diperbarui dan saldo kedua Bagian disinkronkan.',
          'success'
        );
      } else {
        await createMutasi(user, firebaseUser.uid, {
          asalBagianId: bagianAsalId,
          tujuanBagianId: bagianTujuanId,
          tanggal,
          noBukti,
          barangId,
          qty: Number(qty),
          hargaSatuan,
          keterangan,
        });
        showToast(
          'Mutasi dual-entry berhasil dicatat pada Kartu Persediaan kedua Bagian.',
          'success'
        );
      }
      setModalOpen(false);
      setEditingMutasi(null);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan mutasi gudang.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !user || !firebaseUser) return;
    try {
      await deleteMutasi(user, firebaseUser.uid, deleteTarget.refMutasiId);
      showToast('Mutasi antar bagian dibatalkan dan saldo kedua gudang dihitung ulang.', 'success');
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus mutasi.', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <AppShell
      title="Mutasi Antar Bagian (Transfer Gudang)"
      subtitle={`Tahun Anggaran ${tahun} · Transaksi Dual-Entry Keluar Gudang Asal & Masuk Gudang Tujuan`}
    >
      <div className="bg-white rounded-xl border border-cyan-200/80 overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-cyan-500 to-sky-600" />
        <div className="px-5 py-4 bg-gradient-to-r from-cyan-50/75 via-white to-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Riwayat Transfer Antar Bagian</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Setiap transfer otomatis mencatat keluar di gudang asal dan masuk di gudang tujuan
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={openModal}
              className="h-9 px-4 inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-white bg-cyan-700 rounded-lg hover:bg-cyan-800 transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Mutasi Baru</span>
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm text-left">
            <thead className="bg-cyan-50/50 border-b border-cyan-100 text-xs text-cyan-950">
              <tr>
                <th className="px-4 py-3 font-semibold">Tanggal</th>
                <th className="px-4 py-3 font-semibold">No. Bukti</th>
                <th className="px-4 py-3 font-semibold">Arah Transfer Gudang</th>
                <th className="px-4 py-3 font-semibold">Barang</th>
                <th className="px-4 py-3 font-semibold text-right">Qty</th>
                <th className="px-4 py-3 font-semibold text-right">Nilai</th>
                {canEdit && <th className="px-4 py-3 font-semibold text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Memuat riwayat mutasi antar bagian...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Belum ada transaksi mutasi antar bagian pada Tahun {tahun}.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const canDelete =
                    canEdit &&
                    !r.isLocked &&
                    (!isBagianLocked || user?.bagianId === r.bagianAsalId);
                  return (
                    <tr key={r.id} className="hover:bg-cyan-50/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-slate-700">
                        {formatDateID(r.tanggal)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">
                        {r.noBukti}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold">
                          <span className="text-amber-800">{r.bagianAsalNama}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-cyan-600" />
                          <span className="text-emerald-800">{r.bagianTujuanNama}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{r.barangNama}</div>
                        {r.keterangan && (
                          <div className="text-[11px] text-slate-500">{r.keterangan}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-cyan-900 whitespace-nowrap">
                        {formatNumber(r.qty)} {r.satuan}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                        {formatRupiah(r.totalNilai)}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {r.isLocked ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                              <Lock className="w-3.5 h-3.5" /> Terkunci
                            </span>
                          ) : canDelete ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(r)}
                                className="p-1.5 text-slate-500 hover:text-cyan-700 rounded-md hover:bg-cyan-50 mr-1"
                                aria-label="Edit mutasi"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(r)}
                                className="p-1.5 text-slate-500 hover:text-red-600 rounded-md hover:bg-red-50"
                                aria-label="Batalkan mutasi"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">Masuk dari luar</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
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
                {editingMutasi
                  ? 'Edit Mutasi Antar Bagian'
                  : 'Mutasi Antar Bagian (Transfer Gudang)'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setEditingMutasi(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Gudang Asal
                </label>
                <select
                  value={bagianAsalId}
                  disabled={isBagianLocked || Boolean(editingMutasi)}
                  onChange={(e) => setBagianAsalId(e.target.value)}
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
                >
                  {(isBagianLocked ? bagianList : allBagian).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.kode} — {b.nama}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Gudang Tujuan
                </label>
                <select
                  value={bagianTujuanId}
                  onChange={(e) => setBagianTujuanId(e.target.value)}
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {allBagian
                    .filter((b) => b.id !== bagianAsalId)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.kode} — {b.nama}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tanggal Mutasi
                </label>
                <input
                  type="date"
                  required
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  className="w-full h-10 px-3 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  No. Berita Acara Mutasi
                </label>
                <input
                  type="text"
                  required
                  value={noBukti}
                  onChange={(e) => setNoBukti(e.target.value)}
                  className="w-full h-10 px-3 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Barang yang Ditransfer
              </label>
              <select
                value={barangId}
                onChange={(e) => setBarangId(e.target.value)}
                className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {barangList.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.kodeBarang} · {b.nama} (Stok Asal: {getStokAsal(bagianAsalId, b.id)}{' '}
                    {b.satuan})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Jumlah Transfer
                </label>
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  required
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="w-full h-10 px-3 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Keterangan
                </label>
                <input
                  type="text"
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  placeholder="Keperluan mutasi"
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setEditingMutasi(null);
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50"
              >
                {saving
                  ? 'Memproses...'
                  : editingMutasi
                  ? 'Simpan Perubahan Mutasi'
                  : 'Proses Transfer Gudang'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Batalkan Mutasi Antar Bagian"
        message={`Membatalkan mutasi "${deleteTarget?.noBukti}" akan menghapus catatan keluar dari ${deleteTarget?.bagianAsalNama} dan masuk di ${deleteTarget?.bagianTujuanNama}. Lanjutkan?`}
        confirmLabel="Ya, Batalkan Mutasi"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppShell>
  );
}
