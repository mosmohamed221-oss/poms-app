import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Plus,
  Search,
  Download,
  History,
  X,
  ArrowUpDown,
  Trash2,
  MessageCircle,
  FileSpreadsheet,
  FileDown,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiRequest, downloadAuthorizedFile } from '../../lib/api';
import {
  Citizen,
  Employee,
  Ministry,
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
  REQUEST_TYPES,
  RequestHistory,
  RequestPriority,
  RequestRecord,
  RequestStatus,
  RequestType,
} from '../../types/poms';
import { StatusTag } from '../common/StatusTag';
import { DateInputDMY } from '../common/DateInputDMY';
import {
  buildWhatsAppRequestUrl,
  daysBetween,
  exportRowsToExcel,
  formatDateDMY,
  formatDateTimeDMY,
  toIsoDate,
} from '../../utils/formatters';
import { exportDocumentToArabicPdf, exportTableToArabicPdf } from '../../utils/pdfExport';

interface RequestsViewProps {
  requests: RequestRecord[];
  history: RequestHistory[];
  citizens: Citizen[];
  ministries: Ministry[];
  employees: Employee[];
  loading: boolean;
  openCreateInitially?: boolean;
  onConsumeOpenCreate?: () => void;
  initialSearchQuery?: string;
  onRefresh: () => Promise<void>;
}

