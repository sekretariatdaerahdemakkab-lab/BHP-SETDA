'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useApp } from '@/components/context/AppContext';
import { useToast } from '@/components/ui/Toast';
import { getKartuPersediaan } from '@/lib/firestore/laporan';
import { listBarang } from '@/lib/firestore/master';
import { formatDateID, formatNumber, formatRupiah } from '@/lib/format';
import type { Barang, KartuPersediaanRow } from '@/lib/types';

export function KartuPersediaanClient() {
  const { user, bagianList, tahun, selectedBagianId, isBagianLocked } = useApp();
  const { showToast } = useToast();

  const [barangList, setBarangList] = useState<Barang[]>([]);
  const [bagianOverride, setBagianOverride] = useState<string>('');
  const [barangOverride, setBarangOverride] = useState<string>('');
  const [rows, setRows] = useState<KartuPersediaanRow[]>([]);
  const [saldoAkhir, setSaldoAkhir] = useState(0);
  const [loading, setLoading] = useState(false);

  const bagianId =
    isBagianLocked && user?.bagianId
      ? user.bagianId
      : bagianOverride || (selectedBagianId !== 'ALL' ? selectedBagianId : bagianList[0]?.id || '');

  const barangId = barangOverride || barangList[0]?.id || '';

  useEffect(() => {
    let active = true;
    listBarang()
      .then((data) => {
        if (active) setBarangList(data);
      })
      .catch(() => {
        if (active) setBarangList([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadKartu = useCallback(async () => {
    if (!user || !bagianId || !barangId) return;
    try {
      const json = await getKartuPersediaan(user, tahun, bagianId, barangId);
      setRows(json.rows || []);
      setSaldoAkhir(json.saldoAkhir || 0);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal memuat kartu persediaan.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [user, tahun, bagianId, barangId, showToast]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadKartu();
    }, 0);
    return () => clearTimeout(t);
  }, [loadKartu]);

  const selectedBarang = barangList.find((b) => b.id === barangId);
  const selectedBagian = bagianList.find((b) => b.id === bagianId);

  const handleExportExcel = async () => {
    const XLSX = await import('xlsx');
    const data = rows.map((r, i) => ({
      No: i + 1,
      Tanggal: r.tanggal,
      No_Bukti: r.noBukti,
      Jenis_Mutasi: r.jenis,
      Keterangan: r.keterangan,
      Masuk: r.qtyMasuk,
      Keluar: r.qtyKeluar,
      Sisa_Saldo: r.sisaSaldo,
      Harga_Satuan: r.hargaSatuan,
      Nilai_Mutasi: r.nilaiMutasi,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Kartu_Persediaan');
    XLSX.writeFile(
      wb,
      `Kartu_Persediaan_${selectedBagian?.kode || 'BHP'}_${selectedBarang?.kodeBarang || 'Item'}_${tahun}.xlsx`
    );
    showToast('Kartu Persediaan berhasil diekspor ke Excel.', 'success');
  };

  return (
    <AppShell
      title="Kartu Persediaan Dinamis"
      subtitle={`Tahun Anggaran ${tahun} · Buku Mutasi Kronologis per Bagian dan per Item Barang`}
      hideGlobalBagianFilter
    >
      <div className="space-y-5">
        <div className="bg-gradient-to-r from-sky-50/90 via-white to-blue-50/50 rounded-xl border border-sky-200 overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-sky-500 to-blue-600" />
          <div className="p-5 flex flex-wrap items-end justify-between gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 min-w-[260px]">
              <div>
                <label className="block text-xs font-semibold text-sky-950 mb-1">
                  Gudang Bagian
                </label>
                <select
                  value={bagianId}
                  disabled={isBagianLocked}
                  onChange={(e) => setBagianOverride(e.target.value)}
                  className="w-full h-10 px-3 text-sm border border-sky-200 rounded-lg bg-white disabled:bg-slate-100"
                >
                  {bagianList.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.kode} — {b.nama}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-sky-950 mb-1">
                  Item Barang BHP
                </label>
                <select
                  value={barangId}
                  onChange={(e) => setBarangOverride(e.target.value)}
                  className="w-full h-10 px-3 text-sm border border-sky-200 rounded-lg bg-white"
                >
                  {barangList.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.kodeBarang} · {b.nama} ({b.satuan})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs font-medium text-sky-800">Saldo Akhir ({tahun})</p>
                <p className="text-xl font-bold font-mono tabular-nums text-sky-900">
                  {formatNumber(saldoAkhir)} {selectedBarang?.satuan || ''}
                </p>
              </div>
              <button
                type="button"
                disabled={rows.length === 0}
                onClick={handleExportExcel}
                className="h-10 px-4 inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-white bg-sky-700 rounded-lg hover:bg-sky-800 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                <span>Export Excel</span>
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-left">
              <thead className="bg-sky-50/60 border-b border-sky-100 text-xs text-sky-950">
                <tr>
                  <th className="px-4 py-3 font-semibold">Tanggal</th>
                  <th className="px-4 py-3 font-semibold">No. Bukti (BAST/Nota/SPB)</th>
                  <th className="px-4 py-3 font-semibold">Jenis</th>
                  <th className="px-4 py-3 font-semibold">Keterangan</th>
                  <th className="px-4 py-3 font-semibold text-right">Masuk</th>
                  <th className="px-4 py-3 font-semibold text-right">Keluar</th>
                  <th className="px-4 py-3 font-semibold text-right">Sisa Saldo</th>
                  <th className="px-4 py-3 font-semibold text-right">Harga Satuan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      Memuat kartu persediaan...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      Belum ada mutasi barang untuk item dan bagian ini pada Tahun {tahun}.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="hover:bg-sky-50/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-slate-700">
                        {formatDateID(r.tanggal)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">
                        {r.noBukti}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold">
                        <span
                          className={
                            r.qtyMasuk > 0 ? 'text-emerald-700' : 'text-amber-700'
                          }
                        >
                          {r.jenis}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.keterangan || '-'}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                        {r.qtyMasuk > 0 ? `+${formatNumber(r.qtyMasuk)}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-rose-700">
                        {r.qtyKeluar > 0 ? `-${formatNumber(r.qtyKeluar)}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-sky-900">
                        {formatNumber(r.sisaSaldo)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                        {formatRupiah(r.hargaSatuan)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
