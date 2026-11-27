import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import { NAMA_BULAN } from '@/lib/format';
import type { PlafonAnggaran, RekonPeriodeRow, UserProfile } from '@/lib/types';
import { listBagian } from './master';
import {
  assertCanWriteBagianPlafon,
  isCentralRole,
  newFsId,
  resolveEffectiveBagianFilter,
  tsToIso,
} from './utils';

export function computeAnggaranStatus(
  pagu: number,
  realisasi: number
): 'Aman' | 'Peringatan' | 'Melebihi Pagu' {
  if (realisasi > pagu) return 'Melebihi Pagu';
  if (pagu > 0 && realisasi / pagu >= 0.8) return 'Peringatan';
  return 'Aman';
}

export async function listPlafonWithRealisasi(
  currentUser: UserProfile,
  tahun: number,
  requestedBagianId?: string | null
): Promise<PlafonAnggaran[]> {
  const effectiveBagian = resolveEffectiveBagianFilter(currentUser, requestedBagianId);
  const plfCol = collection(db, 'plafon_anggaran');
  const trxCol = collection(db, 'transaksi_persediaan');

  let plfSnap;
  let trxSnap;
  let bagianList;

  try {
    [plfSnap, trxSnap, bagianList] = await Promise.all([
      effectiveBagian !== 'ALL'
        ? getDocs(query(plfCol, where('bagianId', '==', effectiveBagian)))
        : getDocs(plfCol),
      effectiveBagian !== 'ALL'
        ? getDocs(query(trxCol, where('bagianId', '==', effectiveBagian)))
        : getDocs(trxCol),
      listBagian(),
    ]);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'plafon_anggaran');
  }

  const bagianMap = new Map(bagianList.map((b) => [b.id, b]));
  const realisasiMap = new Map<string, number>();

  trxSnap.forEach((d) => {
    const t = d.data() as Record<string, unknown>;
    if (Number(t.tahun) === tahun && t.jenis === 'MASUK' && typeof t.plafonId === 'string') {
      const prev = realisasiMap.get(t.plafonId) || 0;
      realisasiMap.set(t.plafonId, prev + Number(t.totalNilai || 0));
    }
  });

  const rows: PlafonAnggaran[] = [];
  plfSnap.forEach((d) => {
    const p = d.data() as Record<string, unknown>;
    if (Number(p.tahun) !== tahun) return;

    const bagId = String(p.bagianId || '');
    const bag = bagianMap.get(bagId);
    const paguAnggaran = Number(p.paguAnggaran || 0);
    const realisasi = realisasiMap.get(d.id) || 0;
    const sisaPagu = paguAnggaran - realisasi;
    const persentase =
      paguAnggaran > 0
        ? Math.round((realisasi / paguAnggaran) * 1000) / 10
        : realisasi > 0
        ? 100
        : 0;

    rows.push({
      id: d.id,
      tahun: Number(p.tahun),
      bagianId: bagId,
      bagianKode: bag?.kode || '',
      bagianNama: bag?.nama || '',
      kodeRekening: String(p.kodeRekening || ''),
      namaKegiatan: String(p.namaKegiatan || ''),
      paguAnggaran,
      realisasi,
      sisaPagu,
      persentase,
      statusAnggaran: computeAnggaranStatus(paguAnggaran, realisasi),
      updatedAt: tsToIso(p.updatedAt),
    });
  });

  return rows.sort(
    (a, b) =>
      (a.bagianNama || '').localeCompare(b.bagianNama || '') ||
      a.kodeRekening.localeCompare(b.kodeRekening)
  );
}

