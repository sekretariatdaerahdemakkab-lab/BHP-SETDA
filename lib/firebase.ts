import { initializeApp, getApps } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = getApps().find((a) => a.name === '[DEFAULT]') || initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

/**
 * Provision a new Firebase Auth credential on an isolated secondary Firebase App
 * so Superadmin remains signed in on the primary session while registering staff accounts.
 */
export async function provisionAuthUser(authEmail: string, password: string): Promise<string> {
  const provisionerApp =
    getApps().find((a) => a.name === 'user-provisioner') ||
    initializeApp(firebaseConfig, 'user-provisioner');
  const provisionerAuth = getAuth(provisionerApp);
  try {
    const cred = await createUserWithEmailAndPassword(provisionerAuth, authEmail, password);
    return cred.user.uid;
  } finally {
    await signOut(provisionerAuth).catch(() => {});
  }
}

export function mapFirebaseAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (
    raw.includes('auth/operation-not-allowed') ||
    raw.includes('auth/admin-restricted-operation')
  ) {
    return `Metode login Email/Password belum diaktifkan pada Firebase Authentication proyek "${firebaseConfig.projectId}". Buka Firebase Console → Authentication → Sign-in method → Aktifkan (Enable) provider Email/Password.`;
  }
  if (
    raw.includes('auth/invalid-credential') ||
    raw.includes('auth/wrong-password') ||
    raw.includes('auth/user-not-found') ||
    raw.includes('auth/invalid-email')
  ) {
    return 'Username atau password tidak sesuai, atau akun belum terdaftar.';
  }
  if (raw.includes('auth/email-already-in-use')) {
    return 'Username tersebut sudah terdaftar pada sistem autentikasi. Gunakan username lain.';
  }
  if (raw.includes('auth/weak-password')) {
    return 'Password terlalu lemah. Gunakan minimal 6 karakter.';
  }
  if (raw.includes('auth/too-many-requests')) {
    return 'Terlalu banyak percobaan login gagal. Silakan tunggu sebentar lalu coba lagi.';
  }
  if (raw.includes('auth/network-request-failed')) {
    return 'Koneksi jaringan bermasalah. Periksa koneksi internet Anda lalu coba lagi.';
  }
  return raw;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
