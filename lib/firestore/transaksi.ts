import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type { JenisTransaksi, TransaksiPersediaan, UserProfile } from '@/lib/types';
import { listBagian, listBarang } from './master';
import {
  assertCanWriteBagianTransaksi,
  newFsId,
  resolveEffectiveBagianFilter,
} from './utils';

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
  plafonId?: string;
  keterangan?: string;
  refMutasiId?: string;
  tujuanBagianId?: string;
  createdBy: string;
  ownerId: string;
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

export async function assertPeriodNotLocked(
  bagianId: string,
  tahun: number,
  bulan: number
): Promise<void> {
  const candidateIds = [
    { id: `rek_${tahun}_${bulan}_${bagianId}`, label: `bulan ${bulan} tahun ${tahun}` },
    { id: `rek_sem_${tahun}_2_${bagianId}`, label: `Semester II (Jan - Des) tahun ${tahun}` },
    ...(bulan <= 6
      ? [{ id: `rek_sem_${tahun}_1_${bagianId}`, label: `Semester I (Jan - Jun) tahun ${tahun}` }]
      : []),
  ];

  try {
    const snaps = await Promise.all(
      candidateIds.map((c) => getDoc(doc(db, 'rekon_periode', c.id)))
    );
    for (let i = 0; i < snaps.length; i++) {
      const snap = snaps[i];
      if (snap.exists()) {
        const status = String(snap.data().status || 'Draft');
        if (status === 'Dikirim' || status === 'Disetujui') {
          throw new Error(
            `Periode ${candidateIds[i].label} untuk Bagian terkait sudah dikunci (${status}). Hubungi Pengurus Barang/Superadmin untuk membuka kunci.`
          );
        }
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('sudah dikunci')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.GET, `rekon_periode/${candidateIds[0].id}`);
  }
}

async function stageRecalculateIntoBatch(
  batch: WriteBatch,
  bagianId: string,
  barangId: string,
  ownerUid: string,
  mutations: {
    upserts?: Array<{ id: string; data: FsTrx }>;
    deleteIds?: string[];
  } = {}
): Promise<void> {
  const saldoId = `${bagianId}_${barangId}`;
  let trxSnap;
  let krtSnap;
  let saldoSnap;
  try {
    [trxSnap, krtSnap, saldoSnap] = await Promise.all([
      getDocs(query(collection(db, 'transaksi_persediaan'), where('bagianId', '==', bagianId))),
      getDocs(query(collection(db, 'kartu_persediaan'), where('bagianId', '==', bagianId))),
      getDoc(doc(db, 'stok_saldo', saldoId)),
    ]);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'transaksi_persediaan|kartu_persediaan|stok_saldo');
  }

  const trxMap = new Map<string, FsTrx>();
  trxSnap.forEach((d) => {
    const data = d.data() as FsTrx;
    if (data.barangId === barangId) {
      trxMap.set(d.id, data);
    }
  });

  for (const delId of mutations.deleteIds || []) {
    trxMap.delete(delId);
  }
  for (const ups of mutations.upserts || []) {
    trxMap.set(ups.id, ups.data);
  }

  const rows = Array.from(trxMap.entries())
    .map(([id, data]) => ({ id, data }))
    .sort(
      (a, b) =>
        a.data.tanggal.localeCompare(b.data.tanggal) ||
        (a.data.jenis === 'SALDO_AWAL' ? 0 : 1) - (b.data.jenis === 'SALDO_AWAL' ? 0 : 1) ||
        a.data.createdAt.localeCompare(b.data.createdAt) ||
        a.id.localeCompare(b.id)
    );

  const existingKrtIds = new Set<string>();
  krtSnap.forEach((d) => {
    const data = d.data() as { barangId?: string };
    if (data.barangId === barangId) {
      existingKrtIds.add(d.id);
    }
  });

  let runningBalance = 0;
  let lastPrice = 0;
  const activeKrtIds = new Set<string>();

  for (const row of rows) {
    const t = row.data;
    const inflow = isInflow(t.jenis);
    const qtyMasuk = inflow ? t.qty : 0;
    const qtyKeluar = inflow ? 0 : t.qty;
    runningBalance += qtyMasuk - qtyKeluar;

    if (runningBalance < -0.0001) {
      throw new Error(
        `Stok tidak mencukupi pada tanggal ${t.tanggal} (Bukti: ${t.noBukti}). Saldo akan menjadi negatif (${runningBalance}).`
      );
    }

    if (t.hargaSatuan > 0) {
      lastPrice = t.hargaSatuan;
    }

    const krtId = `krt_${row.id}`;
    activeKrtIds.add(krtId);

    const krtPayload: Record<string, unknown> = {
      transaksiId: row.id,
      tahun: t.tahun,
      bagianId: t.bagianId,
      barangId: t.barangId,
      tanggal: t.tanggal,
      noBukti: t.noBukti,
      jenis: t.jenis,
      keterangan: t.keterangan || '',
      qtyMasuk,
      qtyKeluar,
      sisaSaldo: Math.round(runningBalance * 100) / 100,
      hargaSatuan: t.hargaSatuan,
      nilaiMutasi: t.totalNilai,
      ownerId: t.ownerId || ownerUid,
      createdAt: t.createdAt,
      updatedAt: serverTimestamp(),
    };
    batch.set(doc(db, 'kartu_persediaan', krtId), krtPayload);
  }

  for (const oldKrtId of existingKrtIds) {
    if (!activeKrtIds.has(oldKrtId)) {
      batch.delete(doc(db, 'kartu_persediaan', oldKrtId));
    }
  }

  const existingSaldoOwner = saldoSnap.exists()
    ? (saldoSnap.data() as { ownerId?: string })?.ownerId
    : undefined;
  batch.set(doc(db, 'stok_saldo', saldoId), {
    bagianId,
    barangId,
    qty: Math.max(0, Math.round(runningBalance * 100) / 100),
    hargaTerakhir: lastPrice,
    ownerId: existingSaldoOwner || ownerUid,
    updatedAt: serverTimestamp(),
  });
}

