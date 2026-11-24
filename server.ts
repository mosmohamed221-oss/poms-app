import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  OFFICE_BASE_DIR,
  buildFolderTree,
  buildOfficeZipBuffer,
  buildProjectSourceZipBuffer,
  computeStorageStats,
  hashPassword,
  loadStore,
  resolveInsideOffice,
  saveArchiveBinaryFile,
  saveCitizenIdCardFile,
  saveStore,
  verifyPassword,
  type StoredEmployee,
  type StoredCitizen,
  type StoredRequest,
  type StoredMinistry,
  type StoredNotification,
} from './server/storage.ts';

const PORT = Number(process.env.PORT) || 3000;
const TOKEN_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SESSION_COOKIE_NAME = 'poms_session';

const ALL_ADMIN_PERMISSIONS = [
  'dashboard.manager',
  'citizens.view',
  'citizens.create',
  'citizens.edit',
  'citizens.review',
  'citizens.delete',
  'citizens.export',
  'citizens.view_id_cards',
  'requests.view',
  'requests.create',
  'requests.update',
  'requests.delete',
  'ministries.view',
  'ministries.manage',
  'archive.view',
  'archive.upload',
  'archive.delete',
  'letters.design',
  'letters.templates',
  'printing.execute',
  'employees.manage',
  'reports.view',
  'reports.export',
  'settings.manage',
];

interface AuthedRequest extends Request {
  employee?: StoredEmployee;
}

// Simple in-memory login rate limiter
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(
  bucketMap: Map<string, { count: number; resetAt: number }>,
  key: string,
  maxAttempts: number,
  windowMs = 15 * 60 * 1000
): boolean {
  const now = Date.now();
  const entry = bucketMap.get(key);
  if (!entry || now > entry.resetAt) {
    bucketMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxAttempts) {
    return false;
  }
  entry.count += 1;
  return true;
}

const publicActionAttempts = new Map<string, { count: number; resetAt: number }>();

function safeEqualSecret(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a, 'utf-8').digest();
  const hb = crypto.createHash('sha256').update(b, 'utf-8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

function sanitizeImportRow(raw: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = Object.create(null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    out[k] = v;
  }
  return out;
}

function signAuthToken(uid: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid, exp: Date.now() + TOKEN_TTL_MS }),
    'utf-8'
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function isHttpsRequest(req: Request): boolean {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return req.secure || proto === 'https';
}

