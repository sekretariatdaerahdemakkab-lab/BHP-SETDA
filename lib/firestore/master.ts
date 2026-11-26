import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type { Bagian, Barang, InstansiConfig, Kategori, UserProfile } from '@/lib/types';
import { newFsId, tsToIso } from './utils';

export async function getInstansi(): Promise<InstansiConfig | null> {
  try {
    const snap = await getDoc(doc(db, 'instansi', 'default'));
    if (!snap.exists()) return null;
    const d = snap.data() as Record<string, unknown>;
    return {
      id: snap.id,
      namaInstansi: String(d.namaInstansi || ''),
      subInstansi: String(d.subInstansi || ''),
      alamat: String(d.alamat || ''),
      telepon: String(d.telepon || ''),
      fax: String(d.fax || ''),
      website: String(d.website || ''),
      email: String(d.email || ''),
      logoUrl: String(d.logoUrl || ''),
      kopSuratUrl: String(d.kopSuratUrl || ''),
      namaPimpinan: String(d.namaPimpinan || ''),
      jabatanPimpinan: String(d.jabatanPimpinan || ''),
      nipPimpinan: String(d.nipPimpinan || ''),
      namaPengurus: String(d.namaPengurus || ''),
      jabatanPengurus: String(d.jabatanPengurus || ''),
      nipPengurus: String(d.nipPengurus || ''),
      updatedAt: tsToIso(d.updatedAt),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'instansi/default');
  }
}

export async function saveInstansi(
  currentUser: UserProfile,
  ownerUid: string,
  input: InstansiConfig
): Promise<void> {
  if (currentUser.role !== 'Superadmin') {
    throw new Error('Hanya Superadmin yang dapat mengubah Pengaturan Instansi.');
  }
  const namaInstansi = input.namaInstansi.trim().slice(0, 150);
  const subInstansi = input.subInstansi.trim().slice(0, 150);
  if (!namaInstansi || !subInstansi) {
    throw new Error('Nama Instansi Induk dan Sub Instansi wajib diisi.');
  }
  if ((input.logoUrl || '').length > 450000) {
    throw new Error('Ukuran gambar Logo melebihi batas dokumen Firestore (maks 450 KB terkompresi).');
  }
  if ((input.kopSuratUrl || '').length > 450000) {
    throw new Error('Ukuran gambar Kop Surat melebihi batas dokumen Firestore (maks 450 KB terkompresi).');
  }

  const fields = {
    namaInstansi,
    subInstansi,
    alamat: (input.alamat || '').trim().slice(0, 300),
    telepon: (input.telepon || '').trim().slice(0, 50),
    fax: (input.fax || '').trim().slice(0, 50),
    website: (input.website || '').trim().slice(0, 120),
    email: (input.email || '').trim().slice(0, 120),
    logoUrl: input.logoUrl || '',
    kopSuratUrl: input.kopSuratUrl || '',
    namaPimpinan: (input.namaPimpinan || '').trim().slice(0, 120),
    jabatanPimpinan: (input.jabatanPimpinan || '').trim().slice(0, 120),
    nipPimpinan: (input.nipPimpinan || '').trim().slice(0, 40),
    namaPengurus: (input.namaPengurus || '').trim().slice(0, 120),
    jabatanPengurus: (input.jabatanPengurus || '').trim().slice(0, 120),
    nipPengurus: (input.nipPengurus || '').trim().slice(0, 40),
    updatedAt: serverTimestamp(),
  };

  const ref = doc(db, 'instansi', 'default');
  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, fields);
    } else {
      await setDoc(ref, { ...fields, ownerId: ownerUid });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'instansi/default');
  }
}

export async function listBagian(): Promise<Bagian[]> {
  try {
    const snap = await getDocs(collection(db, 'bagian'));
    const list: Bagian[] = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        kode: String(data.kode || ''),
        nama: String(data.nama || ''),
        kepalaBagian: String(data.kepalaBagian || ''),
        createdAt: tsToIso(data.updatedAt),
      };
    });
    return list.sort((a, b) => a.nama.localeCompare(b.nama));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'bagian');
  }
}