export async function listTransaksi(
  currentUser: UserProfile,
  opts: {
    tahun: number;
    requestedBagianId?: string | null;
    jenisList: JenisTransaksi[];
  }
): Promise<TransaksiPersediaan[]> {
  const effectiveBagian = resolveEffectiveBagianFilter(currentUser, opts.requestedBagianId);
  const trxCol = collection(db, 'transaksi_persediaan');
  const rekCol = collection(db, 'rekon_periode');
  const plfCol = collection(db, 'plafon_anggaran');

  let trxSnap;
  let rekSnap;
  let plfSnap;
  let bagianList;
  let barangList;

  try {
    [trxSnap, rekSnap, plfSnap, bagianList, barangList] = await Promise.all([
      effectiveBagian !== 'ALL'
        ? getDocs(query(trxCol, where('bagianId', '==', effectiveBagian)))
        : getDocs(trxCol),
      effectiveBagian !== 'ALL'
        ? getDocs(query(rekCol, where('bagianId', '==', effectiveBagian)))
        : getDocs(rekCol),
      effectiveBagian !== 'ALL'
        ? getDocs(query(plfCol, where('bagianId', '==', effectiveBagian)))
        : getDocs(plfCol),
      listBagian(),
      listBarang(),
    ]);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'transaksi_persediaan');
  }

  const bagianMap = new Map(bagianList.map((b) => [b.id, b]));
  const barangMap = new Map(barangList.map((b) => [b.id, b]));
  const plafonMap = new Map<string, string>();
  plfSnap.forEach((d) => {
    const p = d.data() as { namaKegiatan?: string };
    plafonMap.set(d.id, p.namaKegiatan || '');
  });

  const lockedMonths = new Set<string>();
  rekSnap.forEach((d) => {
    const r = d.data() as { tahun?: number; bulan?: number; bagianId?: string; status?: string };
    if (r.tahun === opts.tahun && (r.status === 'Dikirim' || r.status === 'Disetujui')) {
      if (d.id.startsWith('rek_sem_')) {
        const maxBulan = Number(r.bulan) === 6 ? 6 : 12;
        for (let m = 1; m <= maxBulan; m++) {
          lockedMonths.add(`${r.bagianId}::${m}`);
        }
      } else {
        lockedMonths.add(`${r.bagianId}::${r.bulan}`);
      }
    }
  });

  const allowedJenis = new Set(opts.jenisList);
  const rows: TransaksiPersediaan[] = [];

  trxSnap.forEach((d) => {
    const t = d.data() as FsTrx;
    if (t.tahun !== opts.tahun || !allowedJenis.has(t.jenis)) return;
    const bag = bagianMap.get(t.bagianId);
    const brg = barangMap.get(t.barangId);
    const tujuan = t.tujuanBagianId ? bagianMap.get(t.tujuanBagianId) : undefined;

    rows.push({
      id: d.id,
      tahun: t.tahun,
      bulan: t.bulan,
      bagianId: t.bagianId,
      bagianKode: bag?.kode || '',
      bagianNama: bag?.nama || '',
      jenis: t.jenis,
      tanggal: t.tanggal,
      noBukti: t.noBukti,
      barangId: t.barangId,
      barangKode: brg?.kodeBarang || '',
      barangNama: brg?.nama || '-',
      satuan: brg?.satuan || '-',
      qty: t.qty,
      hargaSatuan: t.hargaSatuan,
      totalNilai: t.totalNilai,
      plafonId: t.plafonId || null,
      plafonKegiatan: t.plafonId ? plafonMap.get(t.plafonId) || null : null,
      keterangan: t.keterangan || '',
      refMutasiId: t.refMutasiId || null,
      tujuanBagianId: t.tujuanBagianId || null,
      tujuanBagianNama: tujuan?.nama || null,
      createdBy: t.createdBy,
      createdAt: t.createdAt,
      isLocked: lockedMonths.has(`${t.bagianId}::${t.bulan}`),
    });
  });

  return rows.sort(
    (a, b) => b.tanggal.localeCompare(a.tanggal) || b.createdAt.localeCompare(a.createdAt)
  );
}

