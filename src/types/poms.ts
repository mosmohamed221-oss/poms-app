export type EmployeeRole = 'super_admin' | 'reception' | 'followup' | 'printing';

export const ROLE_LABELS: Record<EmployeeRole, string> = {
  super_admin: 'مدير المكتب',
  reception: 'موظف استقبال',
  followup: 'موظف متابعة',
  printing: 'موظف طباعة',
};

export interface PermissionDefinition {
  key: string;
  label: string;
  group: string;
}

export const ALL_PERMISSIONS: PermissionDefinition[] = [
  { key: 'dashboard.manager', label: 'لوحة تحكم مدير المكتب', group: 'لوحة التحكم' },
  { key: 'citizens.view', label: 'عرض سجل المواطنين', group: 'المواطنون' },
  { key: 'citizens.create', label: 'تسجيل واستيراد مواطن جديد', group: 'المواطنون' },
  { key: 'citizens.edit', label: 'تعديل بيانات المواطنين', group: 'المواطنون' },
  { key: 'citizens.review', label: 'اعتماد ورفض تسجيلات المواطنين', group: 'المواطنون' },
  { key: 'citizens.delete', label: 'حذف سجل مواطن', group: 'المواطنون' },
  { key: 'citizens.export', label: 'تصدير بيانات المواطنين Excel', group: 'المواطنون' },
  { key: 'citizens.view_id_cards', label: 'عرض صور البطاقة القومية', group: 'المواطنون' },
  { key: 'requests.view', label: 'عرض الطلبات والصادر والوارد', group: 'الطلبات' },
  { key: 'requests.create', label: 'تسجيل طلب / شكوى جديدة', group: 'الطلبات' },
  { key: 'requests.update', label: 'تحديث حالة الطلبات والردود', group: 'الطلبات' },
  { key: 'requests.delete', label: 'حذف الطلبات', group: 'الطلبات' },
  { key: 'ministries.view', label: 'عرض قاعدة الوزارات', group: 'الوزارات' },
  { key: 'ministries.manage', label: 'إضافة وتعديل وحذف الوزارات', group: 'الوزارات' },
  { key: 'archive.view', label: 'الاطلاع على الأرشيف الإلكتروني', group: 'الأرشيف' },
  { key: 'archive.upload', label: 'رفع وأرشفة المستندات', group: 'الأرشيف' },
  { key: 'archive.delete', label: 'حذف ملفات الأرشيف', group: 'الأرشيف' },
  { key: 'letters.design', label: 'مصمم الخطابات الرسمية', group: 'الخطابات والطباعة' },
  { key: 'letters.templates', label: 'إدارة قوالب الترويسة الرسمية', group: 'الخطابات والطباعة' },
  { key: 'printing.execute', label: 'طباعة المستندات المعتمدة', group: 'الخطابات والطباعة' },
  { key: 'employees.manage', label: 'إدارة حسابات الموظفين وصلاحياتهم', group: 'الإدارة' },
  { key: 'reports.view', label: 'عرض التقارير الإحصائية', group: 'التقارير' },
  { key: 'reports.export', label: 'تصدير التقارير والنسخ الاحتياطي', group: 'التقارير' },
  { key: 'settings.manage', label: 'إعدادات المكتب وسجل التدقيق', group: 'الإدارة' },
];

export const ROLE_DEFAULT_PERMISSIONS: Record<EmployeeRole, string[]> = {
  super_admin: ALL_PERMISSIONS.map((p) => p.key),
  reception: [
    'citizens.view',
    'citizens.create',
    'citizens.edit',
    'citizens.review',
    'citizens.view_id_cards',
    'requests.view',
    'requests.create',
    'ministries.view',
  ],
  followup: [
    'citizens.view',
    'citizens.review',
    'citizens.view_id_cards',
    'requests.view',
    'requests.create',
    'requests.update',
    'ministries.view',
    'ministries.manage',
    'archive.view',
    'archive.upload',
    'letters.design',
    'reports.view',
  ],
  printing: [
    'requests.view',
    'archive.view',
    'printing.execute',
  ],
};

export const CITIZEN_REVIEW_STATUSES = [
  'بيانات كاملة',
  'ناقص مراته',
  'ناقص جوزها',
  'ناقص بياناته كلها',
  'ناقص أزواجهم',
  'بانتظار المراجعة',
  'مرفوض',
  'مطلوب استكمال بيانات',
] as const;

export type CitizenReviewStatus = (typeof CITIZEN_REVIEW_STATUSES)[number];

