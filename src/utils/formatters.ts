import * as XLSX from 'xlsx';
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';

function toValidDate(value?: Date | string | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const str = String(value).trim();
  // Support DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmyMatch) {
    const [, dd, mm, yyyy] = dmyMatch;
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Formats any date strictly as DD/MM/YYYY (يوم / شهر / سنة)
 */
export function formatDateDMY(value?: Date | string | null): string {
  const d = toValidDate(value);
  if (!d) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Formats any datetime strictly as DD/MM/YYYY HH:MM
 */
export function formatDateTimeDMY(value?: Date | string | null): string {
  const d = toValidDate(value);
  if (!d) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export function isoToDMY(iso?: string | null): string {
  if (!iso) return '';
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return formatDateDMY(iso);
}

export function dmyToIso(dmy: string): string {
  const cleaned = dmy.trim();
  const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return '';
  const dd = match[1].padStart(2, '0');
  const mm = match[2].padStart(2, '0');
  const yyyy = match[3];
  const dayNum = Number(dd);
  const monthNum = Number(mm);
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return '';
  return `${yyyy}-${mm}-${dd}`;
}

export function toIsoDate(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function daysBetween(startStr?: string, endDate = new Date()): number {
  if (!startStr) return 0;
  const start = toValidDate(startStr);
  if (!start) return 0;
  return Math.floor((endDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatActiveHours(seconds: number): string {
  const totalMins = Math.floor((seconds || 0) / 60);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs === 0) return `${mins} دقيقة`;
  return `${hrs} ساعة و ${mins} دقيقة`;
}

export function buildWhatsAppRequestUrl(params: {
  phone?: string;
  citizenName: string;
  requestNumber: string;
  requestTitle: string;
  status: string;
  officialResponse?: string;
}): string | null {
  const digits = (params.phone || '').replace(/\D/g, '');
  if (!digits) return null;
  let intlPhone = digits;
  if (digits.startsWith('01') && digits.length === 11) {
    intlPhone = `2${digits}`;
  } else if (digits.startsWith('0') && digits.length >= 10) {
    intlPhone = `2${digits}`;
  }

  const lines = [
    `السلام عليكم أ/ ${params.citizenName}،`,
    `تحية طيبة من مكتب النائب محمد كليب.`,
    `نحيط سيادتكم علماً بحالة طلبكم رقم (${params.requestNumber}) الخاص بـ: "${params.requestTitle}".`,
    `الحالة الحالية للطلب: *${params.status}*`,
  ];
  if (params.officialResponse?.trim()) {
    lines.push(`الرد / التفاصيل: ${params.officialResponse.trim()}`);
  }
  lines.push(`تاريخ الإشعار: ${formatDateDMY(new Date())}`);

  const text = encodeURIComponent(lines.join('\n'));
  return `https://wa.me/${intlPhone}?text=${text}`;
}

export function validateNationalId(nid: string): string | null {
  const cleaned = nid.trim();
  if (!/^[0-9]{14}$/.test(cleaned)) {
    return 'الرقم القومي يجب أن يتكون من 14 رقماً بالضبط.';
  }
  return null;
}

export function validateEgyptPhone(phone: string): string | null {
  const cleaned = phone.trim();
  if (!/^01[0125][0-9]{8}$/.test(cleaned) && !/^[0-9]{11}$/.test(cleaned)) {
    return 'رقم الهاتف يجب أن يتكون من 11 رقماً صحيحاً (مثال: 01012345678).';
  }
  return null;
}

export function validateQuadrupleName(name: string): string | null {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 4) {
    return 'يرجى إدخال الاسم الرباعي كاملاً (4 مقاطع على الأقل).';
  }
  if (name.trim().length > 120) {
    return 'الاسم يتجاوز الحد الأقصى المسموح به.';
  }
  return null;
}

export async function compressIdCardDataUrl(source: File | string): Promise<{
  dataUrl: string;
  mimeType: 'image/jpeg';
  size: number;
}> {
  const loadImg = (srcUrl: string, rawSize: number) =>
    new Promise<{ dataUrl: string; mimeType: 'image/jpeg'; size: number }>((resolve, reject) => {
      const img = new Image();
      img.onerror = () => reject(new Error('ملف الصورة غير صالح.'));
      img.onload = () => {
        const maxWidth = 1000;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('تعذر معالجة الصورة في المتصفح.'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        let quality = 0.82;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 450000 && quality > 0.35) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        resolve({
          dataUrl,
          mimeType: 'image/jpeg',
          size: rawSize || Math.round((dataUrl.length * 3) / 4),
        });
      };
      img.src = srcUrl;
    });

  if (typeof source === 'string') {
    return loadImg(source, 0);
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(source.type)) {
    throw new Error('صيغة الملف غير مدعومة. يرجى رفع صورة بصيغة JPG أو PNG أو WEBP.');
  }
  if (source.size > 6 * 1024 * 1024) {
    throw new Error('حجم الصورة يتجاوز 6 ميجابايت.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة.'));
    reader.onload = () => {
      loadImg(String(reader.result), source.size).then(resolve).catch(reject);
    };
    reader.readAsDataURL(source);
  });
}

export async function readArchiveFileAsDataUrl(file: File): Promise<{
  dataUrl: string;
  fileFormat: 'pdf' | 'docx' | 'image';
  mimeType: string;
  fileSize: number;
}> {
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('الحد الأقصى لحجم الملف في الأرشيف هو 8 ميجابايت.');
  }

  let fileFormat: 'pdf' | 'docx' | 'image';
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    fileFormat = 'pdf';
  } else if (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.name.toLowerCase().endsWith('.docx')
  ) {
    fileFormat = 'docx';
  } else if (file.type.startsWith('image/')) {
    fileFormat = 'image';
  } else {
    throw new Error('يُسمح فقط برفع ملفات PDF أو DOCX أو الصور.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الملف المحدد.'));
    reader.onload = () => {
      resolve({
        dataUrl: String(reader.result),
        fileFormat,
        mimeType: file.type || 'application/octet-stream',
        fileSize: file.size,
      });
    };
    reader.readAsDataURL(file);
  });
}

