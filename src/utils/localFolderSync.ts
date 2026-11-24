import { Citizen, Employee, EmployeeNotification, Ministry, PrintedDocument, RequestRecord, ROLE_LABELS } from '../types/poms';
import { buildExcelArrayBuffer, formatActiveHours, formatDateDMY, formatDateTimeDMY } from './formatters';

type DirectoryHandle = FileSystemDirectoryHandle;

let linkedRootHandle: DirectoryHandle | null = null;

export function isFileSystemSyncSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export function getLinkedFolderName(): string | null {
  return linkedRootHandle ? linkedRootHandle.name : null;
}

export async function pickLocalOfficeDirectory(): Promise<string | null> {
  if (!isFileSystemSyncSupported()) {
    throw new Error('المتصفح الحالي لا يدعم الربط المباشر للمجلد؛ يتم الحفظ تلقائياً في مجلد المكتب على الخادم ويمكنك تنزيل مجلد المكتب مضغوطاً (ZIP) في أي وقت.');
  }
  try {
    const picker = (window as unknown as { showDirectoryPicker: (opts?: { mode?: string }) => Promise<DirectoryHandle> }).showDirectoryPicker;
    const handle = await picker({ mode: 'readwrite' });
    linkedRootHandle = handle;
    return handle.name;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return null;
    }
    throw new Error('متصفح المعاينة (iFrame) يمنع اختيار مجلد من الجهاز مباشرة؛ الحفظ المحلي التلقائي يعمل بالكامل في مجلد المكتب على الخادم ويمكنك تنزيل نسخة ZIP كاملة بضغطة زر.');
  }
}

function safeName(input: string): string {
  return input
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'غير_محدد';
}

async function getSubDir(parent: DirectoryHandle, parts: string[]): Promise<DirectoryHandle> {
  let current = parent;
  for (const part of parts) {
    current = await current.getDirectoryHandle(safeName(part), { create: true });
  }
  return current;
}

