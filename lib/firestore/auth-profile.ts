import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  updatePassword,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  mapFirebaseAuthError,
  OperationType,
  provisionAuthUser,
} from '@/lib/firebase';
import type { Bagian, UserProfile, UserRole } from '@/lib/types';
import {
  isPermissionError,
  isValidUsername,
  sanitizeUsername,
  tsToIso,
  usernameToAuthEmail,
} from './utils';

interface FsUserDoc {
  uid: string;
  username: string;
  email: string;
  namaLengkap: string;
  role: UserRole;
  bagianId?: string;
  active: boolean;
  updatedAt?: unknown;
}

let inFlightBootstrap: { uid: string; promise: Promise<UserProfile> } | null = null;

function enrichUser(id: string, data: FsUserDoc, bagianMap: Map<string, Bagian>): UserProfile {
  const bag = data.bagianId ? bagianMap.get(data.bagianId) : undefined;
  return {
    id,
    username: data.username,
    email: data.email,
    namaLengkap: data.namaLengkap,
    role: data.role,
    bagianId: data.bagianId || null,
    bagianKode: bag?.kode || null,
    bagianNama: bag?.nama || null,
    active: Boolean(data.active),
    createdAt: tsToIso(data.updatedAt),
  };
}

async function getBagianMapSafe(): Promise<Map<string, Bagian>> {
  const map = new Map<string, Bagian>();
  try {
    const snap = await getDocs(collection(db, 'bagian'));
    snap.forEach((d) => {
      const data = d.data() as { kode: string; nama: string; kepalaBagian?: string };
      map.set(d.id, {
        id: d.id,
        kode: data.kode,
        nama: data.nama,
        kepalaBagian: data.kepalaBagian || '',
      });
    });
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.LIST, 'bagian');
    }
  }
  return map;
}

async function ensureMinimalInstansiDoc(uid: string): Promise<void> {
  const instRef = doc(db, 'instansi', 'default');
  let snap;
  try {
    snap = await getDoc(instRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'instansi/default');
  }
  if (!snap.exists()) {
    try {
      await setDoc(instRef, {
        namaInstansi: 'PEMERINTAH KABUPATEN DEMAK',
        subInstansi: 'SEKRETARIAT DAERAH',
        alamat: 'Jl. Kyai Singkil No. 7 Demak, Jawa Tengah 59511',
        telepon: '',
        fax: '',
        website: '',
        email: '',
        logoUrl: '',
        kopSuratUrl: '',
        namaPimpinan: '',
        jabatanPimpinan: 'Sekretaris Daerah Kabupaten Demak',
        nipPimpinan: '',
        namaPengurus: '',
        jabatanPengurus: 'Pengurus Barang Pengguna',
        nipPengurus: '',
        ownerId: uid,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'instansi/default');
    }
  }
}

export async function checkBootstrapInitialized(): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'meta', 'bootstrap'));
    return snap.exists() && Boolean((snap.data() as { initialized?: boolean })?.initialized);
  } catch (err) {
    if (isPermissionError(err)) {
      return false;
    }
    return false;
  }
}

export async function signInWithUsernamePassword(
  username: string,
  password: string
): Promise<void> {
  const cleanUsername = sanitizeUsername(username);
  if (!isValidUsername(cleanUsername)) {
    throw new Error(
      'Username minimal 3 karakter dan hanya boleh huruf kecil, angka, titik (.), garis bawah (_), atau tanda hubung (-).'
    );
  }
  if (!password) {
    throw new Error('Password wajib diisi.');
  }
  const authEmail = usernameToAuthEmail(cleanUsername);
  try {
    await signInWithEmailAndPassword(auth, authEmail, password);
  } catch (err) {
    throw new Error(mapFirebaseAuthError(err));
  }
}

