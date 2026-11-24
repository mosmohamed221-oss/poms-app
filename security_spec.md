# POMS V3 Security Specification & Rules TDD

## 1. Core Data Invariants
1. **Employee Identity & RBAC**: Every authenticated employee account (`/employees/{uid}`) requires a verified email (`request.auth.token.email_verified == true`). Role escalation is blocked: a non-admin cannot assign themselves `super_admin` or modify their own `role`/`status`/`permissions`.
2. **Public Self-Registration Isolation (`/register`)**: Unauthenticated citizens may create a citizen submission ONLY with `reviewStatus == 'بانتظار المراجعة'`, `registrationSource == 'بوابة المواطن'`, `registeredByUid == 'public'`, and an atomic entry in `/national_id_registry/{nationalId}`. Public users can NEVER read, list, update, or delete `/citizens` or `/citizen_documents`.
3. **National ID Uniqueness Without PII Leaks**: `/national_id_registry/{nationalId}` contains zero PII (only `createdAt`), permits single-doc `get` for duplicate checks, and strictly forbids `list` queries (`allow list: if false`).
4. **Private ID Card Document Isolation**: `/citizen_documents/{docId}` stores front/back National ID images with strict MIME/size bounds (`<= 400000` chars) and is readable only by authorized staff (`super_admin`, `reception`, `followup`)—never by `printing` or public users.
5. **Immutable Audit & Request History**: `/audit_logs` and `/request_history` are append-only; updates and deletes are strictly forbidden (`allow update, delete: if false`).
6. **Temporal & Key Strictness**: All writes enforce `isValidId()` on document keys, `request.time` on `createdAt`/`updatedAt`, strict `.size()` bounds on all strings, and `hasAll`/`hasOnly` allowlists.

## 2. "Dirty Dozen" Adversarial Payloads
1. Unauthenticated `list` on `/citizens` -> `PERMISSION_DENIED`.
2. Unauthenticated `get` on `/citizen_documents/{id}` -> `PERMISSION_DENIED`.
3. Public citizen creation with `reviewStatus: 'بيانات كاملة'` (bypassing review queue) -> `PERMISSION_DENIED`.
4. Public citizen creation with invalid 10-digit `nationalId` -> `PERMISSION_DENIED`.
5. Public citizen creation without atomic `/national_id_registry/{nationalId}` write -> `PERMISSION_DENIED`.
6. Employee creating `/employees/{uid}` with `role: 'super_admin'` without a matching Super Admin invite -> `PERMISSION_DENIED`.
7. Reception employee attempting `get` or `list` on `/archive_documents` -> `PERMISSION_DENIED`.
8. Printing employee attempting `get` on `/citizen_documents/{id}` -> `PERMISSION_DENIED`.
9. Printing employee attempting `create` or `delete` on `/letter_templates` -> `PERMISSION_DENIED`.
10. Shadow update adding `ghostField: true` to `/requests/{id}` -> `PERMISSION_DENIED`.
11. Spoofed timestamp (`createdAt: '2020-01-01T00:00:00Z'`) on any create -> `PERMISSION_DENIED`.
12. Attempt to `update` or `delete` an `/audit_logs/{id}` entry -> `PERMISSION_DENIED`.
