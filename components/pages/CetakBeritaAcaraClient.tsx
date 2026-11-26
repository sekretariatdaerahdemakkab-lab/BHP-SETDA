'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useApp } from '@/components/context/AppContext';
import { useToast } from '@/components/ui/Toast';
import { KopSurat } from '@/components/ui/KopSurat';
import { getRekapPersediaan } from '@/lib/firestore/laporan';
import {
  formatDateID,
  formatNumber,
  formatRupiah,
  getDefaultDateForYear,
  getPeriodMonthRange,
  NAMA_BULAN,
  terbilang,
} from '@/lib/format';
import type { RekapPersediaanRow } from '@/lib/types';

export function CetakBeritaAcaraClient() {
  const { user, instansi, bagianList, tahun, selectedBagianId, isBagianLocked } = useApp();
  const { showToast } = useToast();

  const [mode, setMode] = useState<'bulanan' | 'triwulan' | 'semester' | 'tahunan' | 'kustom'>(
    'tahunan'
  );
  const [bulan, setBulan] = useState<number>(() => new Date().getMonth() + 1);
  const [triwulan, setTriwulan] = useState<number>(1);
  const [semester, setSemester] = useState<number>(1);
  const [bulanDari, setBulanDari] = useState<number>(1);
  const [bulanSampai, setBulanSampai] = useState<number>(12);

  const [bagianOverride, setBagianOverride] = useState<string | null>(null);
  const [nomorBAOverride, setNomorBAOverride] = useState<string | null>(null);
  const [tanggalBAOverride, setTanggalBAOverride] = useState<string | null>(null);

  const [pimpinanNamaOverride, setPimpinanNamaOverride] = useState<string | null>(null);
  const [pimpinanJabatanOverride, setPimpinanJabatanOverride] = useState<string | null>(null);
  const [pimpinanNipOverride, setPimpinanNipOverride] = useState<string | null>(null);
  const [pengurusNamaOverride, setPengurusNamaOverride] = useState<string | null>(null);
  const [pengurusJabatanOverride, setPengurusJabatanOverride] = useState<string | null>(null);
  const [pengurusNipOverride, setPengurusNipOverride] = useState<string | null>(null);

  const bagianId =
    isBagianLocked && user?.bagianId
      ? user.bagianId
      : bagianOverride ?? selectedBagianId;
  const nomorBA = nomorBAOverride ?? `028/BA-SO/${tahun}`;
  const tanggalBA = tanggalBAOverride ?? getDefaultDateForYear(tahun);

  const namaPimpinan = pimpinanNamaOverride ?? (instansi?.namaPimpinan || '');
  const jabatanPimpinan = pimpinanJabatanOverride ?? (instansi?.jabatanPimpinan || '');
  const nipPimpinan = pimpinanNipOverride ?? (instansi?.nipPimpinan || '');
  const namaPengurus = pengurusNamaOverride ?? (instansi?.namaPengurus || '');
  const jabatanPengurus = pengurusJabatanOverride ?? (instansi?.jabatanPengurus || '');
  const nipPengurus = pengurusNipOverride ?? (instansi?.nipPengurus || '');

  const [rows, setRows] = useState<RekapPersediaanRow[]>([]);
  const [loading, setLoading] = useState(true);

  const periodRange = getPeriodMonthRange(mode, {
    bulan,
    triwulan,
    semester,
    bulanDari,
    bulanSampai,
  });

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getRekapPersediaan(user, {
        tahun,
        bulanDari: periodRange.bulanDari,
        bulanSampai: periodRange.bulanSampai,
        requestedBagianId: bagianId,
      });
      setRows(data);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal memuat data berita acara.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [user, tahun, periodRange.bulanDari, periodRange.bulanSampai, bagianId, showToast]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(t);
  }, [loadData]);

  const groupedByKategori = rows.reduce<
    Record<string, { kodeRekening: string; namaKategori: string; items: RekapPersediaanRow[]; subtotal: number }>
  >((acc, row) => {
    const key = row.kategoriId;
    if (!acc[key]) {
      acc[key] = {
        kodeRekening: row.kodeRekening,
        namaKategori: row.kategoriNama,
        items: [],
        subtotal: 0,
      };
    }
    acc[key].items.push(row);
    acc[key].subtotal += row.totalNilai;
    return acc;
  }, {});

  const kategoriGroups = Object.values(groupedByKategori);
  const grandTotal = rows.reduce((a, r) => a + r.totalNilai, 0);
  const activeBagianName =
    bagianId === 'ALL'
      ? 'Seluruh Bagian (Konsolidasi Sekretariat Daerah)'
      : bagianList.find((b) => b.id === bagianId)?.nama || 'Bagian Terkait';

  return (
    <AppShell
      title="Cetak Berita Acara Stok Opname"
      subtitle="Pratinjau Dokumen Resmi A4 & Cetak / Simpan PDF"
      hideGlobalBagianFilter
    >
      <div className="no-print bg-white rounded-xl border border-sky-200 overflow-hidden mb-6">
        <div className="h-1 w-full bg-gradient-to-r from-sky-500 to-blue-600" />
        <div className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Pengaturan Parameter Berita Acara</h2>
            <p className="text-xs text-slate-500">
              Data Logo, Kop Surat, dan Penandatangan disinkronkan dari Pengaturan Instansi
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="h-10 px-5 inline-flex items-center gap-2 text-sm font-semibold text-white bg-sky-700 rounded-lg hover:bg-sky-800 transition-colors whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak / Simpan PDF</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Unit Bagian</label>
            <select
              value={bagianId}
              disabled={isBagianLocked}
              onChange={(e) => setBagianOverride(e.target.value)}
              className="w-full h-9 px-3 text-xs sm:text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
            >
              {!isBagianLocked && <option value="ALL">Semua Bagian (Konsolidasi)</option>}
              {bagianList.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.kode} — {b.nama}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Jenis Periode</label>
            <select
              value={mode}
              onChange={(e) =>
                setMode(
                  e.target.value as 'bulanan' | 'triwulan' | 'semester' | 'tahunan' | 'kustom'
                )
              }
              className="w-full h-9 px-3 text-xs sm:text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="bulanan">Bulanan</option>
              <option value="triwulan">Triwulan</option>
              <option value="semester">Semester</option>
              <option value="tahunan">Tahunan</option>
              <option value="kustom">Kustom Rentang Bulan</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nomor Berita Acara
            </label>
            <input
              type="text"
              value={nomorBA}
              onChange={(e) => setNomorBAOverride(e.target.value)}
              className="w-full h-9 px-3 text-xs sm:text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tanggal Penandatanganan
            </label>
            <input
              type="date"
              value={tanggalBA}
              onChange={(e) => setTanggalBAOverride(e.target.value)}
              className="w-full h-9 px-3 text-xs sm:text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        {mode !== 'tahunan' && (
          <div className="flex flex-wrap items-center gap-3">
            {mode === 'bulanan' && (
              <select
                value={bulan}
                onChange={(e) => setBulan(Number(e.target.value))}
                className="h-9 px-3 text-xs border border-slate-300 rounded-lg bg-white"
              >
                {NAMA_BULAN.map((b, i) => (
                  <option key={b} value={i + 1}>
                    Bulan {b}
                  </option>
                ))}
              </select>
            )}
            {mode === 'triwulan' && (
              <select
                value={triwulan}
                onChange={(e) => setTriwulan(Number(e.target.value))}
                className="h-9 px-3 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value={1}>Triwulan I (Jan - Mar)</option>
                <option value={2}>Triwulan II (Apr - Jun)</option>
                <option value={3}>Triwulan III (Jul - Sep)</option>
                <option value={4}>Triwulan IV (Okt - Des)</option>
              </select>
            )}
            {mode === 'semester' && (
              <select
                value={semester}
                onChange={(e) => setSemester(Number(e.target.value))}
                className="h-9 px-3 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value={1}>Semester I (Jan - Jun)</option>
                <option value={2}>Semester II (Jan - Des)</option>
              </select>
            )}
            {mode === 'kustom' && (
              <div className="flex items-center gap-2 text-xs">
                <span>Dari</span>
                <select
                  value={bulanDari}
                  onChange={(e) => setBulanDari(Number(e.target.value))}
                  className="h-9 px-3 border border-slate-300 rounded-lg bg-white"
                >
                  {NAMA_BULAN.map((b, i) => (
                    <option key={b} value={i + 1}>
                      {b}
                    </option>
                  ))}
                </select>
                <span>s.d.</span>
                <select
                  value={bulanSampai}
                  onChange={(e) => setBulanSampai(Number(e.target.value))}
                  className="h-9 px-3 border border-slate-300 rounded-lg bg-white"
                >
                  {NAMA_BULAN.map((b, i) => (
                    <option key={b} value={i + 1}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">
              Pihak Pertama (Pimpinan / Kepala Bagian)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={jabatanPimpinan}
                onChange={(e) => setPimpinanJabatanOverride(e.target.value)}
                placeholder="Jabatan"
                className="h-8 px-2.5 text-xs border border-slate-300 rounded-md"
              />
              <input
                type="text"
                value={namaPimpinan}
                onChange={(e) => setPimpinanNamaOverride(e.target.value)}
                placeholder="Nama & Gelar"
                className="h-8 px-2.5 text-xs border border-slate-300 rounded-md"
              />
              <input
                type="text"
                value={nipPimpinan}
                onChange={(e) => setPimpinanNipOverride(e.target.value)}
                placeholder="NIP"
                className="h-8 px-2.5 text-xs font-mono border border-slate-300 rounded-md"
              />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">
              Pihak Kedua (Pengurus Barang / Admin Persediaan)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={jabatanPengurus}
                onChange={(e) => setPengurusJabatanOverride(e.target.value)}
                placeholder="Jabatan"
                className="h-8 px-2.5 text-xs border border-slate-300 rounded-md"
              />
              <input
                type="text"
                value={namaPengurus}
                onChange={(e) => setPengurusNamaOverride(e.target.value)}
                placeholder="Nama & Gelar"
                className="h-8 px-2.5 text-xs border border-slate-300 rounded-md"
              />
              <input
                type="text"
                value={nipPengurus}
                onChange={(e) => setPengurusNipOverride(e.target.value)}
                placeholder="NIP"
                className="h-8 px-2.5 text-xs font-mono border border-slate-300 rounded-md"
              />
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* A4 Print Document Preview Sheet */}
      <div className="print-sheet mx-auto max-w-[210mm] bg-white border border-slate-300 shadow-sm p-8 sm:p-12 text-black">
        <KopSurat
          instansi={instansi}
          subLabel={bagianId !== 'ALL' ? activeBagianName : undefined}
        />

        <div className="text-center my-5">
          <h2 className="text-[15px] font-bold uppercase underline tracking-wide">
            BERITA ACARA PEMERIKSAAN FISIK (STOK OPNAME) PERSEDIAAN
          </h2>
          <p className="text-[12px] font-mono mt-1">Nomor: {nomorBA}</p>
        </div>

        <p className="text-[12px] leading-relaxed text-justify mb-4">
          Pada hari ini tanggal <strong>{formatDateID(tanggalBA)}</strong>, kami yang bertanda
          tangan di bawah ini telah melaksanakan pemeriksaan fisik (<em>stok opname</em>) atas
          persediaan Barang Habis Pakai (BHP) pada unit kerja{' '}
          <strong>{activeBagianName}</strong>,{' '}
          {instansi?.subInstansi || 'SEKRETARIAT DAERAH'}{' '}
          {instansi?.namaInstansi || 'KABUPATEN DEMAK'} untuk{' '}
          <strong>
            {periodRange.label} Tahun Anggaran {tahun}
          </strong>
          , dengan rincian saldo persediaan per kategori barang sebagai berikut:
        </p>

        {loading ? (
          <p className="text-xs text-center py-6">Memuat rincian barang...</p>
        ) : rows.length === 0 ? (
          <div className="border border-black p-6 text-center text-xs my-4">
            Tidak terdapat saldo atau mutasi persediaan pada periode dan unit kerja ini.
          </div>
        ) : (
          <table className="print-table w-full text-[11px] border border-black mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-black px-2 py-1.5 text-center w-8">No</th>
                <th className="border border-black px-2 py-1.5 text-left">Uraian / Nama Barang</th>
                <th className="border border-black px-2 py-1.5 text-center">Satuan</th>
                <th className="border border-black px-2 py-1.5 text-right">Saldo Awal</th>
                <th className="border border-black px-2 py-1.5 text-right">Masuk</th>
                <th className="border border-black px-2 py-1.5 text-right">Keluar</th>
                <th className="border border-black px-2 py-1.5 text-right">Saldo Akhir</th>
                <th className="border border-black px-2 py-1.5 text-right">Harga Satuan</th>
                <th className="border border-black px-2 py-1.5 text-right">Total Nilai</th>
              </tr>
            </thead>
            <tbody>
              {kategoriGroups.map((grp) => (
                <React.Fragment key={grp.kodeRekening + grp.namaKategori}>
                  <tr className="bg-slate-50 font-bold">
                    <td colSpan={9} className="border border-black px-2 py-1.5">
                      {grp.kodeRekening} — {grp.namaKategori}
                    </td>
                  </tr>
                  {grp.items.map((item, i) => (
                    <tr key={`${item.bagianId}-${item.barangId}`}>
                      <td className="border border-black px-2 py-1 text-center font-mono">
                        {i + 1}
                      </td>
                      <td className="border border-black px-2 py-1">
                        {item.namaBarang}
                        {bagianId === 'ALL' && (
                          <span className="block text-[9.5px] text-slate-700">
                            ({item.bagianNama})
                          </span>
                        )}
                      </td>
                      <td className="border border-black px-2 py-1 text-center">
                        {item.satuan}
                      </td>
                      <td className="border border-black px-2 py-1 text-right font-mono tabular-nums">
                        {formatNumber(item.saldoAwal)}
                      </td>
                      <td className="border border-black px-2 py-1 text-right font-mono tabular-nums">
                        {formatNumber(item.mutasiMasuk)}
                      </td>
                      <td className="border border-black px-2 py-1 text-right font-mono tabular-nums">
                        {formatNumber(item.mutasiKeluar)}
                      </td>
                      <td className="border border-black px-2 py-1 text-right font-mono tabular-nums font-semibold">
                        {formatNumber(item.saldoAkhir)}
                      </td>
                      <td className="border border-black px-2 py-1 text-right font-mono tabular-nums">
                        {formatRupiah(item.hargaSatuan)}
                      </td>
                      <td className="border border-black px-2 py-1 text-right font-mono tabular-nums">
                        {formatRupiah(item.totalNilai)}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold bg-slate-50/70">
                    <td colSpan={8} className="border border-black px-2 py-1 text-right">
                      Subtotal {grp.namaKategori}
                    </td>
                    <td className="border border-black px-2 py-1 text-right font-mono tabular-nums">
                      {formatRupiah(grp.subtotal)}
                    </td>
                  </tr>
                </React.Fragment>
              ))}
              <tr className="font-bold bg-slate-100">
                <td colSpan={8} className="border border-black px-2 py-2 text-right uppercase">
                  Jumlah Total Nilai Persediaan
                </td>
                <td className="border border-black px-2 py-2 text-right font-mono tabular-nums">
                  {formatRupiah(grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        )}

        <div className="border border-black px-3 py-2 text-[11.5px] mb-5 bg-slate-50">
          <strong>Terbilang:</strong> <em>{terbilang(grandTotal)}</em>
        </div>

        <p className="text-[12px] leading-relaxed text-justify mb-8">
          Demikian Berita Acara Pemeriksaan Fisik (Stok Opname) Persediaan Barang Habis Pakai ini
          dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.
        </p>

        <div className="print-avoid-break grid grid-cols-2 gap-8 text-[12px] text-center mt-6">
          <div>
            <p className="mb-1">Mengetahui,</p>
            <p className="font-semibold">{jabatanPimpinan || 'Sekretaris Daerah'}</p>
            <div className="h-20" />
            <p className="font-bold underline">{namaPimpinan || '................................'}</p>
            <p className="font-mono text-[11px]">NIP. {nipPimpinan || '-'}</p>
          </div>
          <div>
            <p className="mb-1">Demak, {formatDateID(tanggalBA)}</p>
            <p className="font-semibold">{jabatanPengurus || 'Pengurus Barang Pengguna'}</p>
            <div className="h-20" />
            <p className="font-bold underline">{namaPengurus || '................................'}</p>
            <p className="font-mono text-[11px]">NIP. {nipPengurus || '-'}</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
