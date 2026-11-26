'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { MotionConfig, motion } from 'motion/react';
import {
  Wallet,
  TrendingUp,
  PiggyBank,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Package,
  ArrowRight,
  BellOff,
  BarChart3,
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpenCheck,
  FileSpreadsheet,
  Printer,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useApp } from '@/components/context/AppContext';
import { useToast } from '@/components/ui/Toast';
import { getDashboardSummary } from '@/lib/firestore/laporan';
import { setBarangStokMinimum } from '@/lib/firestore/master';
import { formatNumber, formatRupiah } from '@/lib/format';
import type { DashboardSummary } from '@/lib/types';

export function DashboardClient() {
  const { user, tahun, selectedBagianId } = useApp();
  const { showToast } = useToast();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [disablingId, setDisablingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const summary = await getDashboardSummary(user, tahun, selectedBagianId);
        if (!active) return;
        setError('');
        setData(summary);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Gagal memuat data dashboard dari Firestore.');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user, tahun, selectedBagianId]);

  const statusMeta = (status: DashboardSummary['statusAnggaran']) => {
    if (status === 'Melebihi Pagu') {
      return {
        textColor: 'text-red-700',
        subTextColor: 'text-red-800/80',
        barColor: 'bg-gradient-to-r from-red-500 to-rose-600',
        cardBg: 'bg-gradient-to-br from-red-50/90 via-white to-rose-50/60 border-red-200',
        topBar: 'bg-gradient-to-r from-red-500 to-rose-600',
        iconBox: 'bg-red-600 text-white',
        Icon: ShieldAlert,
      };
    }
    if (status === 'Peringatan') {
      return {
        textColor: 'text-amber-700',
        subTextColor: 'text-amber-800/80',
        barColor: 'bg-gradient-to-r from-amber-400 to-orange-500',
        cardBg: 'bg-gradient-to-br from-amber-50/90 via-white to-orange-50/60 border-amber-200',
        topBar: 'bg-gradient-to-r from-amber-500 to-orange-500',
        iconBox: 'bg-amber-500 text-white',
        Icon: AlertTriangle,
      };
    }
    return {
      textColor: 'text-emerald-700',
      subTextColor: 'text-emerald-800/80',
      barColor: 'bg-gradient-to-r from-teal-500 to-emerald-500',
      cardBg: 'bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/60 border-emerald-200',
      topBar: 'bg-gradient-to-r from-emerald-500 to-teal-500',
      iconBox: 'bg-emerald-600 text-white',
      Icon: CheckCircle2,
    };
  };

  const handleDisableAlert = async (barangId: string, namaBarang: string) => {
    if (!user || user.role !== 'Superadmin') return;
    setDisablingId(barangId);
    try {
      await setBarangStokMinimum(user, barangId, 0);
      setData((prev) =>
        prev
          ? {
              ...prev,
              lowStockAlerts: prev.lowStockAlerts.filter((item) => item.barangId !== barangId),
            }
          : prev
      );
      showToast(`Alert stok minimum untuk "${namaBarang}" dinonaktifkan (Min. 0).`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menonaktifkan alert stok.', 'error');
    } finally {
      setDisablingId(null);
    }
  };

  const quickActions =
    user?.role === 'Pengurus Barang'
      ? [
          {
            href: '/anggaran',
            title: 'Plafon & Rekon',
            subtitle: 'Kelola pagu DPA & rekon semester',
            Icon: Wallet,
            cardClass:
              'bg-gradient-to-br from-indigo-50/90 via-white to-violet-50/60 border-indigo-200 hover:border-indigo-300',
            topBar: 'bg-gradient-to-r from-indigo-500 to-violet-600',
            iconBox: 'bg-indigo-600 text-white',
            linkColor: 'text-indigo-700',
          },
          {
            href: '/laporan/kartu-persediaan',
            title: 'Kartu Persediaan',
            subtitle: 'Mutasi stok & harga per barang',
            Icon: BookOpenCheck,
            cardClass:
              'bg-gradient-to-br from-sky-50/90 via-white to-cyan-50/60 border-sky-200 hover:border-sky-300',
            topBar: 'bg-gradient-to-r from-sky-500 to-cyan-600',
            iconBox: 'bg-sky-600 text-white',
            linkColor: 'text-sky-700',
          },
          {
            href: '/laporan/rekap',
            title: 'Rekap Persediaan',
            subtitle: 'Saldo awal, mutasi & saldo akhir',
            Icon: FileSpreadsheet,
            cardClass:
              'bg-gradient-to-br from-teal-50/90 via-white to-emerald-50/60 border-teal-200 hover:border-teal-300',
            topBar: 'bg-gradient-to-r from-teal-500 to-emerald-600',
            iconBox: 'bg-teal-600 text-white',
            linkColor: 'text-teal-700',
          },
          {
            href: '/laporan/berita-acara',
            title: 'Cetak Berita Acara',
            subtitle: 'Dokumen resmi BAST & opname',
            Icon: Printer,
            cardClass:
              'bg-gradient-to-br from-amber-50/90 via-white to-orange-50/60 border-amber-200 hover:border-amber-300',
            topBar: 'bg-gradient-to-r from-amber-500 to-orange-500',
            iconBox: 'bg-amber-500 text-white',
            linkColor: 'text-amber-700',
          },
        ]
      : [
          {
            href: '/transaksi/masuk',
            title: 'Barang Masuk',
            subtitle: 'Catat pengadaan & saldo awal',
            Icon: ArrowDownToLine,
            cardClass:
              'bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/60 border-emerald-200 hover:border-emerald-300',
            topBar: 'bg-gradient-to-r from-emerald-500 to-teal-600',
            iconBox: 'bg-emerald-600 text-white',
            linkColor: 'text-emerald-700',
          },
          {
            href: '/transaksi/keluar',
            title: 'Keluar & Opname',
            subtitle: 'Pemakaian rutin & penyesuaian fisik',
            Icon: ArrowUpFromLine,
            cardClass:
              'bg-gradient-to-br from-amber-50/90 via-white to-orange-50/60 border-amber-200 hover:border-amber-300',
            topBar: 'bg-gradient-to-r from-amber-500 to-orange-500',
            iconBox: 'bg-amber-500 text-white',
            linkColor: 'text-amber-700',
          },
          {
            href: '/laporan/kartu-persediaan',
            title: 'Kartu Persediaan',
            subtitle: 'Mutasi stok & harga per barang',
            Icon: BookOpenCheck,
            cardClass:
              'bg-gradient-to-br from-sky-50/90 via-white to-cyan-50/60 border-sky-200 hover:border-sky-300',
            topBar: 'bg-gradient-to-r from-sky-500 to-cyan-600',
            iconBox: 'bg-sky-600 text-white',
            linkColor: 'text-sky-700',
          },
          {
            href: '/laporan/rekap',
            title: 'Rekap Persediaan',
            subtitle: 'Saldo awal, mutasi & saldo akhir',
            Icon: FileSpreadsheet,
            cardClass:
              'bg-gradient-to-br from-indigo-50/90 via-white to-violet-50/60 border-indigo-200 hover:border-indigo-300',
            topBar: 'bg-gradient-to-r from-indigo-500 to-violet-600',
            iconBox: 'bg-indigo-600 text-white',
            linkColor: 'text-indigo-700',
          },
        ];

  return (
    <AppShell
      title="Dashboard Monitoring BHP"
      subtitle={`Tahun Anggaran ${tahun} · Ringkasan Plafon Belanja & Persediaan Gudang Bagian`}
    >
      <MotionConfig reducedMotion="user">
        {error && (
          <div className="mb-6 p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading && !data ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-32 rounded-xl bg-white border border-slate-200 animate-pulse p-5"
              />
            ))}
          </div>
        ) : (
          data && (
            <div className="space-y-6">
              {/* 4 Kartu Ringkasan Utama dengan Tema Warna Tailwind UI */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {/* Kartu 1: Teal / Emerald */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.16 }}
                  className="bg-gradient-to-br from-teal-50/90 via-white to-emerald-50/60 rounded-xl border border-teal-200 overflow-hidden transition-transform duration-150 hover:-translate-y-0.5"
                >
                  <div className="h-1.5 w-full bg-gradient-to-r from-teal-500 to-emerald-500" />
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-semibold text-teal-900">Plafond BHP Tahunan</p>
                      <div className="w-9 h-9 rounded-lg bg-teal-600 text-white flex items-center justify-center shrink-0">
                        <Wallet className="w-4 h-4" />
                      </div>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
                      {formatRupiah(data.totalPagu)}
                    </p>
                    <p className="mt-2 text-xs text-teal-800/80">
                      {data.plafonItems.length} Pos Rekening / Kegiatan · TA {data.tahun}
                    </p>
                  </div>
                </motion.div>

                {/* Kartu 2: Blue / Indigo */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.16, delay: 0.03 }}
                  className="bg-gradient-to-br from-blue-50/90 via-white to-indigo-50/60 rounded-xl border border-blue-200 overflow-hidden transition-transform duration-150 hover:-translate-y-0.5"
                >
                  <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-indigo-600" />
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-semibold text-blue-900">
                        Realisasi Belanja BHP (YTD)
                      </p>
                      <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                        <TrendingUp className="w-4 h-4" />
                      </div>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
                      {formatRupiah(data.totalRealisasi)}
                    </p>
                    <div className="mt-2.5 w-full h-1.5 bg-blue-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all"
                        style={{
                          width: `${Math.min(100, Math.max(0, data.persentaseSerapan))}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-blue-800/80 font-mono tabular-nums">
                      Serapan {data.persentaseSerapan}% dari Pagu
                    </p>
                  </div>
                </motion.div>

                {/* Kartu 3: Sky / Cyan (atau Rose saat defisit) */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.16, delay: 0.06 }}
                  className={`rounded-xl border overflow-hidden transition-transform duration-150 hover:-translate-y-0.5 ${
                    data.sisaAnggaran < 0
                      ? 'bg-gradient-to-br from-rose-50/90 via-white to-red-50/60 border-rose-200'
                      : 'bg-gradient-to-br from-sky-50/90 via-white to-cyan-50/60 border-sky-200'
                  }`}
                >
                  <div
                    className={`h-1.5 w-full ${
                      data.sisaAnggaran < 0
                        ? 'bg-gradient-to-r from-rose-500 to-red-600'
                        : 'bg-gradient-to-r from-sky-500 to-cyan-600'
                    }`}
                  />
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <p
                        className={`text-xs font-semibold ${
                          data.sisaAnggaran < 0 ? 'text-rose-900' : 'text-sky-900'
                        }`}
                      >
                        Sisa Anggaran Tersedia
                      </p>
                      <div
                        className={`w-9 h-9 rounded-lg text-white flex items-center justify-center shrink-0 ${
                          data.sisaAnggaran < 0 ? 'bg-rose-600' : 'bg-sky-600'
                        }`}
                      >
                        <PiggyBank className="w-4 h-4" />
                      </div>
                    </div>
                    <p
                      className={`mt-2 text-2xl font-bold font-mono tabular-nums ${
                        data.sisaAnggaran < 0 ? 'text-red-700' : 'text-slate-900'
                      }`}
                    >
                      {formatRupiah(data.sisaAnggaran)}
                    </p>
                    <p
                      className={`mt-2 text-xs font-mono tabular-nums ${
                        data.sisaAnggaran < 0 ? 'text-rose-800/80' : 'text-sky-800/80'
                      }`}
                    >
                      Nilai Persediaan Akhir: {formatRupiah(data.totalNilaiPersediaan)}
                    </p>
                  </div>
                </motion.div>

                {/* Kartu 4: Status Penggunaan Anggaran (Semantik Emerald / Amber / Red) */}
                {(() => {
                  const meta = statusMeta(data.statusAnggaran);
                  const StatusIcon = meta.Icon;
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.16, delay: 0.09 }}
                      className={`rounded-xl border overflow-hidden transition-transform duration-150 hover:-translate-y-0.5 ${meta.cardBg}`}
                    >
                      <div className={`h-1.5 w-full ${meta.topBar}`} />
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <p className={`text-xs font-semibold ${meta.textColor}`}>
                            Status Penggunaan Anggaran
                          </p>
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${meta.iconBox}`}
                          >
                            <StatusIcon className="w-4 h-4" />
                          </div>
                        </div>
                        <p className={`mt-2 text-2xl font-bold ${meta.textColor}`}>
                          {data.statusAnggaran}
                        </p>
                        <p className={`mt-2 text-xs font-mono tabular-nums ${meta.subTextColor}`}>
                          {data.totalJenisBarang} Jenis Barang · {formatNumber(data.totalStokUnit)}{' '}
                          Unit Stok
                        </p>
                      </div>
                    </motion.div>
                  );
                })()}
              </div>

              {/* Progress Bar Plafon Anggaran & Alert Stok Menipis */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                {/* Kartu Progres Realisasi per Pos Rekening */}
                <div className="xl:col-span-7 bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-4 bg-gradient-to-r from-teal-50/70 via-slate-50/50 to-white border-b border-slate-200 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                        <BarChart3 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-sm font-bold text-slate-900">
                          Progres Realisasi Plafon Anggaran per Pos Rekening (DPA)
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Sistem peringatan dini anggaran tanpa memblokir input pengadaan bendahara
                        </p>
                      </div>
                    </div>
                    <Link
                      href="/anggaran"
                      className="text-xs font-semibold text-teal-700 hover:text-teal-800 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      <span>
                        {user?.role === 'Admin Persediaan' ? 'Lihat Pagu' : 'Kelola Pagu'}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {data.plafonItems.length === 0 ? (
                      <div className="p-8 text-center text-sm text-slate-500">
                        Belum ada Plafon Anggaran yang diinput untuk Tahun {data.tahun}.
                      </div>
                    ) : (
                      data.plafonItems.map((item) => {
                        const meta = statusMeta(item.statusAnggaran);
                        const pctClamped = Math.min(100, Math.max(0, item.persentase));
                        return (
                          <div
                            key={item.id}
                            className="p-5 space-y-2.5 hover:bg-slate-50/70 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900">
                                  {item.namaKegiatan}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                                  {item.bagianNama} · Rek. {item.kodeRekening}
                                </p>
                              </div>
                              <span
                                className={`text-xs font-semibold font-mono tabular-nums whitespace-nowrap shrink-0 ${meta.textColor}`}
                              >
                                {item.statusAnggaran} · {item.persentase}%
                              </span>
                            </div>

                            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${meta.barColor}`}
                                style={{ width: `${pctClamped}%` }}
                              />
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 font-mono tabular-nums">
                              <span>Realisasi: {formatRupiah(item.realisasi)}</span>
                              <span>
                                Pagu: {formatRupiah(item.paguAnggaran)} · Sisa:{' '}
                                <strong
                                  className={
                                    item.sisaPagu < 0 ? 'text-red-700' : 'text-slate-900'
                                  }
                                >
                                  {formatRupiah(item.sisaPagu)}
                                </strong>
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Alert Stok Menipis & Ringkasan Gudang Bagian */}
                <div className="xl:col-span-5 space-y-6">
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div
                      className={`px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4 bg-gradient-to-r ${
                        data.lowStockAlerts.length > 0
                          ? 'from-rose-50/80 via-white to-white'
                          : 'from-emerald-50/80 via-white to-white'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            data.lowStockAlerts.length > 0
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {data.lowStockAlerts.length > 0 ? (
                            <AlertTriangle className="w-4 h-4" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-sm font-bold text-slate-900">Alert Stok Menipis</h2>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Khusus item dengan batas minimum &gt; 0. Item sekali habis (BBM/Mamin)
                            set batas 0 agar tanpa alert.
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-semibold font-mono tabular-nums shrink-0 ${
                          data.lowStockAlerts.length > 0 ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {data.lowStockAlerts.length} Item
                      </span>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {data.lowStockAlerts.length === 0 ? (
                        <div className="p-6 text-center text-sm text-slate-500">
                          Seluruh item berbatas minimum dalam kondisi aman.
                        </div>
                      ) : (
                        data.lowStockAlerts.map((alert) => (
                          <div
                            key={`${alert.bagianId}-${alert.barangId}`}
                            className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-rose-50/30 transition-colors"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">
                                {alert.namaBarang}
                              </p>
                              <p className="text-xs text-slate-500 truncate">
                                {alert.bagianNama} · {alert.kodeBarang}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="text-right">
                                <p className="text-sm font-bold text-red-700 font-mono tabular-nums">
                                  {formatNumber(alert.stokSaatIni)} {alert.satuan}
                                </p>
                                <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                                  Min. {alert.stokMinimum}
                                </p>
                              </div>
                              {user?.role === 'Superadmin' && (
                                <button
                                  type="button"
                                  disabled={disablingId === alert.barangId}
                                  onClick={() =>
                                    void handleDisableAlert(alert.barangId, alert.namaBarang)
                                  }
                                  title="Nonaktifkan alert stok minimum (set 0) untuk item ini"
                                  className="h-7 px-2 inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-rose-100 hover:text-rose-700 rounded-md transition-colors disabled:opacity-50 whitespace-nowrap"
                                >
                                  <BellOff className="w-3 h-3" />
                                  <span>Matikan</span>
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Ringkasan Stok Gudang per Bagian */}
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-5 py-4 bg-gradient-to-r from-sky-50/80 via-white to-white border-b border-slate-200 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                          <Package className="w-4 h-4" />
                        </div>
                        <h2 className="text-sm font-bold text-slate-900">
                          Ringkasan Gudang Bagian
                        </h2>
                      </div>
                      <Link
                        href="/laporan/rekap"
                        className="text-xs font-semibold text-sky-700 hover:text-sky-800 whitespace-nowrap"
                      >
                        Lihat Rekap
                      </Link>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-sky-50/50 border-b border-slate-200 text-slate-700">
                          <tr>
                            <th className="px-4 py-2.5 font-semibold">Bagian</th>
                            <th className="px-4 py-2.5 font-semibold text-right">Jenis</th>
                            <th className="px-4 py-2.5 font-semibold text-right">Total Unit</th>
                            <th className="px-4 py-2.5 font-semibold text-right">Nilai Stok</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {data.stokPerBagian.map((b) => (
                            <tr key={b.bagianId} className="hover:bg-sky-50/40 transition-colors">
                              <td className="px-4 py-2.5 font-medium text-slate-900">
                                {b.bagianKode} · {b.bagianNama}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                                {b.totalItem}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                                {formatNumber(b.totalQty)}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-sky-900">
                                {formatRupiah(b.totalNilai)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* Kartu Akses Cepat Operasional Berwarna Tailwind UI */}
              <div className="space-y-3">
                <h2 className="text-sm font-bold text-slate-800">Akses Cepat Modul BHP</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  {quickActions.map((action) => {
                    const ActionIcon = action.Icon;
                    return (
                      <Link
                        key={action.href}
                        href={action.href}
                        className={`group rounded-xl border overflow-hidden transition-all duration-150 hover:-translate-y-0.5 ${action.cardClass}`}
                      >
                        <div className={`h-1 w-full ${action.topBar}`} />
                        <div className="p-4 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900">{action.title}</p>
                            <p className="text-xs text-slate-600 mt-1">{action.subtitle}</p>
                            <span
                              className={`mt-3 inline-flex items-center gap-1 text-xs font-semibold ${action.linkColor}`}
                            >
                              <span>Buka Menu</span>
                              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                            </span>
                          </div>
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${action.iconBox}`}
                          >
                            <ActionIcon className="w-4 h-4" />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          )
        )}
      </MotionConfig>
    </AppShell>
  );
}
