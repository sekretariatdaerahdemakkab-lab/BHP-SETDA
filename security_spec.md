# Security Specification - SIP-BHP SETDA DEMAK

## 1. Data Invariants
1. Every document ID path variable must satisfy `^[a-zA-Z0-9_-]+$` and length 1..128.
2. Users cannot read or enumerate another user's private profile (`users/{userId}`) or invites (`user_invites/{inviteId}`) unless they are an authenticated Superadmin (`isAdmin()`).
3. Users cannot self-assign `role: "Superadmin"` or elevate privileges; first-time profile creation for non-admins must match an active `/user_invites/{inviteId}` record provisioned by an Admin for `request.auth.token.email`.
4. Only verified users (`request.auth.token.email_verified == true`) with an active staff profile (`isActiveStaff()`) may read or write operational data.
5. `ownerId` and `createdAt` fields are immutable after document creation; `updatedAt` must equal `request.time`.
6. Multi-warehouse RBAC isolation: `Admin Persediaan` and `Operator Bagian` can only query, create, update, and delete `plafon_anggaran`, `transaksi_persediaan`, `kartu_persediaan`, and `rekon_periode` where `bagianId == userDoc().bagianId`.
7. Period freeze lock: `rekon_periode` with status `Disetujui` or `Dikirim` cannot be modified or unlocked by `Admin Persediaan`; only `Superadmin` or `Pengurus Barang` (`isCentralStaff()`) can approve or unlock periods.

## 2. Dirty Dozen Attack Payloads
1. Unauthenticated read on `/users/u1` or `/transaksi_persediaan/t1` -> PERMISSION_DENIED
2. Non-owner read on `/users/u2` -> PERMISSION_DENIED
3. Unverified email write on `/users/u1` -> PERMISSION_DENIED
4. Self-elevation (`role: "Superadmin"`) on `/users/u1` create without matching invite -> PERMISSION_DENIED
5. Shadow field injection (`isVerified: true`) on `/bagian/b1` or `/transaksi_persediaan/t1` -> PERMISSION_DENIED
6. Oversized document ID (>128 chars) on `/barang/{id}` -> PERMISSION_DENIED
7. Invalid ID character (`bad/id` or `bad$id`) -> PERMISSION_DENIED
8. Type poisoning (`hargaStandar: "gratis"` or `qty: -5`) -> PERMISSION_DENIED
9. Changing `ownerId` during update on `/bagian/b1` or `/plafon_anggaran/p1` -> PERMISSION_DENIED
10. Cross-bagian access (`bagianId: "bag-hk"` queried or written by `bag-um` user) -> PERMISSION_DENIED
11. `Admin Persediaan` unlocking a `Disetujui` `rekon_periode` -> PERMISSION_DENIED
12. Modifying `/admins/{uid}` by non-admin -> PERMISSION_DENIED