export async function bootstrapInitialSuperadmin(input: {
  username: string;
  namaLengkap: string;
  password: string;
}): Promise<UserProfile> {
  const cleanUsername = sanitizeUsername(input.username);
  const cleanNama = input.namaLengkap.trim().slice(0, 120);
  if (!isValidUsername(cleanUsername)) {
    throw new Error(
      'Username Superadmin minimal 3 karakter (hanya huruf kecil, angka, titik, garis bawah, atau tanda hubung).'
    );
  }
  if (!cleanNama) {
    throw new Error('Nama lengkap Superadmin wajib diisi.');
  }
  if (input.password.length < 6) {
    throw new Error('Password Superadmin minimal 6 karakter.');
  }

  const alreadyInitialized = await checkBootstrapInitialized();
  if (alreadyInitialized) {
    throw new Error('Akun Superadmin awal sudah pernah diaktifkan. Silakan masuk melalui form Login.');
  }

  const authEmail = usernameToAuthEmail(cleanUsername);

  let resolveBootstrap!: (profile: UserProfile) => void;
  let rejectBootstrap!: (err: unknown) => void;
  const bootstrapPromise = new Promise<UserProfile>((res, rej) => {
    resolveBootstrap = res;
    rejectBootstrap = rej;
  });
  const bootstrapEntry = { uid: '__PENDING__', promise: bootstrapPromise };
  inFlightBootstrap = bootstrapEntry;

  try {
    let cred;
    let createdNewAuthUser = false;
    try {
      cred = await createUserWithEmailAndPassword(auth, authEmail, input.password);
      createdNewAuthUser = true;
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (raw.includes('auth/email-already-in-use')) {
        try {
          cred = await signInWithEmailAndPassword(auth, authEmail, input.password);
        } catch {
          throw new Error(
            `Username "${cleanUsername}" sudah terdaftar di sistem autentikasi dengan password berbeda. Gunakan tab "Masuk dengan Username" jika sudah pernah diaktifkan, atau gunakan username Superadmin lain.`
          );
        }
      } else {
        throw new Error(mapFirebaseAuthError(err));
      }
    }

    const uid = cred.user.uid;
    bootstrapEntry.uid = uid;

    const [existingBootstrapSnap, existingUserSnap] = await Promise.all([
      getDoc(doc(db, 'meta', 'bootstrap')),
      getDoc(doc(db, 'users', uid)),
    ]);

    if (existingBootstrapSnap.exists() && existingUserSnap.exists()) {
      const existingData = existingUserSnap.data() as FsUserDoc;
      if (!existingData.active) {
        throw new Error('Akun Anda berstatus nonaktif. Hubungi Superadmin.');
      }
      if (existingData.role === 'Superadmin') {
        await ensureMinimalInstansiDoc(uid);
      }
      const bagianMap = await getBagianMapSafe();
      const profile = enrichUser(uid, existingData, bagianMap);
      resolveBootstrap(profile);
      return profile;
    }

    const batch = writeBatch(db);
    if (!existingBootstrapSnap.exists()) {
      batch.set(doc(db, 'meta', 'bootstrap'), {
        initialized: true,
        superadminUid: uid,
        updatedAt: serverTimestamp(),
      });
    }
    batch.set(doc(db, 'admins', uid), {
      uid,
      email: authEmail,
      createdAt: serverTimestamp(),
    });
    const adminProfile = {
      uid,
      username: cleanUsername,
      email: authEmail,
      namaLengkap: cleanNama,
      role: 'Superadmin' as UserRole,
      active: true,
      updatedAt: serverTimestamp(),
    };
    batch.set(doc(db, 'users', uid), adminProfile);

    try {
      await batch.commit();
    } catch (err) {
      if (createdNewAuthUser) {
        await cred.user.delete().catch(() => {});
      }
      handleFirestoreError(err, OperationType.WRITE, `meta/bootstrap|admins/${uid}|users/${uid}`);
    }

    await ensureMinimalInstansiDoc(uid);
    const bagianMap = await getBagianMapSafe();
    const profile = enrichUser(
      uid,
      {
        uid,
        username: cleanUsername,
        email: authEmail,
        namaLengkap: cleanNama,
        role: 'Superadmin',
        active: true,
        updatedAt: new Date().toISOString(),
      },
      bagianMap
    );
    resolveBootstrap(profile);
    return profile;
  } catch (err) {
    rejectBootstrap(err);
    throw err;
  } finally {
    if (inFlightBootstrap === bootstrapEntry) {
      inFlightBootstrap = null;
    }
  }
}