export function buildExcelArrayBuffer(
  rows: Record<string, string | number | boolean>[],
  sheetName: string,
  emptyHeaders?: string[]
): Uint8Array {
  const worksheet =
    rows.length > 0
      ? XLSX.utils.json_to_sheet(rows)
      : XLSX.utils.aoa_to_sheet([emptyHeaders || ['لا توجد بيانات']]);
  const workbook = XLSX.utils.book_new();
  if (!workbook.Workbook) workbook.Workbook = {};
  workbook.Workbook.Views = [{ RTL: true }];
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

export function exportRowsToExcel(
  rows: Record<string, string | number | boolean>[],
  sheetName: string,
  fileName: string
): void {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  if (!workbook.Workbook) workbook.Workbook = {};
  workbook.Workbook.Views = [{ RTL: true }];
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}

export async function exportLetterToDocx(params: {
  officeTitle: string;
  deputyName: string;
  referenceNumber: string;
  dateLabel: string;
  title: string;
  bodyText: string;
  signatureTitle: string;
  footerText: string;
  fileName: string;
}): Promise<void> {
  const paragraphs = params.bodyText.split('\n').map(
    (line) =>
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        spacing: { after: 140 },
        children: [
          new TextRun({
            text: line || ' ',
            font: 'Cairo',
            size: 24,
            rightToLeft: true,
          }),
        ],
      })
  );

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: params.officeTitle,
                bold: true,
                size: 32,
                color: '0F2C59',
                rightToLeft: true,
              }),
            ],
          }),
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: params.deputyName,
                bold: true,
                size: 26,
                color: 'C5A253',
                rightToLeft: true,
              }),
            ],
          }),
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.RIGHT,
            spacing: { after: 120 },
            children: [
              new TextRun({
                text: `الرقم المرجعي: ${params.referenceNumber}   |   التاريخ: ${params.dateLabel}`,
                size: 20,
                color: '475569',
                rightToLeft: true,
              }),
            ],
          }),
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.CENTER,
            spacing: { before: 120, after: 240 },
            children: [
              new TextRun({
                text: params.title,
                bold: true,
                size: 28,
                underline: {},
                rightToLeft: true,
              }),
            ],
          }),
          ...paragraphs,
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.LEFT,
            spacing: { before: 360, after: 80 },
            children: [
              new TextRun({
                text: params.signatureTitle,
                bold: true,
                size: 24,
                rightToLeft: true,
              }),
            ],
          }),
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.CENTER,
            spacing: { before: 400 },
            children: [
              new TextRun({
                text: params.footerText,
                size: 18,
                color: '64748B',
                rightToLeft: true,
              }),
            ],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = params.fileName.endsWith('.docx') ? params.fileName : `${params.fileName}.docx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
