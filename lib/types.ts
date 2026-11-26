export type UserRole =
  | 'Superadmin'
  | 'Pengurus Barang'
  | 'Admin Persediaan';

export interface Bagian {
  id: string;
  kode: string;
  nama: string;
  kepalaBagian: string;
  createdAt?: string;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  namaLengkap: string;
  role: UserRole;
  bagianId: string | null;
  bagianKode?: string | null;
  bagianNama?: string | null;
  active: boolean;
  createdAt?: string;
}

export interface InstansiConfig {
  id: string;
  namaInstansi: string;
  subInstansi: string;
  alamat: string;
  telepon: string;
  fax: string;
  website: string;
  email: string;
  logoUrl: string;
  kopSuratUrl: string;
  namaPimpinan: string;
  jabatanPimpinan: string;
  nipPimpinan: string;
  namaPengurus: string;
  jabatanPengurus: string;
  nipPengurus: string;
  updatedAt?: string;
}

export interface Kategori {
  id: string;
  kodeRekening: string;
  nama: string;
  createdAt?: string;
}

export interface Barang {
  id: string;
  kodeBarang: string;
  nama: string;
  satuan: string;
  hargaStandar: number;
  stokMinimum: number;
  kategoriId: string;
  kategoriNama?: string;
  kodeRekening?: string;
  createdAt?: string;
}

export interface PlafonAnggaran {
  id: string;
  tahun: number;
  bagianId: string;
  bagianKode?: string;
  bagianNama?: string;
  kodeRekening: string;
  namaKegiatan: string;
  paguAnggaran: number;
  realisasi: number;
  sisaPagu: number;
  persentase: number;
  statusAnggaran: 'Aman' | 'Peringatan' | 'Melebihi Pagu';
  createdAt?: string;
  updatedAt?: string;
}

export type JenisTransaksi =
  | 'SALDO_AWAL'
  | 'MASUK'
  | 'KELUAR'
  | 'OPNAME_MASUK'
  | 'OPNAME_KELUAR'
  | 'MUTASI_KELUAR'
  | 'MUTASI_MASUK';

export interface TransaksiPersediaan {
  id: string;
  tahun: number;
  bulan: number;
  bagianId: string;
  bagianKode?: string;
  bagianNama?: string;
  jenis: JenisTransaksi;
  tanggal: string;
  noBukti: string;
  barangId: string;
  barangKode?: string;
  barangNama?: string;
  satuan?: string;
  qty: number;
  hargaSatuan: number;
  totalNilai: number;
  plafonId: string | null;
  plafonKegiatan?: string | null;
  keterangan: string;
  refMutasiId: string | null;
  tujuanBagianId: string | null;
  tujuanBagianNama?: string | null;
  createdBy: string;
  createdAt: string;
  isLocked?: boolean;
}

export interface KartuPersediaanRow {
  id: string;
  transaksiId: string;
  tahun: number;
  bagianId: string;
  barangId: string;
  tanggal: string;
  noBukti: string;
  jenis: JenisTransaksi;
  keterangan: string;
  qtyMasuk: number;
  qtyKeluar: number;
  sisaSaldo: number;
  hargaSatuan: number;
  nilaiMutasi: number;
  createdAt: string;
}

export interface RekapPersediaanRow {
  barangId: string;
  kodeBarang: string;
  namaBarang: string;
  satuan: string;
  kategoriId: string;
  kategoriNama: string;
  kodeRekening: string;
  bagianId: string;
  bagianNama: string;
  saldoAwal: number;
  hargaAwal: number;
  saldoAwalNilai: number;
  mutasiMasuk: number;
  hargaMasuk: number;
  masukNilai: number;
  mutasiKeluar: number;
  hargaKeluar: number;
  keluarNilai: number;
  saldoAkhir: number;
  hargaAkhir: number;
  saldoAkhirNilai: number;
  hargaSatuan: number;
  totalNilai: number;
  stokMinimum: number;
}

export interface RekonPeriodeRow {
  id: string;
  tahun: number;
  bulan: number;
  namaBulan: string;
  periodeTipe?: 'BULANAN' | 'SEMESTER';
  semester?: 1 | 2;
  periodeLabel?: string;
  bagianId: string;
  bagianNama: string;
  bagianKode: string;
  realisasiPersediaan: number;
  nilaiFungsional: number;
  selisih: number;
  statusCocok: 'Cocok' | 'Selisih';
  status: 'Draft' | 'Dikirim' | 'Disetujui';
  catatan: string;
  submittedBy: string | null;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
}

export interface LowStockAlert {
  bagianId: string;
  bagianNama: string;
  barangId: string;
  kodeBarang: string;
  namaBarang: string;
  satuan: string;
  stokSaatIni: number;
  stokMinimum: number;
}

export interface DashboardSummary {
  tahun: number;
  totalPagu: number;
  totalRealisasi: number;
  sisaAnggaran: number;
  persentaseSerapan: number;
  statusAnggaran: 'Aman' | 'Peringatan' | 'Melebihi Pagu';
  totalJenisBarang: number;
  totalStokUnit: number;
  totalNilaiPersediaan: number;
  plafonItems: PlafonAnggaran[];
  lowStockAlerts: LowStockAlert[];
  stokPerBagian: Array<{
    bagianId: string;
    bagianKode: string;
    bagianNama: string;
    totalItem: number;
    totalQty: number;
    totalNilai: number;
  }>;
}