export const REQUEST_TYPES = [
  'شكوى',
  'طلب',
  'تزكية',
  'علاج',
  'وظيفة',
  'خدمة عامة',
] as const;

export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_STATUSES = [
  'جديد',
  'قيد المراجعة',
  'قيد التنفيذ',
  'بانتظار رد الوزارة',
  'مكتمل',
  'مرفوض',
  'يحتاج استكمال بيانات',
  'مؤجل',
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_PRIORITIES = ['عادي', 'عاجل', 'طارئ'] as const;
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];

export const EGYPT_GOVERNORATES = [
  'القاهرة',
  'الجيزة',
  'الإسكندرية',
  'الدقهلية',
  'الشرقية',
  'القليوبية',
  'البحيرة',
  'الغربية',
  'المنوفية',
  'كفر الشيخ',
  'دمياط',
  'بورسعيد',
  'الإسماعيلية',
  'السويس',
  'الفيوم',
  'بني سويف',
  'المنيا',
  'أسيوط',
  'سوهاج',
  'قنا',
  'الأقصر',
  'أسوان',
  'البحر الأحمر',
  'الوادي الجديد',
  'مطروح',
  'شمال سيناء',
  'جنوب سيناء',
] as const;

export interface Employee {
  id: string;
  uid: string;
  username: string;
  fullName: string;
  phone?: string;
  nationalId?: string;
  email?: string;
  jobTitle: string;
  department: string;
  role: EmployeeRole;
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
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface Citizen {
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
  reviewStatus: CitizenReviewStatus;
  registrationSource: 'بوابة المواطن' | 'استقبال المكتب' | 'استيراد';
  registeredByUid: string;
  registeredByName: string;
  initialRequestType?: string;
  initialRequestDescription?: string;
  reviewNotes?: string;
  hasFrontId: boolean;
  hasBackId: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CitizenDocument {
  id: string;
  citizenId: string;
  docType: 'front_id' | 'back_id';
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  fileName: string;
  fileSize: number;
  dataUrl: string;
  uploadedByUid: string;
  createdAt?: string | null;
}

export interface Ministry {
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
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface RequestRecord {
  id: string;
  requestNumber: string;
  direction: 'وارد' | 'صادر';
  saderNumber?: string;
  waredNumber?: string;
  requestType: RequestType;
  title: string;
  description: string;
  citizenId: string;
  citizenName: string;
  citizenNationalId?: string;
  citizenPhone?: string;
  ministryId?: string;
  ministryName?: string;
  status: RequestStatus;
  priority: RequestPriority;
  assignedToUid?: string;
  assignedToName?: string;
  createdByUid: string;
  createdByName: string;
  submissionDate: string;
  deadlineDate?: string;
  completionDate?: string;
  officialResponse?: string;
  readyForPrint: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface RequestHistory {
  id: string;
  requestId: string;
  requestNumber: string;
  fromStatus: string;
  toStatus: string;
  actionNote: string;
  actorUid: string;
  actorName: string;
  createdAt?: string | null;
}

export interface ArchiveDocument {
  id: string;
  archivePath: string;
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
  dataUrl?: string;
  uploadedByUid: string;
  uploadedByName: string;
  notes?: string;
  createdAt?: string | null;
}

export interface LetterTemplate {
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
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PrintedDocument {
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
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt?: string | null;
}

export interface OfficeSettings {
  officeName: string;
  deputyName: string;
  governorate: string;
  address?: string;
  phone?: string;
  email?: string;
  defaultFooter?: string;
  updatedAt?: string | null;
}

export interface LocalFolderNode {
  name: string;
  relPath: string;
  type: 'dir' | 'file';
  size?: number;
  children?: LocalFolderNode[];
}

export interface StorageStats {
  totalFiles: number;
  totalFolders: number;
  totalSizeBytes: number;
  lastSyncedAt: string;
}

export type NotificationCategory =
  | 'request_assigned'
  | 'direct_task'
  | 'letter_print'
  | 'archive_shared'
  | 'system';

export interface EmployeeNotification {
  id: string;
  recipientUid: string;
  recipientName: string;
  senderUid: string;
  senderName: string;
  senderJobTitle?: string;
  category: NotificationCategory;
  priority: RequestPriority;
  title: string;
  message: string;
  targetSection: AppSection;
  targetRef?: string;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export type AppSection =
  | 'dashboard'
  | 'citizens'
  | 'requests'
  | 'ministries'
  | 'archive'
  | 'letters'
  | 'employees'
  | 'reports'
  | 'settings';
