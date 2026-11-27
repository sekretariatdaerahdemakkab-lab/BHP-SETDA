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

export function roundQty(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function parseFlexibleNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : Number.NaN;
  }
  if (value === null || value === undefined) return Number.NaN;
  let str = String(value).trim();
  if (!str) return Number.NaN;

  // Strip currency prefixes/spaces
  str = str.replace(/rp\.?/gi, '').replace(/\s+/g, '');
  if (!str) return Number.NaN;

  const hasDot = str.includes('.');
  const hasComma = str.includes(',');

  if (hasDot && hasComma) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      // Indonesian style: 1.250.000,50
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // US style: 1,250,000.50
      str = str.replace(/,/g, '');
    }
  } else if (hasComma) {
    if (/^-?\d{1,3}(,\d{3})+$/.test(str)) {
      str = str.replace(/,/g, '');
    } else {
      str = str.replace(',', '.');
    }
  } else if (hasDot) {
    if (/^-?\d{1,3}(\.\d{3})+$/.test(str)) {
      str = str.replace(/\./g, '');
    }
  }

  const parsed = Number(str);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function isValidCalendarYMD(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const check = new Date(Date.UTC(y, m - 1, d));
  return (
    check.getUTCFullYear() === y &&
    check.getUTCMonth() === m - 1 &&
    check.getUTCDate() === d
  );
}

export function parseExcelDateISO(value: unknown, fallback = ''): string {
  if (value === null || value === undefined || value === '') return fallback;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  if (typeof value === 'number' && Number.isFinite(value) && value > 20000 && value < 80000) {
    const utcMs = Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000;
    const dt = new Date(utcMs);
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth() + 1;
    const d = dt.getUTCDate();
    if (isValidCalendarYMD(y, m, d)) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  const str = String(value).trim();
  if (!str) return fallback;

  // Numeric Excel serial passed as string
  if (/^\d{5}(\.\d+)?$/.test(str)) {
    const num = Number(str);
    if (num > 20000 && num < 80000) {
      const utcMs = Date.UTC(1899, 11, 30) + Math.floor(num) * 86400000;
      const dt = new Date(utcMs);
      const y = dt.getUTCFullYear();
      const m = dt.getUTCMonth() + 1;
      const d = dt.getUTCDate();
      if (isValidCalendarYMD(y, m, d)) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
  }

  // YYYY-MM-DD or YYYY/MM/DD (with optional ISO time suffix)
  const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
  if (ymdMatch) {
    const y = Number(ymdMatch[1]);
    const m = Number(ymdMatch[2]);
    const d = Number(ymdMatch[3]);
    if (isValidCalendarYMD(y, m, d)) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const d = Number(dmyMatch[1]);
    const m = Number(dmyMatch[2]);
    const y = Number(dmyMatch[3]);
    if (isValidCalendarYMD(y, m, d)) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  return str.slice(0, 10);
}