export async function createTransaksiBatch(
  currentUser: UserProfile,
  ownerUid: string,
  input: {
    mode: 'SALDO_AWAL' | 'MASUK' | 'KELUAR' | 'OPNAME';
    bagianId: string;
    tanggal?: string;
    noBukti?: string;
    plafonId?: string | null;
    keterangan?: string;
    items: Array<{
      barangId: string;
      qty: number;
      hargaSatuan: number;
      jenisOpname?: 'OPNAME_MASUK' | 'OPNAME_KELUAR';
      tanggal?: string;
      noBukti?: string;
      plafonId?: string | null;
      keterangan?: string;
    }>;
  }
): Promise<number> {
  const effectiveBagian = assertCanWriteBagianTransaksi(currentUser, input.bagianId);
  if (!input.items.length) {
    throw new Error('Minimal 1 item barang harus dimasukkan.');
  }

  const nowIso = new Date().toISOString();
  const stagedByBarang = new Map<string, Array<{ id: string; data: FsTrx }>>();
  const periodsToCheck = new Map<string, { tahun: number; bulan: number }>();

  for (const item of input.items) {
    const itemTanggal = (item.tanggal ?? input.tanggal ?? '').trim().slice(0, 10);
    const itemNoBukti = (item.noBukti ?? input.noBukti ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(itemTanggal) || !itemNoBukti) {
      throw new Error('Tanggal dan Nomor Bukti (BAST/Nota) wajib diisi pada setiap baris.');
    }

    const tahun = Number(itemTanggal.slice(0, 4));
    const bulan = Number(itemTanggal.slice(5, 7));
    if (!(tahun >= 2000 && tahun <= 2100 && bulan >= 1 && bulan <= 12)) {
      throw new Error(`Tanggal transaksi "${itemTanggal}" tidak valid.`);
    }
    periodsToCheck.set(`${tahun}-${bulan}`, { tahun, bulan });

    const qty = Number(item.qty);
    const hargaSatuan = Math.max(0, Number(item.hargaSatuan) || 0);
    if (!item.barangId || !(qty > 0)) {
      throw new Error('Item barang dan kuantitas (> 0) harus valid.');
    }
    const jenis: JenisTransaksi =
      input.mode === 'SALDO_AWAL'
        ? 'SALDO_AWAL'
        : input.mode === 'MASUK'
        ? 'MASUK'
        : input.mode === 'KELUAR'
        ? 'KELUAR'
        : item.jenisOpname || 'OPNAME_KELUAR';

    const itemPlafonId =
      jenis === 'SALDO_AWAL'
        ? null
        : item.plafonId !== undefined
        ? item.plafonId
        : input.plafonId;
    const itemKeterangan = (
      item.keterangan !== undefined ? item.keterangan : input.keterangan || ''
    )
      .trim()
      .slice(0, 300);

    const trxId = newFsId('trx');
    const trxData: FsTrx = {
      tahun,
      bulan,
      bagianId: effectiveBagian,
      jenis,
      tanggal: itemTanggal,
      noBukti: itemNoBukti.slice(0, 100),
      barangId: item.barangId,
      qty,
      hargaSatuan,
      totalNilai: Math.round(qty * hargaSatuan),
      ...(itemPlafonId ? { plafonId: itemPlafonId } : {}),
      keterangan: itemKeterangan,
      createdBy: currentUser.namaLengkap.slice(0, 120),
      ownerId: ownerUid,
      createdAt: nowIso,
    };

    const list = stagedByBarang.get(item.barangId) || [];
    list.push({ id: trxId, data: trxData });
    stagedByBarang.set(item.barangId, list);
  }

  for (const period of periodsToCheck.values()) {
    await assertPeriodNotLocked(effectiveBagian, period.tahun, period.bulan);
  }

  const batch = writeBatch(db);
  for (const [barangId, staged] of stagedByBarang) {
    for (const s of staged) {
      batch.set(doc(db, 'transaksi_persediaan', s.id), {
        ...s.data,
        updatedAt: serverTimestamp(),
      });
    }
    await stageRecalculateIntoBatch(batch, effectiveBagian, barangId, ownerUid, {
      upserts: staged,
    });
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'transaksi_persediaan/batch');
  }
  return input.items.length;
}