export function RequestsView({
  requests,
  history,
  citizens,
  ministries,
  employees,
  loading,
  openCreateInitially,
  onConsumeOpenCreate,
  initialSearchQuery,
  onRefresh,
}: RequestsViewProps) {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || '');
  const [directionFilter, setDirectionFilter] = useState<'الكل' | 'وارد' | 'صادر'>('الكل');
  const [statusFilter, setStatusFilter] = useState<string>('الكل');
  const [typeFilter, setTypeFilter] = useState<string>('الكل');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RequestRecord | null>(null);

  // Create form state
  const [direction, setDirection] = useState<'وارد' | 'صادر'>('وارد');
  const [requestType, setRequestType] = useState<RequestType>('طلب');
  const [priority, setPriority] = useState<RequestPriority>('عادي');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [citizenId, setCitizenId] = useState('');
  const [ministryId, setMinistryId] = useState('');
  const [assignedToUid, setAssignedToUid] = useState('');
  const [deadlineDate, setDeadlineDate] = useState('');
  const [saving, setSaving] = useState(false);

  // Status update modal state
  const [nextStatus, setNextStatus] = useState<RequestStatus>('قيد المراجعة');
  const [nextAssigneeUid, setNextAssigneeUid] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [officialResponse, setOfficialResponse] = useState('');
  const [readyForPrint, setReadyForPrint] = useState(false);

  useEffect(() => {
    if (initialSearchQuery !== undefined && initialSearchQuery !== '') {
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  useEffect(() => {
    if (openCreateInitially) {
      setShowCreateModal(true);
      onConsumeOpenCreate?.();
    }
  }, [openCreateInitially]);

  const canCreate = hasPermission('requests.create');
  const canUpdate = hasPermission('requests.update');
  const canDelete = hasPermission('requests.delete');

  const citizenLookup = useMemo(() => {
    const map = new Map<string, Citizen>();
    for (const c of citizens) map.set(c.id, c);
    return map;
  }, [citizens]);

  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return requests.filter((r) => {
      if (q) {
        const cit = citizenLookup.get(r.citizenId);
        const match =
          r.requestNumber.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.citizenName.toLowerCase().includes(q) ||
          (r.citizenNationalId || cit?.nationalId || '').toLowerCase().includes(q) ||
          (r.citizenPhone || cit?.whatsapp || cit?.phone || '').toLowerCase().includes(q) ||
          (r.ministryName || '').toLowerCase().includes(q) ||
          (r.saderNumber || '').toLowerCase().includes(q) ||
          (r.waredNumber || '').toLowerCase().includes(q) ||
          r.requestType.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (directionFilter !== 'الكل' && r.direction !== directionFilter) return false;
      if (statusFilter !== 'الكل' && r.status !== statusFilter) return false;
      if (typeFilter !== 'الكل' && r.requestType !== typeFilter) return false;
      return true;
    });
  }, [requests, citizenLookup, searchQuery, directionFilter, statusFilter, typeFilter]);

  const openDetails = (r: RequestRecord) => {
    setSelectedRequest(r);
    setNextStatus(r.status);
    setActionNote('');
    setOfficialResponse(r.officialResponse || '');
    setReadyForPrint(r.readyForPrint);
  };

  const getWhatsAppLink = (r: RequestRecord): string | null => {
    const cit = citizenLookup.get(r.citizenId);
    const phone = r.citizenPhone || cit?.whatsapp || cit?.phone;
    return buildWhatsAppRequestUrl({
      phone,
      citizenName: r.citizenName,
      requestNumber: r.requestNumber,
      requestTitle: r.title,
      status: r.status,
      officialResponse: r.officialResponse,
    });
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    if (!citizenId) {
      showToast('يرجى اختيار المواطن المرتبط بالطلب.', 'warning');
      return;
    }
    if (title.trim().length < 2 || !description.trim()) {
      showToast('يرجى إدخال عنوان ووصف الطلب.', 'warning');
      return;
    }

    setSaving(true);
    try {
      const res = await apiRequest<{ request: RequestRecord }>('/api/requests', {
        method: 'POST',
        body: JSON.stringify({
          direction,
          requestType,
          priority,
          title: title.trim(),
          description: description.trim(),
          citizenId,
          ministryId,
          assignedToUid,
          deadlineDate,
        }),
      });
      await onRefresh();
      showToast(`تم تسجيل المعاملة برقم ${res.request.requestNumber} وحفظها في سجل Excel.`, 'success');
      setShowCreateModal(false);
      setTitle('');
      setDescription('');
      setCitizenId('');
      setMinistryId('');
      setDeadlineDate('');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر تسجيل الطلب.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest || !canUpdate || saving) return;

    if (!actionNote.trim()) {
      showToast('يرجى كتابة ملاحظة توضح سبب تحديث الحالة أو إجراء المتابعة.', 'warning');
      return;
    }

    setSaving(true);
    try {
      const res = await apiRequest<{ request: RequestRecord }>(
        `/api/requests/${selectedRequest.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            status: nextStatus,
            assignedToUid: nextAssigneeUid || undefined,
            officialResponse: officialResponse.trim(),
            readyForPrint,
            actionNote: actionNote.trim(),
          }),
        }
      );
      await onRefresh();
      setSelectedRequest(res.request);
      setActionNote('');
      showToast('تم حفظ تحديث الحالة وإرسال إشعار للموظف المكلف.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر تحديث الطلب.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRequest = async (req: RequestRecord) => {
    if (!canDelete) return;
    try {
      await apiRequest(`/api/requests/${req.id}`, { method: 'DELETE' });
      await onRefresh();
      setSelectedRequest(null);
      showToast('تم حذف الطلب.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر حذف الطلب.', 'error');
    }
  };

  const handleExportExcel = () => {
    const rows = filteredRequests.map((r) => ({
      'رقم الطلب': r.requestNumber,
      'الاتجاه': r.direction,
      'رقم الصادر': r.saderNumber || '',
      'رقم الوارد': r.waredNumber || '',
      'نوع الطلب': r.requestType,
      'العنوان': r.title,
      'المواطن': r.citizenName,
      'الرقم القومي': r.citizenNationalId || '',
      'الهاتف': r.citizenPhone || '',
      'الوزارة / الجهة': r.ministryName || '',
      'الحالة': r.status,
      'الأولوية': r.priority,
      'تاريخ التقديم': formatDateDMY(r.submissionDate),
      'تاريخ الإنجاز': formatDateDMY(r.completionDate),
      'المسؤول': r.assignedToName || '',
    }));
    exportRowsToExcel(rows, 'الصادر والوارد', `الطلبات_الصادر_والوارد_${toIsoDate()}.xlsx`);
    showToast('تم تصدير سجل الطلبات إلى Excel.', 'success');
  };

  const handleExportPdf = () => {
    exportTableToArabicPdf({
      title: 'سجل الطلبات والشكاوى (الصادر والوارد)',
      subtitle: 'كشف المعاملات المسجلة وحالات المتابعة والجهات المختصة',
      summary: [
        { label: 'إجمالي المعاملات', value: filteredRequests.length },
        { label: 'مكتمل', value: filteredRequests.filter((r) => r.status === 'مكتمل').length },
        { label: 'قيد التنفيذ / المراجعة', value: filteredRequests.filter((r) => r.status !== 'مكتمل' && r.status !== 'مرفوض').length },
      ],
      columns: [
        'رقم الطلب',
        'الاتجاه',
        'النوع',
        'الموضوع',
        'المواطن',
        'الوزارة / الجهة',
        'الحالة',
        'الأولوية',
        'المسؤول',
        'تاريخ التقديم',
      ],
      rows: filteredRequests.map((r) => [
        r.requestNumber,
        r.direction,
        r.requestType,
        r.title,
        r.citizenName,
        r.ministryName || '—',
        r.status,
        r.priority,
        r.assignedToName || '—',
        formatDateDMY(r.submissionDate),
      ]),
    });
    showToast('تم فتح نافذة تصدير سجل الطلبات بصيغة PDF.', 'success');
  };

  const handleExportSingleRequestPdf = (req: RequestRecord) => {
    const reqHistory = history.filter((h) => h.requestId === req.id);
    const historySummary =
      reqHistory.length > 0
        ? `\n\nسجل المتابعة التاريخي:\n` +
          reqHistory
            .map((h) => `- [${formatDateTimeDMY(h.createdAt)}] ${h.fromStatus} ← ${h.toStatus}: ${h.actionNote} (${h.actorName})`)
            .join('\n')
        : '';

    exportDocumentToArabicPdf({
      officeTitle: 'مكتب النائب محمد كليب – نظام الإدارة الموحد (POMS V3)',
      deputyName: 'السيد النائب محمد كليب · بطاقة متابعة طلب / شكوى رسمية',
      referenceNumber: req.requestNumber,
      dateLabel: formatDateDMY(req.submissionDate),
      title: `${req.requestType}: ${req.title}`,
      metaRows: [
        { label: 'اسم المواطن', value: req.citizenName },
        { label: 'الرقم القومي', value: req.citizenNationalId || '—' },
        { label: 'رقم الهاتف', value: req.citizenPhone || '—' },
        { label: 'الجهة / الوزارة', value: req.ministryName || 'غير محدد' },
        { label: 'الحالة الحالية', value: req.status },
        { label: 'الموظف المكلف', value: req.assignedToName || '—' },
      ],
      bodyText: `تفاصيل الطلب:\n${req.description}${
        req.officialResponse ? `\n\nالرد الرسمي:\n${req.officialResponse}` : ''
      }${historySummary}`,
      signatureTitle: 'اعتماد مكتب النائب محمد كليب',
      footerText: 'وثيقة صادرة من مكتب النائب محمد كليب (POMS V3)',
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#0F2C59]">إدارة الطلبات والشكاوى – الصادر والوارد</h2>
          <p className="text-xs text-slate-500 mt-1">
            ابحث برقم الطلب أو اسم المواطن أو الرقم القومي، وأرسل حالة الطلب عبر واتساب مباشرة
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {canCreate && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F2C59] text-white text-xs font-semibold hover:bg-[#0A1E3D] cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>تسجيل طلب / شكوى جديدة</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void downloadAuthorizedFile('/api/local-storage/excel/requests', 'سجل_الطلبات.xlsx')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>شيت الطلبات (.xlsx)</span>
          </button>
          {filteredRequests.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#C5A253] bg-[#C5A253]/10 text-[#0F2C59] text-xs font-semibold hover:bg-[#C5A253]/20 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                <span>تصدير Excel</span>
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-rose-300 bg-rose-50 text-rose-800 text-xs font-semibold hover:bg-rose-100 cursor-pointer whitespace-nowrap"
              >
                <FileDown className="w-4 h-4" />
                <span>تصدير PDF</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث برقم الطلب، الاسم، الرقم القومي، الهاتف..."
            className="w-full rounded-lg border border-slate-300 pr-9 pl-3 py-2 text-xs focus:border-[#0F2C59] focus:outline-none"
          />
        </div>

        <select
          value={directionFilter}
          onChange={(e) => setDirectionFilter(e.target.value as 'الكل' | 'وارد' | 'صادر')}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-[#0F2C59] focus:outline-none"
        >
          <option value="الكل">وارد وصادر (الكل)</option>
          <option value="وارد">الوارد فقط</option>
          <option value="صادر">الصادر فقط</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-[#0F2C59] focus:outline-none"
        >
          <option value="الكل">كل حالات الطلب</option>
          {REQUEST_STATUSES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-[#0F2C59] focus:outline-none"
        >
          <option value="الكل">كل أنواع الطلبات</option>
          {REQUEST_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-[#0F2C59]/10 text-[#0F2C59] flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1.5">لا توجد طلبات مطابقة</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              عند تسجيل المواطنين لطلباتهم عبر البوابة أو استقبال الطلبات في المكتب ستظهر كافة معاملات الصادر والوارد هنا.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600">
                  <th className="py-3 px-4">رقم الطلب</th>
                  <th className="py-3 px-4">النوع / الاتجاه</th>
                  <th className="py-3 px-4">الموضوع</th>
                  <th className="py-3 px-4">المواطن والرقم القومي</th>
                  <th className="py-3 px-4">الوزارة / الجهة</th>
                  <th className="py-3 px-4">الحالة</th>
                  <th className="py-3 px-4">التاريخ (يوم/شهر/سنة)</th>
                  <th className="py-3 px-4">إجراءات وواتساب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredRequests.map((r) => {
                  const ageDays = daysBetween(r.submissionDate);
                  const isDelayed = !['مكتمل', 'مرفوض'].includes(r.status) && ageDays > 7;
                  const waUrl = getWhatsAppLink(r);
                  const cit = citizenLookup.get(r.citizenId);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono-num font-bold text-[#0F2C59]">
                        {r.requestNumber}
                        <span className="block text-[11px] font-normal text-slate-500">
                          {r.saderNumber || r.waredNumber || ''}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-800">{r.requestType}</span>
                        <span className="text-slate-400 mx-1">·</span>
                        <span className="text-slate-600">{r.direction}</span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 max-w-[200px] truncate">
                        {r.title}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-800">{r.citizenName}</p>
                        <p className="text-[11px] font-mono-num text-slate-500">
                          {r.citizenNationalId || cit?.nationalId || '—'}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{r.ministryName || '—'}</td>
                      <td className="py-3 px-4">
                        <StatusTag status={r.status} />
                      </td>
                      <td className="py-3 px-4 font-mono-num">
                        <span className="text-slate-700">{formatDateDMY(r.submissionDate)}</span>
                        {isDelayed && (
                          <span className="block text-[11px] text-red-700 font-semibold">
                            متأخر ({ageDays} يوم)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openDetails(r)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 text-xs font-semibold text-[#0F2C59] hover:bg-slate-100 cursor-pointer"
                          >
                            <ArrowUpDown className="w-3.5 h-3.5" />
                            <span>متابعة</span>
                          </button>
                          {waUrl && (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
                              title="فتح واتساب وإرسال حالة الطلب للمواطن"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>واتساب</span>
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Request Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h3 className="text-base font-bold text-[#0F2C59]">تسجيل طلب / شكوى جديدة (صادر / وارد)</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {citizens.length === 0 ? (
              <div className="p-6 text-center bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600">
                لا يوجد مواطنون مسجلون حالياً. يرجى تسجيل مواطن أولاً من قسم "المواطنين" لربط الطلب به.
              </div>
            ) : (
              <form onSubmit={handleCreateRequest} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">الاتجاه *</label>
                    <select
                      value={direction}
                      onChange={(e) => setDirection(e.target.value as 'وارد' | 'صادر')}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                    >
                      <option value="وارد">وارد</option>
                      <option value="صادر">صادر</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">نوع الطلب *</label>
                    <select
                      value={requestType}
                      onChange={(e) => setRequestType(e.target.value as RequestType)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                    >
                      {REQUEST_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">الأولوية *</label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as RequestPriority)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                    >
                      {REQUEST_PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">المواطن *</label>
                    <select
                      required
                      value={citizenId}
                      onChange={(e) => setCitizenId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                    >
                      <option value="">-- اختر المواطن --</option>
                      {citizens.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.fullName} ({c.nationalId})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">الوزارة / الجهة المعنية</label>
                    <select
                      value={ministryId}
                      onChange={(e) => setMinistryId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                    >
                      <option value="">-- بدون تحديد --</option>
                      {ministries
                        .filter((m) => m.isActive)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">الموظف المسؤول</label>
                    <select
                      value={assignedToUid}
                      onChange={(e) => setAssignedToUid(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                    >
                      <option value="">-- الموظف الحالي --</option>
                      {employees
                        .filter((emp) => emp.status === 'active')
                        .map((emp) => (
                          <option key={emp.uid} value={emp.uid}>
                            {emp.fullName} ({emp.jobTitle})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      الموعد المستهدف (يوم/شهر/سنة)
                    </label>
                    <DateInputDMY value={deadlineDate} onChange={setDeadlineDate} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">عنوان الموضوع *</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">التفاصيل *</label>
                  <textarea
                    rows={3}
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 rounded-lg bg-[#0F2C59] text-white text-xs font-semibold hover:bg-[#0A1E3D] cursor-pointer"
                  >
                    {saving ? 'جارٍ التسجيل...' : 'حفظ المعاملة'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Request Follow-up & History Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-6 space-y-6">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-lg font-bold text-[#0F2C59]">
                    {selectedRequest.requestNumber} · {selectedRequest.title}
                  </h3>
                  <StatusTag status={selectedRequest.status} />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  المواطن: {selectedRequest.citizenName} ({selectedRequest.citizenNationalId || '—'}) · الاتجاه: {selectedRequest.direction} · التقديم: {formatDateDMY(selectedRequest.submissionDate)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleExportSingleRequestPdf(selectedRequest)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-300 bg-rose-50 text-rose-800 text-xs font-bold hover:bg-rose-100 cursor-pointer"
                >
                  <FileDown className="w-4 h-4" />
                  <span>تصدير PDF</span>
                </button>
                {getWhatsAppLink(selectedRequest) && (
                  <a
                    href={getWhatsAppLink(selectedRequest)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>إرسال الحالة واتساب</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedRequest(null)}
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="bg-[#F5F7FA] border border-slate-200 rounded-lg p-4 text-xs space-y-2">
              <p className="font-bold text-slate-800">تفاصيل الطلب:</p>
              <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{selectedRequest.description}</p>
            </div>

            {canUpdate && (
              <form onSubmit={handleUpdateStatus} className="border border-slate-200 rounded-lg p-4 space-y-4">
                <h4 className="text-xs font-bold text-[#0F2C59]">تحديث حالة الطلب وتوجيهه للموظف المختص</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">الحالة الجديدة</label>
                    <select
                      value={nextStatus}
                      onChange={(e) => setNextStatus(e.target.value as RequestStatus)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                    >
                      {REQUEST_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">توجيه / إسناد إلى موظف (يصلُه إشعار)</label>
                    <select
                      value={nextAssigneeUid || selectedRequest.assignedToUid || ''}
                      onChange={(e) => setNextAssigneeUid(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                    >
                      <option value="">— الإبقاء على الحالي ({selectedRequest.assignedToName || 'غير محدد'}) —</option>
                      {employees
                        .filter((emp) => emp.status === 'active')
                        .map((emp) => (
                          <option key={emp.uid} value={emp.uid}>
                            {emp.fullName} ({emp.jobTitle})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 pt-5">
                    <input
                      id="readyPrint"
                      type="checkbox"
                      checked={readyForPrint}
                      onChange={(e) => setReadyForPrint(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <label htmlFor="readyPrint" className="text-xs font-semibold text-slate-700 cursor-pointer">
                      جاهز لإصدار خطاب وطباعته
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    إجراء المتابعة / ملاحظة الانتقال *
                  </label>
                  <input
                    type="text"
                    required
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                    placeholder="مثال: تم إرسال خطاب رسمي لوزارة الصحة برقم صادر..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">الرد الرسمي من الجهة (يُرسل تلقائياً في رسالة الواتساب)</label>
                  <textarea
                    rows={2}
                    value={officialResponse}
                    onChange={(e) => setOfficialResponse(e.target.value)}
                    placeholder="يُسجل هنا نص رد الوزارة أو نتيجة الفحص..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-[#0F2C59] text-white text-xs font-semibold hover:bg-[#0A1E3D] cursor-pointer"
                  >
                    {saving ? 'جارٍ الحفظ...' : 'حفظ التحديث'}
                  </button>
                </div>
              </form>
            )}

            <div>
              <h4 className="text-xs font-bold text-[#0F2C59] flex items-center gap-1.5 mb-3">
                <History className="w-4 h-4" />
                <span>سجل المتابعة التاريخي</span>
              </h4>
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
                {history
                  .filter((h) => h.requestId === selectedRequest.id)
                  .map((h) => (
                    <div key={h.id} className="p-3 flex items-start justify-between gap-4">
                      <div>
                        <p className="font-bold text-slate-900">
                          {h.fromStatus} ← {h.toStatus}
                        </p>
                        <p className="text-slate-600 mt-0.5">{h.actionNote}</p>
                        <p className="text-[11px] text-slate-400 mt-1">بواسطة: {h.actorName}</p>
                      </div>
                      <span className="text-[11px] font-mono-num text-slate-400 whitespace-nowrap">
                        {formatDateTimeDMY(h.createdAt)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {canDelete && (
              <div className="pt-4 border-t border-slate-200 flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleDeleteRequest(selectedRequest)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>حذف الطلب</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
