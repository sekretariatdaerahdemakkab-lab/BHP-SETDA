import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import { getYearOptions, roundQty } from '@/lib/format';
import type {
  DashboardSummary,
  JenisTransaksi,
  KartuPersediaanRow,
  LowStockAlert,
  RekapPersediaanRow,
  UserProfile,
} from '@/lib/types';
import { computeAnggaranStatus, listPlafonWithRealisasi } from './anggaran';
import { listBagian, listBarang, listKategori } from './master';
import { resolveEffectiveBagianFilter } from './utils';

interface FsTrx {
  tahun: number;
  bulan: number;
  bagianId: string;
  jenis: JenisTransaksi;
  tanggal: string;
  noBukti: string;
  barangId: string;
  qty: number;
  hargaSatuan: number;
  totalNilai: number;
  createdAt: string;
}

function isInflow(jenis: JenisTransaksi): boolean {
  return (
    jenis === 'SALDO_AWAL' ||
    jenis === 'MASUK' ||
    jenis === 'OPNAME_MASUK' ||
    jenis === 'MUTASI_MASUK'
  );
}

export async function getAvailableYears(currentUser: UserProfile): Promise<number[]> {
  const effectiveBagian = resolveEffectiveBagianFilter(currentUser, 'ALL');
  const trxCol = collection(db, 'transaksi_persediaan');
  const plfCol = collection(db, 'plafon_anggaran');

  try {
    const [trxSnap, plfSnap] = await Promise.all([
      effectiveBagian !== 'ALL'
        ? getDocs(query(trxCol, where('bagianId', '==', effectiveBagian)))
        : getDocs(trxCol),
      effectiveBagian !== 'ALL'
        ? getDocs(query(plfCol, where('bagianId', '==', effectiveBagian)))
        : getDocs(plfCol),
    ]);
    const extra: number[] = [];
    trxSnap.forEach((d) => extra.push(Number(d.data().tahun)));
    plfSnap.forEach((d) => extra.push(Number(d.data().tahun)));
    return getYearOptions(extra);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'transaksi_persediaan|plafon_anggaran');
  }
}

export async function getKartuPersediaan(
  currentUser: UserProfile,
  tahun: number,
  requestedBagianId: string,
  barangId: string
): Promise<{ rows: KartuPersediaanRow[]; saldoAkhir: number }> {
  const effectiveBagian = resolveEffectiveBagianFilter(currentUser, requestedBagianId);
  if (effectiveBagian === 'ALL' || !barangId) {
    return { rows: [], saldoAkhir: 0 };
  }

  let snap;
  try {
    snap = await getDocs(
      query(collection(db, 'kartu_persediaan'), where('bagianId', '==', effectiveBagian))
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'kartu_persediaan');
  }

  const rows: KartuPersediaanRow[] = [];
  snap.forEach((d) => {
    const k = d.data() as Record<string, unknown>;
    if (Number(k.tahun) === tahun && String(k.barangId) === barangId) {
      rows.push({
        id: d.id,
        transaksiId: String(k.transaksiId || ''),
        tahun: Number(k.tahun),
        bagianId: String(k.bagianId),
        barangId: String(k.barangId),
        tanggal: String(k.tanggal || ''),
        noBukti: String(k.noBukti || ''),
        jenis: k.jenis as JenisTransaksi,
        keterangan: String(k.keterangan || ''),
        qtyMasuk: Number(k.qtyMasuk || 0),
        qtyKeluar: Number(k.qtyKeluar || 0),
        sisaSaldo: Number(k.sisaSaldo || 0),
        hargaSatuan: Number(k.hargaSatuan || 0),
        nilaiMutasi: Number(k.nilaiMutasi || 0),
        createdAt: String(k.createdAt || ''),
      });
    }
  });

  rows.sort(
    (a, b) =>
      a.tanggal.localeCompare(b.tanggal) ||
      (a.jenis === 'SALDO_AWAL' ? 0 : 1) - (b.jenis === 'SALDO_AWAL' ? 0 : 1) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id)
  );

  const saldoAkhir = rows.length > 0 ? rows[rows.length - 1].sisaSaldo : 0;
  return { rows, saldoAkhir };
}