export async function updateTransaksi(
  currentUser: UserProfile,
  ownerUid: string,
  input: {
    id: string;
    tanggal: string;
    noBukti: string;
    barangId: string;
    qty: number;
    hargaSatuan: number;
    plafonId?: string | null;
    keterangan?: string;
  }
): Promise<void> {
  const ref = doc(db, 'transaksi_persediaan', input.id);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `transaksi_persediaan/${input.id}`);
  }
  if (!snap.exists()) {
    throw new Error('Transaksi tidak ditemukan.');
  }

  const existing = snap.data() as FsTrx;
  assertCanWriteBagianTransaksi(currentUser, existing.bagianId);
  await assertPeriodNotLocked(existing.bagianId, existing.tahun, existing.bulan);

  const newTahun = Number(input.tanggal.slice(0, 4));
  const newBulan = Number(input.tanggal.slice(5, 7));
  await assertPeriodNotLocked(existing.bagianId, newTahun, newBulan);

  const qty = Number(input.qty);
  const hargaSatuan = Math.max(0, Number(input.hargaSatuan) || 0);
  if (!(qty > 0)) {
    throw new Error('Kuantitas harus lebih besar dari 0.');
  }

  const updatedDoc: FsTrx = {
    ...existing,
    tahun: newTahun,
    bulan: newBulan,
    tanggal: input.tanggal,
    noBukti: input.noBukti.trim().slice(0, 100),
    barangId: input.barangId,
    qty,
    hargaSatuan,
    totalNilai: Math.round(qty * hargaSatuan),
    keterangan: (input.keterangan || '').trim().slice(0, 300),
  };
  if (input.plafonId) {
    updatedDoc.plafonId = input.plafonId;
  } else {
    delete updatedDoc.plafonId;
  }

  const batch = writeBatch(db);
  batch.set(ref, { ...updatedDoc, updatedAt: serverTimestamp() });

  if (existing.barangId !== input.barangId) {
    await stageRecalculateIntoBatch(batch, existing.bagianId, existing.barangId, ownerUid, {
      deleteIds: [input.id],
    });
  }
  await stageRecalculateIntoBatch(batch, existing.bagianId, input.barangId, ownerUid, {
    upserts: [{ id: input.id, data: updatedDoc }],
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `transaksi_persediaan/${input.id}`);
  }
}

export async function deleteTransaksi(
  currentUser: UserProfile,
  ownerUid: string,
  id: string
): Promise<void> {
  const ref = doc(db, 'transaksi_persediaan', id);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `transaksi_persediaan/${id}`);
  }
  if (!snap.exists()) {
    throw new Error('Transaksi tidak ditemukan.');
  }
  const existing = snap.data() as FsTrx;
  if (existing.refMutasiId) {
    throw new Error('Transaksi mutasi antar bagian harus dibatalkan dari menu Mutasi Gudang.');
  }
  assertCanWriteBagianTransaksi(currentUser, existing.bagianId);
  await assertPeriodNotLocked(existing.bagianId, existing.tahun, existing.bulan);

  const batch = writeBatch(db);
  batch.delete(ref);
  await stageRecalculateIntoBatch(batch, existing.bagianId, existing.barangId, ownerUid, {
    deleteIds: [id],
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `transaksi_persediaan/${id}`);
  }
}

export async function listMutasi(
  currentUser: UserProfile,
  tahun: number,
  requestedBagianId?: string | null
): Promise<TransaksiPersediaan[]> {
  return listTransaksi(currentUser, {
    tahun,
    requestedBagianId,
    jenisList: ['MUTASI_KELUAR', 'MUTASI_MASUK'],
  });
}