async function writeFileToDir(dir: DirectoryHandle, fileName: string, content: Uint8Array | string): Promise<void> {
  const fileHandle = await dir.getFileHandle(fileName.replace(/[\\/:*?"<>|]/g, '_'), { create: true });
  const writable = await fileHandle.createWritable();
  if (typeof content === 'string') {
    await writable.write(content);
  } else {
    await writable.write(new Blob([new Uint8Array(content)]));
  }
  await writable.close();
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const idx = dataUrl.indexOf(',');
  const base64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export async function syncLocalPCFolder(params: {
  citizens: Citizen[];
  employees: Employee[];
  requests: RequestRecord[];
  ministries: Ministry[];
  notifications?: EmployeeNotification[];
  printedDocs?: PrintedDocument[];
}): Promise<void> {
  if (!linkedRootHandle) return;
  try {
    const officeDir = await getSubDir(linkedRootHandle, ['مجلد_المكتب']);

    // 1. Citizens Excel + individual citizen folders
    const citizensDir = await getSubDir(officeDir, ['المواطنين']);
    const citizenRows = params.citizens.map((c) => ({
      'الرقم المسلسل': c.seqNumber,
      'رقم التسجيل': c.registrationNumber,
      'الاسم الرباعي': c.fullName,
      'السن': c.age,
      'الرقم القومي': c.nationalId,
      'الهاتف': c.phone,
      'الواتساب': c.whatsapp || '',
      'المحافظة': c.governorate,
      'القسم / المركز': c.center,
      'القرية / الحي': c.village || '',
      'العنوان التفصيلي': c.detailedAddress,
      'الحالة': c.reviewStatus,
      'المصدر': c.registrationSource,
      'تاريخ التسجيل': formatDateDMY(c.createdAt),
    }));
    const citizensXlsx = buildExcelArrayBuffer(citizenRows, 'المواطنين', [
      'الرقم المسلسل', 'رقم التسجيل', 'الاسم الرباعي', 'السن', 'الرقم القومي', 'الهاتف', 'الواتساب', 'المحافظة', 'القسم / المركز', 'العنوان التفصيلي', 'الحالة', 'تاريخ التسجيل'
    ]);
    await writeFileToDir(citizensDir, 'سجل_المواطنين.xlsx', citizensXlsx);

    for (const c of params.citizens) {
      const folder = await getSubDir(citizensDir, [`${c.fullName}_${c.nationalId}`]);
      await writeFileToDir(folder, 'بيانات_المواطن.json', JSON.stringify(c, null, 2));
    }

    // 2. Employees Excel + notifications Excel + individual employee folders
    const employeesDir = await getSubDir(officeDir, ['الموظفين']);
    const empRows = params.employees.map((e) => ({
      'الاسم الكامل': e.fullName,
      'اسم المستخدم': e.username,
      'المسمى الوظيفي': e.jobTitle,
      'القسم': e.department,
      'الدور': ROLE_LABELS[e.role],
      'الحالة': e.status === 'active' ? 'نشط' : 'معطل',
      'ساعات العمل على النظام': formatActiveHours(e.activeSeconds),
      'الشكاوى والطلبات المسجلة': e.requestsCreatedCount,
      'الخطابات المحررة': e.lettersCreatedCount,
      'المواطنون المسجلون': e.citizensRegisteredCount,
      'عمليات الطباعة': e.printsCount,
      'آخر دخول': formatDateTimeDMY(e.lastLoginAt),
    }));
    const empXlsx = buildExcelArrayBuffer(empRows, 'الموظفين', [
      'الاسم الكامل', 'اسم المستخدم', 'المسمى الوظيفي', 'القسم', 'الدور', 'الحالة', 'ساعات العمل على النظام'
    ]);
    await writeFileToDir(employeesDir, 'سجل_الموظفين.xlsx', empXlsx);

    for (const e of params.employees) {
      const folder = await getSubDir(employeesDir, [`${e.fullName}_${e.username}`]);
      await writeFileToDir(folder, 'بيانات_الموظف.json', JSON.stringify(e, null, 2));
    }

    // 3. Requests Excel
    const reqDir = await getSubDir(officeDir, ['الطلبات']);
    const reqRows = params.requests.map((r) => ({
      'رقم الطلب': r.requestNumber,
      'الاتجاه': r.direction,
      'النوع': r.requestType,
      'الموضوع': r.title,
      'المواطن': r.citizenName,
      'الرقم القومي': r.citizenNationalId || '',
      'الوزارة': r.ministryName || 'عام',
      'الحالة': r.status,
      'تاريخ التقديم': formatDateDMY(r.submissionDate),
    }));
    const reqXlsx = buildExcelArrayBuffer(reqRows, 'الطلبات', [
      'رقم الطلب', 'الاتجاه', 'النوع', 'الموضوع', 'المواطن', 'الوزارة', 'الحالة', 'تاريخ التقديم'
    ]);
    await writeFileToDir(reqDir, 'سجل_الطلبات.xlsx', reqXlsx);

    // 4. Ministries Excel
    const minDir = await getSubDir(officeDir, ['الوزارات']);
    const minRows = params.ministries.map((m) => ({
      'الكود': m.code,
      'اسم الوزارة': m.name,
      'القطاع': m.sector,
      'مسؤول الاتصال': m.contactPerson || '',
      'الهاتف': m.phone || '',
      'الحالة': m.isActive ? 'نشط' : 'معطل',
    }));
    const minXlsx = buildExcelArrayBuffer(minRows, 'الوزارات', [
      'الكود', 'اسم الوزارة', 'القطاع', 'مسؤول الاتصال', 'الهاتف', 'الحالة'
    ]);
    await writeFileToDir(minDir, 'سجل_الوزارات.xlsx', minXlsx);

    // 5. Printed letters Excel
    if (params.printedDocs) {
      const lettersDir = await getSubDir(officeDir, ['الخطابات_المطبوعة']);
      const letterRows = params.printedDocs.map((l) => ({
        'الرقم المرجعي': l.referenceNumber,
        'عنوان الخطاب': l.title,
        'المواطن': l.citizenName || '',
        'الوزارة': l.ministryName || '',
        'الحالة': l.status === 'printed' ? 'تمت الطباعة' : 'بانتظار الطباعة',
        'التاريخ': formatDateDMY(l.createdAt),
      }));
      const letterXlsx = buildExcelArrayBuffer(letterRows, 'الخطابات', [
        'الرقم المرجعي', 'عنوان الخطاب', 'المواطن', 'الوزارة', 'الحالة', 'التاريخ'
      ]);
      await writeFileToDir(lettersDir, 'سجل_الخطابات_المطبوعة.xlsx', letterXlsx);
    }
  } catch (err) {
    console.warn('Local PC directory sync skipped:', err);
  }
}

export async function syncArchiveFileToPCFolder(params: {
  ministryName: string;
  requestType: string;
  monthFolder: string;
  requestNumber: string;
  fileName: string;
  dataUrl: string;
}): Promise<void> {
  if (!linkedRootHandle) return;
  try {
    const targetDir = await getSubDir(linkedRootHandle, [
      'مجلد_المكتب',
      'الأرشيف',
      params.ministryName || 'عام',
      params.requestType || 'طلب',
      params.monthFolder,
      params.requestNumber || 'بدون_رقم',
    ]);
    await writeFileToDir(targetDir, params.fileName, dataUrlToBytes(params.dataUrl));
  } catch (err) {
    console.warn('Archive PC sync skipped:', err);
  }
}
