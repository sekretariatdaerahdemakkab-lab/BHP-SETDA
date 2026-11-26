'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Download,
  Lock,
  Pencil,
  Plus,
  PlusCircle,
  Printer,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useApp } from '@/components/context/AppContext';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { getRekapPersediaan } from '@/lib/firestore/laporan';
import { listBarang } from '@/lib/firestore/master';
import {
  createTransaksiBatch,
  deleteTransaksi,
  listTransaksi,
  updateTransaksi,
} from '@/lib/firestore/transaksi';
import { formatDateID, formatNumber, formatRupiah, getPeriodMonthRange, NAMA_BULAN } from '@/lib/format';
import type { Barang, RekapPersediaanRow, TransaksiPersediaan } from '@/lib/types';

interface SaldoAwalDraftRow {
  key: string;
  barangId: string;
  tanggal: string;
  noBukti: string;
  qty: string;
  hargaSatuan: string;
  keterangan: string;
}

function makeEmptySaldoRow(tahun: number, seed: number): SaldoAwalDraftRow {
  return {
    key: `sa_${Date.now()}_${seed}`,
    barangId: '',
    tanggal: `${tahun}-01-01`,
    noBukti: `SA-${tahun}`,
    qty: '',
    hargaSatuan: '',
    keterangan: `Saldo Awal Tahun ${tahun}`,
  };
}

interface TotalsSummary {
  awalUnit: number;
  awalNilai: number;
  masukUnit: number;
  masukNilai: number;
  keluarUnit: number;
  keluarNilai: number;
  akhirUnit: number;
  akhirNilai: number;
}

interface BagianGroup {
  bagianId: string;
  bagianLabel: string;
  items: RekapPersediaanRow[];
  totals: TotalsSummary;
}

interface KategoriGroup {
  noUrut: number;
  kodeRekening: string;
  kategoriNama: string;
  bagians: BagianGroup[];
  totals: TotalsSummary;
}

interface SectionGroup {
  romawi: string;
  label: string;
  kategoris: KategoriGroup[];
  totals: TotalsSummary;
}

function emptyTotals(): TotalsSummary {
  return {
    awalUnit: 0,
    awalNilai: 0,
    masukUnit: 0,
    masukNilai: 0,
    keluarUnit: 0,
    keluarNilai: 0,
    akhirUnit: 0,
    akhirNilai: 0,
  };
}

function addRowToTotals(target: TotalsSummary, row: RekapPersediaanRow) {
  target.awalUnit += row.saldoAwal;
  target.awalNilai += row.saldoAwalNilai;
  target.masukUnit += row.mutasiMasuk;
  target.masukNilai += row.masukNilai;
  target.keluarUnit += row.mutasiKeluar;
  target.keluarNilai += row.keluarNilai;
  target.akhirUnit += Math.max(0, row.saldoAkhir);
  target.akhirNilai += row.saldoAkhirNilai;
}

function classifyBelanjaSection(kodeRekening: string): { romawi: string; label: string; order: number } {
  const clean = (kodeRekening || '').trim();
  if (clean.startsWith('5.1.02.01.02')) {
    return { romawi: 'II', label: 'Belanja Barang Tak Habis Pakai', order: 2 };
  }
  if (clean.startsWith('5.1.02.01.03')) {
    return { romawi: 'III', label: 'Belanja Barang Bekas Dipakai', order: 3 };
  }
  return { romawi: 'I', label: 'Belanja Barang Pakai Habis', order: 1 };
}

function normalizeBagianTitle(nama: string): string {
  const upper = (nama || 'LAINNYA').trim().toUpperCase();
  return upper.startsWith('BAGIAN ') ? upper : `BAGIAN ${upper}`;
}

function fmtCell(value: number): string {
  return value === 0 ? '-' : formatNumber(value);
}