function parseCookies(req: Request): Record<string, string> {
  const raw = req.headers.cookie;
  const result: Record<string, string> = Object.create(null);
  if (!raw) return result;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const maxAge = Math.floor(TOKEN_TTL_MS / 1000);
  const base = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly`;
  if (isHttpsRequest(req)) {
    res.setHeader('Set-Cookie', `${base}; Secure; SameSite=None; Partitioned`);
  } else {
    res.setHeader('Set-Cookie', `${base}; SameSite=Lax`);
  }
}

function clearSessionCookie(req: Request, res: Response): void {
  const base = `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly`;
  if (isHttpsRequest(req)) {
    res.setHeader('Set-Cookie', `${base}; Secure; SameSite=None; Partitioned`);
  } else {
    res.setHeader('Set-Cookie', `${base}; SameSite=Lax`);
  }
}

function verifyCookieCsrf(req: Request): boolean {
  if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
    return false;
  }
  const origin = req.headers.origin;
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      const expectedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
        .split(',')[0]
        .trim();
      if (!expectedHost || originHost !== expectedHost) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

function verifyAuthToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      uid: string;
      exp: number;
    };
    if (!parsed.uid || Date.now() > parsed.exp) return null;
    return parsed.uid;
  } catch {
    return null;
  }
}

function sanitizeEmployee(emp: StoredEmployee) {
  const { passwordHash: _ignored, ...safe } = emp;
  return safe;
}

function sanitizeDirectoryEmployee(emp: StoredEmployee) {
  return {
    id: emp.id,
    uid: emp.uid,
    username: emp.username,
    fullName: emp.fullName,
    phone: '',
    nationalId: '',
    jobTitle: emp.jobTitle,
    department: emp.department,
    role: emp.role,
    permissions: [],
    status: emp.status,
    activeSeconds: 0,
    citizensRegisteredCount: 0,
    requestsCreatedCount: 0,
    lettersCreatedCount: 0,
    printsCount: 0,
    completedRequestsCount: 0,
    createdAt: emp.createdAt,
    updatedAt: emp.updatedAt,
  };
}

function hasPerm(emp: StoredEmployee, perm: string): boolean {
  if (emp.role === 'super_admin') return true;
  return emp.permissions.includes(perm);
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'يرجى تسجيل الدخول أولاً.' });
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  const uid = verifyAuthToken(token);
  if (!uid) {
    res.status(401).json({ error: 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.' });
    return;
  }
  const store = loadStore();
  const emp = store.employees.find((e) => e.uid === uid);
  if (!emp || emp.status !== 'active') {
    res.status(403).json({ error: 'الحساب غير نشط أو غير موجود.' });
    return;
  }
  req.employee = emp;
  next();
}

function requirePerm(perm: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.employee || !hasPerm(req.employee, perm)) {
      res.status(403).json({ error: 'لا تملك صلاحية تنفيذ هذا الإجراء.' });
      return;
    }
    next();
  };
}

function requireAnyPerm(perms: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.employee || !perms.some((p) => hasPerm(req.employee!, p))) {
      res.status(403).json({ error: 'لا تملك صلاحية تنفيذ هذا الإجراء.' });
      return;
    }
    next();
  };
}

function appendAudit(
  store: ReturnType<typeof loadStore>,
  actorUid: string,
  actorName: string,
  action: string,
  targetType: string,
  targetId: string,
  details: string
) {
  store.auditLogs.unshift({
    id: crypto.randomUUID(),
    actorUid,
    actorName,
    action: action.slice(0, 100),
    targetType: targetType.slice(0, 60),
    targetId: targetId.slice(0, 128),
    details: details.slice(0, 500),
    createdAt: new Date().toISOString(),
  });
  if (store.auditLogs.length > 500) {
    store.auditLogs = store.auditLogs.slice(0, 500);
  }
}

function pushNotification(
  store: ReturnType<typeof loadStore>,
  params: {
    recipient: StoredEmployee;
    sender: StoredEmployee;
    category: StoredNotification['category'];
    priority?: StoredNotification['priority'];
    title: string;
    message: string;
    targetSection: string;
    targetRef?: string;
  }
) {
  if (!store.notifications) store.notifications = [];
  store.notifications.unshift({
    id: crypto.randomUUID(),
    recipientUid: params.recipient.uid,
    recipientName: params.recipient.fullName,
    senderUid: params.sender.uid,
    senderName: params.sender.fullName,
    senderJobTitle: params.sender.jobTitle,
    category: params.category,
    priority: params.priority || 'عادي',
    title: params.title.slice(0, 140),
    message: params.message.slice(0, 600),
    targetSection: params.targetSection,
    targetRef: params.targetRef ? params.targetRef.slice(0, 120) : '',
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString(),
  });
  if (store.notifications.length > 500) {
    store.notifications = store.notifications.slice(0, 500);
  }
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=()');
    next();
  });
  app.use(express.json({ limit: '15mb' }));

  // Ensure initial folders & empty Excel files exist immediately on boot
  loadStore();

  // --- Auth & Bootstrap Routes ---
  app.get('/api/auth/bootstrap-status', (_req, res) => {
    const store = loadStore();
    const envPasscodeSet = Boolean(process.env.ADMIN_PASSCODE?.trim());
    res.json({
      needsSetup: store.employees.length === 0 && !envPasscodeSet,
      envPasscodeActive: store.employees.length === 0 && envPasscodeSet,
    });
  });

  app.post('/api/auth/setup-admin', (req, res) => {
    const store = loadStore();
    if (store.employees.length > 0 || process.env.ADMIN_PASSCODE?.trim()) {
      res.status(409).json({ error: 'تم إعداد حساب مدير المكتب مسبقاً.' });
      return;
    }
    const { username, password, fullName, jobTitle, phone } = req.body as {
      username?: string;
      password?: string;
      fullName?: string;
      jobTitle?: string;
      phone?: string;
    };
    const cleanUser = (username || '').trim().toLowerCase();
    if (cleanUser.length < 2 || /[\s\\/:*?"<>|]/.test(cleanUser)) {
      res.status(400).json({ error: 'اسم المستخدم يجب أن يكون حرفين على الأقل بدون مسافات.' });
      return;
    }
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.' });
      return;
    }
    const now = new Date().toISOString();
    const uid = crypto.randomUUID();
    const adminEmp: StoredEmployee = {
      id: uid,
      uid,
      username: cleanUser,
      passwordHash: hashPassword(password),
      fullName: (fullName || 'مدير المكتب').trim(),
      phone: (phone || '').trim(),
      jobTitle: (jobTitle || 'مدير مكتب النائب محمد كليب').trim(),
      department: 'الإدارة العليا',
      role: 'super_admin',
      permissions: ALL_ADMIN_PERMISSIONS,
      status: 'active',
      activeSeconds: 0,
      citizensRegisteredCount: 0,
      requestsCreatedCount: 0,
      lettersCreatedCount: 0,
      printsCount: 0,
      completedRequestsCount: 0,
      lastActivityLabel: 'إعداد وتفعيل حساب مدير المكتب',
      lastLoginAt: now,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    };
    store.employees.push(adminEmp);
    appendAudit(store, uid, adminEmp.fullName, 'إعداد مدير المكتب الأول', 'employee', uid, `إنشاء حساب ${cleanUser}`);
    saveStore(store);

    const token = signAuthToken(uid);
    setSessionCookie(req, res, token);
    res.json({ token, employee: sanitizeEmployee(adminEmp) });
  });

  app.post('/api/auth/login', (req, res) => {
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(loginAttempts, ip, 20)) {
      res.status(429).json({ error: 'تم تجاوز الحد المسموح من محاولات الدخول. يرجى الانتظار 15 دقيقة.' });
      return;
    }
    const { username, password } = req.body as { username?: string; password?: string };
    const cleanUser = (username || '').trim().toLowerCase();
    if (!cleanUser || !password) {
      res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور.' });
      return;
    }

    const store = loadStore();
    const envPasscode = process.env.ADMIN_PASSCODE?.trim();
    let emp = store.employees.find((e) => e.username.toLowerCase() === cleanUser);

    if (envPasscode && cleanUser === 'admin' && safeEqualSecret(password, envPasscode)) {
      if (!emp) {
        const now = new Date().toISOString();
        const uid = crypto.randomUUID();
        emp = {
          id: uid,
          uid,
          username: 'admin',
          passwordHash: hashPassword(envPasscode),
          fullName: 'مدير المكتب',
          jobTitle: 'مدير مكتب النائب محمد كليب',
          department: 'الإدارة العليا',
          role: 'super_admin',
          permissions: ALL_ADMIN_PERMISSIONS,
          status: 'active',
          activeSeconds: 0,
          citizensRegisteredCount: 0,
          requestsCreatedCount: 0,
          lettersCreatedCount: 0,
          printsCount: 0,
          completedRequestsCount: 0,
          lastActivityLabel: 'تسجيل دخول مدير المكتب',
          lastLoginAt: now,
          lastActivityAt: now,
          createdAt: now,
          updatedAt: now,
        };
        store.employees.push(emp);
      }
    } else {
      if (!emp || !verifyPassword(password, emp.passwordHash)) {
        res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
        return;
      }
    }

    if (emp.status !== 'active') {
      res.status(403).json({ error: 'تم تعطيل هذا الحساب. يرجى التواصل مع مدير المكتب.' });
      return;
    }

    const now = new Date().toISOString();
    emp.lastLoginAt = now;
    emp.lastActivityAt = now;
    emp.lastActivityLabel = 'تسجيل دخول إلى النظام';
    emp.updatedAt = now;
    appendAudit(store, emp.uid, emp.fullName, 'تسجيل دخول', 'session', emp.uid, `دخول الموظف (${emp.username})`);
    saveStore(store);

    const token = signAuthToken(emp.uid);
    setSessionCookie(req, res, token);
    res.json({ token, employee: sanitizeEmployee(emp) });
  });

  app.post('/api/auth/session', (req, res) => {
    if (!verifyCookieCsrf(req)) {
      res.status(403).json({ error: 'طلب غير مصرح به.' });
      return;
    }
    const cookies = parseCookies(req);
    const cookieToken = cookies[SESSION_COOKIE_NAME];
    if (!cookieToken) {
      res.json({ authenticated: false, token: null, employee: null });
      return;
    }
    const uid = verifyAuthToken(cookieToken);
    if (!uid) {
      clearSessionCookie(req, res);
      res.json({ authenticated: false, token: null, employee: null });
      return;
    }
    const store = loadStore();
    const emp = store.employees.find((e) => e.uid === uid);
    if (!emp || emp.status !== 'active') {
      clearSessionCookie(req, res);
      res.json({ authenticated: false, token: null, employee: null });
      return;
    }
    const refreshedToken = signAuthToken(emp.uid);
    setSessionCookie(req, res, refreshedToken);
    res.json({
      authenticated: true,
      token: refreshedToken,
      employee: sanitizeEmployee(emp),
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({ employee: sanitizeEmployee(req.employee!) });
  });

  app.post('/api/auth/heartbeat', requireAuth, (req: AuthedRequest, res) => {
    const store = loadStore();
    const emp = store.employees.find((e) => e.uid === req.employee!.uid);
    if (emp) {
      emp.activeSeconds = (emp.activeSeconds || 0) + 60;
      emp.lastActivityAt = new Date().toISOString();
      emp.updatedAt = new Date().toISOString();
      saveStore(store);
      res.json({ activeSeconds: emp.activeSeconds });
      return;
    }
    res.status(404).json({ error: 'غير موجود' });
  });

  app.post('/api/auth/logout', (req: AuthedRequest, res) => {
    const header = req.headers.authorization;
    const cookies = parseCookies(req);
    const rawToken =
      header && header.startsWith('Bearer ')
        ? header.slice('Bearer '.length).trim()
        : verifyCookieCsrf(req)
          ? cookies[SESSION_COOKIE_NAME]
          : undefined;
    if (rawToken) {
      const uid = verifyAuthToken(rawToken);
      if (uid) {
        const store = loadStore();
        const emp = store.employees.find((e) => e.uid === uid);
        if (emp) {
          appendAudit(store, emp.uid, emp.fullName, 'تسجيل خروج', 'session', emp.uid, 'تسجيل خروج');
          saveStore(store);
        }
      }
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  // --- Public Portal Routes (/register) ---
  app.get('/api/public/districts', (_req, res) => {
    const store = loadStore();
    res.json({ customDistricts: store.customDistricts });
  });

  app.post('/api/public/districts', (req, res) => {
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(publicActionAttempts, `dist_${ip}`, 30)) {
      res.status(429).json({ error: 'تم تجاوز الحد المسموح. يرجى المحاولة لاحقاً.' });
      return;
    }
    const { governorate, district } = req.body as { governorate?: string; district?: string };
    const gov = (governorate || '').trim();
    const dist = (district || '').trim();
    if (!gov || !dist || dist.length > 80) {
      res.status(400).json({ error: 'اسم المحافظة أو القسم غير صالح.' });
      return;
    }
    const store = loadStore();
    const existing = store.customDistricts[gov] || [];
    if (!existing.includes(dist)) {
      store.customDistricts[gov] = [...existing, dist];
      saveStore(store);
    }
    res.json({ customDistricts: store.customDistricts });
  });

  app.get('/api/public/check-nid/:nid', (req, res) => {
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(publicActionAttempts, `nid_${ip}`, 60)) {
      res.status(429).json({ error: 'تم تجاوز الحد المسموح من المحاولات.' });
      return;
    }
    const nid = String(req.params.nid || '').trim();
    if (!/^[0-9]{14}$/.test(nid)) {
      res.json({ exists: false });
      return;
    }
    const store = loadStore();
    const exists = store.citizens.some((c) => c.nationalId === nid);
    res.json({ exists });
  });

  app.post('/api/public/register', (req, res) => {
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(publicActionAttempts, `reg_${ip}`, 15)) {
      res.status(429).json({ error: 'تم تسجيل عدد كبير من الطلبات. يرجى الانتظار قليلاً.' });
      return;
    }
    const body = req.body as {
      fullName?: string;
      age?: number;
      nationalId?: string;
      phone?: string;
      whatsapp?: string;
      governorate?: string;
      center?: string;
      village?: string;
      detailedAddress?: string;
      requestType?: string;
      requestDescription?: string;
      frontIdDataUrl?: string;
      backIdDataUrl?: string;
    };

    const fullName = String(body.fullName || '').trim();
    const nid = (body.nationalId || '').trim();
    const phone = (body.phone || '').trim();
    const ageNum = Number(body.age);
    if (fullName.length < 4 || fullName.length > 120) {
      res.status(400).json({ error: 'يرجى إدخال الاسم الرباعي بشكل صحيح.' });
      return;
    }
    if (!Number.isFinite(ageNum) || ageNum < 15 || ageNum > 110) {
      res.status(400).json({ error: 'يرجى إدخال سن صحيح بين 15 و 110 عاماً.' });
      return;
    }
    if (!/^[0-9]{14}$/.test(nid)) {
      res.status(400).json({ error: 'الرقم القومي يجب أن يتكون من 14 رقماً.' });
      return;
    }
    if (!/^[0-9]{11}$/.test(phone)) {
      res.status(400).json({ error: 'رقم الهاتف يجب أن يتكون من 11 رقماً.' });
      return;
    }

    const store = loadStore();
    if (store.citizens.some((c) => c.nationalId === nid)) {
      res.status(409).json({ error: 'هذا الرقم القومي مسجل بالفعل في النظام.' });
      return;
    }

    const now = new Date().toISOString();
    const nextSeq = store.citizens.length > 0 ? Math.max(...store.citizens.map((c) => c.seqNumber)) + 1 : 1;
    const year = new Date().getFullYear();
    const seqPad = String(nextSeq).padStart(5, '0');
    const registrationNumber = `REG-${year}-${seqPad}`;
    const requestNumber = `REQ-${year}-${seqPad}`;

    const citizenId = crypto.randomUUID();
    const newCitizen: StoredCitizen = {
      id: citizenId,
      seqNumber: nextSeq,
      registrationNumber,
      fullName: (body.fullName || '').trim().slice(0, 120),
      age: Number(body.age) || 30,
      nationalId: nid,
      phone,
      whatsapp: (body.whatsapp || phone).trim(),
      governorate: (body.governorate || '').trim(),
      center: (body.center || '').trim(),
      village: (body.village || '').trim(),
      detailedAddress: (body.detailedAddress || '').trim(),
      reviewStatus: 'بانتظار المراجعة',
      registrationSource: 'بوابة المواطن',
      registeredByUid: 'public',
      registeredByName: 'التسجيل الذاتي للمواطن',
      initialRequestType: (body.requestType || 'طلب').trim(),
      initialRequestDescription: (body.requestDescription || '').trim(),
      hasFrontId: Boolean(body.frontIdDataUrl),
      hasBackId: Boolean(body.backIdDataUrl),
      createdAt: now,
      updatedAt: now,
    };

    store.citizens.unshift(newCitizen);

    if (body.frontIdDataUrl) {
      const relPath = saveCitizenIdCardFile(newCitizen, 'front', body.frontIdDataUrl);
      store.citizenDocs.push({
        id: `${citizenId}_front`,
        citizenId,
        docType: 'front_id',
        mimeType: 'image/jpeg',
        fileName: 'البطاقة_الأمامية.jpg',
        fileSize: body.frontIdDataUrl.length,
        relPath,
        uploadedByUid: 'public',
        createdAt: now,
      });
    }

    if (body.backIdDataUrl) {
      const relPath = saveCitizenIdCardFile(newCitizen, 'back', body.backIdDataUrl);
      store.citizenDocs.push({
        id: `${citizenId}_back`,
        citizenId,
        docType: 'back_id',
        mimeType: 'image/jpeg',
        fileName: 'البطاقة_الخلفية.jpg',
        fileSize: body.backIdDataUrl.length,
        relPath,
        uploadedByUid: 'public',
        createdAt: now,
      });
    }

    const reqId = crypto.randomUUID();
    const newReq: StoredRequest = {
      id: reqId,
      requestNumber,
      direction: 'وارد',
      waredNumber: `WAR-${year}-${seqPad}`,
      requestType: (body.requestType || 'طلب').trim(),
      title: `${body.requestType || 'طلب'} - ${newCitizen.fullName}`,
      description: (body.requestDescription || '').trim(),
      citizenId,
      citizenName: newCitizen.fullName,
      citizenNationalId: nid,
      citizenPhone: phone,
      status: 'جديد',
      priority: 'عادي',
      createdByUid: 'public',
      createdByName: 'بوابة التسجيل الذاتي',
      submissionDate: now.slice(0, 10),
      readyForPrint: false,
      createdAt: now,
      updatedAt: now,
    };
    store.requests.unshift(newReq);
    store.requestHistory.unshift({
      id: crypto.randomUUID(),
      requestId: reqId,
      requestNumber,
      fromStatus: 'مسودة',
      toStatus: 'جديد',
      actionNote: 'تسجيل الطلب الأولي عبر بوابة التسجيل الذاتي للمواطنين',
      actorUid: 'public',
      actorName: newCitizen.fullName,
      createdAt: now,
    });
    appendAudit(store, 'public', newCitizen.fullName, 'تسجيل مواطن ذاتياً', 'citizen', citizenId, `رقم التسجيل ${registrationNumber}`);
    saveStore(store);

    res.json({ registrationNumber, requestNumber, fullName: newCitizen.fullName });
  });

  // --- Protected ERP Data Route ---
  app.get('/api/data', requireAuth, (req: AuthedRequest, res) => {
    const store = loadStore();
    const emp = req.employee!;
    const myNotifications = (store.notifications || []).filter((n) => n.recipientUid === emp.uid);
    const canManageEmps = hasPerm(emp, 'employees.manage');
    res.json({
      citizens: hasPerm(emp, 'citizens.view') ? store.citizens : [],
      requests: hasPerm(emp, 'requests.view') ? store.requests : [],
      requestHistory: hasPerm(emp, 'requests.view') ? store.requestHistory : [],
      ministries: hasPerm(emp, 'ministries.view') ? store.ministries : [],
      employees: canManageEmps
        ? store.employees.map(sanitizeEmployee)
        : store.employees.map(sanitizeDirectoryEmployee),
      archiveDocs: hasPerm(emp, 'archive.view') ? store.archiveDocs : [],
      letterTemplates: store.letterTemplates,
      printedDocs: store.printedDocs,
      notifications: myNotifications,
      auditLogs: emp.role === 'super_admin' || hasPerm(emp, 'settings.manage') ? store.auditLogs : [],
      officeSettings: store.officeSettings,
      customDistricts: store.customDistricts,
      officeBaseDir: OFFICE_BASE_DIR,
      storageStats: hasPerm(emp, 'archive.view') || hasPerm(emp, 'settings.manage') ? computeStorageStats() : null,
    });
  });

  // --- Employee Notifications & Work Assignments ---
  app.get('/api/notifications', requireAuth, (req: AuthedRequest, res) => {
    const store = loadStore();
    const myNotifications = (store.notifications || []).filter((n) => n.recipientUid === req.employee!.uid);
    res.json({
      notifications: myNotifications,
      unreadCount: myNotifications.filter((n) => !n.isRead).length,
    });
  });

  app.post('/api/notifications/send', requireAuth, (req: AuthedRequest, res) => {
    const store = loadStore();
    const sender = store.employees.find((e) => e.uid === req.employee!.uid)!;
    const b = req.body as {
      recipientUid?: string;
      title?: string;
      message?: string;
      priority?: StoredNotification['priority'];
      targetSection?: string;
      targetRef?: string;
      category?: StoredNotification['category'];
    };
    const recipient = store.employees.find((e) => e.uid === b.recipientUid);
    if (!recipient || recipient.status !== 'active') {
      res.status(404).json({ error: 'الموظف المستلم غير موجود أو حسابه معطل.' });
      return;
    }
    if (!b.title?.trim() || !b.message?.trim()) {
      res.status(400).json({ error: 'يرجى كتابة عنوان التكليف وتفاصيل العمل المطلوب.' });
      return;
    }
    pushNotification(store, {
      recipient,
      sender,
      category: b.category || 'direct_task',
      priority: b.priority || 'عادي',
      title: b.title.trim(),
      message: b.message.trim(),
      targetSection: b.targetSection || 'requests',
      targetRef: (b.targetRef || '').trim(),
    });
    const now = new Date().toISOString();
    sender.lastActivityAt = now;
    sender.lastActivityLabel = `إرسال تكليف عمل إلى ${recipient.fullName}`;
    appendAudit(store, sender.uid, sender.fullName, 'إرسال إشعار عمل لموظف', 'notification', recipient.uid, `${recipient.fullName}: ${b.title.trim()}`);
    saveStore(store);
    res.json({ ok: true, notification: store.notifications[0] });
  });

  app.post('/api/notifications/:id/read', requireAuth, (req: AuthedRequest, res) => {
    const store = loadStore();
    const idx = (store.notifications || []).findIndex(
      (n) => n.id === req.params.id && n.recipientUid === req.employee!.uid
    );
    if (idx >= 0) {
      store.notifications[idx] = {
        ...store.notifications[idx],
        isRead: true,
        readAt: new Date().toISOString(),
      };
      saveStore(store);
    }
    res.json({ ok: true });
  });

  app.post('/api/notifications/read-all', requireAuth, (req: AuthedRequest, res) => {
    const store = loadStore();
    const now = new Date().toISOString();
    store.notifications = (store.notifications || []).map((n) =>
      n.recipientUid === req.employee!.uid && !n.isRead
        ? { ...n, isRead: true, readAt: now }
        : n
    );
    saveStore(store);
    res.json({ ok: true });
  });

  // --- Citizens CRUD ---
  app.post('/api/citizens', requireAuth, requirePerm('citizens.create'), (req: AuthedRequest, res) => {
    const store = loadStore();
    const emp = store.employees.find((e) => e.uid === req.employee!.uid)!;
    const b = req.body as Record<string, unknown>;
    const nid = String(b.nationalId || '').trim();
    const phone = String(b.phone || '').trim();
    if (!/^[0-9]{14}$/.test(nid)) {
      res.status(400).json({ error: 'الرقم القومي يجب أن يتكون من 14 رقماً.' });
      return;
    }
    if (!/^[0-9]{11}$/.test(phone)) {
      res.status(400).json({ error: 'رقم الهاتف يجب أن يتكون من 11 رقماً.' });
      return;
    }
    if (store.citizens.some((c) => c.nationalId === nid)) {
      res.status(409).json({ error: 'هذا الرقم القومي مسجل بالفعل.' });
      return;
    }

    const now = new Date().toISOString();
    const nextSeq = store.citizens.length > 0 ? Math.max(...store.citizens.map((c) => c.seqNumber)) + 1 : 1;
    const regNo = `REG-${new Date().getFullYear()}-${String(nextSeq).padStart(5, '0')}`;
    const citizenId = crypto.randomUUID();

    const newCitizen: StoredCitizen = {
      id: citizenId,
      seqNumber: nextSeq,
      registrationNumber: regNo,
      fullName: String(b.fullName || '').trim(),
      age: Number(b.age) || 30,
      nationalId: nid,
      phone,
      whatsapp: String(b.whatsapp || phone).trim(),
      governorate: String(b.governorate || '').trim(),
      center: String(b.center || '').trim(),
      village: String(b.village || '').trim(),
      detailedAddress: String(b.detailedAddress || '').trim(),
      reviewStatus: String(b.reviewStatus || 'بيانات كاملة'),
      registrationSource: (b.registrationSource as StoredCitizen['registrationSource']) || 'استقبال المكتب',
      registeredByUid: emp.uid,
      registeredByName: emp.fullName,
      reviewNotes: String(b.reviewNotes || '').trim(),
      hasFrontId: Boolean(b.frontIdDataUrl),
      hasBackId: Boolean(b.backIdDataUrl),
      createdAt: now,
      updatedAt: now,
    };
    store.citizens.unshift(newCitizen);

    if (typeof b.frontIdDataUrl === 'string' && b.frontIdDataUrl) {
      const relPath = saveCitizenIdCardFile(newCitizen, 'front', b.frontIdDataUrl);
      store.citizenDocs.push({
        id: `${citizenId}_front`,
        citizenId,
        docType: 'front_id',
        mimeType: 'image/jpeg',
        fileName: 'البطاقة_الأمامية.jpg',
        fileSize: b.frontIdDataUrl.length,
        relPath,
        uploadedByUid: emp.uid,
        createdAt: now,
      });
    }
    if (typeof b.backIdDataUrl === 'string' && b.backIdDataUrl) {
      const relPath = saveCitizenIdCardFile(newCitizen, 'back', b.backIdDataUrl);
      store.citizenDocs.push({
        id: `${citizenId}_back`,
        citizenId,
        docType: 'back_id',
        mimeType: 'image/jpeg',
        fileName: 'البطاقة_الخلفية.jpg',
        fileSize: b.backIdDataUrl.length,
        relPath,
        uploadedByUid: emp.uid,
        createdAt: now,
      });
    }

    emp.citizensRegisteredCount = (emp.citizensRegisteredCount || 0) + 1;
    emp.lastActivityAt = now;
    emp.lastActivityLabel = `تسجيل مواطن: ${newCitizen.fullName}`;
    appendAudit(store, emp.uid, emp.fullName, 'تسجيل مواطن جديد', 'citizen', citizenId, regNo);
    saveStore(store);

    res.json({ citizen: newCitizen });
  });

  app.post('/api/citizens/import', requireAuth, requirePerm('citizens.create'), (req: AuthedRequest, res) => {
    const store = loadStore();
    const emp = store.employees.find((e) => e.uid === req.employee!.uid)!;
    const rawRows = Array.isArray(req.body?.rows) ? (req.body.rows as unknown[]).slice(0, 3000) : [];
    const rows = rawRows.map(sanitizeImportRow);
    const now = new Date().toISOString();
    let importedCount = 0;
    let skippedCount = 0;
    let nextSeq = store.citizens.length > 0 ? Math.max(...store.citizens.map((c) => c.seqNumber)) + 1 : 1;

    for (const r of rows) {
      const nameVal = String(r['الاسم'] || r['الاسم الرباعي'] || r['fullName'] || '').trim();
      const nidVal = String(r['الرقم القومي'] || r['nationalId'] || '').replace(/\D/g, '');
      const phoneVal = String(r['الهاتف'] || r['رقم الهاتف'] || r['phone'] || '').replace(/\D/g, '');
      if (!nameVal || !/^[0-9]{14}$/.test(nidVal) || !/^[0-9]{11}$/.test(phoneVal)) {
        skippedCount++;
        continue;
      }
      if (store.citizens.some((c) => c.nationalId === nidVal)) {
        skippedCount++;
        continue;
      }
      const citizenId = crypto.randomUUID();
      const regNo = `REG-${new Date().getFullYear()}-${String(nextSeq).padStart(5, '0')}`;
      store.citizens.unshift({
        id: citizenId,
        seqNumber: nextSeq,
        registrationNumber: regNo,
        fullName: nameVal.slice(0, 120),
        age: Number(r['السن'] || r['age']) || 30,
        nationalId: nidVal,
        phone: phoneVal,
        whatsapp: phoneVal,
        governorate: String(r['المحافظة'] || r['governorate'] || 'القاهرة').trim(),
        center: String(r['القسم'] || r['المركز'] || r['center'] || 'غير محدد').trim(),
        village: '',
        detailedAddress: String(r['العنوان'] || r['العنوان التفصيلي'] || r['detailedAddress'] || 'غير محدد').trim(),
        reviewStatus: String(r['الحالة'] || r['حالة البيانات'] || 'بيانات كاملة').trim(),
        registrationSource: 'استيراد',
        registeredByUid: emp.uid,
        registeredByName: emp.fullName,
        hasFrontId: false,
        hasBackId: false,
        createdAt: now,
        updatedAt: now,
      });
      nextSeq++;
      importedCount++;
    }

    emp.citizensRegisteredCount = (emp.citizensRegisteredCount || 0) + importedCount;
    emp.lastActivityAt = now;
    emp.lastActivityLabel = `استيراد ${importedCount} مواطن`;
    appendAudit(store, emp.uid, emp.fullName, 'استيراد مواطنين', 'citizens', 'import', `تم استيراد ${importedCount} وتخطي ${skippedCount}`);
    saveStore(store);
    res.json({ importedCount, skippedCount });
  });

  app.put('/api/citizens/:id', requireAuth, (req: AuthedRequest, res) => {
    const store = loadStore();
    const emp = store.employees.find((e) => e.uid === req.employee!.uid)!;
    const idx = store.citizens.findIndex((c) => c.id === req.params.id);
    if (idx < 0) {
      res.status(404).json({ error: 'المواطن غير موجود.' });
      return;
    }
    const existing = store.citizens[idx];
    const b = req.body as Record<string, unknown>;
    const isReviewOnly = Object.keys(b).every((k) => k === 'reviewStatus' || k === 'reviewNotes');
    if (isReviewOnly && !hasPerm(emp, 'citizens.review')) {
      res.status(403).json({ error: 'لا تملك صلاحية مراجعة حالة المواطن.' });
      return;
    }
    if (!isReviewOnly && !hasPerm(emp, 'citizens.edit')) {
      res.status(403).json({ error: 'لا تملك صلاحية تعديل بيانات المواطن.' });
      return;
    }

    if (!isReviewOnly && b.phone !== undefined) {
      const cleanPhone = String(b.phone).trim();
      if (!/^[0-9]{11}$/.test(cleanPhone)) {
        res.status(400).json({ error: 'رقم الهاتف يجب أن يتكون من 11 رقماً.' });
        return;
      }
    }

    const now = new Date().toISOString();
    const updated: StoredCitizen = {
      ...existing,
      fullName: b.fullName ? String(b.fullName).trim() : existing.fullName,
      age: b.age ? Number(b.age) : existing.age,
      phone: b.phone ? String(b.phone).trim() : existing.phone,
      whatsapp: b.whatsapp !== undefined ? String(b.whatsapp).trim() : existing.whatsapp,
      governorate: b.governorate ? String(b.governorate).trim() : existing.governorate,
      center: b.center ? String(b.center).trim() : existing.center,
      village: b.village !== undefined ? String(b.village).trim() : existing.village,
      detailedAddress: b.detailedAddress ? String(b.detailedAddress).trim() : existing.detailedAddress,
      reviewStatus: b.reviewStatus ? String(b.reviewStatus) : existing.reviewStatus,
      reviewNotes: b.reviewNotes !== undefined ? String(b.reviewNotes).trim() : existing.reviewNotes,
      hasFrontId: existing.hasFrontId || Boolean(b.frontIdDataUrl),
      hasBackId: existing.hasBackId || Boolean(b.backIdDataUrl),
      updatedAt: now,
    };
    store.citizens[idx] = updated;

    if (typeof b.frontIdDataUrl === 'string' && b.frontIdDataUrl) {
      const relPath = saveCitizenIdCardFile(updated, 'front', b.frontIdDataUrl);
      const docIdx = store.citizenDocs.findIndex((d) => d.id === `${updated.id}_front`);
      const docItem = {
        id: `${updated.id}_front`,
        citizenId: updated.id,
        docType: 'front_id' as const,
        mimeType: 'image/jpeg',
        fileName: 'البطاقة_الأمامية.jpg',
        fileSize: b.frontIdDataUrl.length,
        relPath,
        uploadedByUid: emp.uid,
        createdAt: now,
      };
      if (docIdx >= 0) store.citizenDocs[docIdx] = docItem;
      else store.citizenDocs.push(docItem);
    }
    if (typeof b.backIdDataUrl === 'string' && b.backIdDataUrl) {
      const relPath = saveCitizenIdCardFile(updated, 'back', b.backIdDataUrl);
      const docIdx = store.citizenDocs.findIndex((d) => d.id === `${updated.id}_back`);
      const docItem = {
        id: `${updated.id}_back`,
        citizenId: updated.id,
        docType: 'back_id' as const,
        mimeType: 'image/jpeg',
        fileName: 'البطاقة_الخلفية.jpg',
        fileSize: b.backIdDataUrl.length,
        relPath,
        uploadedByUid: emp.uid,
        createdAt: now,
      };
      if (docIdx >= 0) store.citizenDocs[docIdx] = docItem;
      else store.citizenDocs.push(docItem);
    }

    emp.lastActivityAt = now;
    emp.lastActivityLabel = `تحديث بيانات المواطن ${updated.fullName}`;
    appendAudit(store, emp.uid, emp.fullName, 'تحديث بيانات مواطن', 'citizen', updated.id, `${updated.registrationNumber} -> ${updated.reviewStatus}`);
    saveStore(store);

    res.json({ citizen: updated });
  });

  app.get('/api/citizens/:id/documents', requireAuth, requirePerm('citizens.view_id_cards'), (req: AuthedRequest, res) => {
    const store = loadStore();
    const docs = store.citizenDocs.filter((d) => d.citizenId === req.params.id);
    const result: { front?: string; back?: string } = {};
    for (const d of docs) {
      const absPath = resolveInsideOffice(d.relPath);
      if (fs.existsSync(absPath)) {
        const b64 = fs.readFileSync(absPath).toString('base64');
        const dataUrl = `data:${d.mimeType};base64,${b64}`;
        if (d.docType === 'front_id') result.front = dataUrl;
        else result.back = dataUrl;
      }
    }
    appendAudit(store, req.employee!.uid, req.employee!.fullName, 'استعراض صور البطاقة القومية', 'citizen', String(req.params.id), 'وصول مصرح به لصور البطاقة');
    saveStore(store);
    res.json(result);
  });

  app.delete('/api/citizens/:id', requireAuth, requirePerm('citizens.delete'), (req: AuthedRequest, res) => {
    const store = loadStore();
    const target = store.citizens.find((c) => c.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'غير موجود' });
      return;
    }
    store.citizens = store.citizens.filter((c) => c.id !== req.params.id);
    store.citizenDocs = store.citizenDocs.filter((d) => d.citizenId !== req.params.id);
    appendAudit(store, req.employee!.uid, req.employee!.fullName, 'حذف سجل مواطن', 'citizen', target.id, target.fullName);
    saveStore(store);
    res.json({ ok: true });
  });

  // --- Requests (SADER / WARED) ---
  app.post('/api/requests', requireAuth, requirePerm('requests.create'), (req: AuthedRequest, res) => {
    const store = loadStore();
    const emp = store.employees.find((e) => e.uid === req.employee!.uid)!;
    const b = req.body as Record<string, unknown>;
    const citizen = store.citizens.find((c) => c.id === b.citizenId);
    if (!citizen) {
      res.status(400).json({ error: 'المواطن المرتبط غير موجود.' });
      return;
    }
    const ministry = store.ministries.find((m) => m.id === b.ministryId);
    const assignee = store.employees.find((e) => e.uid === b.assignedToUid);
    const now = new Date().toISOString();
    const seq = String(store.requests.length + 1).padStart(5, '0');
    const year = new Date().getFullYear();
    const direction = b.direction === 'صادر' ? 'صادر' : 'وارد';
    const requestNumber = `REQ-${year}-${seq}`;
    const reqId = crypto.randomUUID();

    const newReq: StoredRequest = {
      id: reqId,
      requestNumber,
      direction,
      waredNumber: direction === 'وارد' ? `WAR-${year}-${seq}` : '',
      saderNumber: direction === 'صادر' ? `SAD-${year}-${seq}` : '',
      requestType: String(b.requestType || 'طلب'),
      title: String(b.title || '').trim(),
      description: String(b.description || '').trim(),
      citizenId: citizen.id,
      citizenName: citizen.fullName,
      citizenNationalId: citizen.nationalId,
      citizenPhone: citizen.whatsapp || citizen.phone,
      ministryId: ministry?.id || '',
      ministryName: ministry?.name || '',
      status: 'جديد',
      priority: String(b.priority || 'عادي'),
      assignedToUid: assignee?.uid || emp.uid,
      assignedToName: assignee?.fullName || emp.fullName,
      createdByUid: emp.uid,
      createdByName: emp.fullName,
      submissionDate: now.slice(0, 10),
      deadlineDate: String(b.deadlineDate || ''),
      completionDate: '',
      officialResponse: '',
      readyForPrint: false,
      createdAt: now,
      updatedAt: now,
    };
    store.requests.unshift(newReq);
    store.requestHistory.unshift({
      id: crypto.randomUUID(),
      requestId: reqId,
      requestNumber,
      fromStatus: 'جديد',
      toStatus: 'جديد',
      actionNote: `إنشاء معاملة ${direction} برقم ${requestNumber}`,
      actorUid: emp.uid,
      actorName: emp.fullName,
      createdAt: now,
    });

    emp.requestsCreatedCount = (emp.requestsCreatedCount || 0) + 1;
    emp.lastActivityAt = now;
    emp.lastActivityLabel = `تسجيل ${newReq.requestType}: ${requestNumber}`;

    if (assignee && assignee.uid !== emp.uid) {
      pushNotification(store, {
        recipient: assignee,
        sender: emp,
        category: 'request_assigned',
        priority: (newReq.priority as StoredNotification['priority']) || 'عادي',
        title: `تم تكليفك بمتابعة ${newReq.requestType} (${requestNumber})`,
        message: `الموضوع: ${newReq.title} — المواطن: ${newReq.citizenName}${newReq.ministryName ? ` — الجهة: ${newReq.ministryName}` : ''}`,
        targetSection: 'requests',
        targetRef: requestNumber,
      });
    }

    appendAudit(store, emp.uid, emp.fullName, 'تسجيل طلب / شكوى', 'request', reqId, requestNumber);
    saveStore(store);

    res.json({ request: newReq });
  });

  app.put('/api/requests/:id', requireAuth, requirePerm('requests.update'), (req: AuthedRequest, res) => {
    const store = loadStore();
    const emp = store.employees.find((e) => e.uid === req.employee!.uid)!;
    const idx = store.requests.findIndex((r) => r.id === req.params.id);
    if (idx < 0) {
      res.status(404).json({ error: 'الطلب غير موجود.' });
      return;
    }
    const existing = store.requests[idx];
    const b = req.body as {
      status?: string;
      officialResponse?: string;
      readyForPrint?: boolean;
      actionNote?: string;
      assignedToUid?: string;
    };
    const nextAssignee = b.assignedToUid
      ? store.employees.find((e) => e.uid === b.assignedToUid)
      : store.employees.find((e) => e.uid === existing.assignedToUid);
    const nextStatus = b.status || existing.status;
    const now = new Date().toISOString();
    const updated: StoredRequest = {
      ...existing,
      status: nextStatus,
      assignedToUid: nextAssignee?.uid || existing.assignedToUid,
      assignedToName: nextAssignee?.fullName || existing.assignedToName,
      officialResponse: b.officialResponse !== undefined ? b.officialResponse.trim() : existing.officialResponse,
      readyForPrint: b.readyForPrint !== undefined ? Boolean(b.readyForPrint) : existing.readyForPrint,
      completionDate: nextStatus === 'مكتمل' ? now.slice(0, 10) : existing.completionDate,
      updatedAt: now,
    };
    store.requests[idx] = updated;
    store.requestHistory.unshift({
      id: crypto.randomUUID(),
      requestId: updated.id,
      requestNumber: updated.requestNumber,
      fromStatus: existing.status,
      toStatus: nextStatus,
      actionNote: (b.actionNote || 'تحديث حالة الطلب').trim(),
      actorUid: emp.uid,
      actorName: emp.fullName,
      createdAt: now,
    });
    if (nextStatus === 'مكتمل' && existing.status !== 'مكتمل') {
      emp.completedRequestsCount = (emp.completedRequestsCount || 0) + 1;
    }
    emp.lastActivityAt = now;
    emp.lastActivityLabel = `متابعة الطلب ${updated.requestNumber}`;

    if (nextAssignee && nextAssignee.uid !== emp.uid) {
      const reassigned = b.assignedToUid && b.assignedToUid !== existing.assignedToUid;
      pushNotification(store, {
        recipient: nextAssignee,
        sender: emp,
        category: 'request_assigned',
        priority: (updated.priority as StoredNotification['priority']) || 'عادي',
        title: reassigned
          ? `تم تحويل الطلب (${updated.requestNumber}) للعمل عليه`
          : `تحديث جديد على الطلب (${updated.requestNumber})`,
        message: `${updated.title} — الحالة: ${nextStatus}${b.actionNote ? ` — الملاحظة: ${b.actionNote}` : ''}`,
        targetSection: 'requests',
        targetRef: updated.requestNumber,
      });
    }

    appendAudit(store, emp.uid, emp.fullName, 'تحديث حالة طلب', 'request', updated.id, `${existing.status} -> ${nextStatus}`);
    saveStore(store);
    res.json({ request: updated });
  });

  app.delete('/api/requests/:id', requireAuth, requirePerm('requests.delete'), (req: AuthedRequest, res) => {
    const store = loadStore();
    store.requests = store.requests.filter((r) => r.id !== req.params.id);
    appendAudit(store, req.employee!.uid, req.employee!.fullName, 'حذف طلب', 'request', String(req.params.id), 'حذف الطلب');
    saveStore(store);
    res.json({ ok: true });
  });

  // --- Ministries CRUD ---
  app.post('/api/ministries', requireAuth, requirePerm('ministries.manage'), (req: AuthedRequest, res) => {
    const store = loadStore();
    const emp = store.employees.find((e) => e.uid === req.employee!.uid)!;
    const b = req.body as Record<string, unknown>;
    const name = String(b.name || '').trim();
    if (!name || store.ministries.some((m) => m.name === name)) {
      res.status(400).json({ error: 'اسم الوزارة مطلوب ولا يجوز تكراره.' });
      return;
    }
    const now = new Date().toISOString();
    const item: StoredMinistry = {
      id: crypto.randomUUID(),
      name,
      code: String(b.code || `MIN-${store.ministries.length + 1}`).trim(),
      sector: String(b.sector || 'حكومي').trim(),
      contactPerson: String(b.contactPerson || '').trim(),
      phone: String(b.phone || '').trim(),
      email: String(b.email || '').trim(),
      address: String(b.address || '').trim(),
      departments: Array.isArray(b.departments) ? (b.departments as string[]) : [],
      isActive: true,
      notes: String(b.notes || '').trim(),
      createdAt: now,
      updatedAt: now,
    };
    store.ministries.push(item);
    emp.lastActivityAt = now;
    emp.lastActivityLabel = `إضافة وزارة: ${name}`;
    appendAudit(store, emp.uid, emp.fullName, 'إضافة وزارة', 'ministry', item.id, name);
    saveStore(store);
    res.json({ ministry: item });
  });

  app.post('/api/ministries/import', requireAuth, requirePerm('ministries.manage'), (req: AuthedRequest, res) => {
    const store = loadStore();
    const rawRows = Array.isArray(req.body?.rows) ? (req.body.rows as unknown[]).slice(0, 3000) : [];
    const rows = rawRows.map(sanitizeImportRow);
    const now = new Date().toISOString();
    let added = 0;
    for (const r of rows) {
      const mName = String(r['اسم الوزارة'] || r['الاسم'] || r['name'] || '').trim();
      if (!mName || store.ministries.some((m) => m.name === mName)) continue;
      store.ministries.push({
        id: crypto.randomUUID(),
        name: mName,
        code: String(r['الكود'] || r['code'] || `MIN-${store.ministries.length + 1}`).trim(),
        sector: String(r['القطاع'] || r['sector'] || 'حكومي').trim(),
        contactPerson: String(r['المسؤول'] || '').trim(),
        phone: String(r['الهاتف'] || '').trim(),
        email: String(r['البريد'] || '').trim(),
        address: String(r['العنوان'] || '').trim(),
        departments: [],
        isActive: true,
        notes: '',
        createdAt: now,
        updatedAt: now,
      });
      added++;
    }
    saveStore(store);
    res.json({ added });
  });

  app.put('/api/ministries/:id', requireAuth, requirePerm('ministries.manage'), (req: AuthedRequest, res) => {
    const store = loadStore();
    const idx = store.ministries.findIndex((m) => m.id === req.params.id);
    if (idx < 0) {
      res.status(404).json({ error: 'الوزارة غير موجودة.' });
      return;
    }
    const existing = store.ministries[idx];
    const b = req.body as Partial<StoredMinistry>;
    store.ministries[idx] = {
      ...existing,
      name: b.name !== undefined ? String(b.name).trim() || existing.name : existing.name,
      code: b.code !== undefined ? String(b.code).trim() || existing.code : existing.code,
      sector: b.sector !== undefined ? String(b.sector).trim() : existing.sector,
      contactPerson: b.contactPerson !== undefined ? String(b.contactPerson).trim() : existing.contactPerson,
      phone: b.phone !== undefined ? String(b.phone).trim() : existing.phone,
      email: b.email !== undefined ? String(b.email).trim() : existing.email,
      address: b.address !== undefined ? String(b.address).trim() : existing.address,
      departments: Array.isArray(b.departments)
        ? b.departments.map((d) => String(d).trim()).filter(Boolean).slice(0, 30)
        : existing.departments,
      isActive: b.isActive !== undefined ? Boolean(b.isActive) : existing.isActive,
      notes: b.notes !== undefined ? String(b.notes).trim() : existing.notes,
      updatedAt: new Date().toISOString(),
    };
    saveStore(store);
    res.json({ ministry: store.ministries[idx] });
  });

  app.delete('/api/ministries/:id', requireAuth, requirePerm('employees.manage'), (req: AuthedRequest, res) => {
    const store = loadStore();
    const linked = store.requests.filter((r) => r.ministryId === req.params.id).length;
    if (linked > 0) {
      res.status(400).json({ error: 'لا يمكن حذف وزارة مرتبطة بطلبات حالية.' });
      return;
    }
    store.ministries = store.ministries.filter((m) => m.id !== req.params.id);
    saveStore(store);
    res.json({ ok: true });
  });

  // --- Electronic Archive (Ministry / RequestType / Month / RequestNumber) ---
  app.post('/api/archive', requireAuth, requirePerm('archive.upload'), (req: AuthedRequest, res) => {
    const store = loadStore();
    const emp = store.employees.find((e) => e.uid === req.employee!.uid)!;
    const b = req.body as {
      requestType?: string;
      ministryName?: string;
      requestNumber?: string;
      citizenName?: string;
      monthFolder?: string;
      fileName?: string;
      fileFormat?: 'pdf' | 'docx' | 'image';
      mimeType?: string;
      fileSize?: number;
      dataUrl?: string;
      notes?: string;
    };
    if (!b.fileName || !b.dataUrl) {
      res.status(400).json({ error: 'يرجى تحديد الملف المراد أرشفته.' });
      return;
    }
    const now = new Date().toISOString();
    const monthFolder = (b.monthFolder || now.slice(0, 7)).trim(); // YYYY-MM
    const ministryName = (b.ministryName || 'عام').trim();
    const requestType = (b.requestType || 'طلب').trim();
    const requestNumber = (b.requestNumber || 'بدون-رقم').trim();

    const { archivePath, relFilePath } = saveArchiveBinaryFile({
      ministryName,
      requestType,
      monthFolder,
      requestNumber,
      fileName: b.fileName,
      dataUrl: b.dataUrl,
    });

    const docItem = {
      id: crypto.randomUUID(),
      archivePath,
      relFilePath,
      monthFolder,
      requestType,
      ministryName,
      requestNumber,
      citizenName: (b.citizenName || '').trim(),
      fileName: b.fileName,
      fileFormat: b.fileFormat || 'pdf',
      mimeType: b.mimeType || 'application/octet-stream',
      fileSize: Number(b.fileSize) || b.dataUrl.length,
      uploadedByUid: emp.uid,
      uploadedByName: emp.fullName,
      notes: (b.notes || '').trim(),
      createdAt: now,
    };

    store.archiveDocs.unshift(docItem);
    emp.lastActivityAt = now;
    emp.lastActivityLabel = `أرشفة ملف: ${b.fileName}`;

    // Notify assigned employee if a matching request exists
    const linkedReq = store.requests.find((r) => r.requestNumber === requestNumber);
    if (linkedReq?.assignedToUid && linkedReq.assignedToUid !== emp.uid) {
      const targetEmp = store.employees.find((e) => e.uid === linkedReq.assignedToUid);
      if (targetEmp) {
        pushNotification(store, {
          recipient: targetEmp,
          sender: emp,
          category: 'archive_shared',
          priority: 'عادي',
          title: `مرفق أرشيفي جديد للطلب (${requestNumber})`,
          message: `تم حفظ الملف "${b.fileName}" في أرشيف ${ministryName} / ${requestType}`,
          targetSection: 'archive',
          targetRef: requestNumber,
        });
      }
    }

    appendAudit(store, emp.uid, emp.fullName, 'أرشفة مستند محلياً', 'archive', docItem.id, archivePath);
    saveStore(store);

    res.json({ archiveDoc: docItem });
  });

  app.get('/api/archive/:id/file', requireAuth, requirePerm('archive.view'), (req: AuthedRequest, res) => {
    const store = loadStore();
    const item = store.archiveDocs.find((d) => d.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: 'الملف غير موجود.' });
      return;
    }
    const absPath = resolveInsideOffice(item.relFilePath);
    if (!fs.existsSync(absPath)) {
      res.status(404).json({ error: 'الملف غير موجود على القرص المحلي.' });
      return;
    }
    const b64 = fs.readFileSync(absPath).toString('base64');
    res.json({ dataUrl: `data:${item.mimeType};base64,${b64}`, fileName: item.fileName });
  });

  app.delete('/api/archive/:id', requireAuth, requirePerm('archive.delete'), (req: AuthedRequest, res) => {
    const store = loadStore();
    const item = store.archiveDocs.find((d) => d.id === req.params.id);
    if (item) {
      const absPath = resolveInsideOffice(item.relFilePath);
      if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
      store.archiveDocs = store.archiveDocs.filter((d) => d.id !== req.params.id);
      appendAudit(store, req.employee!.uid, req.employee!.fullName, 'حذف مستند أرشيفي', 'archive', item.id, item.archivePath);
      saveStore(store);
    }
    res.json({ ok: true });
  });

  // --- Letters & Templates & Printing ---
  app.post('/api/letter-templates', requireAuth, requirePerm('letters.templates'), (req: AuthedRequest, res) => {
    const store = loadStore();
    const now = new Date().toISOString();
    const b = req.body as Record<string, unknown>;
    const tpl = {
      id: crypto.randomUUID(),
      name: String(b.name || '').trim(),
      category: String(b.category || 'عام').trim(),
      officeTitle: String(b.officeTitle || '').trim(),
      deputyName: String(b.deputyName || '').trim(),
      headerSubtitle: String(b.headerSubtitle || '').trim(),
      bodyTemplate: String(b.bodyTemplate || ''),
      signatureTitle: String(b.signatureTitle || '').trim(),
      footerText: String(b.footerText || '').trim(),
      isDefault: store.letterTemplates.length === 0,
      updatedByUid: req.employee!.uid,
      createdAt: now,
      updatedAt: now,
    };
    store.letterTemplates.unshift(tpl);
    saveStore(store);
    res.json({ template: tpl });
  });

  app.delete('/api/letter-templates/:id', requireAuth, requirePerm('letters.templates'), (req: AuthedRequest, res) => {
    const store = loadStore();
    store.letterTemplates = store.letterTemplates.filter((t) => t.id !== req.params.id);
    saveStore(store);
    res.json({ ok: true });
  });

  app.post('/api/printed-documents', requireAuth, requirePerm('letters.design'), (req: AuthedRequest, res) => {
    const store = loadStore();
    const emp = store.employees.find((e) => e.uid === req.employee!.uid)!;
    const b = req.body as Record<string, unknown>;
    const now = new Date().toISOString();
    const docItem = {
      id: crypto.randomUUID(),
      referenceNumber: String(b.referenceNumber || `REF-${Date.now()}`).trim(),
      title: String(b.title || 'خطاب رسمي').trim(),
      requestId: String(b.requestId || ''),
      requestNumber: String(b.requestNumber || ''),
      citizenName: String(b.citizenName || ''),
      ministryName: String(b.ministryName || ''),
      renderedContent: String(b.renderedContent || ''),
      officeTitle: String(b.officeTitle || ''),
      deputyName: String(b.deputyName || ''),
      signatureTitle: String(b.signatureTitle || ''),
      footerText: String(b.footerText || ''),
      status: 'pending_print' as const,
      createdByUid: emp.uid,
      createdByName: emp.fullName,
      printedByUid: '',
      printedByName: '',
      printCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    store.printedDocs.unshift(docItem);
    emp.lettersCreatedCount = (emp.lettersCreatedCount || 0) + 1;
    emp.lastActivityAt = now;
    emp.lastActivityLabel = `تحرير خطاب: ${docItem.referenceNumber}`;

    // Notify printing officers that a letter is queued for printing
    const printOfficers = store.employees.filter(
      (e) => e.status === 'active' && e.uid !== emp.uid && (e.role === 'printing' || e.permissions.includes('printing.execute'))
    );
    for (const officer of printOfficers) {
      pushNotification(store, {
        recipient: officer,
        sender: emp,
        category: 'letter_print',
        priority: 'عادي',
        title: `خطاب جاهز للطباعة (${docItem.referenceNumber})`,
        message: `الموضوع: ${docItem.title}${docItem.ministryName ? ` — الجهة: ${docItem.ministryName}` : ''}`,
        targetSection: 'letters',
        targetRef: docItem.referenceNumber,
      });
    }

    appendAudit(store, emp.uid, emp.fullName, 'تحرير واعتماد خطاب', 'printed_document', docItem.id, docItem.referenceNumber);
    saveStore(store);
    res.json({ printedDoc: docItem });
  });

  app.post('/api/printed-documents/:id/print', requireAuth, requirePerm('printing.execute'), (req: AuthedRequest, res) => {
    const store = loadStore();
    const emp = store.employees.find((e) => e.uid === req.employee!.uid)!;
    const idx = store.printedDocs.findIndex((p) => p.id === req.params.id);
    if (idx < 0) {
      res.status(404).json({ error: 'المستند غير موجود.' });
      return;
    }
    const now = new Date().toISOString();
    store.printedDocs[idx] = {
      ...store.printedDocs[idx],
      status: 'printed',
      printedByUid: emp.uid,
      printedByName: emp.fullName,
      printCount: (store.printedDocs[idx].printCount || 0) + 1,
      updatedAt: now,
    };
    emp.printsCount = (emp.printsCount || 0) + 1;
    emp.lastActivityAt = now;
    emp.lastActivityLabel = `طباعة خطاب: ${store.printedDocs[idx].referenceNumber}`;
    appendAudit(store, emp.uid, emp.fullName, 'طباعة مستند رسمي', 'printed_document', store.printedDocs[idx].id, store.printedDocs[idx].referenceNumber);
    saveStore(store);
    res.json({ printedDoc: store.printedDocs[idx] });
  });

  // --- Employees CRUD (Username/Password + Granular Permissions) ---
  app.post('/api/employees', requireAuth, requirePerm('employees.manage'), (req: AuthedRequest, res) => {
    const store = loadStore();
    const b = req.body as {
      username?: string;
      password?: string;
      fullName?: string;
      phone?: string;
      nationalId?: string;
      jobTitle?: string;
      department?: string;
      role?: StoredEmployee['role'];
      permissions?: string[];
      notes?: string;
    };
    const cleanUser = (b.username || '').trim().toLowerCase();
    if (cleanUser.length < 2 || /[\s\\/:*?"<>|]/.test(cleanUser)) {
      res.status(400).json({ error: 'اسم المستخدم يجب أن يكون حرفين على الأقل بدون مسافات.' });
      return;
    }
    if (!b.password || b.password.length < 6) {
      res.status(400).json({ error: 'كلمة المرور يجب أن لا تقل عن 6 أحرف.' });
      return;
    }
    if (store.employees.some((e) => e.username.toLowerCase() === cleanUser)) {
      res.status(409).json({ error: 'اسم المستخدم مستخدم بالفعل لموظف آخر.' });
      return;
    }
    const now = new Date().toISOString();
    const uid = crypto.randomUUID();
    const newEmp: StoredEmployee = {
      id: uid,
      uid,
      username: cleanUser,
      passwordHash: hashPassword(b.password),
      fullName: (b.fullName || '').trim(),
      phone: (b.phone || '').trim(),
      nationalId: (b.nationalId || '').trim(),
      jobTitle: (b.jobTitle || '').trim(),
      department: (b.department || 'مكتب النائب محمد كليب').trim(),
      role: b.role || 'reception',
      permissions: Array.isArray(b.permissions) ? b.permissions : [],
      status: 'active',
      notes: (b.notes || '').trim(),
      activeSeconds: 0,
      citizensRegisteredCount: 0,
      requestsCreatedCount: 0,
      lettersCreatedCount: 0,
      printsCount: 0,
      completedRequestsCount: 0,
      lastActivityLabel: 'إنشاء حساب الموظف',
      createdAt: now,
      updatedAt: now,
    };
    store.employees.push(newEmp);
    appendAudit(store, req.employee!.uid, req.employee!.fullName, 'إضافة موظف جديد', 'employee', uid, `${newEmp.fullName} (@${cleanUser})`);
    saveStore(store);
    res.json({ employee: sanitizeEmployee(newEmp) });
  });

  app.put('/api/employees/:id', requireAuth, requirePerm('employees.manage'), (req: AuthedRequest, res) => {
    const store = loadStore();
    const idx = store.employees.findIndex((e) => e.id === req.params.id);
    if (idx < 0) {
      res.status(404).json({ error: 'الموظف غير موجود.' });
      return;
    }
    const existing = store.employees[idx];
    const b = req.body as {
      fullName?: string;
      phone?: string;
      nationalId?: string;
      jobTitle?: string;
      department?: string;
      role?: StoredEmployee['role'];
      permissions?: string[];
      status?: 'active' | 'inactive';
      password?: string;
      notes?: string;
    };
    if (existing.uid === req.employee!.uid && b.status === 'inactive') {
      res.status(400).json({ error: 'لا يمكنك تعطيل حسابك النشط.' });
      return;
    }
    const now = new Date().toISOString();
    store.employees[idx] = {
      ...existing,
      fullName: b.fullName !== undefined ? b.fullName.trim() : existing.fullName,
      phone: b.phone !== undefined ? b.phone.trim() : existing.phone,
      nationalId: b.nationalId !== undefined ? b.nationalId.trim() : existing.nationalId,
      jobTitle: b.jobTitle !== undefined ? b.jobTitle.trim() : existing.jobTitle,
      department: b.department !== undefined ? b.department.trim() : existing.department,
      role: b.role || existing.role,
      permissions: Array.isArray(b.permissions) ? b.permissions : existing.permissions,
      status: b.status || existing.status,
      notes: b.notes !== undefined ? b.notes.trim() : existing.notes,
      passwordHash: b.password && b.password.length >= 6 ? hashPassword(b.password) : existing.passwordHash,
      updatedAt: now,
    };
    appendAudit(store, req.employee!.uid, req.employee!.fullName, 'تحديث بيانات وصلاحيات موظف', 'employee', existing.uid, store.employees[idx].fullName);
    saveStore(store);
    res.json({ employee: sanitizeEmployee(store.employees[idx]) });
  });

  // --- Office Settings & Local Folder Explorer ---
  app.put('/api/settings', requireAuth, requirePerm('settings.manage'), (req: AuthedRequest, res) => {
    const store = loadStore();
    const b = req.body as Record<string, string>;
    store.officeSettings = {
      officeName: (b.officeName || store.officeSettings.officeName).trim(),
      deputyName: (b.deputyName || store.officeSettings.deputyName).trim(),
      governorate: (b.governorate || store.officeSettings.governorate).trim(),
      address: (b.address || '').trim(),
      phone: (b.phone || '').trim(),
      email: (b.email || '').trim(),
      defaultFooter: (b.defaultFooter || '').trim(),
      updatedAt: new Date().toISOString(),
    };
    appendAudit(store, req.employee!.uid, req.employee!.fullName, 'تحديث إعدادات المكتب', 'settings', 'main', store.officeSettings.officeName);
    saveStore(store);
    res.json({ officeSettings: store.officeSettings });
  });

  app.get('/api/local-storage/tree', requireAuth, requireAnyPerm(['archive.view', 'settings.manage']), (_req: AuthedRequest, res) => {
    const tree = buildFolderTree();
    res.json({ baseDir: OFFICE_BASE_DIR, tree, stats: computeStorageStats() });
  });

  app.post('/api/local-storage/sync', requireAuth, requireAnyPerm(['archive.view', 'settings.manage']), (req: AuthedRequest, res) => {
    const store = loadStore();
    saveStore(store);
    appendAudit(store, req.employee!.uid, req.employee!.fullName, 'تحديث ومزامنة التخزين المحلي', 'storage', 'local', OFFICE_BASE_DIR);
    res.json({
      baseDir: OFFICE_BASE_DIR,
      tree: buildFolderTree(),
      stats: computeStorageStats(),
    });
  });

  app.get('/api/local-storage/export-zip', requireAuth, requirePerm('settings.manage'), (req: AuthedRequest, res) => {
    const store = loadStore();
    saveStore(store);
    const zipBuffer = buildOfficeZipBuffer();
    const fileName = `مجلد_المكتب_${new Date().toISOString().slice(0, 10)}.zip`;
    appendAudit(store, req.employee!.uid, req.employee!.fullName, 'تنزيل نسخة مضغوطة من مجلد المكتب', 'storage', 'zip', fileName);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.send(zipBuffer);
  });

  app.get('/api/local-storage/download', requireAuth, (req: AuthedRequest, res) => {
    const relPath = String(req.query.relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!relPath) {
      res.status(400).json({ error: 'مسار الملف مطلوب.' });
      return;
    }

    const emp = req.employee!;
    const allowedByFolder = (() => {
      if (emp.role === 'super_admin') return true;
      if (relPath.startsWith('الأرشيف/')) return hasPerm(emp, 'archive.view');
      if (relPath.startsWith('الموظفين/')) return hasPerm(emp, 'employees.manage');
      if (relPath.startsWith('المواطنين/')) {
        if (relPath.endsWith('.jpg') || relPath.endsWith('.jpeg') || relPath.endsWith('.png')) {
          return hasPerm(emp, 'citizens.view_id_cards');
        }
        return hasPerm(emp, 'citizens.view') && hasPerm(emp, 'citizens.export');
      }
      if (relPath.startsWith('الطلبات/')) return hasPerm(emp, 'requests.view');
      if (relPath.startsWith('الوزارات/')) return hasPerm(emp, 'ministries.view');
      if (relPath.startsWith('الخطابات_المطبوعة/')) {
        return hasPerm(emp, 'letters.design') || hasPerm(emp, 'printing.execute');
      }
      return hasPerm(emp, 'settings.manage');
    })();

    if (!allowedByFolder) {
      res.status(403).json({ error: 'لا تملك صلاحية تنزيل هذا الملف.' });
      return;
    }

    try {
      const absPath = resolveInsideOffice(relPath);
      if (!fs.existsSync(absPath) || fs.statSync(absPath).isDirectory()) {
        res.status(404).json({ error: 'الملف غير موجود.' });
        return;
      }
      res.download(absPath, path.basename(absPath));
    } catch {
      res.status(403).json({ error: 'مسار غير مصرح به.' });
    }
  });

  app.get('/api/local-storage/excel/:kind', requireAuth, (req: AuthedRequest, res) => {
    const kind = String(req.params.kind);
    const map: Record<string, { rel: string; perms: string[] }> = {
      citizens: { rel: 'المواطنين/سجل_المواطنين.xlsx', perms: ['citizens.view', 'citizens.export'] },
      employees: { rel: 'الموظفين/سجل_الموظفين.xlsx', perms: ['employees.manage'] },
      notifications: { rel: 'الموظفين/سجل_التكليفات_والاشعارات.xlsx', perms: ['employees.manage'] },
      requests: { rel: 'الطلبات/سجل_الطلبات.xlsx', perms: ['requests.view'] },
      ministries: { rel: 'الوزارات/سجل_الوزارات.xlsx', perms: ['ministries.view'] },
      archive: { rel: 'الأرشيف/فهرس_الأرشيف.xlsx', perms: ['archive.view'] },
      letters: { rel: 'الخطابات_المطبوعة/سجل_الخطابات_المطبوعة.xlsx', perms: ['letters.design', 'printing.execute'] },
    };
    const entry = map[kind];
    if (!entry) {
      res.status(400).json({ error: 'نوع السجل غير معروف.' });
      return;
    }
    const emp = req.employee!;
    const hasAccess =
      emp.role === 'super_admin' ||
      (kind === 'letters'
        ? entry.perms.some((p) => hasPerm(emp, p))
        : entry.perms.every((p) => hasPerm(emp, p)));
    if (!hasAccess) {
      res.status(403).json({ error: 'لا تملك صلاحية تنزيل هذا السجل.' });
      return;
    }
    const store = loadStore();
    saveStore(store); // Guarantee Excel is freshly synced
    const absPath = resolveInsideOffice(entry.rel);
    res.download(absPath, path.basename(absPath));
  });

  // --- Multi-Device LAN Info & Clean Project Download ---
  const getLanAddresses = () => {
    const interfaces = os.networkInterfaces();
    const list: Array<{ interfaceName: string; address: string; appUrl: string; portalUrl: string }> = [];
    for (const [ifaceName, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal) {
          list.push({
            interfaceName: ifaceName,
            address: addr.address,
            appUrl: `http://${addr.address}:${PORT}`,
            portalUrl: `http://${addr.address}:${PORT}/register`,
          });
        }
      }
    }
    return list;
  };

  app.get('/api/system/network-info', requireAuth, (_req: AuthedRequest, res) => {
    res.json({
      hostname: os.hostname(),
      port: PORT,
      localUrl: `http://localhost:${PORT}`,
      lanUrls: getLanAddresses(),
    });
  });

  app.get('/api/system/download-project-zip', requireAuth, requirePerm('settings.manage'), (req: AuthedRequest, res) => {
    const store = loadStore();
    const zipBuffer = buildProjectSourceZipBuffer();
    const fileName = `POMS_V3_Local_Package_${new Date().toISOString().slice(0, 10)}.zip`;
    appendAudit(store, req.employee!.uid, req.employee!.fullName, 'تنزيل حزمة المشروع للتشغيل المحلي', 'system', 'package', fileName);
    saveStore(store);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.send(zipBuffer);
  });

  const httpServer = http.createServer(app);

  // --- Vite / Static Frontend Serving ---
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    if (hmrDisabled) {
      app.get('/@vite/client', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.send(`
const sheetsMap = new Map();
const linkSheetsMap = new Map();
if (typeof document !== 'undefined') {
  document.querySelectorAll('style[data-vite-dev-id]').forEach((el) => {
    sheetsMap.set(el.getAttribute('data-vite-dev-id'), el);
  });
  document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id]').forEach((el) => {
    linkSheetsMap.set(el.getAttribute('data-vite-dev-id'), el);
  });
}
let lastInsertedStyle;
export function updateStyle(id, content) {
  if (linkSheetsMap.has(id)) return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = undefined; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement('afterend', style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  if (linkSheetsMap.has(id)) {
    document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id="' + CSS.escape(id) + '"]').forEach((el) => el.remove());
    linkSheetsMap.delete(id);
  }
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  const noop = () => {};
  return {
    data: {},
    accept: noop,
    acceptExports: noop,
    dispose: noop,
    prune: noop,
    decline: noop,
    invalidate: noop,
    on: noop,
    off: noop,
    send: noop,
  };
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== '.' && url[0] !== '/') return url;
  const pathname = url.replace(/[?#].*$/, '');
  const parsed = new URL(url, 'http://vite.dev');
  return pathname + '?' + queryToInject + (parsed.search ? '&' + parsed.search.slice(1) : '') + (parsed.hash || '');
}
export class ErrorOverlay extends HTMLElement {}
`);
      });
    }

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'حدث خطأ غير متوقع في الخادم.';
    if (!res.headersSent) {
      res.status(400).json({ error: message });
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`POMS V3 running on http://localhost:${PORT}`);
    for (const lan of getLanAddresses()) {
      console.log(`POMS V3 LAN (${lan.interfaceName}): ${lan.appUrl}`);
    }
  });
}

void startServer();