export async function saveBagian(
  currentUser: UserProfile,
  ownerUid: string,
  input: { id?: string; kode: string; nama: string; kepalaBagian: string }
): Promise<void> {
  if (currentUser.role !== 'Superadmin') {
    throw new Error('Hanya Superadmin yang dapat menambah atau mengubah data Bagian.');
  }
  const kode = input.kode.trim().toUpperCase().slice(0, 20);
  const nama = input.nama.trim().slice(0, 120);
  const kepalaBagian = (input.kepalaBagian || '').trim().slice(0, 120);
  if (!kode || !nama) {
    throw new Error('Kode dan Nama Bagian wajib diisi.');
  }

  const all = await listBagian();
  if (all.some((b) => b.id !== input.id && b.kode.toUpperCase() === kode)) {
    throw new Error(`Kode Bagian "${kode}" sudah digunakan.`);
  }

  if (input.id) {
    try {
      await updateDoc(doc(db, 'bagian', input.id), {
        kode,
        nama,
        kepalaBagian,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `bagian/${input.id}`);
    }
    return;
  }

  const id = newFsId('bag');
  try {
    await setDoc(doc(db, 'bagian', id), {
      kode,
      nama,
      kepalaBagian,
      ownerId: ownerUid,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `bagian/${id}`);
  }
}

export async function deleteBagian(currentUser: UserProfile, id: string): Promise<void> {
  if (currentUser.role !== 'Superadmin') {
    throw new Error('Hanya Superadmin yang dapat menghapus Bagian.');
  }
  try {
    const [trxSnap, plafonSnap] = await Promise.all([
      getDocs(query(collection(db, 'transaksi_persediaan'), where('bagianId', '==', id), limit(1))),
      getDocs(query(collection(db, 'plafon_anggaran'), where('bagianId', '==', id), limit(1))),
    ]);
    if (!trxSnap.empty || !plafonSnap.empty) {
      throw new Error('Bagian tidak dapat dihapus karena masih memiliki plafon anggaran atau transaksi persediaan.');
    }
    await deleteDoc(doc(db, 'bagian', id));
  } catch (err) {
    if (err instanceof Error && err.message.includes('tidak dapat dihapus')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.DELETE, `bagian/${id}`);
  }
}

export async function listKategori(): Promise<Kategori[]> {
  try {
    const snap = await getDocs(collection(db, 'kategori'));
    const list: Kategori[] = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        kodeRekening: String(data.kodeRekening || ''),
        nama: String(data.nama || ''),
        createdAt: tsToIso(data.updatedAt),
      };
    });
    return list.sort((a, b) => a.kodeRekening.localeCompare(b.kodeRekening) || a.nama.localeCompare(b.nama));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'kategori');
  }
}

export async function saveKategori(
  currentUser: UserProfile,
  ownerUid: string,
  input: { id?: string; kodeRekening: string; nama: string }
): Promise<void> {
  if (currentUser.role !== 'Superadmin') {
    throw new Error('Hanya Superadmin yang dapat mengelola Master Kategori.');
  }
  const kodeRekening = input.kodeRekening.trim().slice(0, 50);
  const nama = input.nama.trim().slice(0, 150);
  if (!kodeRekening || !nama) {
    throw new Error('Kode Rekening dan Nama Kategori wajib diisi.');
  }

  if (input.id) {
    try {
      await updateDoc(doc(db, 'kategori', input.id), {
        kodeRekening,
        nama,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `kategori/${input.id}`);
    }
    return;
  }

  const id = newFsId('kat');
  try {
    await setDoc(doc(db, 'kategori', id), {
      kodeRekening,
      nama,
      ownerId: ownerUid,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `kategori/${id}`);
  }
}

export async function deleteKategori(currentUser: UserProfile, id: string): Promise<void> {
  if (currentUser.role !== 'Superadmin') {
    throw new Error('Hanya Superadmin yang dapat menghapus Kategori.');
  }
  try {
    const usedSnap = await getDocs(
      query(collection(db, 'barang'), where('kategoriId', '==', id), limit(1))
    );
    if (!usedSnap.empty) {
      throw new Error('Kategori masih digunakan oleh item barang pada katalog.');
    }
    await deleteDoc(doc(db, 'kategori', id));
  } catch (err) {
    if (err instanceof Error && err.message.includes('masih digunakan')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.DELETE, `kategori/${id}`);
  }
}

export async function listBarang(searchTerm = ''): Promise<Barang[]> {
  try {
    const [brgSnap, katList] = await Promise.all([
      getDocs(collection(db, 'barang')),
      listKategori(),
    ]);
    const katMap = new Map(katList.map((k) => [k.id, k]));
    const q = searchTerm.trim().toLowerCase();

    const rows: Barang[] = brgSnap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const katId = String(data.kategoriId || '');
      const kat = katMap.get(katId);
      return {
        id: d.id,
        kodeBarang: String(data.kodeBarang || ''),
        nama: String(data.nama || ''),
        satuan: String(data.satuan || ''),
        hargaStandar: Number(data.hargaStandar || 0),
        stokMinimum: Math.max(0, Number(data.stokMinimum ?? 0) || 0),
        kategoriId: katId,
        kategoriNama: kat?.nama || '-',
        kodeRekening: kat?.kodeRekening || '-',
        createdAt: tsToIso(data.updatedAt),
      };
    });

    const filtered = q
      ? rows.filter(
          (r) =>
            r.kodeBarang.toLowerCase().includes(q) ||
            r.nama.toLowerCase().includes(q) ||
            (r.kategoriNama || '').toLowerCase().includes(q)
        )
      : rows;

    return filtered.sort((a, b) => a.nama.localeCompare(b.nama));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'barang');
  }
}