export function RekapPersediaanClient() {
  const {
    user,
    firebaseUser,
    instansi,
    bagianList,
    tahun,
    selectedBagianId,
    setSelectedBagianId,
    isBagianLocked,
  } = useApp();
  const { showToast } = useToast();

  const [mode, setMode] = useState<'bulanan' | 'triwulan' | 'semester' | 'tahunan' | 'kustom'>(
    'tahunan'
  );
  const [bulan, setBulan] = useState<number>(() => new Date().getMonth() + 1);
  const [triwulan, setTriwulan] = useState<number>(1);
  const [semester, setSemester] = useState<number>(1);
  const [bulanDari, setBulanDari] = useState<number>(1);
  const [bulanSampai, setBulanSampai] = useState<number>(12);
  const [search, setSearch] = useState('');

  const [rows, setRows] = useState<RekapPersediaanRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Saldo Awal modal state
  const canManageSaldoAwal = user?.role === 'Superadmin' || user?.role === 'Admin Persediaan';
  const [saldoModalOpen, setSaldoModalOpen] = useState(false);
  const [saldoModalTab, setSaldoModalTab] = useState<'input' | 'daftar'>('input');
  const [barangList, setBarangList] = useState<Barang[]>([]);
  const [modalBagianId, setModalBagianId] = useState('');
  const [draftRows, setDraftRows] = useState<SaldoAwalDraftRow[]>(() => [makeEmptySaldoRow(tahun, 1)]);
  const [savingSaldo, setSavingSaldo] = useState(false);

  const [saldoAwalList, setSaldoAwalList] = useState<TransaksiPersediaan[]>([]);
  const [loadingSaldoList, setLoadingSaldoList] = useState(false);
  const [editingSaldo, setEditingSaldo] = useState<TransaksiPersediaan | null>(null);
  const [editTanggal, setEditTanggal] = useState('');
  const [editNoBukti, setEditNoBukti] = useState('');
  const [editBarangId, setEditBarangId] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editHarga, setEditHarga] = useState('');
  const [editKeterangan, setEditKeterangan] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TransaksiPersediaan | null>(null);
  const [deletingSaldo, setDeletingSaldo] = useState(false);

  const periodRange = getPeriodMonthRange(mode, {
    bulan,
    triwulan,
    semester,
    bulanDari,
    bulanSampai,
  });

  const loadRekap = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getRekapPersediaan(user, {
        tahun,
        bulanDari: periodRange.bulanDari,
        bulanSampai: periodRange.bulanSampai,
        requestedBagianId: selectedBagianId,
        search,
      });
      setRows(data);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal memuat rekap persediaan.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [
    user,
    tahun,
    periodRange.bulanDari,
    periodRange.bulanSampai,
    selectedBagianId,
    search,
    showToast,
  ]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadRekap();
    }, 0);
    return () => clearTimeout(t);
  }, [loadRekap]);

  const loadSaldoAwalData = useCallback(async () => {
    if (!user) return;
    setLoadingSaldoList(true);
    try {
      const [brg, list] = await Promise.all([
        barangList.length > 0 ? Promise.resolve(barangList) : listBarang(),
        listTransaksi(user, {
          tahun,
          requestedBagianId: selectedBagianId,
          jenisList: ['SALDO_AWAL'],
        }),
      ]);
      if (barangList.length === 0) setBarangList(brg);
      setSaldoAwalList(list);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal memuat daftar saldo awal.',
        'error'
      );
    } finally {
      setLoadingSaldoList(false);
    }
  }, [user, barangList, tahun, selectedBagianId, showToast]);

  const openSaldoAwalModal = async () => {
    const defaultBagian =
      isBagianLocked && user?.bagianId
        ? user.bagianId
        : selectedBagianId !== 'ALL'
        ? selectedBagianId
        : bagianList[0]?.id || '';
    setModalBagianId(defaultBagian);
    setDraftRows([makeEmptySaldoRow(tahun, 1)]);
    setEditingSaldo(null);
    setSaldoModalTab('input');
    setSaldoModalOpen(true);
    await loadSaldoAwalData();
  };

  const handleDraftBarangChange = (key: string, barangId: string) => {
    const found = barangList.find((b) => b.id === barangId);
    setDraftRows((prev) =>
      prev.map((row) =>
        row.key === key
          ? {
              ...row,
              barangId,
              hargaSatuan: found ? String(found.hargaStandar) : row.hargaSatuan,
            }
          : row
      )
    );
  };

  const handleDraftFieldChange = (
    key: string,
    field: keyof Omit<SaldoAwalDraftRow, 'key'>,
    value: string
  ) => {
    setDraftRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, [field]: value } : row))
    );
  };

  const handleAddDraftRow = () => {
    setDraftRows((prev) => [...prev, makeEmptySaldoRow(tahun, prev.length + 1)]);
  };

  const handleRemoveDraftRow = (key: string) => {
    setDraftRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  };

  const handleSaveSaldoAwalBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firebaseUser) return;
    if (!modalBagianId) {
      showToast('Pilih Gudang Bagian terlebih dahulu.', 'error');
      return;
    }

    const validItems = draftRows
      .filter((r) => r.barangId && Number(r.qty) > 0)
      .map((r) => ({
        barangId: r.barangId,
        tanggal: r.tanggal || `${tahun}-01-01`,
        noBukti: (r.noBukti || `SA-${tahun}`).trim(),
        qty: Number(r.qty),
        hargaSatuan: Math.max(0, Number(r.hargaSatuan) || 0),
        keterangan: (r.keterangan || `Saldo Awal Tahun ${tahun}`).trim(),
      }));

    if (validItems.length === 0) {
      showToast('Isi minimal 1 item barang dengan kuantitas (> 0).', 'error');
      return;
    }

    setSavingSaldo(true);
    try {
      const inserted = await createTransaksiBatch(user, firebaseUser.uid, {
        mode: 'SALDO_AWAL',
        bagianId: modalBagianId,
        items: validItems,
      });
      showToast(`${inserted} item Saldo Awal berhasil disimpan.`, 'success');
      setDraftRows([makeEmptySaldoRow(tahun, 1)]);
      await Promise.all([loadSaldoAwalData(), loadRekap()]);
      setSaldoModalTab('daftar');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal menyimpan saldo awal.',
        'error'
      );
    } finally {
      setSavingSaldo(false);
    }
  };

  const startEditSaldo = (row: TransaksiPersediaan) => {
    setEditingSaldo(row);
    setEditTanggal(row.tanggal);
    setEditNoBukti(row.noBukti);
    setEditBarangId(row.barangId);
    setEditQty(String(row.qty));
    setEditHarga(String(row.hargaSatuan));
    setEditKeterangan(row.keterangan || '');
  };

  const handleSaveEditSaldo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firebaseUser || !editingSaldo) return;
    setSavingEdit(true);
    try {
      await updateTransaksi(user, firebaseUser.uid, {
        id: editingSaldo.id,
        tanggal: editTanggal,
        noBukti: editNoBukti,
        barangId: editBarangId,
        qty: Number(editQty),
        hargaSatuan: Math.max(0, Number(editHarga) || 0),
        keterangan: editKeterangan,
      });
      showToast('Saldo Awal berhasil diperbarui.', 'success');
      setEditingSaldo(null);
      await Promise.all([loadSaldoAwalData(), loadRekap()]);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal memperbarui saldo awal.',
        'error'
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteSaldo = async () => {
    if (!user || !firebaseUser || !deleteTarget) return;
    setDeletingSaldo(true);
    try {
      await deleteTransaksi(user, firebaseUser.uid, deleteTarget.id);
      showToast('Saldo Awal berhasil dihapus.', 'success');
      setDeleteTarget(null);
      await Promise.all([loadSaldoAwalData(), loadRekap()]);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal menghapus saldo awal.',
        'error'
      );
    } finally {
      setDeletingSaldo(false);
    }
  };

  // Hierarchical grouping matching reference PDF:
  // A. JUMLAH OPERASIONAL -> I/II/III Belanja Barang ... -> Kode Rekening / Kategori -> BAGIAN ... -> Item Rows
  const { sections, grandTotals } = useMemo(() => {
    const secMap = new Map<
      string,
      {
        romawi: string;
        label: string;
        order: number;
        katMap: Map<
          string,
          {
            kodeRekening: string;
            kategoriNama: string;
            bagMap: Map<string, BagianGroup>;
            totals: TotalsSummary;
          }
        >;
        totals: TotalsSummary;
      }
    >();

    const totalAll = emptyTotals();

    for (const row of rows) {
      const secMeta = classifyBelanjaSection(row.kodeRekening);
      let sec = secMap.get(secMeta.romawi);
      if (!sec) {
        sec = {
          romawi: secMeta.romawi,
          label: secMeta.label,
          order: secMeta.order,
          katMap: new Map(),
          totals: emptyTotals(),
        };
        secMap.set(secMeta.romawi, sec);
      }

      const katKey = `${row.kodeRekening}::${row.kategoriNama}`;
      let kat = sec.katMap.get(katKey);
      if (!kat) {
        kat = {
          kodeRekening: row.kodeRekening,
          kategoriNama: row.kategoriNama,
          bagMap: new Map(),
          totals: emptyTotals(),
        };
        sec.katMap.set(katKey, kat);
      }

      let bag = kat.bagMap.get(row.bagianId);
      if (!bag) {
        bag = {
          bagianId: row.bagianId,
          bagianLabel: normalizeBagianTitle(row.bagianNama),
          items: [],
          totals: emptyTotals(),
        };
        kat.bagMap.set(row.bagianId, bag);
      }

      bag.items.push(row);
      addRowToTotals(bag.totals, row);
      addRowToTotals(kat.totals, row);
      addRowToTotals(sec.totals, row);
      addRowToTotals(totalAll, row);
    }

    const builtSections: SectionGroup[] = Array.from(secMap.values())
      .sort((a, b) => a.order - b.order)
      .map((sec) => {
        const kategoris: KategoriGroup[] = Array.from(sec.katMap.values())
          .sort((a, b) => a.kodeRekening.localeCompare(b.kodeRekening))
          .map((kat, idx) => ({
            noUrut: idx + 1,
            kodeRekening: kat.kodeRekening,
            kategoriNama: kat.kategoriNama,
            bagians: Array.from(kat.bagMap.values()).sort((a, b) =>
              a.bagianLabel.localeCompare(b.bagianLabel)
            ),
            totals: kat.totals,
          }));

        return {
          romawi: sec.romawi,
          label: sec.label,
          kategoris,
          totals: sec.totals,
        };
      });

    return { sections: builtSections, grandTotals: totalAll };
  }, [rows]);

  const bulanAwalLabel = `${NAMA_BULAN[periodRange.bulanDari - 1]} ${tahun}`;
  const bulanAkhirLabel = `${NAMA_BULAN[periodRange.bulanSampai - 1]} ${tahun}`;
  const lastDayOfEndMonth = new Date(tahun, periodRange.bulanSampai, 0).getDate();
  const tanggalTtdLabel = `${lastDayOfEndMonth} ${NAMA_BULAN[periodRange.bulanSampai - 1]} ${tahun}`;

  const opdLabel = instansi?.subInstansi
    ? instansi.subInstansi.replace(/^sekretariat daerah$/i, 'Sekretariat Daerah')
    : 'Sekretariat Daerah';
  const rawKabKota = (instansi?.namaInstansi || 'DEMAK')
    .replace(/^PEMERINTAH\s+/i, '')
    .replace(/^KABUPATEN\s+/i, '')
    .replace(/^KOTA\s+/i, '')
    .trim()
    .toUpperCase();
  const kabKotaLabel = rawKabKota || 'DEMAK';

  const handleExportExcel = async () => {
    const XLSX = await import('xlsx');
    const aoa: Array<Array<string | number>> = [];

    aoa.push(['REKAP PERSEDIAAN']);
    aoa.push(['OPD', `: ${opdLabel}`]);
    aoa.push(['KABUPATEN/ KOTA', `: ${kabKotaLabel}`]);
    aoa.push(['PROVINSI', ': JAWA TENGAH']);
    aoa.push([]);

    aoa.push([
      'NO.',
      'Nama Barang /Kode Rekening',
      '',
      `Saldo Awal ${bulanAwalLabel}`,
      '',
      '',
      '',
      `Pembelanjaan ${tahun}`,
      '',
      '',
      '',
      `Pemakaian ${tahun}`,
      '',
      '',
      '',
      `Saldo Akhir ${bulanAkhirLabel}`,
      '',
      '',
      '',
      'Ket.',
    ]);

    aoa.push([
      '',
      '',
      '',
      'Unit',
      'Satuan Barang',
      'Satuan Harga',
      'Jumlah',
      'Unit',
      'Satuan Barang',
      'Satuan Harga',
      'Jumlah',
      'Unit',
      'Satuan Barang',
      'Satuan Harga',
      'Jumlah',
      'Unit',
      'Satuan Barang',
      'Satuan Harga',
      'Jumlah',
      '',
    ]);

    aoa.push([1, 2, '', 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);

    const pushSummaryRow = (col1: string | number, col2: string, col3: string, t: TotalsSummary) => {
      aoa.push([
        col1,
        col2,
        col3,
        t.awalUnit,
        '-',
        '-',
        t.awalNilai,
        t.masukUnit,
        '-',
        '-',
        t.masukNilai,
        t.keluarUnit,
        '-',
        '-',
        t.keluarNilai,
        t.akhirUnit,
        '-',
        '-',
        t.akhirNilai,
        '-',
      ]);
    };

    pushSummaryRow('A.', '', 'JUMLAH OPERASIONAL', grandTotals);

    for (const sec of sections) {
      pushSummaryRow(sec.romawi, '', sec.label, sec.totals);
      for (const kat of sec.kategoris) {
        pushSummaryRow(kat.noUrut, kat.kodeRekening, kat.kategoriNama, kat.totals);
        for (const bag of kat.bagians) {
          pushSummaryRow('', '', bag.bagianLabel, bag.totals);
          for (const item of bag.items) {
            aoa.push([
              '',
              '',
              item.namaBarang,
              item.saldoAwal,
              item.saldoAwal > 0 ? item.satuan : '-',
              item.saldoAwal > 0 ? item.hargaAwal : 0,
              item.saldoAwalNilai,
              item.mutasiMasuk,
              item.mutasiMasuk > 0 ? item.satuan : '-',
              item.mutasiMasuk > 0 ? item.hargaMasuk : 0,
              item.masukNilai,
              item.mutasiKeluar,
              item.mutasiKeluar > 0 ? item.satuan : '-',
              item.mutasiKeluar > 0 ? item.hargaKeluar : 0,
              item.keluarNilai,
              Math.max(0, item.saldoAkhir),
              item.saldoAkhir > 0 ? item.satuan : '-',
              item.saldoAkhir > 0 ? item.hargaAkhir : 0,
              item.saldoAkhirNilai,
              '',
            ]);
          }
        }
      }
    }

    pushSummaryRow('', '', 'JUMLAH TOTAL', grandTotals);

    aoa.push([]);
    aoa.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', `Demak, ${tanggalTtdLabel}`]);
    aoa.push(['', '', 'Mengetahui :', '', '', '', '', '', '', '', '', '', '', '', '', 'PENGURUS BARANG']);
    aoa.push([
      '',
      '',
      'A.N. SEKRETARIS DAERAH',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      `${opdLabel.toUpperCase()} KABUPATEN ${kabKotaLabel}`,
    ]);
    aoa.push(['', '', instansi?.jabatanPimpinan || 'KEPALA BAGIAN UMUM SETDA KAB. DEMAK']);
    aoa.push([]);
    aoa.push([]);
    aoa.push([
      '',
      '',
      instansi?.namaPimpinan || '-',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      instansi?.namaPengurus || '-',
    ]);
    aoa.push([
      '',
      '',
      `NIP. ${instansi?.nipPimpinan || '-'}`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      `NIP. ${instansi?.nipPengurus || '-'}`,
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 19 } }, // REKAP PERSEDIAAN
      { s: { r: 5, c: 0 }, e: { r: 6, c: 0 } }, // NO.
      { s: { r: 5, c: 1 }, e: { r: 6, c: 2 } }, // Nama Barang /Kode Rekening
      { s: { r: 5, c: 3 }, e: { r: 5, c: 6 } }, // Saldo Awal
      { s: { r: 5, c: 7 }, e: { r: 5, c: 10 } }, // Pembelanjaan
      { s: { r: 5, c: 11 }, e: { r: 5, c: 14 } }, // Pemakaian
      { s: { r: 5, c: 15 }, e: { r: 5, c: 18 } }, // Saldo Akhir
      { s: { r: 5, c: 19 }, e: { r: 6, c: 19 } }, // Ket.
      { s: { r: 7, c: 1 }, e: { r: 7, c: 2 } }, // Col index 2
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap_Persediaan');
    XLSX.writeFile(wb, `Rekap_Persediaan_BHP_TA_${tahun}.xlsx`);
    showToast('Laporan Rekap Persediaan berhasil diekspor ke Excel.', 'success');
  };

  const renderSummaryCells = (t: TotalsSummary, dashOnZeroHarga = true) => (
    <>
      <td className="border border-black px-1.5 py-1 text-right font-mono tabular-nums">
        {fmtCell(t.awalUnit)}
      </td>
      <td className="border border-black px-1 py-1 text-center">{t.awalUnit > 0 ? '-' : '0'}</td>
      <td className="border border-black px-1.5 py-1 text-right font-mono tabular-nums">
        {dashOnZeroHarga ? '-' : ''}
      </td>
      <td className="border border-black px-1.5 py-1 text-right font-mono tabular-nums">
        {fmtCell(t.awalNilai)}
      </td>

      <td className="border border-black px-1.5 py-1 text-right font-mono tabular-nums">
        {fmtCell(t.masukUnit)}
      </td>
      <td className="border border-black px-1 py-1 text-center">{t.masukUnit > 0 ? '-' : '0'}</td>
      <td className="border border-black px-1.5 py-1 text-right font-mono tabular-nums">
        {dashOnZeroHarga ? '-' : ''}
      </td>
      <td className="border border-black px-1.5 py-1 text-right font-mono tabular-nums">
        {fmtCell(t.masukNilai)}
      </td>

      <td className="border border-black px-1.5 py-1 text-right font-mono tabular-nums">
        {fmtCell(t.keluarUnit)}
      </td>
      <td className="border border-black px-1 py-1 text-center">{t.keluarUnit > 0 ? '-' : '0'}</td>
      <td className="border border-black px-1.5 py-1 text-right font-mono tabular-nums">
        {dashOnZeroHarga ? '-' : ''}
      </td>
      <td className="border border-black px-1.5 py-1 text-right font-mono tabular-nums">
        {fmtCell(t.keluarNilai)}
      </td>

      <td className="border border-black px-1.5 py-1 text-right font-mono tabular-nums">
        {fmtCell(t.akhirUnit)}
      </td>
      <td className="border border-black px-1 py-1 text-center">{t.akhirUnit > 0 ? '-' : '0'}</td>
      <td className="border border-black px-1.5 py-1 text-right font-mono tabular-nums">
        {dashOnZeroHarga ? '-' : ''}
      </td>
      <td className="border border-black px-1.5 py-1 text-right font-mono tabular-nums">
        {fmtCell(t.akhirNilai)}
      </td>

      <td className="border border-black px-1 py-1 text-center">-</td>
    </>
  );

  return (
    <AppShell
      title="Rekapitulasi Persediaan Barang"
      subtitle={`Tahun Anggaran ${tahun} · ${periodRange.label}`}
    >
      <div className="space-y-4">
        {/* Controls Toolbar */}
        <div className="no-print bg-gradient-to-r from-sky-50/80 via-white to-white rounded-xl border border-sky-200 overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-sky-500 to-blue-600" />
          <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-sky-100/70 rounded-lg">
              {(
                [
                  { id: 'bulanan', label: 'Bulanan' },
                  { id: 'triwulan', label: 'Triwulan' },
                  { id: 'semester', label: 'Semester' },
                  { id: 'tahunan', label: 'Tahunan' },
                  { id: 'kustom', label: 'Kustom Rentang' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    mode === m.id
                      ? 'bg-white text-sky-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-white border border-sky-200 rounded-lg px-2.5 h-9">
                <Building2 className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                {isBagianLocked ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-800 whitespace-nowrap">
                    <Lock className="w-3 h-3 text-slate-500" />
                    {user?.bagianNama || 'Bagian Terkait'}
                  </span>
                ) : (
                  <select
                    aria-label="Filter Bagian Rekap Persediaan"
                    value={selectedBagianId}
                    onChange={(e) => setSelectedBagianId(e.target.value)}
                    className="text-xs font-medium text-slate-800 bg-transparent focus:outline-none max-w-[170px]"
                  >
                    <option value="ALL">Semua Bagian (Konsolidasi)</option>
                    {bagianList.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.kode} — {b.nama}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="relative w-52">
                <Search className="w-4 h-4 text-sky-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari barang/rekening..."
                  className="w-full h-9 pl-9 pr-3 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>

              {canManageSaldoAwal && (
                <button
                  type="button"
                  onClick={() => void openSaldoAwalModal()}
                  className="h-9 px-3.5 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-300 rounded-lg hover:bg-emerald-100 whitespace-nowrap"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Input / Kelola Saldo Awal</span>
                </button>
              )}

              <button
                type="button"
                disabled={rows.length === 0}
                onClick={() => window.print()}
                className="h-9 px-3.5 inline-flex items-center gap-1.5 text-xs font-semibold text-sky-800 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 disabled:opacity-50 whitespace-nowrap"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak / PDF</span>
              </button>

              <button
                type="button"
                disabled={rows.length === 0}
                onClick={handleExportExcel}
                className="h-9 px-3.5 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-sky-700 rounded-lg hover:bg-sky-800 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                <span>Export Excel</span>
              </button>
            </div>
          </div>

          {mode !== 'tahunan' && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
              {mode === 'bulanan' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-600">Pilih Bulan:</span>
                  <select
                    value={bulan}
                    onChange={(e) => setBulan(Number(e.target.value))}
                    className="h-9 px-3 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    {NAMA_BULAN.map((b, idx) => (
                      <option key={b} value={idx + 1}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {mode === 'triwulan' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-600">Pilih Triwulan:</span>
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
                </div>
              )}
              {mode === 'semester' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-600">Pilih Semester:</span>
                  <select
                    value={semester}
                    onChange={(e) => setSemester(Number(e.target.value))}
                    className="h-9 px-3 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value={1}>Semester I (Jan - Jun)</option>
                    <option value={2}>Semester II (Jan - Des)</option>
                  </select>
                </div>
              )}
              {mode === 'kustom' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-600">Dari Bulan:</span>
                  <select
                    value={bulanDari}
                    onChange={(e) => setBulanDari(Number(e.target.value))}
                    className="h-9 px-3 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    {NAMA_BULAN.map((b, idx) => (
                      <option key={b} value={idx + 1}>
                        {b}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs font-medium text-slate-600">s.d.</span>
                  <select
                    value={bulanSampai}
                    onChange={(e) => setBulanSampai(Number(e.target.value))}
                    className="h-9 px-3 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    {NAMA_BULAN.map((b, idx) => (
                      <option key={b} value={idx + 1}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
          </div>
        </div>

        {/* Official Report Sheet matching Reference PDF */}
        <div className="print-sheet print-landscape bg-white rounded-xl border border-slate-200 p-4 sm:p-6 text-black">
          {/* Document Header / Kop */}
          <div className="text-center mb-3">
            <h2 className="text-sm sm:text-base font-bold tracking-wide uppercase text-black">
              REKAP PERSEDIAAN
            </h2>
          </div>

          <div className="mb-3 text-[11px] leading-snug text-black max-w-md">
            <div className="grid grid-cols-[135px_12px_1fr]">
              <span className="font-medium">OPD</span>
              <span>:</span>
              <span className="font-medium">{opdLabel}</span>
            </div>
            <div className="grid grid-cols-[135px_12px_1fr]">
              <span className="font-medium">KABUPATEN/ KOTA</span>
              <span>:</span>
              <span className="font-medium">{kabKotaLabel}</span>
            </div>
            <div className="grid grid-cols-[135px_12px_1fr]">
              <span className="font-medium">PROVINSI</span>
              <span>:</span>
              <span className="font-medium">JAWA TENGAH</span>
            </div>
          </div>

          {/* 20-Column Two-Row Table */}
          <div className="overflow-x-auto">
            <table className="print-table w-full border-collapse border border-black text-[10px] sm:text-[10.5px] leading-tight">
              <thead>
                <tr className="bg-white text-black font-semibold text-center">
                  <th rowSpan={2} className="border border-black px-1.5 py-1.5 w-8">
                    NO.
                  </th>
                  <th rowSpan={2} colSpan={2} className="border border-black px-2 py-1.5 min-w-[230px]">
                    Nama Barang /Kode Rekening
                  </th>
                  <th colSpan={4} className="border border-black px-1.5 py-1">
                    Saldo Awal {bulanAwalLabel}
                  </th>
                  <th colSpan={4} className="border border-black px-1.5 py-1">
                    Pembelanjaan {tahun}
                  </th>
                  <th colSpan={4} className="border border-black px-1.5 py-1">
                    Pemakaian {tahun}
                  </th>
                  <th colSpan={4} className="border border-black px-1.5 py-1">
                    Saldo Akhir {bulanAkhirLabel}
                  </th>
                  <th rowSpan={2} className="border border-black px-1.5 py-1.5 w-9">
                    Ket.
                  </th>
                </tr>
                <tr className="bg-white text-black font-semibold text-center">
                  {/* Saldo Awal subheaders */}
                  <th className="border border-black px-1 py-1 min-w-[38px]">Unit</th>
                  <th className="border border-black px-1 py-1 min-w-[46px]">Satuan Barang</th>
                  <th className="border border-black px-1 py-1 min-w-[66px]">Satuan Harga</th>
                  <th className="border border-black px-1 py-1 min-w-[76px]">Jumlah</th>
                  {/* Pembelanjaan subheaders */}
                  <th className="border border-black px-1 py-1 min-w-[38px]">Unit</th>
                  <th className="border border-black px-1 py-1 min-w-[46px]">Satuan Barang</th>
                  <th className="border border-black px-1 py-1 min-w-[66px]">Satuan Harga</th>
                  <th className="border border-black px-1 py-1 min-w-[76px]">Jumlah</th>
                  {/* Pemakaian subheaders */}
                  <th className="border border-black px-1 py-1 min-w-[38px]">Unit</th>
                  <th className="border border-black px-1 py-1 min-w-[46px]">Satuan Barang</th>
                  <th className="border border-black px-1 py-1 min-w-[66px]">Satuan Harga</th>
                  <th className="border border-black px-1 py-1 min-w-[76px]">Jumlah</th>
                  {/* Saldo Akhir subheaders */}
                  <th className="border border-black px-1 py-1 min-w-[38px]">Unit</th>
                  <th className="border border-black px-1 py-1 min-w-[46px]">Satuan Barang</th>
                  <th className="border border-black px-1 py-1 min-w-[66px]">Satuan Harga</th>
                  <th className="border border-black px-1 py-1 min-w-[76px]">Jumlah</th>
                </tr>
                <tr className="bg-neutral-400/80 text-black text-[9px] text-center font-medium">
                  <th className="border border-black px-1 py-0.5">1</th>
                  <th colSpan={2} className="border border-black px-1 py-0.5">
                    2
                  </th>
                  <th className="border border-black px-1 py-0.5">4</th>
                  <th className="border border-black px-1 py-0.5">5</th>
                  <th className="border border-black px-1 py-0.5">6</th>
                  <th className="border border-black px-1 py-0.5">7</th>
                  <th className="border border-black px-1 py-0.5">8</th>
                  <th className="border border-black px-1 py-0.5">9</th>
                  <th className="border border-black px-1 py-0.5">10</th>
                  <th className="border border-black px-1 py-0.5">11</th>
                  <th className="border border-black px-1 py-0.5">12</th>
                  <th className="border border-black px-1 py-0.5">13</th>
                  <th className="border border-black px-1 py-0.5">14</th>
                  <th className="border border-black px-1 py-0.5">15</th>
                  <th className="border border-black px-1 py-0.5">16</th>
                  <th className="border border-black px-1 py-0.5">17</th>
                  <th className="border border-black px-1 py-0.5">18</th>
                  <th className="border border-black px-1 py-0.5">19</th>
                  <th className="border border-black px-1 py-0.5">20</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={20} className="border border-black px-4 py-10 text-center text-slate-600">
                      Menghitung rekap persediaan...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={20} className="border border-black px-4 py-10 text-center text-slate-600">
                      Tidak ada pergerakan atau saldo persediaan pada periode terpilih.
                    </td>
                  </tr>
                ) : (
                  <>
                    {/* Level 1: A. JUMLAH OPERASIONAL */}
                    <tr className="bg-[#0099cc] text-black font-bold">
                      <td className="border border-black px-1.5 py-1 text-center">A.</td>
                      <td className="border border-black px-1.5 py-1 w-28" />
                      <td className="border border-black px-1.5 py-1">JUMLAH OPERASIONAL</td>
                      {renderSummaryCells(grandTotals)}
                    </tr>

                    {sections.map((sec) => (
                      <React.Fragment key={sec.romawi}>
                        {/* Level 2: I / II / III Belanja Barang ... */}
                        <tr className="bg-[#e67e00] text-black font-bold">
                          <td className="border border-black px-1.5 py-1 text-center">
                            {sec.romawi}
                          </td>
                          <td className="border border-black px-1.5 py-1" />
                          <td className="border border-black px-1.5 py-1">{sec.label}</td>
                          {renderSummaryCells(sec.totals)}
                        </tr>

                        {sec.kategoris.map((kat) => (
                          <React.Fragment key={`${sec.romawi}-${kat.kodeRekening}-${kat.kategoriNama}`}>
                            {/* Level 3: No + Kode Rekening + Nama Kategori */}
                            <tr className="bg-[#f8cbad] text-black font-semibold">
                              <td className="border border-black px-1.5 py-1 text-center">
                                {kat.noUrut}
                              </td>
                              <td className="border border-black px-1.5 py-1 font-mono whitespace-nowrap">
                                {kat.kodeRekening}
                              </td>
                              <td className="border border-black px-1.5 py-1">
                                {kat.kategoriNama}
                              </td>
                              {renderSummaryCells(kat.totals)}
                            </tr>

                            {kat.bagians.map((bag) => (
                              <React.Fragment key={`${kat.kodeRekening}-${bag.bagianId}`}>
                                {/* Level 4: BAGIAN ... */}
                                <tr className="bg-[#92d050] text-black font-semibold">
                                  <td className="border border-black px-1.5 py-1" />
                                  <td className="border border-black px-1.5 py-1" />
                                  <td className="border border-black px-1.5 py-1">
                                    {bag.bagianLabel}
                                  </td>
                                  {renderSummaryCells(bag.totals)}
                                </tr>

                                {/* Level 5: Item detail rows */}
                                {bag.items.map((item) => (
                                  <tr
                                    key={`${item.bagianId}-${item.barangId}`}
                                    className="bg-white hover:bg-slate-50 text-black"
                                  >
                                    <td className="border border-black px-1.5 py-1" />
                                    <td className="border border-black px-1.5 py-1" />
                                    <td className="border border-black px-1.5 py-1">
                                      {item.namaBarang}
                                    </td>

                                    {/* Saldo Awal */}
                                    <td className="border border-black px-1.5 py-1 text-right font-mono tabular-nums">
                                      {fmtCell(item.saldoAwal)}
                                    </td>
                                    <td className="border border-black px-1 py-1 text-center">
                                      {item.saldoAwal > 0 ? item.satuan : '-'}
                                    </td>
                                    <td className="border border-black px-1.5 py-1 text-right font-mono tabular-nums">
                                      {item.saldoAwal > 0 ? fmtCell(item.hargaAwal) : '-'}
                                    </td>
                                    <td className="border border-black px-1.5 py-1 text-right font-mono tabular-nums">
                                      {fmtCell(item.saldoAwalNilai)}
                                    </td>

                                    {/* Pembelanjaan */}
                                    <td className="border border-black px-1.5 py-1 text-right font-mono tabular-nums">
                                      {fmtCell(item.mutasiMasuk)}
                                    </td>
                                    <td className="border border-black px-1 py-1 text-center">
                                      {item.mutasiMasuk > 0 ? item.satuan : '-'}
                                    </td>
                                    <td className="border border-black px-1.5 py-1 text-right font-mono tabular-nums">
                                      {item.mutasiMasuk > 0 ? fmtCell(item.hargaMasuk) : '-'}
                                    </td>
                                    <td className="border border-black px-1.5 py-1 text-right font-mono tabular-nums">
                                      {fmtCell(item.masukNilai)}
                                    </td>

                                    {/* Pemakaian */}
                                    <td className="border border-black px-1.5 py-1 text-right font-mono tabular-nums">
                                      {fmtCell(item.mutasiKeluar)}
                                    </td>
                                    <td className="border border-black px-1 py-1 text-center">
                                      {item.mutasiKeluar > 0 ? item.satuan : '-'}
                                    </td>
                                    <td className="border border-black px-1.5 py-1 text-right font-mono tabular-nums">
                                      {item.mutasiKeluar > 0 ? fmtCell(item.hargaKeluar) : '-'}
                                    </td>
                                    <td className="border border-black px-1.5 py-1 text-right font-mono tabular-nums">
                                      {fmtCell(item.keluarNilai)}
                                    </td>

                                    {/* Saldo Akhir */}
                                    <td className="border border-black px-1.5 py-1 text-right font-mono tabular-nums">
                                      {fmtCell(Math.max(0, item.saldoAkhir))}
                                    </td>
                                    <td className="border border-black px-1 py-1 text-center">
                                      {item.saldoAkhir > 0 ? item.satuan : '-'}
                                    </td>
                                    <td className="border border-black px-1.5 py-1 text-right font-mono tabular-nums">
                                      {item.saldoAkhir > 0 ? fmtCell(item.hargaAkhir) : '-'}
                                    </td>
                                    <td className="border border-black px-1.5 py-1 text-right font-mono tabular-nums font-medium">
                                      {fmtCell(item.saldoAkhirNilai)}
                                    </td>

                                    <td className="border border-black px-1 py-1 text-center" />
                                  </tr>
                                ))}
                              </React.Fragment>
                            ))}
                          </React.Fragment>
                        ))}
                      </React.Fragment>
                    ))}

                    {/* Footer: JUMLAH TOTAL */}
                    <tr className="bg-[#0099cc] text-black font-bold">
                      <td className="border border-black px-1.5 py-1.5" />
                      <td className="border border-black px-1.5 py-1.5" />
                      <td className="border border-black px-1.5 py-1.5">JUMLAH TOTAL</td>
                      {renderSummaryCells(grandTotals)}
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* Signature Block matching Page 39 of Reference PDF */}
          {rows.length > 0 && (
            <div className="print-avoid-break mt-8 grid grid-cols-2 gap-8 text-[11px] text-center text-black">
              <div className="pt-5">
                <p>Mengetahui :</p>
                <p>A.N. SEKRETARIS DAERAH</p>
                <p className="uppercase">
                  {instansi?.jabatanPimpinan || 'KEPALA BAGIAN UMUM SETDA KAB. DEMAK'}
                </p>
                <div className="h-16" />
                <p className="font-bold underline uppercase">
                  {instansi?.namaPimpinan || '................................'}
                </p>
                <p className="font-mono">NIP. {instansi?.nipPimpinan || '-'}</p>
              </div>
              <div>
                <p className="mb-1">Demak, {tanggalTtdLabel}</p>
                <p className="uppercase">{instansi?.jabatanPengurus || 'PENGURUS BARANG'}</p>
                <p className="uppercase">
                  {opdLabel} KABUPATEN {kabKotaLabel}
                </p>
                <div className="h-16" />
                <p className="font-bold underline uppercase">
                  {instansi?.namaPengurus || '................................'}
                </p>
                <p className="font-mono">NIP. {instansi?.nipPengurus || '-'}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Input & Kelola Saldo Awal */}
      {saldoModalOpen && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Kelola Saldo Awal Persediaan · TA {tahun}
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Saldo awal mengisi kolom Saldo Awal di Rekap Persediaan dan stok awal gudang tanpa memotong Realisasi Anggaran DPA.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSaldoModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                aria-label="Tutup modal saldo awal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-1 px-5 pt-3 border-b border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setSaldoModalTab('input')}
                className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  saldoModalTab === 'input'
                    ? 'border-teal-700 text-teal-800'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Input Saldo Awal Baru
              </button>
              <button
                type="button"
                onClick={() => setSaldoModalTab('daftar')}
                className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  saldoModalTab === 'daftar'
                    ? 'border-teal-700 text-teal-800'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Daftar Saldo Awal ({saldoAwalList.length})
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {saldoModalTab === 'input' ? (
                <form onSubmit={handleSaveSaldoAwalBatch} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Gudang Bagian
                      </label>
                      {isBagianLocked ? (
                        <div className="h-9 px-3 flex items-center gap-1.5 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-300 rounded-lg">
                          <Lock className="w-3.5 h-3.5 text-slate-500" />
                          <span>{user?.bagianNama || 'Bagian Terkait'}</span>
                        </div>
                      ) : (
                        <select
                          value={modalBagianId}
                          onChange={(e) => setModalBagianId(e.target.value)}
                          className="w-full h-9 px-3 text-xs border border-slate-300 rounded-lg bg-white"
                        >
                          <option value="">-- Pilih Gudang Bagian --</option>
                          {bagianList.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.kode} — {b.nama}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleAddDraftRow}
                        className="h-9 px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-300 rounded-lg hover:bg-teal-100 whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah Baris Barang</span>
                      </button>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-lg overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="px-2.5 py-2 font-semibold min-w-[220px]">Barang BHP</th>
                          <th className="px-2.5 py-2 font-semibold w-36">Tanggal</th>
                          <th className="px-2.5 py-2 font-semibold w-32">No. Bukti / BA</th>
                          <th className="px-2.5 py-2 font-semibold w-24 text-right">Unit</th>
                          <th className="px-2.5 py-2 font-semibold w-32 text-right">Harga Satuan</th>
                          <th className="px-2.5 py-2 font-semibold w-32 text-right">Jumlah Nilai</th>
                          <th className="px-2.5 py-2 font-semibold min-w-[140px]">Keterangan</th>
                          <th className="px-2 py-2 w-10" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {draftRows.map((row) => {
                          const selectedBrg = barangList.find((b) => b.id === row.barangId);
                          const subtotal =
                            (Number(row.qty) || 0) * Math.max(0, Number(row.hargaSatuan) || 0);
                          return (
                            <tr key={row.key}>
                              <td className="px-2.5 py-2">
                                <select
                                  value={row.barangId}
                                  onChange={(e) => handleDraftBarangChange(row.key, e.target.value)}
                                  className="w-full h-8 px-2 text-xs border border-slate-300 rounded-md bg-white"
                                >
                                  <option value="">-- Pilih Barang --</option>
                                  {barangList.map((b) => (
                                    <option key={b.id} value={b.id}>
                                      {b.nama} ({b.satuan})
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-2.5 py-2">
                                <input
                                  type="date"
                                  value={row.tanggal}
                                  onChange={(e) =>
                                    handleDraftFieldChange(row.key, 'tanggal', e.target.value)
                                  }
                                  className="w-full h-8 px-2 text-xs border border-slate-300 rounded-md"
                                />
                              </td>
                              <td className="px-2.5 py-2">
                                <input
                                  type="text"
                                  value={row.noBukti}
                                  onChange={(e) =>
                                    handleDraftFieldChange(row.key, 'noBukti', e.target.value)
                                  }
                                  placeholder={`SA-${tahun}`}
                                  className="w-full h-8 px-2 text-xs border border-slate-300 rounded-md"
                                />
                              </td>
                              <td className="px-2.5 py-2">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0.01"
                                    step="any"
                                    value={row.qty}
                                    onChange={(e) =>
                                      handleDraftFieldChange(row.key, 'qty', e.target.value)
                                    }
                                    placeholder="0"
                                    className="w-full h-8 px-2 text-xs text-right font-mono border border-slate-300 rounded-md"
                                  />
                                  {selectedBrg && (
                                    <span className="text-[11px] text-slate-500 shrink-0">
                                      {selectedBrg.satuan}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-2.5 py-2">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={row.hargaSatuan}
                                  onChange={(e) =>
                                    handleDraftFieldChange(row.key, 'hargaSatuan', e.target.value)
                                  }
                                  placeholder="0"
                                  className="w-full h-8 px-2 text-xs text-right font-mono border border-slate-300 rounded-md"
                                />
                              </td>
                              <td className="px-2.5 py-2 text-right font-mono tabular-nums font-semibold text-slate-800 whitespace-nowrap">
                                {formatRupiah(subtotal)}
                              </td>
                              <td className="px-2.5 py-2">
                                <input
                                  type="text"
                                  value={row.keterangan}
                                  onChange={(e) =>
                                    handleDraftFieldChange(row.key, 'keterangan', e.target.value)
                                  }
                                  className="w-full h-8 px-2 text-xs border border-slate-300 rounded-md"
                                />
                              </td>
                              <td className="px-2 py-2 text-center">
                                <button
                                  type="button"
                                  disabled={draftRows.length <= 1}
                                  onClick={() => handleRemoveDraftRow(row.key)}
                                  className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30"
                                  aria-label="Hapus baris"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div className="text-xs text-slate-600">
                      Total Nilai Draft:{' '}
                      <span className="font-bold font-mono text-slate-900">
                        {formatRupiah(
                          draftRows.reduce(
                            (sum, r) =>
                              sum + (Number(r.qty) || 0) * Math.max(0, Number(r.hargaSatuan) || 0),
                            0
                          )
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSaldoModalOpen(false)}
                        className="h-9 px-4 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        disabled={savingSaldo}
                        className="h-9 px-4 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50"
                      >
                        {savingSaldo ? 'Menyimpan...' : 'Simpan Saldo Awal'}
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  {editingSaldo && (
                    <form
                      onSubmit={handleSaveEditSaldo}
                      className="p-4 rounded-lg border border-teal-200 bg-teal-50/50 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-teal-900">
                          Edit Saldo Awal · {editingSaldo.bagianNama}
                        </h4>
                        <button
                          type="button"
                          onClick={() => setEditingSaldo(null)}
                          className="text-xs text-slate-600 hover:text-slate-900"
                        >
                          Batal Edit
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Barang BHP
                          </label>
                          <select
                            value={editBarangId}
                            onChange={(e) => setEditBarangId(e.target.value)}
                            className="w-full h-8 px-2 text-xs border border-slate-300 rounded-md bg-white"
                          >
                            {barangList.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.nama} ({b.satuan})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Tanggal
                          </label>
                          <input
                            type="date"
                            value={editTanggal}
                            onChange={(e) => setEditTanggal(e.target.value)}
                            className="w-full h-8 px-2 text-xs border border-slate-300 rounded-md bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            No. Bukti
                          </label>
                          <input
                            type="text"
                            value={editNoBukti}
                            onChange={(e) => setEditNoBukti(e.target.value)}
                            className="w-full h-8 px-2 text-xs border border-slate-300 rounded-md bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Unit
                          </label>
                          <input
                            type="number"
                            min="0.01"
                            step="any"
                            value={editQty}
                            onChange={(e) => setEditQty(e.target.value)}
                            className="w-full h-8 px-2 text-xs text-right font-mono border border-slate-300 rounded-md bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Harga Satuan
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={editHarga}
                            onChange={(e) => setEditHarga(e.target.value)}
                            className="w-full h-8 px-2 text-xs text-right font-mono border border-slate-300 rounded-md bg-white"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <input
                          type="text"
                          value={editKeterangan}
                          onChange={(e) => setEditKeterangan(e.target.value)}
                          placeholder="Keterangan"
                          className="flex-1 h-8 px-2.5 text-xs border border-slate-300 rounded-md bg-white"
                        />
                        <button
                          type="submit"
                          disabled={savingEdit}
                          className="h-8 px-3.5 text-xs font-semibold text-white bg-teal-700 rounded-md hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap"
                        >
                          {savingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="border border-slate-200 rounded-lg overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Bagian</th>
                          <th className="px-3 py-2 font-semibold">Tanggal</th>
                          <th className="px-3 py-2 font-semibold">No. Bukti</th>
                          <th className="px-3 py-2 font-semibold">Barang BHP</th>
                          <th className="px-3 py-2 font-semibold text-right">Unit</th>
                          <th className="px-3 py-2 font-semibold text-right">Harga Satuan</th>
                          <th className="px-3 py-2 font-semibold text-right">Jumlah</th>
                          <th className="px-3 py-2 font-semibold text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {loadingSaldoList ? (
                          <tr>
                            <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                              Memuat daftar saldo awal...
                            </td>
                          </tr>
                        ) : saldoAwalList.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                              Belum ada data Saldo Awal tercatat untuk Tahun {tahun}.
                            </td>
                          </tr>
                        ) : (
                          saldoAwalList.map((r) => (
                            <tr key={r.id} className="hover:bg-slate-50">
                              <td className="px-3 py-2 font-medium text-slate-800">
                                {r.bagianNama || r.bagianKode}
                              </td>
                              <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">
                                {formatDateID(r.tanggal)}
                              </td>
                              <td className="px-3 py-2 font-mono font-semibold text-slate-900">
                                {r.noBukti}
                              </td>
                              <td className="px-3 py-2 text-slate-900">
                                {r.barangNama} ({r.satuan})
                              </td>
                              <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                                {formatNumber(r.qty)}
                              </td>
                              <td className="px-3 py-2 text-right font-mono tabular-nums">
                                {formatRupiah(r.hargaSatuan)}
                              </td>
                              <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                                {formatRupiah(r.totalNilai)}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {r.isLocked ? (
                                  <span
                                    title="Periode bulan terkait sudah dikunci oleh Rekon"
                                    className="inline-flex items-center gap-1 text-[11px] text-slate-400"
                                  >
                                    <Lock className="w-3.5 h-3.5" />
                                    Terkunci
                                  </span>
                                ) : (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => startEditSaldo(r)}
                                      className="p-1 text-slate-600 hover:text-teal-700"
                                      aria-label={`Edit saldo awal ${r.barangNama}`}
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeleteTarget(r)}
                                      className="p-1 text-slate-600 hover:text-red-600"
                                      aria-label={`Hapus saldo awal ${r.barangNama}`}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Hapus Data Saldo Awal?"
        message={
          deleteTarget
            ? `Saldo awal "${deleteTarget.barangNama}" sejumlah ${formatNumber(deleteTarget.qty)} ${deleteTarget.satuan || ''} pada ${deleteTarget.bagianNama || 'Bagian'} akan dihapus dan saldo stok akan dihitung ulang.`
            : ''
        }
        confirmLabel="Ya, Hapus"
        danger
        loading={deletingSaldo}
        onConfirm={() => void handleDeleteSaldo()}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppShell>
  );
}
