import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as XLSX from 'xlsx';

export interface StoredEmployee {
  id: string;
  uid: string;
  username: string;
  passwordHash: string;
  fullName: string;
  phone?: string;
  nationalId?: string;
  email?: string;
  jobTitle: string;
  department: string;
  role: 'super_admin' | 'reception' | 'followup' | 'printing';
  permissions: string[];
  status: 'active' | 'inactive';
  notes?: string;
  activeSeconds: number;
  citizensRegisteredCount: number;
  requestsCreatedCount: number;
  lettersCreatedCount: number;
  printsCount: number;
  completedRequestsCount: number;
  lastActivityLabel?: string;
  lastLoginAt?: string | null;
  lastActivityAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoredCitizen {
  id: string;
  seqNumber: number;
  registrationNumber: string;
  fullName: string;
  age: number;
  nationalId: string;
  phone: string;
  whatsapp?: string;
  governorate: string;
  center: string;
  village?: string;
  detailedAddress: string;
  reviewStatus: string;
  registrationSource: 'بوابة المواطن' | 'استقبال المكتب' | 'استيراد';
  registeredByUid: string;
  registeredByName: string;
  initialRequestType?: string;
  initialRequestDescription?: string;
  reviewNotes?: string;
  hasFrontId: boolean;
  hasBackId: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoredCitizenDoc {
  id: string;
  citizenId: string;
  docType: 'front_id' | 'back_id';
  mimeType: string;
  fileName: string;
  fileSize: number;
  relPath: string;
  uploadedByUid: string;
  createdAt: string;
}

export interface StoredMinistry {
  id: string;
  name: string;
  code: string;
  sector: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  departments: string[];
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredRequest {
  id: string;
  requestNumber: string;
  direction: 'وارد' | 'صادر';
  saderNumber?: string;
  waredNumber?: string;
  requestType: string;
  title: string;
  description: string;
  citizenId: string;
  citizenName: string;
  citizenNationalId?: string;
  citizenPhone?: string;
  ministryId?: string;
  ministryName?: string;
  status: string;
  priority: string;
  assignedToUid?: string;
  assignedToName?: string;
  createdByUid: string;
  createdByName: string;
  submissionDate: string;
  deadlineDate?: string;
  completionDate?: string;
  officialResponse?: string;
  readyForPrint: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoredRequestHistory {
  id: string;
  requestId: string;
  requestNumber: string;
  fromStatus: string;
  toStatus: string;
  actionNote: string;
  actorUid: string;
  actorName: string;
  createdAt: string;
}

export interface StoredArchiveDoc {
  id: string;
  archivePath: string;
  relFilePath: string;
  monthFolder: string;
  requestType: string;
  ministryId?: string;
  ministryName: string;
  requestId?: string;
  requestNumber: string;
  citizenId?: string;
  citizenName?: string;
  fileName: string;
  fileFormat: 'pdf' | 'docx' | 'image';
  mimeType: string;
  fileSize: number;
  uploadedByUid: string;
  uploadedByName: string;
  notes?: string;
  createdAt: string;
}

export interface StoredLetterTemplate {
  id: string;
  name: string;
  category: string;
  officeTitle: string;
  deputyName: string;
  headerSubtitle?: string;
  bodyTemplate: string;
  signatureTitle: string;
  footerText: string;
  isDefault: boolean;
  updatedByUid: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredPrintedDoc {
  id: string;
  referenceNumber: string;
  title: string;
  requestId?: string;
  requestNumber?: string;
  citizenName?: string;
  ministryName?: string;
  renderedContent: string;
  officeTitle?: string;
  deputyName?: string;
  signatureTitle?: string;
  footerText?: string;
  status: 'pending_print' | 'printed';
  createdByUid: string;
  createdByName: string;
  printedByUid?: string;
  printedByName?: string;
  printCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoredAuditLog {
  id: string;
  actorUid: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt: string;
}

export interface StoredOfficeSettings {
  officeName: string;
  deputyName: string;
  governorate: string;
  address?: string;
  phone?: string;
  email?: string;
  defaultFooter?: string;
  updatedAt: string;
}

export interface StoredNotification {
  id: string;
  recipientUid: string;
  recipientName: string;
  senderUid: string;
  senderName: string;
  senderJobTitle?: string;
  category: 'request_assigned' | 'direct_task' | 'letter_print' | 'archive_shared' | 'system';
  priority: 'عادي' | 'عاجل' | 'طارئ';
  title: string;
  message: string;
  targetSection: string;
  targetRef?: string;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface PomsStore {
  employees: StoredEmployee[];
  citizens: StoredCitizen[];
  citizenDocs: StoredCitizenDoc[];
  ministries: StoredMinistry[];
  requests: StoredRequest[];
  requestHistory: StoredRequestHistory[];
  archiveDocs: StoredArchiveDoc[];
  letterTemplates: StoredLetterTemplate[];
  printedDocs: StoredPrintedDoc[];
  notifications: StoredNotification[];
  auditLogs: StoredAuditLog[];
  officeSettings: StoredOfficeSettings;
  customDistricts: Record<string, string[]>;
}

const rawDir = process.env.OFFICE_STORAGE_DIR?.trim();
export const OFFICE_BASE_DIR = path.resolve(rawDir || path.join(process.cwd(), 'مجلد_المكتب'));
const SYSTEM_DIR = path.join(OFFICE_BASE_DIR, '.system_db');
const STORE_FILE = path.join(SYSTEM_DIR, 'poms_store.json');

export function sanitizeFolderPart(input: string): string {
  const cleaned = String(input || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  return cleaned || 'غير_محدد';
}

export function resolveInsideOffice(relPath: string): string {
  const normalized = path.resolve(OFFICE_BASE_DIR, relPath);
  if (normalized !== OFFICE_BASE_DIR && !normalized.startsWith(OFFICE_BASE_DIR + path.sep)) {
    throw new Error('مسار الملف غير مصرح به.');
  }
  return normalized;
}

function ensureBaseFolders(): void {
  fs.mkdirSync(OFFICE_BASE_DIR, { recursive: true });
  fs.mkdirSync(SYSTEM_DIR, { recursive: true });
  fs.mkdirSync(path.join(OFFICE_BASE_DIR, 'المواطنين'), { recursive: true });
  fs.mkdirSync(path.join(OFFICE_BASE_DIR, 'الموظفين'), { recursive: true });
  fs.mkdirSync(path.join(OFFICE_BASE_DIR, 'الطلبات'), { recursive: true });
  fs.mkdirSync(path.join(OFFICE_BASE_DIR, 'الوزارات'), { recursive: true });
  fs.mkdirSync(path.join(OFFICE_BASE_DIR, 'الأرشيف'), { recursive: true });
  fs.mkdirSync(path.join(OFFICE_BASE_DIR, 'الخطابات_المطبوعة'), { recursive: true });
}

function createInitialStore(): PomsStore {
  return {
    employees: [],
    citizens: [], // Empty citizens table as requested
    citizenDocs: [],
    ministries: [],
    requests: [],
    requestHistory: [],
    archiveDocs: [],
    letterTemplates: [],
    printedDocs: [],
    notifications: [],
    auditLogs: [],
    officeSettings: {
      officeName: 'مكتب النائب محمد كليب',
      deputyName: 'السيد النائب محمد كليب',
      governorate: 'القاهرة',
      address: '',
      phone: '',
      email: '',
      defaultFooter: 'مكتب النائب محمد كليب لخدمة المواطنين – المراسلات الرسمية',
      updatedAt: new Date().toISOString(),
    },
    customDistricts: {},
  };
}

export function loadStore(): PomsStore {
  ensureBaseFolders();
  if (!fs.existsSync(STORE_FILE)) {
    const initial = createInitialStore();
    saveStore(initial);
    return initial;
  }
  const raw = fs.readFileSync(STORE_FILE, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<PomsStore>;
  const defaults = createInitialStore();
  const mergedSettings = { ...defaults.officeSettings, ...(parsed.officeSettings || {}) };
  if (!mergedSettings.officeName || mergedSettings.officeName === 'مكتب النائب البرلماني') {
    mergedSettings.officeName = 'مكتب النائب محمد كليب';
  }
  if (!mergedSettings.deputyName || mergedSettings.deputyName === 'السيد النائب عضو مجلس النواب') {
    mergedSettings.deputyName = 'السيد النائب محمد كليب';
  }
  if (!mergedSettings.defaultFooter || mergedSettings.defaultFooter === 'مكتب خدمة المواطنين – المراسلات الرسمية') {
    mergedSettings.defaultFooter = 'مكتب النائب محمد كليب لخدمة المواطنين – المراسلات الرسمية';
  }
  return {
    ...defaults,
    ...parsed,
    officeSettings: mergedSettings,
    customDistricts: parsed.customDistricts || {},
  };
}

function formatDMY(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatHours(seconds: number): string {
  const totalMins = Math.floor((seconds || 0) / 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return h === 0 ? `${m} دقيقة` : `${h} ساعة و ${m} دقيقة`;
}

function writeExcelFile(
  absFilePath: string,
  rows: Record<string, string | number | boolean>[],
  sheetName: string,
  emptyHeaders: string[]
): void {
  const ws =
    rows.length > 0
      ? XLSX.utils.json_to_sheet(rows)
      : XLSX.utils.aoa_to_sheet([emptyHeaders]);
  const wb = XLSX.utils.book_new();
  if (!wb.Workbook) wb.Workbook = {};
  wb.Workbook.Views = [{ RTL: true }];
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  fs.writeFileSync(absFilePath, buf);
}

export function syncAllExcelAndFolders(store: PomsStore): void {
  ensureBaseFolders();

  // 1. Citizens Excel & individual citizen folders
  const citizenRows = store.citizens.map((c) => ({
    'الرقم المسلسل': c.seqNumber,
    'رقم التسجيل': c.registrationNumber,
    'الاسم الرباعي': c.fullName,
    'السن': c.age,
    'الرقم القومي': c.nationalId,
    'رقم الهاتف': c.phone,
    'الواتساب': c.whatsapp || '',
    'المحافظة': c.governorate,
    'القسم / المركز': c.center,
    'القرية / الحي': c.village || '',
    'العنوان التفصيلي': c.detailedAddress,
    'الحالة': c.reviewStatus,
    'مصدر التسجيل': c.registrationSource,
    'الموظف المسجل': c.registeredByName,
    'تاريخ التسجيل': formatDMY(c.createdAt),
  }));
  writeExcelFile(
    path.join(OFFICE_BASE_DIR, 'المواطنين', 'سجل_المواطنين.xlsx'),
    citizenRows,
    'المواطنين',
    ['الرقم المسلسل', 'رقم التسجيل', 'الاسم الرباعي', 'السن', 'الرقم القومي', 'رقم الهاتف', 'الواتساب', 'المحافظة', 'القسم / المركز', 'العنوان التفصيلي', 'الحالة', 'تاريخ التسجيل']
  );

  for (const c of store.citizens) {
    const folderName = sanitizeFolderPart(`${c.fullName}_${c.nationalId}`);
    const citizenDir = resolveInsideOffice(path.join('المواطنين', folderName));
    fs.mkdirSync(citizenDir, { recursive: true });
    fs.writeFileSync(
      path.join(citizenDir, 'بيانات_المواطن.json'),
      JSON.stringify(c, null, 2),
      'utf-8'
    );
  }

  // 2. Employees Excel & individual employee folders
  const empRows = store.employees.map((e) => ({
    'الاسم الكامل': e.fullName,
    'اسم المستخدم': e.username,
    'المسمى الوظيفي': e.jobTitle,
    'القسم': e.department,
    'الدور': e.role,
    'الهاتف': e.phone || '',
    'الرقم القومي': e.nationalId || '',
    'الحالة': e.status === 'active' ? 'نشط' : 'معطل',
    'ساعات العمل على النظام': formatHours(e.activeSeconds),
    'المواطنون المسجلون': e.citizensRegisteredCount,
    'الطلبات والشكاوى المكتوبة': e.requestsCreatedCount,
    'الخطابات المحررة': e.lettersCreatedCount,
    'عمليات الطباعة': e.printsCount,
    'آخر دخول': formatDMY(e.lastLoginAt),
    'آخر نشاط': e.lastActivityLabel || '',
  }));
  writeExcelFile(
    path.join(OFFICE_BASE_DIR, 'الموظفين', 'سجل_الموظفين.xlsx'),
    empRows,
    'الموظفين',
    ['الاسم الكامل', 'اسم المستخدم', 'المسمى الوظيفي', 'القسم', 'الدور', 'الحالة', 'ساعات العمل على النظام', 'الطلبات والشكاوى المكتوبة', 'الخطابات المحررة']
  );

  for (const e of store.employees) {
    const folderName = sanitizeFolderPart(`${e.fullName}_${e.username}`);
    const empDir = resolveInsideOffice(path.join('الموظفين', folderName));
    fs.mkdirSync(empDir, { recursive: true });
    const safeEmp = { ...e, passwordHash: undefined };
    fs.writeFileSync(
      path.join(empDir, 'بيانات_الموظف.json'),
      JSON.stringify(safeEmp, null, 2),
      'utf-8'
    );
  }

  // 3. Requests Excel
  const reqRows = store.requests.map((r) => ({
    'رقم الطلب': r.requestNumber,
    'الاتجاه': r.direction,
    'رقم الصادر': r.saderNumber || '',
    'رقم الوارد': r.waredNumber || '',
    'نوع الطلب': r.requestType,
    'الموضوع': r.title,
    'المواطن': r.citizenName,
    'الرقم القومي': r.citizenNationalId || '',
    'الوزارة': r.ministryName || 'عام',
    'الحالة': r.status,
    'الأولوية': r.priority,
    'تاريخ التقديم': formatDMY(r.submissionDate),
    'تاريخ الإنجاز': formatDMY(r.completionDate),
  }));
  writeExcelFile(
    path.join(OFFICE_BASE_DIR, 'الطلبات', 'سجل_الطلبات.xlsx'),
    reqRows,
    'الطلبات',
    ['رقم الطلب', 'الاتجاه', 'نوع الطلب', 'الموضوع', 'المواطن', 'الوزارة', 'الحالة', 'تاريخ التقديم']
  );

  // 4. Ministries Excel
  const minRows = store.ministries.map((m) => ({
    'الكود': m.code,
    'اسم الوزارة': m.name,
    'القطاع': m.sector,
    'مسؤول الاتصال': m.contactPerson || '',
    'الهاتف': m.phone || '',
    'البريد': m.email || '',
    'الحالة': m.isActive ? 'نشط' : 'معطل',
  }));
  writeExcelFile(
    path.join(OFFICE_BASE_DIR, 'الوزارات', 'سجل_الوزارات.xlsx'),
    minRows,
    'الوزارات',
    ['الكود', 'اسم الوزارة', 'القطاع', 'مسؤول الاتصال', 'الهاتف', 'الحالة']
  );

  // 5. Notifications / Assignments Excel inside Employees folder
  const notifRows = (store.notifications || []).map((n) => ({
    'الموظف المستلم': n.recipientName,
    'المرسل': n.senderName,
    'الأولوية': n.priority,
    'العنوان': n.title,
    'التفاصيل': n.message,
    'المرجع': n.targetRef || '',
    'الحالة': n.isRead ? 'تمت القراءة' : 'غير مقروء',
    'تاريخ الإرسال': formatDMY(n.createdAt),
  }));
  writeExcelFile(
    path.join(OFFICE_BASE_DIR, 'الموظفين', 'سجل_التكليفات_والاشعارات.xlsx'),
    notifRows,
    'التكليفات',
    ['الموظف المستلم', 'المرسل', 'الأولوية', 'العنوان', 'التفاصيل', 'المرجع', 'الحالة', 'تاريخ الإرسال']
  );

  // 6. Archive index Excel inside Archive folder
  const archiveRows = (store.archiveDocs || []).map((a) => ({
    'اسم الملف': a.fileName,
    'الوزارة': a.ministryName,
    'نوع الطلب': a.requestType,
    'الشهر': a.monthFolder,
    'رقم الطلب': a.requestNumber,
    'المواطن': a.citizenName || '',
    'الصيغة': a.fileFormat.toUpperCase(),
    'بواسطة': a.uploadedByName,
    'التاريخ': formatDMY(a.createdAt),
    'المسار المحلي': a.archivePath,
  }));
  writeExcelFile(
    path.join(OFFICE_BASE_DIR, 'الأرشيف', 'فهرس_الأرشيف.xlsx'),
    archiveRows,
    'الأرشيف',
    ['اسم الملف', 'الوزارة', 'نوع الطلب', 'الشهر', 'رقم الطلب', 'المواطن', 'الصيغة', 'التاريخ', 'المسار المحلي']
  );

  // 7. Printed Official Letters Excel & individual letter text files
  const letterRows = (store.printedDocs || []).map((l) => ({
    'الرقم المرجعي': l.referenceNumber,
    'عنوان الخطاب': l.title,
    'رقم الطلب': l.requestNumber || '',
    'المواطن': l.citizenName || '',
    'الوزارة': l.ministryName || '',
    'الحالة': l.status === 'printed' ? 'تمت الطباعة' : 'بانتظار الطباعة',
    'المحرر': l.createdByName,
    'عدد مرات الطباعة': l.printCount,
    'التاريخ': formatDMY(l.createdAt),
  }));
  writeExcelFile(
    path.join(OFFICE_BASE_DIR, 'الخطابات_المطبوعة', 'سجل_الخطابات_المطبوعة.xlsx'),
    letterRows,
    'الخطابات',
    ['الرقم المرجعي', 'عنوان الخطاب', 'رقم الطلب', 'المواطن', 'الوزارة', 'الحالة', 'المحرر', 'التاريخ']
  );

  for (const l of store.printedDocs || []) {
    const fileName = `${sanitizeFolderPart(l.referenceNumber)}_${sanitizeFolderPart(l.title)}.txt`;
    const absLetter = resolveInsideOffice(path.join('الخطابات_المطبوعة', fileName));
    const letterText = [
      l.officeTitle || store.officeSettings.officeName,
      l.deputyName || store.officeSettings.deputyName,
      `الرقم المرجعي: ${l.referenceNumber} | التاريخ: ${formatDMY(l.createdAt)}`,
      `الموضوع: ${l.title}`,
      '----------------------------------------',
      l.renderedContent,
      '----------------------------------------',
      l.signatureTitle || '',
      l.footerText || '',
    ].join('\n');
    fs.writeFileSync(absLetter, letterText, 'utf-8');
  }
}

export function saveStore(store: PomsStore): void {
  ensureBaseFolders();
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
  syncAllExcelAndFolders(store);
}

const MAX_ID_CARD_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ARCHIVE_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export function decodeValidatedDataUrl(
  dataUrl: string,
  allowedMimeRegex: RegExp,
  maxBytes: number
): Buffer {
  const trimmed = String(dataUrl || '').trim();
  const match = /^data:([a-zA-Z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(trimmed);
  if (!match) {
    throw new Error('صيغة الملف المرفوع غير صالحة.');
  }
  const mime = match[1].toLowerCase();
  if (!allowedMimeRegex.test(mime)) {
    throw new Error('نوع الملف المرفوع غير مسموح به.');
  }
  const buf = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (buf.length === 0 || buf.length > maxBytes) {
    throw new Error('حجم الملف المرفوع يتجاوز الحد المسموح به.');
  }
  return buf;
}

export function saveCitizenIdCardFile(
  citizen: StoredCitizen,
  side: 'front' | 'back',
  dataUrl: string
): string {
  const buf = decodeValidatedDataUrl(
    dataUrl,
    /^image\/(jpeg|jpg|png|webp)$/,
    MAX_ID_CARD_BYTES
  );
  const folderName = sanitizeFolderPart(`${citizen.fullName}_${citizen.nationalId}`);
  const fileName = side === 'front' ? 'البطاقة_الأمامية.jpg' : 'البطاقة_الخلفية.jpg';
  const relPath = path.join('المواطنين', folderName, fileName);
  const absPath = resolveInsideOffice(relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, buf);
  return relPath;
}

export function saveArchiveBinaryFile(params: {
  ministryName: string;
  requestType: string;
  monthFolder: string;
  requestNumber: string;
  fileName: string;
  dataUrl: string;
}): { archivePath: string; relFilePath: string } {
  const buf = decodeValidatedDataUrl(
    params.dataUrl,
    /^(application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/msword|image\/(jpeg|jpg|png|webp))$/,
    MAX_ARCHIVE_FILE_BYTES
  );
  const minPart = sanitizeFolderPart(params.ministryName || 'عام');
  const typePart = sanitizeFolderPart(params.requestType || 'طلب');
  const monthPart = sanitizeFolderPart(params.monthFolder);
  const reqPart = sanitizeFolderPart(params.requestNumber || 'بدون_رقم');
  const cleanFile = sanitizeFolderPart(params.fileName);

  const relFilePath = path.join('الأرشيف', minPart, typePart, monthPart, reqPart, cleanFile);
  const absPath = resolveInsideOffice(relFilePath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, buf);

  return {
    archivePath: `مجلد_المكتب/الأرشيف/${minPart}/${typePart}/${monthPart}/${reqPart}/${cleanFile}`,
    relFilePath,
  };
}

export function buildFolderTree(dirAbs = OFFICE_BASE_DIR, relPrefix = ''): Array<{
  name: string;
  relPath: string;
  type: 'dir' | 'file';
  size?: number;
  children?: unknown[];
}> {
  if (!fs.existsSync(dirAbs)) return [];
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  const nodes: Array<{
    name: string;
    relPath: string;
    type: 'dir' | 'file';
    size?: number;
    children?: unknown[];
  }> = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.system_db')) continue;
    const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    const childAbs = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        relPath,
        type: 'dir',
        children: buildFolderTree(childAbs, relPath),
      });
    } else {
      const stat = fs.statSync(childAbs);
      nodes.push({
        name: entry.name,
        relPath,
        type: 'file',
        size: stat.size,
      });
    }
  }
  return nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, 'ar') : a.type === 'dir' ? -1 : 1));
}

export function computeStorageStats(): {
  totalFiles: number;
  totalFolders: number;
  totalSizeBytes: number;
  lastSyncedAt: string;
} {
  let totalFiles = 0;
  let totalFolders = 0;
  let totalSizeBytes = 0;

  const walk = (dirAbs: string) => {
    if (!fs.existsSync(dirAbs)) return;
    const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.system_db')) continue;
      const full = path.join(dirAbs, entry.name);
      if (entry.isDirectory()) {
        totalFolders += 1;
        walk(full);
      } else {
        totalFiles += 1;
        totalSizeBytes += fs.statSync(full).size;
      }
    }
  };
  walk(OFFICE_BASE_DIR);

  return {
    totalFiles,
    totalFolders,
    totalSizeBytes,
    lastSyncedAt: new Date().toISOString(),
  };
}

// Standard CRC32 + UTF-8 ZIP builder (STORE compression) with zero external packages
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeZipEntries(files: Array<{ relPath: string; data: Buffer; mtime: Date }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.relPath, 'utf-8');
    const fileCrc = crc32(f.data);
    const size = f.data.length;

    const d = f.mtime;
    const dosTime = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
    const dosDate = (((Math.max(1980, d.getFullYear()) - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(fileCrc, 14);
    localHeader.writeUInt32LE(size, 18);
    localHeader.writeUInt32LE(size, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, f.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(fileCrc, 16);
    centralHeader.writeUInt32LE(size, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += 30 + nameBuf.length + size;
  }

  const centralDirBuf = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(files.length, 8);
  endRecord.writeUInt16LE(files.length, 10);
  endRecord.writeUInt32LE(centralDirBuf.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirBuf, endRecord]);
}

export function buildOfficeZipBuffer(): Buffer {
  const files: Array<{ relPath: string; data: Buffer; mtime: Date }> = [];
  const rootName = path.basename(OFFICE_BASE_DIR) || 'مجلد_المكتب';

  const walk = (dirAbs: string, relPrefix: string) => {
    if (!fs.existsSync(dirAbs)) return;
    const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.system_db')) continue;
      const full = path.join(dirAbs, entry.name);
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(full, rel);
      } else {
        const stat = fs.statSync(full);
        files.push({
          relPath: `${rootName}/${rel}`.replace(/\\/g, '/'),
          data: fs.readFileSync(full),
          mtime: stat.mtime,
        });
      }
    }
  };
  walk(OFFICE_BASE_DIR, '');

  return encodeZipEntries(files);
}

export function buildProjectSourceZipBuffer(): Buffer {
  const cwd = process.cwd();
  const rootName = 'POMS-V3';
  const files: Array<{ relPath: string; data: Buffer; mtime: Date }> = [];

  const rootWhitelist = [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'vite.config.ts',
    'index.html',
    'metadata.json',
    '.env.example',
    '.gitignore',
    'server.ts',
    'start-poms.bat',
    'start-poms.sh',
    'README_LOCAL_SETUP.md',
  ];

  for (const name of rootWhitelist) {
    const abs = path.join(cwd, name);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      files.push({
        relPath: `${rootName}/${name}`,
        data: fs.readFileSync(abs),
        mtime: fs.statSync(abs).mtime,
      });
    }
  }

  const dirWhitelist = ['src', 'server', 'public'];
  const walkSource = (dirAbs: string, relPrefix: string) => {
    if (!fs.existsSync(dirAbs)) return;
    const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.DS_Store') || entry.name === 'Thumbs.db') continue;
      const full = path.join(dirAbs, entry.name);
      const rel = `${relPrefix}/${entry.name}`;
      if (entry.isDirectory()) {
        walkSource(full, rel);
      } else {
        const stat = fs.statSync(full);
        files.push({
          relPath: `${rootName}/${rel}`.replace(/\\/g, '/'),
          data: fs.readFileSync(full),
          mtime: stat.mtime,
        });
      }
    }
  };

  for (const dirName of dirWhitelist) {
    walkSource(path.join(cwd, dirName), dirName);
  }

  return encodeZipEntries(files);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const actualBuf = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}