export async function savePlafon(
  currentUser: UserProfile,
  ownerUid: string,
  input: {
    id?: string;
    tahun: number;
    bagianId: string;
    kodeRekening: string;
    namaKegiatan: string;
    paguAnggaran: number;
  }
): Promise<void> {
  const effectiveBagian = assertCanWriteBagianPlafon(currentUser, input.bagianId);
  const tahun = Number(input.tahun);
  const kodeRekening = input.kodeRekening.trim().slice(0, 50);
  const namaKegiatan = input.namaKegiatan.trim().slice(0, 200);
  const rawPagu = Number(input.paguAnggaran);
  if (!Number.isFinite(rawPagu) || rawPagu < 0) {
    throw new Error('Pagu anggaran harus berupa angka valid >= 0.');
  }
  const paguAnggaran = Math.round(rawPagu);

  if (!tahun || !kodeRekening || !namaKegiatan) {
    throw new Error('Tahun, Bagian, Kode Rekening, dan Nama Kegiatan wajib diisi.');
  }

  if (input.id) {
    const ref = doc(db, 'plafon_anggaran', input.id);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        throw new Error('Plafon anggaran tidak ditemukan.');
      }
      assertCanWriteBagianPlafon(currentUser, String(snap.data().bagianId || ''));
      await updateDoc(ref, {
        tahun,
        bagianId: effectiveBagian,
        kodeRekening,
        namaKegiatan,
        paguAnggaran,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      if (err instanceof Error && (err.message.includes('Akses ditolak') || err.message.includes('tidak ditemukan'))) {
        throw err;
      }
      handleFirestoreError(err, OperationType.UPDATE, `plafon_anggaran/${input.id}`);
    }
    return;
  }

  const id = newFsId('plf');
  try {
    await setDoc(doc(db, 'plafon_anggaran', id), {
      tahun,
      bagianId: effectiveBagian,
      kodeRekening,
      namaKegiatan,
      paguAnggaran,
      ownerId: ownerUid,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `plafon_anggaran/${id}`);
  }
}

export async function deletePlafon(currentUser: UserProfile, id: string): Promise<void> {
  const ref = doc(db, 'plafon_anggaran', id);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `plafon_anggaran/${id}`);
  }
  if (!snap.exists()) {
    throw new Error('Plafon anggaran tidak ditemukan.');
  }
  const bagId = String(snap.data().bagianId || '');
  assertCanWriteBagianPlafon(currentUser, bagId);

  try {
    const trxSnap = await getDocs(
      query(collection(db, 'transaksi_persediaan'), where('bagianId', '==', bagId))
    );
    const hasLinked = trxSnap.docs.some((d) => d.data().plafonId === id);
    if (hasLinked) {
      throw new Error('Pos pagu anggaran tidak dapat dihapus karena sudah terhubung ke transaksi barang masuk.');
    }
    await deleteDoc(ref);
  } catch (err) {
    if (err instanceof Error && err.message.includes('tidak dapat dihapus')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.DELETE, `plafon_anggaran/${id}`);
  }
}