export async function createMutasi(
  currentUser: UserProfile,
  ownerUid: string,
  input: {
    asalBagianId: string;
    tujuanBagianId: string;
    tanggal: string;
    noBukti: string;
    barangId: string;
    qty: number;
    hargaSatuan: number;
    keterangan?: string;
  }
): Promise<void> {
  if (currentUser.role !== 'Superadmin' && currentUser.role !== 'Admin Persediaan') {
    throw new Error('Hanya Superadmin dan Admin Persediaan yang dapat membuat Mutasi Antar Bagian.');
  }
  const effectiveAsal = assertCanWriteBagianTransaksi(currentUser, input.asalBagianId);
  if (!input.tujuanBagianId || input.tujuanBagianId === effectiveAsal) {
    throw new Error('Gudang Bagian tujuan tidak boleh sama dengan Bagian asal.');
  }
  const qty = Number(input.qty);
  const hargaSatuan = Math.max(0, Number(input.hargaSatuan) || 0);
  if (!input.tanggal || !input.noBukti.trim() || !input.barangId || !(qty > 0)) {
    throw new Error('Lengkapi seluruh field mutasi dengan benar.');
  }

  const tahun = Number(input.tanggal.slice(0, 4));
  const bulan = Number(input.tanggal.slice(5, 7));
  await Promise.all([
    assertPeriodNotLocked(effectiveAsal, tahun, bulan),
    assertPeriodNotLocked(input.tujuanBagianId, tahun, bulan),
  ]);

  const refMutasiId = newFsId('mut');
  const outId = `${refMutasiId}_out`;
  const inId = `${refMutasiId}_in`;
  const nowIso = new Date().toISOString();
  const totalNilai = Math.round(qty * hargaSatuan);
  const cleanBukti = input.noBukti.trim().slice(0, 100);
  const cleanKet = (input.keterangan || '').trim().slice(0, 300);

  const outData: FsTrx = {
    tahun,
    bulan,
    bagianId: effectiveAsal,
    jenis: 'MUTASI_KELUAR',
    tanggal: input.tanggal,
    noBukti: cleanBukti,
    barangId: input.barangId,
    qty,
    hargaSatuan,
    totalNilai,
    keterangan: cleanKet || 'Mutasi keluar ke bagian tujuan',
    refMutasiId,
    tujuanBagianId: input.tujuanBagianId,
    createdBy: currentUser.namaLengkap.slice(0, 120),
    ownerId: ownerUid,
    createdAt: nowIso,
  };

  const inData: FsTrx = {
    tahun,
    bulan,
    bagianId: input.tujuanBagianId,
    jenis: 'MUTASI_MASUK',
    tanggal: input.tanggal,
    noBukti: cleanBukti,
    barangId: input.barangId,
    qty,
    hargaSatuan,
    totalNilai,
    keterangan: cleanKet || 'Mutasi masuk dari bagian asal',
    refMutasiId,
    tujuanBagianId: effectiveAsal,
    createdBy: currentUser.namaLengkap.slice(0, 120),
    ownerId: ownerUid,
    createdAt: nowIso,
  };

  const batch = writeBatch(db);
  batch.set(doc(db, 'transaksi_persediaan', outId), { ...outData, updatedAt: serverTimestamp() });
  batch.set(doc(db, 'transaksi_persediaan', inId), { ...inData, updatedAt: serverTimestamp() });

  if (currentUser.role === 'Superadmin') {
    await Promise.all([
      stageRecalculateIntoBatch(batch, effectiveAsal, input.barangId, ownerUid, {
        upserts: [{ id: outId, data: outData }],
      }),
      stageRecalculateIntoBatch(batch, input.tujuanBagianId, input.barangId, ownerUid, {
        upserts: [{ id: inId, data: inData }],
      }),
    ]);
  } else {
    const destSaldoRef = doc(db, 'stok_saldo', `${input.tujuanBagianId}_${input.barangId}`);
    let destSaldoSnap;
    try {
      destSaldoSnap = await getDoc(destSaldoRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `stok_saldo/${input.tujuanBagianId}_${input.barangId}`);
    }
    const curDestQty = destSaldoSnap.exists() ? Number(destSaldoSnap.data()?.qty || 0) : 0;
    const curDestHarga = destSaldoSnap.exists() ? Number(destSaldoSnap.data()?.hargaTerakhir || 0) : 0;
    const destOwner = destSaldoSnap.exists()
      ? (destSaldoSnap.data() as { ownerId?: string })?.ownerId
      : undefined;
    const nextDestQty = Math.round((curDestQty + qty) * 100) / 100;

    await stageRecalculateIntoBatch(batch, effectiveAsal, input.barangId, ownerUid, {
      upserts: [{ id: outId, data: outData }],
    });

    batch.set(doc(db, 'kartu_persediaan', `krt_${inId}`), {
      transaksiId: inId,
      tahun: inData.tahun,
      bagianId: inData.bagianId,
      barangId: inData.barangId,
      tanggal: inData.tanggal,
      noBukti: inData.noBukti,
      jenis: inData.jenis,
      keterangan: inData.keterangan || '',
      qtyMasuk: qty,
      qtyKeluar: 0,
      sisaSaldo: nextDestQty,
      hargaSatuan,
      nilaiMutasi: totalNilai,
      ownerId: ownerUid,
      createdAt: nowIso,
      updatedAt: serverTimestamp(),
    });
    batch.set(destSaldoRef, {
      bagianId: input.tujuanBagianId,
      barangId: input.barangId,
      qty: nextDestQty,
      hargaTerakhir: hargaSatuan > 0 ? hargaSatuan : curDestHarga,
      ownerId: destOwner || ownerUid,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'transaksi_persediaan/mutasi');
  }
}

export async function updateMutasi(
  currentUser: UserProfile,
  ownerUid: string,
  input: {
    refMutasiId: string;
    tujuanBagianId: string;
    tanggal: string;
    noBukti: string;
    barangId: string;
    qty: number;
    hargaSatuan: number;
    keterangan?: string;
  }
): Promise<void> {
  if (currentUser.role !== 'Superadmin' && currentUser.role !== 'Admin Persediaan') {
    throw new Error('Hanya Superadmin dan Admin Persediaan yang dapat mengubah Mutasi Antar Bagian.');
  }

  const outId = `${input.refMutasiId}_out`;
  const inId = `${input.refMutasiId}_in`;

  let outSnap;
  let inSnap;
  try {
    [outSnap, inSnap] = await Promise.all([
      getDoc(doc(db, 'transaksi_persediaan', outId)),
      getDoc(doc(db, 'transaksi_persediaan', inId)),
    ]);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `transaksi_persediaan/${outId}`);
  }

  if (!outSnap.exists() || !inSnap.exists()) {
    throw new Error('Dokumen mutasi tidak ditemukan.');
  }

  const existingOut = outSnap.data() as FsTrx;
  const existingIn = inSnap.data() as FsTrx;

  const effectiveAsal = assertCanWriteBagianTransaksi(currentUser, existingOut.bagianId);
  if (!input.tujuanBagianId || input.tujuanBagianId === effectiveAsal) {
    throw new Error('Gudang Bagian tujuan tidak boleh sama dengan Bagian asal.');
  }

  const qty = Number(input.qty);
  const hargaSatuan = Math.max(0, Number(input.hargaSatuan) || 0);
  if (!input.tanggal || !input.noBukti.trim() || !input.barangId || !(qty > 0)) {
    throw new Error('Lengkapi seluruh field mutasi dengan benar.');
  }

  const newTahun = Number(input.tanggal.slice(0, 4));
  const newBulan = Number(input.tanggal.slice(5, 7));

  await Promise.all([
    assertPeriodNotLocked(existingOut.bagianId, existingOut.tahun, existingOut.bulan),
    assertPeriodNotLocked(existingIn.bagianId, existingIn.tahun, existingIn.bulan),
    assertPeriodNotLocked(effectiveAsal, newTahun, newBulan),
    assertPeriodNotLocked(input.tujuanBagianId, newTahun, newBulan),
  ]);

  if (input.tujuanBagianId !== existingIn.bagianId) {
    await deleteMutasi(currentUser, ownerUid, input.refMutasiId);
    await createMutasi(currentUser, ownerUid, {
      asalBagianId: effectiveAsal,
      tujuanBagianId: input.tujuanBagianId,
      tanggal: input.tanggal,
      noBukti: input.noBukti,
      barangId: input.barangId,
      qty,
      hargaSatuan,
      keterangan: input.keterangan,
    });
    return;
  }

  const totalNilai = Math.round(qty * hargaSatuan);
  const cleanBukti = input.noBukti.trim().slice(0, 100);
  const cleanKet = (input.keterangan || '').trim().slice(0, 300);

  const updatedOut: FsTrx = {
    ...existingOut,
    tahun: newTahun,
    bulan: newBulan,
    tanggal: input.tanggal,
    noBukti: cleanBukti,
    barangId: input.barangId,
    qty,
    hargaSatuan,
    totalNilai,
    keterangan: cleanKet || 'Mutasi keluar ke bagian tujuan',
    tujuanBagianId: input.tujuanBagianId,
  };

  const updatedIn: FsTrx = {
    ...existingIn,
    tahun: newTahun,
    bulan: newBulan,
    tanggal: input.tanggal,
    noBukti: cleanBukti,
    barangId: input.barangId,
    qty,
    hargaSatuan,
    totalNilai,
    keterangan: cleanKet || 'Mutasi masuk dari bagian asal',
    tujuanBagianId: effectiveAsal,
  };

  const batch = writeBatch(db);
  batch.set(doc(db, 'transaksi_persediaan', outId), {
    ...updatedOut,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'transaksi_persediaan', inId), {
    ...updatedIn,
    updatedAt: serverTimestamp(),
  });

  if (existingOut.barangId !== input.barangId) {
    await stageRecalculateIntoBatch(batch, effectiveAsal, existingOut.barangId, ownerUid, {
      deleteIds: [outId],
    });
  }
  await stageRecalculateIntoBatch(batch, effectiveAsal, input.barangId, ownerUid, {
    upserts: [{ id: outId, data: updatedOut }],
  });

  if (currentUser.role === 'Superadmin') {
    if (existingIn.barangId !== input.barangId) {
      await stageRecalculateIntoBatch(batch, existingIn.bagianId, existingIn.barangId, ownerUid, {
        deleteIds: [inId],
      });
    }
    await stageRecalculateIntoBatch(batch, input.tujuanBagianId, input.barangId, ownerUid, {
      upserts: [{ id: inId, data: updatedIn }],
    });
  } else {
    const krtInRef = doc(db, 'kartu_persediaan', `krt_${inId}`);
    if (existingIn.barangId === input.barangId) {
      const destSaldoRef = doc(db, 'stok_saldo', `${input.tujuanBagianId}_${input.barangId}`);
      let destSaldoSnap;
      let krtInSnap;
      try {
        [destSaldoSnap, krtInSnap] = await Promise.all([
          getDoc(destSaldoRef),
          getDoc(krtInRef),
        ]);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `stok_saldo/${input.tujuanBagianId}_${input.barangId}`);
      }
      const curDestQty = destSaldoSnap.exists() ? Number(destSaldoSnap.data()?.qty || 0) : 0;
      const curDestHarga = destSaldoSnap.exists() ? Number(destSaldoSnap.data()?.hargaTerakhir || 0) : 0;
      const destOwner = destSaldoSnap.exists()
        ? (destSaldoSnap.data() as { ownerId?: string })?.ownerId
        : undefined;
      const delta = qty - existingIn.qty;
      const nextDestQty = Math.round((curDestQty + delta) * 100) / 100;
      if (nextDestQty < -0.0001) {
        throw new Error(
          `Stok di Gudang Tujuan sudah terpakai (sisa ${curDestQty}), sehingga jumlah mutasi tidak dapat dikurangi menjadi ${qty}.`
        );
      }
      const prevKrtSisa = krtInSnap.exists() ? Number(krtInSnap.data()?.sisaSaldo || 0) : nextDestQty;
      const nextKrtSisa = krtInSnap.exists()
        ? Math.max(0, Math.round((prevKrtSisa + delta) * 100) / 100)
        : Math.max(0, nextDestQty);
      const krtOwner = krtInSnap.exists()
        ? (krtInSnap.data() as { ownerId?: string })?.ownerId
        : undefined;

      batch.set(krtInRef, {
        transaksiId: inId,
        tahun: updatedIn.tahun,
        bagianId: updatedIn.bagianId,
        barangId: updatedIn.barangId,
        tanggal: updatedIn.tanggal,
        noBukti: updatedIn.noBukti,
        jenis: updatedIn.jenis,
        keterangan: updatedIn.keterangan || '',
        qtyMasuk: qty,
        qtyKeluar: 0,
        sisaSaldo: nextKrtSisa,
        hargaSatuan,
        nilaiMutasi: totalNilai,
        ownerId: krtOwner || updatedIn.ownerId || ownerUid,
        createdAt: updatedIn.createdAt,
        updatedAt: serverTimestamp(),
      });
      batch.set(destSaldoRef, {
        bagianId: input.tujuanBagianId,
        barangId: input.barangId,
        qty: Math.max(0, nextDestQty),
        hargaTerakhir: hargaSatuan > 0 ? hargaSatuan : curDestHarga,
        ownerId: destOwner || ownerUid,
        updatedAt: serverTimestamp(),
      });
    } else {
      const oldDestSaldoRef = doc(db, 'stok_saldo', `${existingIn.bagianId}_${existingIn.barangId}`);
      const newDestSaldoRef = doc(db, 'stok_saldo', `${input.tujuanBagianId}_${input.barangId}`);
      let oldDestSaldoSnap;
      let newDestSaldoSnap;
      let krtInSnap;
      try {
        [oldDestSaldoSnap, newDestSaldoSnap, krtInSnap] = await Promise.all([
          getDoc(oldDestSaldoRef),
          getDoc(newDestSaldoRef),
          getDoc(krtInRef),
        ]);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `stok_saldo/${existingIn.bagianId}_${existingIn.barangId}`);
      }
      const oldDestQty = oldDestSaldoSnap.exists() ? Number(oldDestSaldoSnap.data()?.qty || 0) : 0;
      const oldDestHarga = oldDestSaldoSnap.exists() ? Number(oldDestSaldoSnap.data()?.hargaTerakhir || 0) : 0;
      const oldDestOwner = oldDestSaldoSnap.exists()
        ? (oldDestSaldoSnap.data() as { ownerId?: string })?.ownerId
        : undefined;
      const reducedOldQty = Math.round((oldDestQty - existingIn.qty) * 100) / 100;
      if (reducedOldQty < -0.0001) {
        throw new Error(
          `Stok barang lama di Gudang Tujuan sudah terpakai (sisa ${oldDestQty}), sehingga barang mutasi tidak dapat diganti.`
        );
      }

      const newDestQty = newDestSaldoSnap.exists() ? Number(newDestSaldoSnap.data()?.qty || 0) : 0;
      const newDestHarga = newDestSaldoSnap.exists() ? Number(newDestSaldoSnap.data()?.hargaTerakhir || 0) : 0;
      const newDestOwner = newDestSaldoSnap.exists()
        ? (newDestSaldoSnap.data() as { ownerId?: string })?.ownerId
        : undefined;
      const addedNewQty = Math.round((newDestQty + qty) * 100) / 100;
      const krtOwner = krtInSnap.exists()
        ? (krtInSnap.data() as { ownerId?: string })?.ownerId
        : undefined;

      batch.set(oldDestSaldoRef, {
        bagianId: existingIn.bagianId,
        barangId: existingIn.barangId,
        qty: Math.max(0, reducedOldQty),
        hargaTerakhir: oldDestHarga,
        ownerId: oldDestOwner || ownerUid,
        updatedAt: serverTimestamp(),
      });
      batch.set(newDestSaldoRef, {
        bagianId: input.tujuanBagianId,
        barangId: input.barangId,
        qty: addedNewQty,
        hargaTerakhir: hargaSatuan > 0 ? hargaSatuan : newDestHarga,
        ownerId: newDestOwner || ownerUid,
        updatedAt: serverTimestamp(),
      });
      batch.set(krtInRef, {
        transaksiId: inId,
        tahun: updatedIn.tahun,
        bagianId: updatedIn.bagianId,
        barangId: updatedIn.barangId,
        tanggal: updatedIn.tanggal,
        noBukti: updatedIn.noBukti,
        jenis: updatedIn.jenis,
        keterangan: updatedIn.keterangan || '',
        qtyMasuk: qty,
        qtyKeluar: 0,
        sisaSaldo: addedNewQty,
        hargaSatuan,
        nilaiMutasi: totalNilai,
        ownerId: krtOwner || updatedIn.ownerId || ownerUid,
        createdAt: updatedIn.createdAt,
        updatedAt: serverTimestamp(),
      });
    }
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `mutasi/${input.refMutasiId}`);
  }
}