export async function resolveAuthenticatedSession(fbUser: FirebaseUser): Promise<UserProfile> {
  const uid = fbUser.uid;
  if (
    inFlightBootstrap &&
    (inFlightBootstrap.uid === uid || inFlightBootstrap.uid === '__PENDING__')
  ) {
    return await inFlightBootstrap.promise;
  }

  const userPath = `users/${uid}`;
  let existingSnap;
  try {
    existingSnap = await getDoc(doc(db, 'users', uid));
  } catch (err) {
    if (isPermissionError(err)) {
      throw new Error(
        'Akun Anda belum terdaftar pada profil pengguna Firestore. Hubungi Superadmin untuk pendaftaran akun.'
      );
    }
    handleFirestoreError(err, OperationType.GET, userPath);
  }

  if (!existingSnap.exists()) {
    let bootstrapSnap;
    try {
      bootstrapSnap = await getDoc(doc(db, 'meta', 'bootstrap'));
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'meta/bootstrap');
    }

    const bootstrapData = bootstrapSnap.exists()
      ? (bootstrapSnap.data() as { initialized?: boolean; superadminUid?: string })
      : null;

    if (!bootstrapSnap.exists() || bootstrapData?.superadminUid === uid) {
      const authEmail = (fbUser.email || usernameToAuthEmail('superadmin')).trim().toLowerCase();
      const rawPrefix = sanitizeUsername(authEmail.split('@')[0] || 'superadmin');
      const cleanUsername = isValidUsername(rawPrefix) ? rawPrefix : 'superadmin';
      const cleanNama = (fbUser.displayName || 'Superadmin Setda Demak').slice(0, 120);

      const batch = writeBatch(db);
      if (!bootstrapSnap.exists()) {
        batch.set(doc(db, 'meta', 'bootstrap'), {
          initialized: true,
          superadminUid: uid,
          updatedAt: serverTimestamp(),
        });
      }
      batch.set(doc(db, 'admins', uid), {
        uid,
        email: authEmail,
        createdAt: serverTimestamp(),
      });
      const adminDoc: FsUserDoc = {
        uid,
        username: cleanUsername,
        email: authEmail,
        namaLengkap: cleanNama,
        role: 'Superadmin',
        active: true,
        updatedAt: serverTimestamp(),
      };
      batch.set(doc(db, 'users', uid), adminDoc);

      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `meta/bootstrap|admins/${uid}|users/${uid}`);
      }

      await ensureMinimalInstansiDoc(uid);
      const bagianMap = await getBagianMapSafe();
      return enrichUser(
        uid,
        {
          ...adminDoc,
          updatedAt: new Date().toISOString(),
        },
        bagianMap
      );
    }

    throw new Error(
      'Akun Anda belum terdaftar di SIP-BHP SETDA DEMAK. Hubungi Superadmin untuk membuat akun pengelola.'
    );
  }

  const data = existingSnap.data() as FsUserDoc;
  if (!data.active) {
    throw new Error('Akun Anda berstatus nonaktif. Hubungi Superadmin.');
  }

  if (data.role === 'Superadmin') {
    await ensureMinimalInstansiDoc(uid);
  }

  const bagianMap = await getBagianMapSafe();
  return enrichUser(uid, data, bagianMap);
}

export async function listUsers(currentUser: UserProfile): Promise<UserProfile[]> {
  if (currentUser.role !== 'Superadmin') {
    throw new Error('Hanya Superadmin yang dapat melihat daftar pengguna.');
  }

  const bagianMap = await getBagianMapSafe();
  let usersSnap;
  try {
    usersSnap = await getDocs(collection(db, 'users'));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'users');
  }

  const result: UserProfile[] = [];
  usersSnap.forEach((d) => {
    const data = d.data() as FsUserDoc;
    result.push(enrichUser(d.id, data, bagianMap));
  });

  return result.sort((a, b) => a.username.localeCompare(b.username));
}

