'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Lock,
  Unlock,
  CheckCircle2,
  Send,
  Save,
  Building2,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useApp } from '@/components/context/AppContext';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  deletePlafon,
  executeRekonAction as runRekonAction,
  listPlafonWithRealisasi,
  listRekon,
  savePlafon,
} from '@/lib/firestore/anggaran';
import { formatRupiah, NAMA_BULAN } from '@/lib/format';
import type { PlafonAnggaran, RekonPeriodeRow } from '@/lib/types';

export function AnggaranRekonClient() {
  const {
    user,
    firebaseUser,
    bagianList,
    tahun,
    selectedBagianId,
    setSelectedBagianId,
    isBagianLocked,
  } = useApp();
  const { showToast } = useToast();

  const [tab, setTab] = useState<'plafon' | 'rekon'>('plafon');

  // Plafon state
  const [plafonRows, setPlafonRows] = useState<PlafonAnggaran[]>([]);
  const [loadingPlafon, setLoadingPlafon] = useState(true);
  const [plafonModal, setPlafonModal] = useState(false);
  const [editingPlafon, setEditingPlafon] = useState<PlafonAnggaran | null>(null);
  const [pBagianId, setPBagianId] = useState('');
  const [pKodeRek, setPKodeRek] = useState('5.1.02.01.01.0024');
  const [pKegiatan, setPKegiatan] = useState('');
  const [pPagu, setPPagu] = useState('');
  const [savingPlafon, setSavingPlafon] = useState(false);
  const [deletePlafonTarget, setDeletePlafonTarget] = useState<PlafonAnggaran | null>(null);

  // Rekon state
  const [rekonMode, setRekonMode] = useState<'semester' | 'bulanan'>('semester');
  const [rekonRows, setRekonRows] = useState<RekonPeriodeRow[]>([]);
  const [loadingRekon, setLoadingRekon] = useState(true);
  const [rekonFilter, setRekonFilter] = useState<'Semua' | 'Selisih' | 'Cocok'>('Semua');
  const [rekonBulanFilter, setRekonBulanFilter] = useState<number | 'ALL'>('ALL');
  const [rekonSemesterFilter, setRekonSemesterFilter] = useState<1 | 2 | 'ALL'>('ALL');
  const [fungsionalDrafts, setFungsionalDrafts] = useState<Record<string, string>>({});
  const [catatanDrafts, setCatatanDrafts] = useState<Record<string, string>>({});
  const [rekonActionTarget, setRekonActionTarget] = useState<{
    action: 'submit' | 'approve' | 'unlock';
    row: RekonPeriodeRow;
  } | null>(null);

  const canManagePlafon =
    user?.role === 'Superadmin' || user?.role === 'Pengurus Barang';
  const canApproveUnlock = canManagePlafon;
  const canSubmitRekon = canManagePlafon;

  const loadPlafon = useCallback(async () => {
    if (!user) return;
    setLoadingPlafon(true);
    try {
      const data = await listPlafonWithRealisasi(user, tahun, selectedBagianId);
      setPlafonRows(data);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal memuat data plafon anggaran.',
        'error'
      );
    } finally {
      setLoadingPlafon(false);
    }
  }, [user, tahun, selectedBagianId, showToast]);

  const loadRekon = useCallback(async () => {
    if (!user) return;
    setLoadingRekon(true);
    try {
      const allRows = await listRekon(user, tahun, selectedBagianId, rekonMode);
      const byStatus =
        rekonFilter === 'Selisih'
          ? allRows.filter((r) => r.statusCocok === 'Selisih')
          : rekonFilter === 'Cocok'
          ? allRows.filter((r) => r.statusCocok === 'Cocok')
          : allRows;
      const data =
        rekonMode === 'semester'
          ? rekonSemesterFilter === 'ALL'
            ? byStatus
            : byStatus.filter((r) => r.semester === rekonSemesterFilter)
          : rekonBulanFilter === 'ALL'
          ? byStatus
          : byStatus.filter((r) => r.bulan === rekonBulanFilter);
      setRekonRows(data);
      const drafts: Record<string, string> = {};
      const notes: Record<string, string> = {};
      data.forEach((r) => {
        drafts[r.id] = String(r.nilaiFungsional);
        notes[r.id] = r.catatan || '';
      });
      setFungsionalDrafts(drafts);
      setCatatanDrafts(notes);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal memuat data rekonsiliasi.',
        'error'
      );
    } finally {
      setLoadingRekon(false);
    }
  }, [
    user,
    tahun,
    selectedBagianId,
    rekonMode,
    rekonFilter,
    rekonBulanFilter,
    rekonSemesterFilter,
    showToast,
  ]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadPlafon();
    }, 0);
    return () => clearTimeout(t);
  }, [loadPlafon]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadRekon();
    }, 0);
    return () => clearTimeout(t);
  }, [loadRekon]);

  const openCreatePlafon = () => {
    setEditingPlafon(null);
    setPBagianId(
      isBagianLocked && user?.bagianId
        ? user.bagianId
        : selectedBagianId !== 'ALL'
        ? selectedBagianId
        : bagianList[0]?.id || ''
    );
    setPKodeRek('5.1.02.01.01.0024');
    setPKegiatan('');
    setPPagu('');
    setPlafonModal(true);
  };

  const openEditPlafon = (item: PlafonAnggaran) => {
    setEditingPlafon(item);
    setPBagianId(item.bagianId);
    setPKodeRek(item.kodeRekening);
    setPKegiatan(item.namaKegiatan);
    setPPagu(String(item.paguAnggaran));
    setPlafonModal(true);
  };

  const handleSavePlafon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firebaseUser) return;
    setSavingPlafon(true);
    try {
      await savePlafon(user, firebaseUser.uid, {
        id: editingPlafon?.id,
        tahun,
        bagianId: pBagianId,
        kodeRekening: pKodeRek,
        namaKegiatan: pKegiatan,
        paguAnggaran: Number(pPagu) || 0,
      });
      showToast('Plafon anggaran berhasil disimpan.', 'success');
      setPlafonModal(false);
      await loadPlafon();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan plafon anggaran.', 'error');
    } finally {
      setSavingPlafon(false);
    }
  };

  const handleDeletePlafon = async () => {
    if (!deletePlafonTarget || !user) return;
    try {
      await deletePlafon(user, deletePlafonTarget.id);
      showToast('Pos plafon anggaran berhasil dihapus.', 'success');
      await loadPlafon();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus plafon.', 'error');
    } finally {
      setDeletePlafonTarget(null);
    }
  };

  const handleSaveFungsional = async (row: RekonPeriodeRow) => {
    if (!user || !firebaseUser) return;
    const nilaiFungsional = Number(fungsionalDrafts[row.id]) || 0;
    const catatan = catatanDrafts[row.id] || '';

    try {
      await runRekonAction(user, firebaseUser.uid, {
        action: 'save_fungsional',
        tahun,
        bulan: row.bulan,
        bagianId: row.bagianId,
        mode: row.periodeTipe === 'SEMESTER' ? 'semester' : 'bulanan',
        semester: row.semester,
        nilaiFungsional,
        catatan,
      });
      showToast(`Nilai fungsional ${row.namaBulan} disimpan.`, 'success');
      await loadRekon();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal menyimpan nilai fungsional.',
        'error'
      );
    }
  };

  const handleConfirmRekonAction = async () => {
    if (!rekonActionTarget || !user || !firebaseUser) return;
    const { action, row } = rekonActionTarget;
    try {
      await runRekonAction(user, firebaseUser.uid, {
        action,
        tahun,
        bulan: row.bulan,
        bagianId: row.bagianId,
        mode: row.periodeTipe === 'SEMESTER' ? 'semester' : 'bulanan',
        semester: row.semester,
        nilaiFungsional: Number(fungsionalDrafts[row.id]) || row.nilaiFungsional,
        catatan: catatanDrafts[row.id] ?? row.catatan,
      });
      const msg =
        action === 'submit'
          ? `Laporan Rekon ${row.namaBulan} (${row.bagianNama}) dikirim & periode dikunci.`
          : action === 'approve'
          ? `Rekon ${row.namaBulan} (${row.bagianNama}) disetujui.`
          : `Kunci periode ${row.namaBulan} (${row.bagianNama}) dibuka kembali.`;
      showToast(msg, 'success');
      await loadRekon();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal memproses status rekonsiliasi.',
        'error'
      );
    } finally {
      setRekonActionTarget(null);
    }
  };

  const totalPagu = plafonRows.reduce((a, p) => a + p.paguAnggaran, 0);
  const totalRealisasiPlafon = plafonRows.reduce((a, p) => a + p.realisasi, 0);
  const totalSisaPagu = totalPagu - totalRealisasiPlafon;

  const activeBagianLabel =
    selectedBagianId === 'ALL'
      ? 'Semua Bagian (Setda)'
      : bagianList.find((b) => b.id === selectedBagianId)?.nama || 'Bagian Terpilih';

  return (
    <AppShell
      title="Plafon Anggaran & Rekon Fungsional"
      subtitle={`Tahun Anggaran ${tahun} · ${activeBagianLabel}`}
    >
      {/* Segmented Tab & Filter Bagian */}
      <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex p-1 bg-indigo-100/70 border border-indigo-200/70 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('plafon')}
            className={`px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'plafon'
                ? 'bg-white text-indigo-900 shadow-sm'
                : 'text-indigo-800/70 hover:text-indigo-950'
            }`}
          >
            Plafon Pagu Anggaran
          </button>
          <button
            type="button"
            onClick={() => setTab('rekon')}
            className={`px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'rekon'
                ? 'bg-white text-indigo-900 shadow-sm'
                : 'text-indigo-800/70 hover:text-indigo-950'
            }`}
          >
            Rekon Fungsional & Kunci Periode
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Filter Bagian */}
          <div className="flex items-center gap-2 bg-white border border-indigo-200 rounded-lg px-3 h-9">
            <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">
              Bagian:
            </span>
            {isBagianLocked ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-800 whitespace-nowrap">
                <Lock className="w-3 h-3 text-slate-500" />
                {user?.bagianNama || 'Bagian Terkait'}
              </span>
            ) : (
              <select
                aria-label="Filter Bagian Plafon & Rekon"
                value={selectedBagianId}
                onChange={(e) => setSelectedBagianId(e.target.value)}
                className="text-xs sm:text-sm font-semibold text-slate-900 bg-transparent focus:outline-none pr-1 cursor-pointer"
              >
                <option value="ALL">Semua Bagian (Setda)</option>
                {bagianList.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.kode} — {b.nama}
                  </option>
                ))}
              </select>
            )}
          </div>

          {tab === 'plafon' && canManagePlafon && (
            <button
              type="button"
              onClick={openCreatePlafon}
              className="h-9 px-4 inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Pos Plafon</span>
            </button>
          )}
        </div>
      </div>

      {tab === 'plafon' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-indigo-50/90 via-white to-violet-50/50 rounded-xl border border-indigo-200 overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-indigo-500 to-violet-600" />
              <div className="px-4 py-3">
                <p className="text-xs font-semibold text-indigo-800">
                  Total Pagu ({activeBagianLabel})
                </p>
                <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {formatRupiah(totalPagu)}
                </p>
              </div>
            </div>
            <div className="bg-gradient-to-br from-teal-50/90 via-white to-emerald-50/50 rounded-xl border border-teal-200 overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-teal-500 to-emerald-500" />
              <div className="px-4 py-3">
                <p className="text-xs font-semibold text-teal-800">Total Realisasi (YTD)</p>
                <p className="text-lg font-bold font-mono tabular-nums text-teal-700 mt-1">
                  {formatRupiah(totalRealisasiPlafon)}
                </p>
              </div>
            </div>
            <div
              className={`rounded-xl border overflow-hidden ${
                totalSisaPagu < 0
                  ? 'bg-gradient-to-br from-rose-50/90 via-white to-red-50/50 border-rose-200'
                  : 'bg-gradient-to-br from-sky-50/90 via-white to-cyan-50/50 border-sky-200'
              }`}
            >
              <div
                className={`h-1 w-full ${
                  totalSisaPagu < 0
                    ? 'bg-gradient-to-r from-rose-500 to-red-600'
                    : 'bg-gradient-to-r from-sky-500 to-cyan-500'
                }`}
              />
              <div className="px-4 py-3">
                <p
                  className={`text-xs font-semibold ${
                    totalSisaPagu < 0 ? 'text-rose-800' : 'text-sky-800'
                  }`}
                >
                  Sisa Pagu Anggaran
                </p>
                <p
                  className={`text-lg font-bold font-mono tabular-nums mt-1 ${
                    totalSisaPagu < 0 ? 'text-red-700' : 'text-slate-900'
                  }`}
                >
                  {formatRupiah(totalSisaPagu)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-indigo-500 to-violet-600" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-indigo-50/60 border-b border-indigo-100 text-xs text-indigo-950">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Bagian</th>
                    <th className="px-4 py-3 font-semibold">Kode Rekening & Kegiatan</th>
                    <th className="px-4 py-3 font-semibold text-right">Pagu Anggaran</th>
                    <th className="px-4 py-3 font-semibold text-right">Realisasi (YTD)</th>
                    <th className="px-4 py-3 font-semibold text-right">Sisa Pagu</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    {canManagePlafon && <th className="px-4 py-3 font-semibold text-right">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingPlafon ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        Memuat data plafon anggaran...
                      </td>
                    </tr>
                  ) : plafonRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        Belum ada pos plafon anggaran untuk Tahun {tahun}.
                      </td>
                    </tr>
                  ) : (
                    plafonRows.map((p) => (
                      <tr key={p.id} className="hover:bg-indigo-50/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                          {p.bagianKode} · {p.bagianNama}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{p.namaKegiatan}</div>
                          <div className="text-xs font-mono text-indigo-700/80">{p.kodeRekening}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                          {formatRupiah(p.paguAnggaran)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-teal-700 font-medium">
                          {formatRupiah(p.realisasi)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-mono tabular-nums font-semibold ${
                            p.sisaPagu < 0 ? 'text-red-700' : 'text-slate-900'
                          }`}
                        >
                          {formatRupiah(p.sisaPagu)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`text-xs font-semibold ${
                              p.statusAnggaran === 'Melebihi Pagu'
                                ? 'text-red-700'
                                : p.statusAnggaran === 'Peringatan'
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                            }`}
                          >
                            {p.statusAnggaran} ({p.persentase}%)
                          </span>
                        </td>
                        {canManagePlafon && (
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => openEditPlafon(p)}
                              className="p-1.5 text-slate-500 hover:text-indigo-700 rounded-md hover:bg-indigo-50 mr-1"
                              aria-label="Edit Plafon"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletePlafonTarget(p)}
                              className="p-1.5 text-slate-500 hover:text-red-600 rounded-md hover:bg-red-50"
                              aria-label="Hapus Plafon"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
                {plafonRows.length > 0 && (
                  <tfoot className="bg-indigo-50/40 border-t border-indigo-200 font-bold text-slate-900">
                    <tr>
                      <td colSpan={2} className="px-4 py-3 text-right text-xs uppercase tracking-wider">
                        Total {activeBagianLabel}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {formatRupiah(totalPagu)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-teal-800">
                        {formatRupiah(totalRealisasiPlafon)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono tabular-nums ${
                          totalSisaPagu < 0 ? 'text-red-700' : 'text-slate-900'
                        }`}
                      >
                        {formatRupiah(totalSisaPagu)}
                      </td>
                      <td colSpan={canManagePlafon ? 2 : 1} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-indigo-50/80 via-white to-white rounded-xl border border-indigo-200 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-700 max-w-xl">
              {rekonMode === 'semester' ? (
                <span>
                  Rekon per Semester: <strong className="text-indigo-900">Semester I (Jan - Jun)</strong> dan{' '}
                  <strong className="text-indigo-900">Semester II (Jan - Des)</strong> membandingkan total belanja masuk kumulatif
                  dengan anggaran fungsional Bendahara. Mengirim rekon mengunci periode terkait.
                </span>
              ) : (
                <span>
                  Membandingkan total belanja barang masuk persediaan aplikasi dengan laporan
                  fungsional Bendahara per bulan. Mengirim rekon otomatis mengunci transaksi bulan
                  tersebut.
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex p-1 bg-indigo-100/70 rounded-lg">
                <button
                  type="button"
                  onClick={() => setRekonMode('semester')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    rekonMode === 'semester'
                      ? 'bg-white text-indigo-800 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semesteran
                </button>
                <button
                  type="button"
                  onClick={() => setRekonMode('bulanan')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    rekonMode === 'bulanan'
                      ? 'bg-white text-indigo-800 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Bulanan
                </button>
              </div>

              {rekonMode === 'semester' ? (
                <select
                  aria-label="Filter Semester Rekon"
                  value={rekonSemesterFilter}
                  onChange={(e) =>
                    setRekonSemesterFilter(
                      e.target.value === 'ALL' ? 'ALL' : (Number(e.target.value) as 1 | 2)
                    )
                  }
                  className="h-8 px-2.5 text-xs font-medium border border-indigo-200 rounded-lg bg-white text-slate-800"
                >
                  <option value="ALL">Semua Semester</option>
                  <option value={1}>Semester I (Jan - Jun)</option>
                  <option value={2}>Semester II (Jan - Des)</option>
                </select>
              ) : (
                <select
                  aria-label="Filter Bulan Rekon"
                  value={rekonBulanFilter}
                  onChange={(e) =>
                    setRekonBulanFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
                  }
                  className="h-8 px-2.5 text-xs font-medium border border-indigo-200 rounded-lg bg-white text-slate-800"
                >
                  <option value="ALL">Semua Bulan (Jan - Des)</option>
                  {NAMA_BULAN.map((b, idx) => (
                    <option key={b} value={idx + 1}>
                      Bulan {b}
                    </option>
                  ))}
                </select>
              )}

              <div className="inline-flex p-1 bg-slate-100 rounded-lg">
                {(['Semua', 'Selisih', 'Cocok'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setRekonFilter(f)}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      rekonFilter === f
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-indigo-500 to-violet-600" />
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm text-left">
                <thead className="bg-indigo-50/60 border-b border-indigo-100 text-xs text-indigo-950">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Periode & Bagian</th>
                    <th className="px-4 py-3 font-semibold text-right">Realisasi Aplikasi</th>
                    <th className="px-4 py-3 font-semibold text-right">Fungsional Bendahara</th>
                    <th className="px-4 py-3 font-semibold text-right">Selisih</th>
                    <th className="px-4 py-3 font-semibold">Status Rekon</th>
                    <th className="px-4 py-3 font-semibold text-right">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingRekon ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        Memuat data rekonsiliasi...
                      </td>
                    </tr>
                  ) : rekonRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        Tidak ada periode yang sesuai filter &quot;{rekonFilter}&quot;.
                      </td>
                    </tr>
                  ) : (
                    rekonRows.map((r) => {
                      const isLocked = r.status === 'Dikirim' || r.status === 'Disetujui';
                      return (
                        <tr key={r.id} className="hover:bg-indigo-50/30 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="font-semibold text-slate-900">
                              {r.periodeTipe === 'SEMESTER'
                                ? `${r.namaBulan} · ${r.tahun}`
                                : `${r.namaBulan} ${r.tahun}`}
                            </div>
                            <div className="text-xs text-slate-500">
                              {r.bagianKode} · {r.bagianNama}
                              {r.periodeLabel ? ` · ${r.periodeLabel}` : ''}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                            {formatRupiah(r.realisasiPersediaan)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              min={0}
                              disabled={isLocked || !canSubmitRekon}
                              value={fungsionalDrafts[r.id] ?? '0'}
                              onChange={(e) =>
                                setFungsionalDrafts((prev) => ({
                                  ...prev,
                                  [r.id]: e.target.value,
                                }))
                              }
                              className="w-36 h-8 px-2 text-right text-xs sm:text-sm font-mono tabular-nums border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-500"
                            />
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-mono tabular-nums font-semibold ${
                              r.statusCocok === 'Cocok' ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            <div>{formatRupiah(r.selisih)}</div>
                            <div className="text-[11px] font-sans">{r.statusCocok}</div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div
                              className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                                r.status === 'Disetujui'
                                  ? 'text-emerald-700'
                                  : r.status === 'Dikirim'
                                  ? 'text-amber-700'
                                  : 'text-slate-600'
                              }`}
                            >
                              {isLocked ? (
                                <Lock className="w-3.5 h-3.5" />
                              ) : (
                                <Unlock className="w-3.5 h-3.5" />
                              )}
                              <span>{r.status}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {!isLocked && canSubmitRekon && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleSaveFungsional(r)}
                                    className="h-8 px-2.5 inline-flex items-center gap-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                                    title="Simpan angka fungsional"
                                  >
                                    <Save className="w-3.5 h-3.5" />
                                    <span>Simpan</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRekonActionTarget({ action: 'submit', row: r })
                                    }
                                    className="h-8 px-2.5 inline-flex items-center gap-1 text-xs font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
                                  >
                                    <Send className="w-3.5 h-3.5" />
                                    <span>Kirim Rekon</span>
                                  </button>
                                </>
                              )}
                              {r.status === 'Dikirim' && canApproveUnlock && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRekonActionTarget({ action: 'approve', row: r })
                                  }
                                  className="h-8 px-2.5 inline-flex items-center gap-1 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Setujui</span>
                                </button>
                              )}
                              {isLocked && canApproveUnlock && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRekonActionTarget({ action: 'unlock', row: r })
                                  }
                                  className="h-8 px-2.5 inline-flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100"
                                >
                                  <Unlock className="w-3.5 h-3.5" />
                                  <span>Buka Kunci</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {plafonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSavePlafon}
            className="w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editingPlafon ? 'Edit Plafon Anggaran' : `Tambah Plafon Anggaran TA ${tahun}`}
              </h3>
              <button
                type="button"
                onClick={() => setPlafonModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Bagian</label>
              <select
                value={pBagianId}
                disabled={isBagianLocked}
                onChange={(e) => setPBagianId(e.target.value)}
                className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
              >
                {bagianList.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.kode} — {b.nama}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kode Rekening Belanja (DPA)
              </label>
              <input
                type="text"
                required
                value={pKodeRek}
                onChange={(e) => setPKodeRek(e.target.value)}
                className="w-full h-10 px-3 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Sub Kegiatan / Uraian Belanja
              </label>
              <input
                type="text"
                required
                value={pKegiatan}
                onChange={(e) => setPKegiatan(e.target.value)}
                placeholder="Contoh: Penyediaan Peralatan dan Perlengkapan Kantor"
                className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pagu Anggaran Tahunan (Rp)
              </label>
              <input
                type="number"
                min={0}
                required
                value={pPagu}
                onChange={(e) => setPPagu(e.target.value)}
                className="w-full h-10 px-3 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPlafonModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingPlafon}
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingPlafon ? 'Menyimpan...' : 'Simpan Plafon'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deletePlafonTarget)}
        title="Hapus Pos Plafon"
        message={`Hapus pos anggaran "${deletePlafonTarget?.namaKegiatan}"?`}
        confirmLabel="Hapus"
        danger
        onConfirm={handleDeletePlafon}
        onCancel={() => setDeletePlafonTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(rekonActionTarget)}
        title={
          rekonActionTarget?.action === 'submit'
            ? 'Kirim Laporan Rekon & Kunci Periode'
            : rekonActionTarget?.action === 'approve'
            ? 'Setujui Rekonsiliasi Periode'
            : 'Buka Kunci Periode'
        }
        message={
          rekonActionTarget?.action === 'submit'
            ? `Mengirim laporan rekon ${rekonActionTarget.row.namaBulan} ${rekonActionTarget.row.tahun} akan MENGUNCI seluruh transaksi masuk/keluar/mutasi pada periode tersebut.`
            : rekonActionTarget?.action === 'approve'
            ? `Setujui hasil rekonsiliasi ${rekonActionTarget?.row.bagianNama} (${rekonActionTarget?.row.namaBulan})?`
            : `Buka kembali kunci transaksi ${rekonActionTarget?.row.namaBulan} untuk ${rekonActionTarget?.row.bagianNama}?`
        }
        confirmLabel="Ya, Konfirmasi"
        danger={rekonActionTarget?.action === 'unlock'}
        onConfirm={handleConfirmRekonAction}
        onCancel={() => setRekonActionTarget(null)}
      />
    </AppShell>
  );
}