export async function deleteMutasi(
  currentUser: UserProfile,
  ownerUid: string,
  refMutasiId: string
): Promise<void> {
  if (currentUser.role !== 'Superadmin' && currentUser.role !== 'Admin Persediaan') {
    throw new Error('Hanya Superadmin dan Admin Persediaan yang dapat membatalkan Mutasi Antar Bagian.');
  }
  const outId = `${refMutasiId}_out`;
  const inId = `${refMutasiId}_in`;

  let outSnap;
  let inSnap;
  try {
    [outSnap, inSnap] = await Promise.all([
      getDoc(doc(db, 'transaksi_persediaan', outId)),
      getDoc(doc(db, 'transaksi_persediaan', inId)),
    ]);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `transaksi_persediaan/${outId}`);
  }

  let pairs: Array<{ id: string; data: FsTrx }> = [];
  if (outSnap.exists() || inSnap.exists()) {
    if (outSnap.exists()) pairs.push({ id: outSnap.id, data: outSnap.data() as FsTrx });
    if (inSnap.exists()) pairs.push({ id: inSnap.id, data: inSnap.data() as FsTrx });
  } else if (currentUser.role === 'Superadmin') {
    const snap = await getDocs(
      query(collection(db, 'transaksi_persediaan'), where('refMutasiId', '==', refMutasiId))
    );
    pairs = snap.docs.map((d) => ({ id: d.id, data: d.data() as FsTrx }));
  }

  if (pairs.length === 0) {
    throw new Error('Dokumen mutasi tidak ditemukan.');
  }

  const outRow = pairs.find((p) => p.data.jenis === 'MUTASI_KELUAR') || pairs[0];
  assertCanWriteBagianTransaksi(currentUser, outRow.data.bagianId);

  for (const p of pairs) {
    await assertPeriodNotLocked(p.data.bagianId, p.data.tahun, p.data.bulan);
  }

  const batch = writeBatch(db);
  for (const p of pairs) {
    batch.delete(doc(db, 'transaksi_persediaan', p.id));
    if (currentUser.role === 'Superadmin' || p.data.bagianId === outRow.data.bagianId) {
      await stageRecalculateIntoBatch(batch, p.data.bagianId, p.data.barangId, ownerUid, {
        deleteIds: [p.id],
      });
    } else {
      const destSaldoRef = doc(db, 'stok_saldo', `${p.data.bagianId}_${p.data.barangId}`);
      let destSaldoSnap;
      try {
        destSaldoSnap = await getDoc(destSaldoRef);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `stok_saldo/${p.data.bagianId}_${p.data.barangId}`);
      }
      const curDestQty = destSaldoSnap.exists() ? Number(destSaldoSnap.data()?.qty || 0) : 0;
      const curDestHarga = destSaldoSnap.exists() ? Number(destSaldoSnap.data()?.hargaTerakhir || 0) : 0;
      const destOwner = destSaldoSnap.exists()
        ? (destSaldoSnap.data() as { ownerId?: string })?.ownerId
        : undefined;
      const nextDestQty = Math.round((curDestQty - p.data.qty) * 100) / 100;
      if (nextDestQty < -0.0001) {
        throw new Error(
          `Stok di Gudang Tujuan sudah terpakai sebagian (sisa ${curDestQty}), sehingga mutasi tidak dapat dibatalkan.`
        );
      }
      if (destSaldoSnap.exists()) {
        batch.set(destSaldoRef, {
          bagianId: p.data.bagianId,
          barangId: p.data.barangId,
          qty: Math.max(0, nextDestQty),
          hargaTerakhir: curDestHarga,
          ownerId: destOwner || ownerUid,
          updatedAt: serverTimestamp(),
        });
      }
      batch.delete(doc(db, 'kartu_persediaan', `krt_${p.id}`));
    }
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `mutasi/${refMutasiId}`);
  }
}
