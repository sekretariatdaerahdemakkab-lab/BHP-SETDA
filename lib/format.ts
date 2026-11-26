export const NAMA_BULAN = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

export function getCurrentYear(): number {
  return new Date().getFullYear();
}

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDefaultDateForYear(tahun: number): string {
  const currentYear = getCurrentYear();
  if (tahun === currentYear) {
    return getTodayISO();
  }
  return `${tahun}-01-15`;
}

export function getYearOptions(extraYears: number[] = []): number[] {
  const current = getCurrentYear();
  const set = new Set<number>();
  for (let y = current - 2; y <= current + 2; y++) {
    set.add(y);
  }
  for (const y of extraYears) {
    if (Number.isInteger(y) && y >= 2000 && y <= 2100) {
      set.add(y);
    }
  }
  return Array.from(set).sort((a, b) => b - a);
}

export function formatRupiah(value: number): string {
  const num = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatNumber(value: number): string {
  const num = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatDateID(isoDate: string): string {
  if (!isoDate) return '-';
  const parts = isoDate.slice(0, 10).split('-');
  if (parts.length !== 3) return isoDate;
  const year = Number(parts[0]);
  const monthIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  const monthName = NAMA_BULAN[monthIdx] || parts[1];
  return `${day} ${monthName} ${year}`;
}

export function terbilang(angka: number): string {
  const nilai = Math.round(Math.abs(angka));
  if (nilai === 0) return 'Nol Rupiah';

  const satuan = [
    '',
    'Satu',
    'Dua',
    'Tiga',
    'Empat',
    'Lima',
    'Enam',
    'Tujuh',
    'Delapan',
    'Sembilan',
    'Sepuluh',
    'Sebelas',
  ];

  function convert(n: number): string {
    if (n < 12) return satuan[n];
    if (n < 20) return `${convert(n - 10)} Belas`;
    if (n < 100) {
      const puluhan = Math.floor(n / 10);
      const sisa = n % 10;
      return `${satuan[puluhan]} Puluh${sisa > 0 ? ' ' + convert(sisa) : ''}`;
    }
    if (n < 200) {
      const sisa = n - 100;
      return `Seratus${sisa > 0 ? ' ' + convert(sisa) : ''}`;
    }
    if (n < 1000) {
      const ratusan = Math.floor(n / 100);
      const sisa = n % 100;
      return `${satuan[ratusan]} Ratus${sisa > 0 ? ' ' + convert(sisa) : ''}`;
    }
    if (n < 2000) {
      const sisa = n - 1000;
      return `Seribu${sisa > 0 ? ' ' + convert(sisa) : ''}`;
    }
    if (n < 1000000) {
      const ribuan = Math.floor(n / 1000);
      const sisa = n % 1000;
      return `${convert(ribuan)} Ribu${sisa > 0 ? ' ' + convert(sisa) : ''}`;
    }
    if (n < 1000000000) {
      const jutaan = Math.floor(n / 1000000);
      const sisa = n % 1000000;
      return `${convert(jutaan)} Juta${sisa > 0 ? ' ' + convert(sisa) : ''}`;
    }
    if (n < 1000000000000) {
      const miliaran = Math.floor(n / 1000000000);
      const sisa = n % 1000000000;
      return `${convert(miliaran)} Miliar${sisa > 0 ? ' ' + convert(sisa) : ''}`;
    }
    const triliunan = Math.floor(n / 1000000000000);
    const sisa = n % 1000000000000;
    return `${convert(triliunan)} Triliun${sisa > 0 ? ' ' + convert(sisa) : ''}`;
  }

  const prefix = angka < 0 ? 'Minus ' : '';
  return `${prefix}${convert(nilai)} Rupiah`.replace(/\s+/g, ' ').trim();
}

export function getPeriodMonthRange(
  mode: 'bulanan' | 'triwulan' | 'semester' | 'tahunan' | 'kustom',
  param: {
    bulan?: number;
    triwulan?: number;
    semester?: number;
    bulanDari?: number;
    bulanSampai?: number;
  }
): { bulanDari: number; bulanSampai: number; label: string } {
  switch (mode) {
    case 'bulanan': {
      const b = Math.min(12, Math.max(1, param.bulan || 1));
      return { bulanDari: b, bulanSampai: b, label: `Bulan ${NAMA_BULAN[b - 1]}` };
    }
    case 'triwulan': {
      const tw = Math.min(4, Math.max(1, param.triwulan || 1));
      const dari = (tw - 1) * 3 + 1;
      const sampai = tw * 3;
      return {
        bulanDari: dari,
        bulanSampai: sampai,
        label: `Triwulan ${tw} (${NAMA_BULAN[dari - 1]} - ${NAMA_BULAN[sampai - 1]})`,
      };
    }
    case 'semester': {
      const sem = param.semester === 2 ? 2 : 1;
      const dari = 1;
      const sampai = sem === 1 ? 6 : 12;
      return {
        bulanDari: dari,
        bulanSampai: sampai,
        label: `Semester ${sem === 1 ? 'I' : 'II'} (${NAMA_BULAN[dari - 1]} - ${NAMA_BULAN[sampai - 1]})`,
      };
    }
    case 'kustom': {
      const d = Math.min(12, Math.max(1, param.bulanDari || 1));
      const s = Math.min(12, Math.max(d, param.bulanSampai || 12));
      return {
        bulanDari: d,
        bulanSampai: s,
        label: `Periode ${NAMA_BULAN[d - 1]} - ${NAMA_BULAN[s - 1]}`,
      };
    }
    case 'tahunan':
    default:
      return { bulanDari: 1, bulanSampai: 12, label: 'Satu Tahun Penuh (Januari - Desember)' };
  }
}