export async function listRekon(
  currentUser: UserProfile,
  tahun: number,
  requestedBagianId?: string | null,
  mode: 'bulanan' | 'semester' = 'bulanan'
): Promise<RekonPeriodeRow[]> {
  const effectiveBagian = resolveEffectiveBagianFilter(currentUser, requestedBagianId);
  const rekCol = collection(db, 'rekon_periode');
  const trxCol = collection(db, 'transaksi_persediaan');

  let rekSnap;
  let trxSnap;
  let bagianList;
  try {
    [rekSnap, trxSnap, bagianList] = await Promise.all([
      effectiveBagian !== 'ALL'
        ? getDocs(query(rekCol, where('bagianId', '==', effectiveBagian)))
        : getDocs(rekCol),
      effectiveBagian !== 'ALL'
        ? getDocs(query(trxCol, where('bagianId', '==', effectiveBagian)))
        : getDocs(trxCol),
      listBagian(),
    ]);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'rekon_periode');
  }

  const targetBagianList =
    effectiveBagian !== 'ALL'
      ? bagianList.filter((b) => b.id === effectiveBagian)
      : bagianList;

  const trxRealisasiMap = new Map<string, number>();
  trxSnap.forEach((d) => {
    const t = d.data() as Record<string, unknown>;
    if (Number(t.tahun) === tahun && t.jenis === 'MASUK') {
      const key = `${t.bagianId}::${Number(t.bulan)}`;
      trxRealisasiMap.set(key, (trxRealisasiMap.get(key) || 0) + Number(t.totalNilai || 0));
    }
  });

  const monthlyRekonMap = new Map<string, Record<string, unknown> & { id: string }>();
  const semesterRekonMap = new Map<string, Record<string, unknown> & { id: string }>();
  rekSnap.forEach((d) => {
    const r = d.data() as Record<string, unknown>;
    if (Number(r.tahun) !== tahun) return;
    if (d.id.startsWith('rek_sem_')) {
      const semNum = d.id.startsWith(`rek_sem_${tahun}_2_`) || Number(r.bulan) === 12 ? 2 : 1;
      semesterRekonMap.set(`${r.bagianId}::${semNum}`, { ...r, id: d.id });
    } else {
      const key = `${r.bagianId}::${Number(r.bulan)}`;
      monthlyRekonMap.set(key, { ...r, id: d.id });
    }
  });

  const rows: RekonPeriodeRow[] = [];

  if (mode === 'semester') {
    for (const bag of targetBagianList) {
      let realisasiSem1 = 0;
      let realisasiSem2 = 0;
      for (let m = 1; m <= 12; m++) {
        const val = trxRealisasiMap.get(`${bag.id}::${m}`) || 0;
        if (m <= 6) realisasiSem1 += val;
        realisasiSem2 += val;
      }

      const defs: Array<{
        sem: 1 | 2;
        bulan: number;
        title: string;
        periodeLabel: string;
        realisasi: number;
      }> = [
        {
          sem: 1,
          bulan: 6,
          title: 'Semester I (Jan - Jun)',
          periodeLabel: 'Transaksi Januari - Juni',
          realisasi: realisasiSem1,
        },
        {
          sem: 2,
          bulan: 12,
          title: 'Semester II (Jan - Des)',
          periodeLabel: 'Transaksi Januari - Desember',
          realisasi: realisasiSem2,
        },
      ];

      for (const def of defs) {
        const existing = semesterRekonMap.get(`${bag.id}::${def.sem}`);
        const nilaiFungsional = existing ? Number(existing.nilaiFungsional || 0) : 0;
        const selisih = def.realisasi - nilaiFungsional;
        const status = (existing?.status as 'Draft' | 'Dikirim' | 'Disetujui') || 'Draft';

        rows.push({
          id: existing?.id || `rek_sem_${tahun}_${def.sem}_${bag.id}`,
          tahun,
          bulan: def.bulan,
          namaBulan: def.title,
          periodeTipe: 'SEMESTER',
          semester: def.sem,
          periodeLabel: def.periodeLabel,
          bagianId: bag.id,
          bagianNama: bag.nama,
          bagianKode: bag.kode,
          realisasiPersediaan: def.realisasi,
          nilaiFungsional,
          selisih,
          statusCocok: Math.abs(selisih) < 1 ? 'Cocok' : 'Selisih',
          status,
          catatan: String(existing?.catatan || ''),
          submittedBy: existing?.submittedBy ? String(existing.submittedBy) : null,
          submittedAt: existing?.submittedAt ? String(existing.submittedAt) : null,
          approvedBy: existing?.approvedBy ? String(existing.approvedBy) : null,
          approvedAt: existing?.approvedAt ? String(existing.approvedAt) : null,
        });
      }
    }
    return rows;
  }

  for (const bag of targetBagianList) {
    for (let bulan = 1; bulan <= 12; bulan++) {
      const key = `${bag.id}::${bulan}`;
      const existing = monthlyRekonMap.get(key);
      const realisasiPersediaan = trxRealisasiMap.get(key) || 0;
      const nilaiFungsional = existing ? Number(existing.nilaiFungsional || 0) : 0;
      const selisih = realisasiPersediaan - nilaiFungsional;
      const status = (existing?.status as 'Draft' | 'Dikirim' | 'Disetujui') || 'Draft';

      rows.push({
        id: existing?.id || `rek_${tahun}_${bulan}_${bag.id}`,
        tahun,
        bulan,
        namaBulan: NAMA_BULAN[bulan - 1],
        periodeTipe: 'BULANAN',
        bagianId: bag.id,
        bagianNama: bag.nama,
        bagianKode: bag.kode,
        realisasiPersediaan,
        nilaiFungsional,
        selisih,
        statusCocok: Math.abs(selisih) < 1 ? 'Cocok' : 'Selisih',
        status,
        catatan: String(existing?.catatan || ''),
        submittedBy: existing?.submittedBy ? String(existing.submittedBy) : null,
        submittedAt: existing?.submittedAt ? String(existing.submittedAt) : null,
        approvedBy: existing?.approvedBy ? String(existing.approvedBy) : null,
        approvedAt: existing?.approvedAt ? String(existing.approvedAt) : null,
      });
    }
  }

  return rows;
}