export async function getRekapPersediaan(
  currentUser: UserProfile,
  opts: {
    tahun: number;
    bulanDari: number;
    bulanSampai: number;
    requestedBagianId?: string | null;
    search?: string;
  }
): Promise<RekapPersediaanRow[]> {
  const effectiveBagian = resolveEffectiveBagianFilter(currentUser, opts.requestedBagianId);
  const startDate = `${opts.tahun}-${String(opts.bulanDari).padStart(2, '0')}-01`;
  const endDate = `${opts.tahun}-${String(opts.bulanSampai).padStart(2, '0')}-31`;

  const trxCol = collection(db, 'transaksi_persediaan');
  let trxSnap;
  let bagianList;
  let barangList;
  let kategoriList;

  try {
    [trxSnap, bagianList, barangList, kategoriList] = await Promise.all([
      effectiveBagian !== 'ALL'
        ? getDocs(query(trxCol, where('bagianId', '==', effectiveBagian)))
        : getDocs(trxCol),
      listBagian(),
      listBarang(),
      listKategori(),
    ]);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'transaksi_persediaan|rekap');
  }

  const katMap = new Map(kategoriList.map((k) => [k.id, k]));
  const targetBagianList =
    effectiveBagian !== 'ALL'
      ? bagianList.filter((b) => b.id === effectiveBagian)
      : bagianList;
  const bagianMap = new Map(targetBagianList.map((b) => [b.id, b]));
  const barangMap = new Map(barangList.map((b) => [b.id, b]));

  type Acc = {
    saldoAwal: number;
    saldoAwalNilai: number;
    mutasiMasuk: number;
    masukNilai: number;
    mutasiKeluar: number;
    keluarNilai: number;
    latestHarga: number;
    latestTanggal: string;
    latestCreatedAt: string;
  };
  const pairAcc = new Map<string, Acc>();

  trxSnap.forEach((d) => {
    const t = d.data() as FsTrx;
    if (!bagianMap.has(t.bagianId) || !barangMap.has(t.barangId)) return;
    if (t.tanggal > endDate) return;

    const key = `${t.bagianId}::${t.barangId}`;
    const brg = barangMap.get(t.barangId)!;
    const acc = pairAcc.get(key) || {
      saldoAwal: 0,
      saldoAwalNilai: 0,
      mutasiMasuk: 0,
      masukNilai: 0,
      mutasiKeluar: 0,
      keluarNilai: 0,
      latestHarga: brg.hargaStandar,
      latestTanggal: '',
      latestCreatedAt: '',
    };

    const inflow = isInflow(t.jenis);
    const qty = Number(t.qty || 0);
    const hargaTx = Number(t.hargaSatuan || 0);
    const nilaiTx = Number(t.totalNilai || 0) || qty * hargaTx;

    if (t.tanggal < startDate || (t.jenis === 'SALDO_AWAL' && t.tahun === opts.tahun)) {
      acc.saldoAwal += inflow ? qty : -qty;
      acc.saldoAwalNilai += inflow ? nilaiTx : -nilaiTx;
    } else {
      if (inflow) {
        acc.mutasiMasuk += qty;
        acc.masukNilai += nilaiTx;
      } else {
        acc.mutasiKeluar += qty;
        acc.keluarNilai += nilaiTx;
      }
    }

    if (
      hargaTx > 0 &&
      (t.tanggal > acc.latestTanggal ||
        (t.tanggal === acc.latestTanggal && t.createdAt >= acc.latestCreatedAt))
    ) {
      acc.latestHarga = hargaTx;
      acc.latestTanggal = t.tanggal;
      acc.latestCreatedAt = t.createdAt;
    }

    pairAcc.set(key, acc);
  });

  const q = (opts.search || '').trim().toLowerCase();
  const rows: RekapPersediaanRow[] = [];

  for (const [key, acc] of pairAcc) {
    const [bagId, brgId] = key.split('::');
    const bag = bagianMap.get(bagId);
    const brg = barangMap.get(brgId);
    if (!bag || !brg) continue;

    const saldoAwal = roundQty(acc.saldoAwal);
    const mutasiMasuk = roundQty(acc.mutasiMasuk);
    const mutasiKeluar = roundQty(acc.mutasiKeluar);
    const saldoAkhir = roundQty(saldoAwal + mutasiMasuk - mutasiKeluar);
    if (saldoAwal === 0 && mutasiMasuk === 0 && mutasiKeluar === 0 && saldoAkhir === 0) {
      continue;
    }

    const kat = katMap.get(brg.kategoriId);
    if (q) {
      const hay = `${brg.kodeBarang} ${brg.nama} ${bag.nama} ${kat?.nama || ''} ${kat?.kodeRekening || ''}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }

    const masukNilai = Math.round(acc.masukNilai);
    const keluarNilai = Math.round(acc.keluarNilai);
    const saldoAwalNilai = Math.round(
      saldoAwal <= 0
        ? 0
        : acc.saldoAwalNilai > 0
        ? acc.saldoAwalNilai
        : saldoAwal * acc.latestHarga
    );
    const rawAkhirNilai = saldoAwalNilai + masukNilai - keluarNilai;
    const saldoAkhirNilai = Math.round(
      saldoAkhir <= 0
        ? 0
        : rawAkhirNilai > 0
        ? rawAkhirNilai
        : saldoAkhir * acc.latestHarga
    );

    const hargaAwal = saldoAwal > 0 ? Math.round(saldoAwalNilai / saldoAwal) : 0;
    const hargaMasuk = mutasiMasuk > 0 ? Math.round(masukNilai / mutasiMasuk) : 0;
    const hargaKeluar = mutasiKeluar > 0 ? Math.round(keluarNilai / mutasiKeluar) : 0;
    const hargaAkhir = saldoAkhir > 0 ? Math.round(saldoAkhirNilai / saldoAkhir) : 0;

    rows.push({
      barangId: brg.id,
      kodeBarang: brg.kodeBarang,
      namaBarang: brg.nama,
      satuan: brg.satuan,
      kategoriId: brg.kategoriId,
      kategoriNama: kat?.nama || '-',
      kodeRekening: kat?.kodeRekening || '-',
      bagianId: bag.id,
      bagianNama: bag.nama,
      saldoAwal,
      hargaAwal,
      saldoAwalNilai,
      mutasiMasuk,
      hargaMasuk,
      masukNilai,
      mutasiKeluar,
      hargaKeluar,
      keluarNilai,
      saldoAkhir,
      hargaAkhir,
      saldoAkhirNilai,
      hargaSatuan: acc.latestHarga,
      totalNilai: saldoAkhirNilai,
      stokMinimum: brg.stokMinimum,
    });
  }

  return rows.sort(
    (a, b) =>
      a.kodeRekening.localeCompare(b.kodeRekening) ||
      a.bagianNama.localeCompare(b.bagianNama) ||
      a.namaBarang.localeCompare(b.namaBarang)
  );
}

export async function getDashboardSummary(
  currentUser: UserProfile,
  tahun: number,
  requestedBagianId?: string | null
): Promise<DashboardSummary> {
  const effectiveBagian = resolveEffectiveBagianFilter(currentUser, requestedBagianId);

  const [plafonItems, rekapRows, bagianList] = await Promise.all([
    listPlafonWithRealisasi(currentUser, tahun, effectiveBagian),
    getRekapPersediaan(currentUser, {
      tahun,
      bulanDari: 1,
      bulanSampai: 12,
      requestedBagianId: effectiveBagian,
    }),
    listBagian(),
  ]);

  const totalPagu = plafonItems.reduce((acc, p) => acc + p.paguAnggaran, 0);
  const totalRealisasi = plafonItems.reduce((acc, p) => acc + p.realisasi, 0);
  const sisaAnggaran = totalPagu - totalRealisasi;
  const persentaseSerapan =
    totalPagu > 0
      ? Math.round((totalRealisasi / totalPagu) * 1000) / 10
      : totalRealisasi > 0
      ? 100
      : 0;

  const uniqueBarang = new Set(rekapRows.map((r) => r.barangId));
  const totalStokUnit = roundQty(
    rekapRows.reduce((acc, r) => acc + Math.max(0, r.saldoAkhir), 0)
  );
  const totalNilaiPersediaan = Math.round(
    rekapRows.reduce((acc, r) => acc + r.totalNilai, 0)
  );

  const lowStockAlerts: LowStockAlert[] = rekapRows
    .filter((r) => r.stokMinimum > 0 && r.saldoAkhir <= r.stokMinimum)
    .map((r) => ({
      bagianId: r.bagianId,
      bagianNama: r.bagianNama,
      barangId: r.barangId,
      kodeBarang: r.kodeBarang,
      namaBarang: r.namaBarang,
      satuan: r.satuan,
      stokSaatIni: r.saldoAkhir,
      stokMinimum: r.stokMinimum,
    }))
    .sort((a, b) => a.stokSaatIni - b.stokSaatIni);

  const targetBagians =
    effectiveBagian !== 'ALL'
      ? bagianList.filter((b) => b.id === effectiveBagian)
      : bagianList;

  const stokPerBagian = targetBagians.map((b) => {
    const bagRows = rekapRows.filter((r) => r.bagianId === b.id && r.saldoAkhir > 0);
    return {
      bagianId: b.id,
      bagianKode: b.kode,
      bagianNama: b.nama,
      totalItem: bagRows.length,
      totalQty: roundQty(bagRows.reduce((a, r) => a + r.saldoAkhir, 0)),
      totalNilai: Math.round(bagRows.reduce((a, r) => a + r.totalNilai, 0)),
    };
  });

  return {
    tahun,
    totalPagu,
    totalRealisasi,
    sisaAnggaran,
    persentaseSerapan,
    statusAnggaran: computeAnggaranStatus(totalPagu, totalRealisasi),
    totalJenisBarang: uniqueBarang.size,
    totalStokUnit,
    totalNilaiPersediaan,
    plafonItems,
    lowStockAlerts,
    stokPerBagian,
  };
}
