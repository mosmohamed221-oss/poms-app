import { useMemo } from 'react';
import {
  Users,
  Clock,
  FolderOpen,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  Plus,
  Search,
  Printer,
  FileText,
  ArrowLeft,
  Building2,
  Upload,
  UserPlus,
  FileSpreadsheet,
  FileDown,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { downloadAuthorizedFile } from '../../lib/api';
import {
  AppSection,
  AuditLog,
  Citizen,
  Employee,
  Ministry,
  PrintedDocument,
  RequestRecord,
  REQUEST_TYPES,
  ROLE_LABELS,
} from '../../types/poms';
import { StatusTag } from '../common/StatusTag';
import {
  daysBetween,
  formatActiveHours,
  formatDateDMY,
  formatDateTimeDMY,
  toIsoDate,
} from '../../utils/formatters';
import { exportTableToArabicPdf } from '../../utils/pdfExport';

interface RoleDashboardProps {
  citizens: Citizen[];
  requests: RequestRecord[];
  ministries: Ministry[];
  employees: Employee[];
  printedDocs: PrintedDocument[];
  auditLogs: AuditLog[];
  onNavigate: (section: AppSection) => void;
  onQuickCreateCitizen: () => void;
  onQuickCreateRequest: () => void;
  onQuickCreateMinistry: () => void;
  onQuickUploadArchive: () => void;
  onQuickCreateEmployee: () => void;
}

const CHART_COLORS = ['#0F2C59', '#C5A253', '#1E40AF', '#047857', '#B45309', '#64748B'];

export function RoleDashboard({
  citizens,
  requests,
  ministries,
  employees,
  printedDocs,
  auditLogs,
  onNavigate,
  onQuickCreateCitizen,
  onQuickCreateRequest,
  onQuickCreateMinistry,
  onQuickUploadArchive,
  onQuickCreateEmployee,
}: RoleDashboardProps) {
  const { employee, hasPermission } = useAuth();
  const role = employee?.role || 'reception';

  const stats = useMemo(() => {
    const totalCitizens = citizens.length;
    const pendingReview = citizens.filter((c) => c.reviewStatus === 'بانتظار المراجعة').length;
    const missingData = citizens.filter(
      (c) => c.reviewStatus.startsWith('ناقص') || c.reviewStatus === 'مطلوب استكمال بيانات'
    ).length;
    const openRequests = requests.filter((r) => !['مكتمل', 'مرفوض'].includes(r.status)).length;
    const completedRequests = requests.filter((r) => r.status === 'مكتمل').length;
    const activeEmployees = employees.filter((e) => e.status === 'active').length;
    const delayedRequests = requests.filter(
      (r) => !['مكتمل', 'مرفوض'].includes(r.status) && daysBetween(r.submissionDate) > 7
    );
    const completionRate =
      requests.length > 0 ? Math.round((completedRequests / requests.length) * 100) : 0;

    return {
      totalCitizens,
      pendingReview,
      missingData,
      openRequests,
      completedRequests,
      activeEmployees,
      delayedRequests,
      completionRate,
    };
  }, [citizens, requests, employees]);

  const requestsByTypeData = useMemo(
    () =>
      REQUEST_TYPES.map((type) => ({
        name: type,
        count: requests.filter((r) => r.requestType === type).length,
      })),
    [requests]
  );

  const employeePerfData = useMemo(
    () =>
      employees.slice(0, 6).map((emp) => ({
        name: emp.fullName.split(' ').slice(0, 2).join(' '),
        completed: requests.filter((r) => r.assignedToUid === emp.uid && r.status === 'مكتمل').length,
        open: requests.filter(
          (r) => r.assignedToUid === emp.uid && !['مكتمل', 'مرفوض'].includes(r.status)
        ).length,
      })),
    [employees, requests]
  );

  const monthlyData = useMemo(() => {
    const map = new Map<string, { month: string; total: number; completed: number }>();
    for (const req of requests) {
      const m = (req.submissionDate || toIsoDate()).slice(0, 7);
      const curr = map.get(m) || { month: m, total: 0, completed: 0 };
      curr.total += 1;
      if (req.status === 'مكتمل') curr.completed += 1;
      map.set(m, curr);
    }
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [requests]);

  const latestSelfRegistered = useMemo(
    () => citizens.filter((c) => c.registrationSource === 'بوابة المواطن').slice(0, 5),
    [citizens]
  );

  const pendingApprovals = useMemo(
    () => citizens.filter((c) => c.reviewStatus === 'بانتظار المراجعة').slice(0, 8),
    [citizens]
  );

  const todayIso = toIsoDate();

  // --- RECEPTION DASHBOARD ---
  if (role === 'reception') {
    const todayIncoming = requests.filter((r) => r.submissionDate === todayIso && r.direction === 'وارد');
    return (
      <div className="space-y-6">
        <div className="bg-[#0F2C59] text-white rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-[#C5A253] font-semibold">
              {employee?.jobTitle || 'موظف استقبال'} · {employee?.department}
            </p>
            <h2 className="text-xl font-bold mt-1">مرحباً، {employee?.fullName}</h2>
            <p className="text-xs text-slate-300 mt-1">
              استقبال وتسجيل المواطنين والطلبات ومراجعة تسجيلات البوابة
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasPermission('citizens.create') && (
              <button
                type="button"
                onClick={onQuickCreateCitizen}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[#C5A253] text-[#0F2C59] font-bold text-sm hover:bg-[#d4b366] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-5 h-5" />
                <span>تسجيل مواطن جديد</span>
              </button>
            )}
            {hasPermission('requests.create') && (
              <button
                type="button"
                onClick={onQuickCreateRequest}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-lg bg-white/10 text-white font-semibold text-xs hover:bg-white/20 transition-colors cursor-pointer whitespace-nowrap"
              >
                <FileText className="w-4 h-4" />
                <span>تسجيل طلب جديد</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs text-slate-500">طلبات اليوم الواردة</p>
            <p className="text-2xl font-bold text-[#0F2C59] font-mono-num mt-2">{todayIncoming.length}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs text-slate-500">تسجيلات بانتظار المراجعة</p>
            <p className="text-2xl font-bold text-amber-700 font-mono-num mt-2">{stats.pendingReview}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs text-slate-500">إجمالي قاعدة المواطنين</p>
            <p className="text-2xl font-bold text-slate-900 font-mono-num mt-2">{stats.totalCitizens}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[#0F2C59]">تسجيلات بانتظار المراجعة</h3>
              <button
                type="button"
                onClick={() => onNavigate('citizens')}
                className="text-xs text-[#0F2C59] font-semibold hover:underline cursor-pointer"
              >
                عرض الكل
              </button>
            </div>
            {pendingApprovals.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">لا توجد تسجيلات معلقة حالياً.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {pendingApprovals.map((c) => (
                  <div key={c.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-slate-900">{c.fullName}</p>
                      <p className="text-slate-500 font-mono-num mt-0.5">{c.nationalId} · {c.phone}</p>
                    </div>
                    <StatusTag status={c.reviewStatus} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#0F2C59] mb-2">البحث السريع في المواطنين والطلبات</h3>
              <p className="text-xs text-slate-500 mb-6">
                انتقل مباشرة إلى سجل المواطنين أو شاشة تسجيل الطلبات الواردة.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onNavigate('citizens')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0F2C59] text-white text-xs font-semibold hover:bg-[#0A1E3D] cursor-pointer"
              >
                <Search className="w-4 h-4" />
                <span>بحث في قاعدة المواطنين</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('requests')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>استلام طلب وارد</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- FOLLOW-UP DASHBOARD ---
  if (role === 'followup') {
    const assigned = requests.filter((r) => r.assignedToUid === employee?.uid);
    const awaitingMinistry = requests.filter((r) => r.status === 'بانتظار رد الوزارة');
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-[#C5A253] font-bold">{employee?.jobTitle || 'موظف المتابعة'}</p>
            <h2 className="text-xl font-bold text-[#0F2C59] mt-1">أهلاً بك، {employee?.fullName}</h2>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {hasPermission('requests.create') && (
              <button
                type="button"
                onClick={onQuickCreateRequest}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F2C59] text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة طلب / شكوى</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('letters')}
              className="px-4 py-2 rounded-lg border border-[#C5A253] bg-[#C5A253]/10 text-[#0F2C59] text-xs font-semibold cursor-pointer"
            >
              مصمم الخطابات الرسمية
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs text-slate-500">الطلبات المسندة إليّ</p>
            <p className="text-2xl font-bold text-[#0F2C59] font-mono-num mt-2">{assigned.length}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs text-slate-500">طلبات متأخرة (&gt; 7 أيام)</p>
            <p className="text-2xl font-bold text-red-700 font-mono-num mt-2">{stats.delayedRequests.length}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs text-slate-500">بانتظار رد الوزارة</p>
            <p className="text-2xl font-bold text-amber-700 font-mono-num mt-2">{awaitingMinistry.length}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs text-slate-500">الوزارات النشطة</p>
            <p className="text-2xl font-bold text-slate-900 font-mono-num mt-2">
              {ministries.filter((m) => m.isActive).length}
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-[#0F2C59] mb-4">الطلبات التي تتطلب متابعة عاجلة</h3>
          {stats.delayedRequests.length === 0 && awaitingMinistry.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">لا توجد طلبات متأخرة أو معلقة حالياً.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {[...stats.delayedRequests, ...awaitingMinistry].slice(0, 8).map((r) => (
                <div key={r.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                  <div>
                    <p className="font-bold text-slate-900">
                      {r.requestNumber} · {r.title}
                    </p>
                    <p className="text-slate-500 mt-0.5">
                      {r.citizenName} · {r.ministryName || 'بدون وزارة'} · منذ {daysBetween(r.submissionDate)} يوم ({formatDateDMY(r.submissionDate)})
                    </p>
                  </div>
                  <StatusTag status={r.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- PRINTING DASHBOARD ---
  if (role === 'printing') {
    const pendingPrint = printedDocs.filter((p) => p.status === 'pending_print');
    const donePrint = printedDocs.filter((p) => p.status === 'printed');
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-[#C5A253] font-bold">{employee?.jobTitle || 'موظف الطباعة'}</p>
            <h2 className="text-xl font-bold text-[#0F2C59] mt-1">أهلاً بك، {employee?.fullName}</h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('letters')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0F2C59] text-white text-xs font-semibold cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>فتح قائمة الخطابات والطباعة</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs text-slate-500">مستندات معتمدة بانتظار الطباعة</p>
            <p className="text-2xl font-bold text-[#0F2C59] font-mono-num mt-2">{pendingPrint.length}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs text-slate-500">سجل المستندات المطبوعة</p>
            <p className="text-2xl font-bold text-emerald-700 font-mono-num mt-2">{donePrint.length}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-[#0F2C59] mb-4">قائمة انتظار الطباعة المعتمدة</h3>
          {pendingPrint.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">لا توجد مستندات بانتظار الطباعة حالياً.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingPrint.map((docItem) => (
                <div key={docItem.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-bold text-slate-900">
                      {docItem.referenceNumber} · {docItem.title}
                    </p>
                    <p className="text-slate-500 mt-0.5">
                      {docItem.citizenName || '—'} · {docItem.ministryName || '—'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('letters')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F2C59] text-white font-semibold cursor-pointer"
                  >
                    <span>معاينة وطباعة</span>
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- SUPER ADMIN / MANAGER DASHBOARD ---
  const kpiCards = [
    { label: 'إجمالي المواطنين', value: stats.totalCitizens, icon: Users, tone: 'text-[#0F2C59]' },
    { label: 'المواطنين بانتظار المراجعة', value: stats.pendingReview, icon: Clock, tone: 'text-amber-700' },
    { label: 'الطلبات المفتوحة', value: stats.openRequests, icon: FolderOpen, tone: 'text-[#0F2C59]' },
    { label: 'الطلبات المكتملة', value: stats.completedRequests, icon: CheckCircle2, tone: 'text-emerald-700' },
    { label: 'النواقص', value: stats.missingData, icon: AlertTriangle, tone: 'text-red-700' },
    { label: 'الموظفون النشطون', value: stats.activeEmployees, icon: UserCheck, tone: 'text-[#0F2C59]' },
  ];

  return (
    <div className="space-y-6">
      {/* Quick Manual Actions Panel across ALL sections */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-3.5">
            <img
              src="/assets/aistudio/Gemini_Generated_Image_mlu9oomlu9oomlu9_51cff395.jpeg"
              alt="السيد النائب محمد كليب"
              className="w-14 h-14 rounded-xl object-cover object-top border-2 border-[#C5A253] shadow-sm shrink-0"
            />
            <div>
              <h2 className="text-base font-extrabold text-[#0F2C59]">مكتب النائب محمد كليب</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                الإجراءات اليدوية السريعة لجميع الأقسام · حفظ تلقائي محلي وملفات Excel
              </p>
            </div>
          </div>
          <span className="text-xs font-mono-num text-slate-500">
            تاريخ اليوم: {formatDateDMY(new Date())}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          {hasPermission('citizens.create') && (
            <button
              type="button"
              onClick={onQuickCreateCitizen}
              className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg bg-[#0F2C59] text-white hover:bg-[#0A1E3D] text-xs font-semibold cursor-pointer"
            >
              <UserPlus className="w-4 h-4 text-[#C5A253]" />
              <span>إضافة مواطن</span>
            </button>
          )}
          {hasPermission('requests.create') && (
            <button
              type="button"
              onClick={onQuickCreateRequest}
              className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border border-[#0F2C59] bg-[#0F2C59]/5 text-[#0F2C59] hover:bg-[#0F2C59]/10 text-xs font-semibold cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>إضافة طلب/شكوى</span>
            </button>
          )}
          {hasPermission('ministries.manage') && (
            <button
              type="button"
              onClick={onQuickCreateMinistry}
              className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
            >
              <Building2 className="w-4 h-4 text-[#0F2C59]" />
              <span>إضافة وزارة</span>
            </button>
          )}
          {hasPermission('archive.upload') && (
            <button
              type="button"
              onClick={onQuickUploadArchive}
              className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
            >
              <Upload className="w-4 h-4 text-[#0F2C59]" />
              <span>أرشفة ملف</span>
            </button>
          )}
          {hasPermission('letters.design') && (
            <button
              type="button"
              onClick={() => onNavigate('letters')}
              className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
            >
              <Printer className="w-4 h-4 text-[#0F2C59]" />
              <span>إعداد خطاب رسمي</span>
            </button>
          )}
          {hasPermission('employees.manage') && (
            <button
              type="button"
              onClick={onQuickCreateEmployee}
              className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border border-[#C5A253] bg-[#C5A253]/15 text-[#0F2C59] hover:bg-[#C5A253]/25 text-xs font-semibold cursor-pointer"
            >
              <UserCheck className="w-4 h-4" />
              <span>إضافة موظف</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void downloadAuthorizedFile('/api/local-storage/excel/citizens', 'سجل_المواطنين.xlsx')}
            className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>شيت Excel</span>
          </button>
          <button
            type="button"
            onClick={() =>
              exportTableToArabicPdf({
                title: 'التقرير التنفيذي لمكتب النائب محمد كليب',
                subtitle: 'ملخص حالة الطلبات والشكاوى والأداء العام',
                summary: [
                  { label: 'المواطنون', value: stats.totalCitizens },
                  { label: 'إجمالي الطلبات', value: requests.length },
                  { label: 'المكتمل', value: stats.completedRequests },
                  { label: 'نسبة الإنجاز', value: `${stats.completionRate}%` },
                ],
                columns: ['رقم الطلب', 'النوع', 'الموضوع', 'المواطن', 'الوزارة', 'الحالة', 'تاريخ التقديم'],
                rows: requests.slice(0, 100).map((r) => [
                  r.requestNumber,
                  r.requestType,
                  r.title,
                  r.citizenName,
                  r.ministryName || '—',
                  r.status,
                  formatDateDMY(r.submissionDate),
                ]),
              })
            }
            className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 text-xs font-semibold cursor-pointer"
          >
            <FileDown className="w-4 h-4" />
            <span>تقرير PDF</span>
          </button>
        </div>
      </div>

      {/* 6 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500">{kpi.label}</span>
                <Icon className={`w-4 h-4 ${kpi.tone}`} />
              </div>
              <p className={`text-2xl font-extrabold font-mono-num ${kpi.tone}`}>{kpi.value}</p>
            </div>
          );
        })}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[#0F2C59]">الطلبات حسب النوع</h3>
            <span className="text-xs text-slate-500 font-mono-num">نسبة الإنجاز: {stats.completionRate}%</span>
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={requestsByTypeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" name="عدد الطلبات" fill="#0F2C59" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-[#0F2C59] mb-4">أداء الموظفين (الطلبات المسندة)</h3>
          {employeePerfData.length === 0 ? (
            <p className="text-xs text-slate-500 py-20 text-center">لا توجد بيانات أداء متاحة بعد.</p>
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={employeePerfData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="completed" name="مكتمل" fill="#047857" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="open" name="مفتوح" fill="#C5A253" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-[#0F2C59] mb-4">الإحصائيات الشهرية للطلبات</h3>
          {monthlyData.length === 0 ? (
            <p className="text-xs text-slate-500 py-20 text-center">سيظهر المنحنى الشهري فور تسجيل الطلبات.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="total" name="إجمالي الطلبات" stroke="#0F2C59" strokeWidth={2} />
                  <Line type="monotone" dataKey="completed" name="المكتملة" stroke="#C5A253" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-[#0F2C59] mb-4">توزيع نسب الإنجاز</h3>
          {requests.length === 0 ? (
            <p className="text-xs text-slate-500 py-20 text-center">لا توجد طلبات مسجلة لحساب معدلات الإنجاز.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'مكتمل', value: stats.completedRequests },
                      { name: 'مفتوح', value: stats.openRequests },
                      { name: 'مرفوض', value: requests.filter((r) => r.status === 'مرفوض').length },
                    ]}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label
                  >
                    {[0, 1, 2].map((idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Operational Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latest 5 Self-Registered */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[#0F2C59]">أحدث 5 مواطنين مسجلين ذاتياً</h3>
            <button
              type="button"
              onClick={() => onNavigate('citizens')}
              className="text-xs text-[#0F2C59] font-semibold hover:underline cursor-pointer"
            >
              إدارة المواطنين
            </button>
          </div>
          {latestSelfRegistered.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">لا توجد تسجيلات واردة من بوابة المواطن بعد.</p>
          ) : (
            <div className="divide-y divide-slate-100 text-xs">
              {latestSelfRegistered.map((c) => (
                <div key={c.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-slate-900">{c.fullName}</p>
                    <p className="text-slate-500 mt-0.5 font-mono-num">
                      {c.registrationNumber} · {formatDateDMY(c.createdAt)}
                    </p>
                  </div>
                  <StatusTag status={c.reviewStatus} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Delayed > 7 days */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[#0F2C59]">الطلبات المتأخرة أكثر من 7 أيام</h3>
            <button
              type="button"
              onClick={() => onNavigate('requests')}
              className="text-xs text-[#0F2C59] font-semibold hover:underline cursor-pointer"
            >
              عرض الطلبات
            </button>
          </div>
          {stats.delayedRequests.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">لا توجد طلبات متجاوزة لمدة 7 أيام.</p>
          ) : (
            <div className="divide-y divide-slate-100 text-xs">
              {stats.delayedRequests.slice(0, 5).map((r) => (
                <div key={r.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-slate-900">
                      {r.requestNumber} · {r.title}
                    </p>
                    <p className="text-red-700 mt-0.5 font-mono-num">
                      متأخر منذ {daysBetween(r.submissionDate)} يوم · {r.ministryName || 'بدون وزارة'}
                    </p>
                  </div>
                  <StatusTag status={r.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live Employee Activity with Job Title & Active Hours */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[#0F2C59]">نشاط وساعات عمل الموظفين</h3>
            <button
              type="button"
              onClick={() => onNavigate('employees')}
              className="text-xs text-[#0F2C59] font-semibold hover:underline cursor-pointer"
            >
              إدارة الموظفين
            </button>
          </div>
          {employees.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">لا يوجد موظفون مسجلون بعد.</p>
          ) : (
            <div className="divide-y divide-slate-100 text-xs">
              {employees.map((emp) => (
                <div key={emp.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900">
                      {emp.fullName} ·{' '}
                      <span className="text-[#0F2C59] font-semibold">
                        {emp.jobTitle || ROLE_LABELS[emp.role]}
                      </span>
                    </p>
                    <p className="text-slate-600 mt-0.5">
                      {emp.lastActivityLabel || 'نشط'} · طلبات: {emp.requestsCreatedCount || 0} · خطابات: {emp.lettersCreatedCount || 0}
                    </p>
                  </div>
                  <div className="text-left shrink-0">
                    <span className="block font-mono-num font-bold text-[#0F2C59]">
                      {formatActiveHours(emp.activeSeconds)}
                    </span>
                    <span className="text-[11px] font-mono-num text-slate-400">
                      {formatDateTimeDMY(emp.lastActivityAt || emp.lastLoginAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent System Operations */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-[#0F2C59] mb-4">أحدث عمليات النظام (سجل التدقيق)</h3>
          {auditLogs.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">سجل العمليات فارغ حالياً.</p>
          ) : (
            <div className="divide-y divide-slate-100 text-xs">
              {auditLogs.slice(0, 6).map((log) => (
                <div key={log.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900">{log.action}</p>
                    <p className="text-slate-500 mt-0.5">
                      {log.actorName} · {log.details}
                    </p>
                  </div>
                  <span className="text-[11px] font-mono-num text-slate-400 whitespace-nowrap">
                    {formatDateTimeDMY(log.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