export async function executeRekonAction(
  currentUser: UserProfile,
  ownerUid: string,
  input: {
    tahun: number;
    bulan: number;
    bagianId: string;
    mode?: 'bulanan' | 'semester';
    semester?: 1 | 2;
    action: 'save_fungsional' | 'submit' | 'approve' | 'unlock';
    nilaiFungsional?: number;
    catatan?: string;
  }
): Promise<void> {
  const effectiveBagian = assertCanWriteBagianPlafon(currentUser, input.bagianId);
  const tahun = Number(input.tahun);
  const isSemester = input.mode === 'semester';
  const sem = input.semester === 2 ? 2 : 1;
  const bulan = isSemester ? (sem === 1 ? 6 : 12) : Number(input.bulan);
  if (!tahun || bulan < 1 || bulan > 12) {
    throw new Error('Tahun atau bulan periode tidak valid.');
  }

  if ((input.action === 'approve' || input.action === 'unlock') && !isCentralRole(currentUser.role)) {
    throw new Error('Hanya Superadmin atau Pengurus Barang yang dapat menyetujui atau membuka kunci periode.');
  }

  const rekonId = isSemester
    ? `rek_sem_${tahun}_${sem}_${effectiveBagian}`
    : `rek_${tahun}_${bulan}_${effectiveBagian}`;
  const ref = doc(db, 'rekon_periode', rekonId);
  const nowIso = new Date().toISOString();

  let snap;
  try {
    snap = await getDoc(ref);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `rekon_periode/${rekonId}`);
  }

  const existing = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
  const currentStatus = (existing?.status as string) || 'Draft';

  if ((input.action === 'save_fungsional' || input.action === 'submit') && currentStatus !== 'Draft') {
    throw new Error(`Periode berstatus "${currentStatus}" dan sudah terkunci.`);
  }

  let nilaiFungsional = Number(existing?.nilaiFungsional || 0);
  if (input.nilaiFungsional !== undefined) {
    const rawFungsional = Number(input.nilaiFungsional);
    if (!Number.isFinite(rawFungsional) || rawFungsional < 0) {
      throw new Error('Nilai belanja fungsional harus berupa angka valid >= 0.');
    }
    nilaiFungsional = Math.round(rawFungsional);
  }
  const catatan =
    input.catatan !== undefined
      ? input.catatan.trim().slice(0, 500)
      : String(existing?.catatan || '');

  let nextStatus = currentStatus;
  let submittedBy = existing?.submittedBy ? String(existing.submittedBy) : undefined;
  let submittedAt = existing?.submittedAt ? String(existing.submittedAt) : undefined;
  let approvedBy = existing?.approvedBy ? String(existing.approvedBy) : undefined;
  let approvedAt = existing?.approvedAt ? String(existing.approvedAt) : undefined;

  if (input.action === 'submit') {
    nextStatus = 'Dikirim';
    submittedBy = currentUser.namaLengkap.slice(0, 120);
    submittedAt = nowIso;
  } else if (input.action === 'approve') {
    nextStatus = 'Disetujui';
    approvedBy = currentUser.namaLengkap.slice(0, 120);
    approvedAt = nowIso;
  } else if (input.action === 'unlock') {
    nextStatus = 'Draft';
    approvedBy = undefined;
    approvedAt = undefined;
  }

  const payload: Record<string, unknown> = {
    tahun,
    bulan,
    bagianId: effectiveBagian,
    nilaiFungsional,
    status: nextStatus,
    catatan,
    updatedAt: serverTimestamp(),
  };
  if (submittedBy) payload.submittedBy = submittedBy;
  if (submittedAt) payload.submittedAt = submittedAt;
  if (approvedBy) payload.approvedBy = approvedBy;
  if (approvedAt) payload.approvedAt = approvedAt;

  try {
    if (!existing) {
      await setDoc(ref, { ...payload, ownerId: ownerUid });
    } else {
      await setDoc(ref, { ...payload, ownerId: String(existing.ownerId || ownerUid) });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `rekon_periode/${rekonId}`);
  }
}
