import type { UserProfile } from '@/lib/types';

export const USERNAME_REGEX = /^[a-z0-9._\-]{3,40}$/;
export const AUTH_EMAIL_DOMAIN = 'sipbhp.demak.local';

export function sanitizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
  return USERNAME_REGEX.test(sanitizeUsername(username));
}

export function usernameToAuthEmail(username: string): string {
  return `${sanitizeUsername(username)}@${AUTH_EMAIL_DOMAIN}`;
}

export function newFsId(prefix: string): string {
  const raw =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 14)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${raw}`.replace(/[^a-zA-Z0-9_\-]/g, '');
}

export function tsToIso(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) {
    const ts = value as { toDate?: () => Date; toMillis?: () => number; seconds?: number };
    if (typeof ts.toDate === 'function') {
      return ts.toDate().toISOString();
    }
    if (typeof ts.toMillis === 'function') {
      return new Date(ts.toMillis()).toISOString();
    }
    if (typeof ts.seconds === 'number') {
      return new Date(ts.seconds * 1000).toISOString();
    }
  }
  return '';
}

export function isCentralRole(role?: string | null): boolean {
  return role === 'Superadmin' || role === 'Pengurus Barang';
}

export function isBagianRestrictedRole(role?: string | null): boolean {
  return role === 'Admin Persediaan';
}

export function resolveEffectiveBagianFilter(
  user: UserProfile,
  requestedBagianId?: string | null
): string {
  if (isBagianRestrictedRole(user.role)) {
    if (!user.bagianId) {
      throw new Error('Akun Anda terikat pada Bagian namun belum memiliki Bagian terdaftar.');
    }
    return user.bagianId;
  }
  if (!requestedBagianId || requestedBagianId === 'ALL') {
    return 'ALL';
  }
  return requestedBagianId;
}

export function assertCanWriteBagianTransaksi(
  user: UserProfile,
  targetBagianId?: string | null
): string {
  if (user.role === 'Pengurus Barang') {
    throw new Error(
      'Akses ditolak: Role Pengurus Barang hanya memiliki wewenang mengelola Plafon & Rekon.'
    );
  }
  if (isBagianRestrictedRole(user.role)) {
    if (!user.bagianId) {
      throw new Error('Akun Bagian belum memiliki gudang Bagian yang valid.');
    }
    if (targetBagianId && targetBagianId !== user.bagianId) {
      throw new Error('Akses ditolak: Anda hanya berhak mengelola persediaan pada Bagian Anda.');
    }
    return user.bagianId;
  }
  if (!targetBagianId || targetBagianId === 'ALL') {
    throw new Error('Pilih Bagian tujuan terlebih dahulu.');
  }
  return targetBagianId;
}

export function assertCanWriteBagianPlafon(
  user: UserProfile,
  targetBagianId?: string | null
): string {
  if (!isCentralRole(user.role)) {
    throw new Error(
      'Akses ditolak: Hanya Superadmin atau Pengurus Barang yang berhak mengelola Plafon & Rekon.'
    );
  }
  if (!targetBagianId || targetBagianId === 'ALL') {
    throw new Error('Pilih Bagian tujuan terlebih dahulu.');
  }
  return targetBagianId;
}

export function isPermissionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('permission') ||
    msg.includes('insufficient') ||
    msg.includes('permission-denied')
  );
}