export async function createStaffUserAccount(
  currentUser: UserProfile,
  input: {
    username: string;
    password: string;
    namaLengkap: string;
    role: UserRole;
    bagianId: string | null;
    active: boolean;
  }
): Promise<void> {
  if (currentUser.role !== 'Superadmin') {
    throw new Error('Hanya Superadmin yang dapat mendaftarkan akun baru.');
  }

  const cleanUsername = sanitizeUsername(input.username);
  const cleanNama = input.namaLengkap.trim().slice(0, 120);
  if (!isValidUsername(cleanUsername)) {
    throw new Error(
      'Username minimal 3 karakter (hanya huruf kecil, angka, titik, garis bawah, atau tanda hubung).'
    );
  }
  if (!cleanNama) {
    throw new Error('Nama lengkap wajib diisi.');
  }
  if (input.password.length < 6) {
    throw new Error('Password minimal 6 karakter.');
  }

  const needsBagian = input.role === 'Admin Persediaan';
  if (needsBagian && !input.bagianId) {
    throw new Error('Pilihan Bagian wajib dipilih untuk Admin Persediaan.');
  }
  const cleanBagianId = needsBagian && input.bagianId ? input.bagianId : null;

  const existingUsers = await listUsers(currentUser);
  const duplicate = existingUsers.find((u) => u.username.toLowerCase() === cleanUsername);
  if (duplicate) {
    throw new Error(`Username "${cleanUsername}" sudah digunakan oleh pengguna lain.`);
  }

  const authEmail = usernameToAuthEmail(cleanUsername);
  let newUid: string;
  try {
    newUid = await provisionAuthUser(authEmail, input.password);
  } catch (err) {
    throw new Error(mapFirebaseAuthError(err));
  }

  const userPayload: Record<string, unknown> = {
    uid: newUid,
    username: cleanUsername,
    email: authEmail,
    namaLengkap: cleanNama,
    role: input.role,
    active: Boolean(input.active),
    updatedAt: serverTimestamp(),
  };
  if (cleanBagianId) {
    userPayload.bagianId = cleanBagianId;
  }

  try {
    await setDoc(doc(db, 'users', newUid), userPayload);
    if (input.role === 'Superadmin' && input.active) {
      await setDoc(doc(db, 'admins', newUid), {
        uid: newUid,
        email: authEmail,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users/${newUid}`);
  }
}

export async function updateStaffUserAccount(
  currentUser: UserProfile,
  input: {
    id: string;
    namaLengkap: string;
    role: UserRole;
    bagianId: string | null;
    active: boolean;
  }
): Promise<void> {
  if (currentUser.role !== 'Superadmin') {
    throw new Error('Hanya Superadmin yang dapat mengubah data pengguna.');
  }

  const cleanNama = input.namaLengkap.trim().slice(0, 120);
  if (!cleanNama) {
    throw new Error('Nama lengkap wajib diisi.');
  }

  const needsBagian = input.role === 'Admin Persediaan';
  if (needsBagian && !input.bagianId) {
    throw new Error('Pilihan Bagian wajib dipilih untuk Admin Persediaan.');
  }
  const cleanBagianId = needsBagian && input.bagianId ? input.bagianId : null;

  if (input.id === currentUser.id && (!input.active || input.role !== 'Superadmin')) {
    throw new Error('Tidak dapat menonaktifkan atau menurunkan role akun Superadmin Anda sendiri.');
  }

  const userRef = doc(db, 'users', input.id);
  let userSnap;
  try {
    userSnap = await getDoc(userRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${input.id}`);
  }
  if (!userSnap.exists()) {
    throw new Error('User tidak ditemukan di Firestore.');
  }
  const existingUser = userSnap.data() as FsUserDoc;

  const userPatch: Record<string, unknown> = {
    namaLengkap: cleanNama,
    role: input.role,
    active: Boolean(input.active),
    bagianId: cleanBagianId ? cleanBagianId : deleteField(),
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(userRef, userPatch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${input.id}`);
  }

  const adminRef = doc(db, 'admins', input.id);
  try {
    if (input.role === 'Superadmin' && input.active) {
      await setDoc(adminRef, {
        uid: input.id,
        email: existingUser.email,
        createdAt: serverTimestamp(),
      });
    } else if (input.id !== currentUser.id) {
      const admSnap = await getDoc(adminRef);
      if (admSnap.exists()) {
        await deleteDoc(adminRef);
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `admins/${input.id}`);
  }
}

export async function changeCurrentUserPassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const current = auth.currentUser;
  if (!current || !current.email) {
    throw new Error('Sesi login tidak ditemukan.');
  }
  if (!currentPassword) {
    throw new Error('Password saat ini wajib diisi.');
  }
  if (newPassword.length < 6) {
    throw new Error('Password baru minimal 6 karakter.');
  }
  try {
    const credential = EmailAuthProvider.credential(current.email, currentPassword);
    await reauthenticateWithCredential(current, credential);
    await updatePassword(current, newPassword);
  } catch (err) {
    throw new Error(mapFirebaseAuthError(err));
  }
}

export async function deleteUserAccount(
  currentUser: UserProfile,
  targetId: string
): Promise<void> {
  if (currentUser.role !== 'Superadmin') {
    throw new Error('Hanya Superadmin yang dapat menghapus user.');
  }
  if (targetId === currentUser.id) {
    throw new Error('Tidak dapat menghapus akun Anda sendiri yang sedang login.');
  }

  const userRef = doc(db, 'users', targetId);
  try {
    await deleteDoc(userRef);
    const admRef = doc(db, 'admins', targetId);
    const admSnap = await getDoc(admRef);
    if (admSnap.exists()) {
      await deleteDoc(admRef);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${targetId}`);
  }
}