export async function saveBarang(
  currentUser: UserProfile,
  ownerUid: string,
  input: {
    id?: string;
    kodeBarang: string;
    nama: string;
    satuan: string;
    hargaStandar: number;
    stokMinimum: number;
    kategoriId: string;
  }
): Promise<void> {
  if (currentUser.role !== 'Superadmin') {
    throw new Error('Hanya Superadmin yang dapat mengelola Master Barang.');
  }
  const kodeBarang = input.kodeBarang.trim().toUpperCase().slice(0, 40);
  const nama = input.nama.trim().slice(0, 150);
  const satuan = input.satuan.trim().slice(0, 40);
  const hargaStandar = Math.max(0, Number(input.hargaStandar) || 0);
  const stokMinimum = Math.max(0, Number(input.stokMinimum) || 0);
  const kategoriId = input.kategoriId;

  if (!kodeBarang || !nama || !satuan || !kategoriId) {
    throw new Error('Kode Barang, Nama Barang, Satuan, dan Kategori wajib diisi.');
  }

  const all = await listBarang();
  if (all.some((b) => b.id !== input.id && b.kodeBarang.toUpperCase() === kodeBarang)) {
    throw new Error(`Kode Barang "${kodeBarang}" sudah terdaftar.`);
  }

  if (input.id) {
    try {
      await updateDoc(doc(db, 'barang', input.id), {
        kodeBarang,
        nama,
        satuan,
        hargaStandar,
        stokMinimum,
        kategoriId,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `barang/${input.id}`);
    }
    return;
  }

  const id = newFsId('brg');
  try {
    await setDoc(doc(db, 'barang', id), {
      kodeBarang,
      nama,
      satuan,
      hargaStandar,
      stokMinimum,
      kategoriId,
      ownerId: ownerUid,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `barang/${id}`);
  }
}

export async function importBarangBatch(
  currentUser: UserProfile,
  ownerUid: string,
  items: Array<{
    kodeBarang: string;
    nama: string;
    satuan: string;
    hargaStandar: number;
    stokMinimum: number;
    kategoriNama?: string;
    kategoriId?: string;
  }>
): Promise<number> {
  if (currentUser.role !== 'Superadmin') {
    throw new Error('Hanya Superadmin yang dapat mengimpor katalog barang.');
  }
  if (items.length === 0) return 0;

  const [katList, existingBarang] = await Promise.all([listKategori(), listBarang()]);
  if (katList.length === 0) {
    throw new Error('Buat minimal satu Master Kategori sebelum mengimpor barang.');
  }
  const existingCodes = new Set(existingBarang.map((b) => b.kodeBarang.toUpperCase()));

  let inserted = 0;
  const chunkSize = 400;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    let chunkCount = 0;

    for (const item of chunk) {
      const kodeBarang = String(item.kodeBarang || '').trim().toUpperCase().slice(0, 40);
      const nama = String(item.nama || '').trim().slice(0, 150);
      const satuan = String(item.satuan || '').trim().slice(0, 40);
      if (!kodeBarang || !nama || !satuan || existingCodes.has(kodeBarang)) continue;

      let katId = item.kategoriId;
      if (!katId && item.kategoriNama) {
        const match = katList.find(
          (k) => k.nama.toLowerCase() === item.kategoriNama!.trim().toLowerCase()
        );
        katId = match?.id;
      }
      if (!katId) katId = katList[0].id;

      const id = newFsId('brg');
      batch.set(doc(db, 'barang', id), {
        kodeBarang,
        nama,
        satuan,
        hargaStandar: Math.max(0, Number(item.hargaStandar) || 0),
        stokMinimum: Number.isFinite(Number(item.stokMinimum))
          ? Math.max(0, Number(item.stokMinimum))
          : 0,
        kategoriId: katId,
        ownerId: ownerUid,
        updatedAt: serverTimestamp(),
      });
      existingCodes.add(kodeBarang);
      chunkCount += 1;
      inserted += 1;
    }

    if (chunkCount > 0) {
      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'barang/importBatch');
      }
    }
  }

  return inserted;
}

export async function deleteBarang(currentUser: UserProfile, id: string): Promise<void> {
  if (currentUser.role !== 'Superadmin') {
    throw new Error('Hanya Superadmin yang dapat menghapus Barang.');
  }
  try {
    const usedSnap = await getDocs(
      query(collection(db, 'transaksi_persediaan'), where('barangId', '==', id), limit(1))
    );
    if (!usedSnap.empty) {
      throw new Error('Barang tidak dapat dihapus karena sudah tercatat pada transaksi persediaan.');
    }
    await deleteDoc(doc(db, 'barang', id));
  } catch (err) {
    if (err instanceof Error && err.message.includes('tidak dapat dihapus')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.DELETE, `barang/${id}`);
  }
}

export async function setBarangStokMinimum(
  currentUser: UserProfile,
  barangId: string,
  stokMinimum: number
): Promise<void> {
  if (currentUser.role !== 'Superadmin') {
    throw new Error('Hanya Superadmin yang dapat mengubah pengaturan alert stok minimum.');
  }
  const cleanMin = Number.isFinite(stokMinimum) ? Math.max(0, Math.round(stokMinimum)) : 0;
  try {
    await updateDoc(doc(db, 'barang', barangId), {
      stokMinimum: cleanMin,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `barang/${barangId}`);
  }
}
