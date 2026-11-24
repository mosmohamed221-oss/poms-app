import React, { useEffect, useMemo, useState } from 'react';
import {
  Users,
  Search,
  Plus,
  Download,
  Upload,
  Eye,
  Edit3,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trash2,
  X,
  ShieldCheck,
  FileSpreadsheet,
  FileDown,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiRequest, downloadAuthorizedFile } from '../../lib/api';
import {
  Citizen,
  CITIZEN_REVIEW_STATUSES,
  CitizenReviewStatus,
  EGYPT_GOVERNORATES,
  RequestRecord,
} from '../../types/poms';
import { StatusTag } from '../common/StatusTag';
import { DistrictSelect } from '../common/DistrictSelect';
import { IdCardCaptureInput } from '../common/IdCardCaptureInput';
import {
  exportRowsToExcel,
  formatDateDMY,
  toIsoDate,
  validateEgyptPhone,
  validateNationalId,
} from '../../utils/formatters';
import { exportTableToArabicPdf } from '../../utils/pdfExport';

interface CitizensViewProps {
  citizens: Citizen[];
  requests: RequestRecord[];
  customDistricts: Record<string, string[]>;
  onCustomDistrictsChange: (next: Record<string, string[]>) => void;
  loading: boolean;
  openCreateInitially?: boolean;
  onConsumeOpenCreate?: () => void;
  initialSearchQuery?: string;
  onRefresh: () => Promise<void>;
}

interface IdImageState {
  dataUrl: string;
  mimeType: 'image/jpeg';
  fileName: string;
  size: number;
}

export function CitizensView({
  citizens,
  requests,
  customDistricts,
  onCustomDistrictsChange,
  loading,
  openCreateInitially,
  onConsumeOpenCreate,
  initialSearchQuery,
  onRefresh,
}: CitizensViewProps) {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || '');
  const [statusFilter, setStatusFilter] = useState<string>('الكل');
  const [govFilter, setGovFilter] = useState<string>('الكل');
  const [ageRange, setAgeRange] = useState<string>('الكل');

  const [showFormModal, setShowFormModal] = useState(false);
  const [editingCitizen, setEditingCitizen] = useState<Citizen | null>(null);
  const [viewingCitizen, setViewingCitizen] = useState<Citizen | null>(null);
  const [idDocs, setIdDocs] = useState<{ front?: string; back?: string }>({});
  const [loadingDocs, setLoadingDocs] = useState(false);

  // Form states
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [governorate, setGovernorate] = useState<string>('القاهرة');
  const [center, setCenter] = useState('');
  const [village, setVillage] = useState('');
  const [detailedAddress, setDetailedAddress] = useState('');
  const [reviewStatus, setReviewStatus] = useState<CitizenReviewStatus>('بيانات كاملة');
  const [reviewNotes, setReviewNotes] = useState('');
  const [frontFile, setFrontFile] = useState<IdImageState | null>(null);
  const [backFile, setBackFile] = useState<IdImageState | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (initialSearchQuery !== undefined && initialSearchQuery !== '') {
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  useEffect(() => {
    if (openCreateInitially) {
      openCreateModal();
      onConsumeOpenCreate?.();
    }
  }, [openCreateInitially]);

  const canCreate = hasPermission('citizens.create');
  const canEdit = hasPermission('citizens.edit');
  const canDelete = hasPermission('citizens.delete');
  const canReview = hasPermission('citizens.review');
  const canExport = hasPermission('citizens.export');
  const canViewIdCards = hasPermission('citizens.view_id_cards');

  const filteredCitizens = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return citizens.filter((c) => {
      if (q) {
        const matches =
          c.fullName.toLowerCase().includes(q) ||
          c.nationalId.includes(q) ||
          c.phone.includes(q) ||
          (c.whatsapp || '').includes(q) ||
          c.registrationNumber.toLowerCase().includes(q) ||
          c.governorate.toLowerCase().includes(q) ||
          c.center.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (statusFilter !== 'الكل' && c.reviewStatus !== statusFilter) return false;
      if (govFilter !== 'الكل' && c.governorate !== govFilter) return false;
      if (ageRange === '18-30' && (c.age < 18 || c.age > 30)) return false;
      if (ageRange === '31-50' && (c.age < 31 || c.age > 50)) return false;
      if (ageRange === '51+' && c.age < 51) return false;
      return true;
    });
  }, [citizens, searchQuery, statusFilter, govFilter, ageRange]);

  const openCreateModal = () => {
    setEditingCitizen(null);
    setFullName('');
    setAge('');
    setNationalId('');
    setPhone('');
    setWhatsapp('');
    setGovernorate('القاهرة');
    setCenter('');
    setVillage('');
    setDetailedAddress('');
    setReviewStatus('بيانات كاملة');
    setReviewNotes('');
    setFrontFile(null);
    setBackFile(null);
    setShowFormModal(true);
  };

  const openEditModal = (c: Citizen) => {
    setEditingCitizen(c);
    setFullName(c.fullName);
    setAge(String(c.age));
    setNationalId(c.nationalId);
    setPhone(c.phone);
    setWhatsapp(c.whatsapp || '');
    setGovernorate(c.governorate);
    setCenter(c.center);
    setVillage(c.village || '');
    setDetailedAddress(c.detailedAddress);
    setReviewStatus(c.reviewStatus);
    setReviewNotes(c.reviewNotes || '');
    setFrontFile(null);
    setBackFile(null);
    setShowFormModal(true);
  };

  const openProfile = async (c: Citizen) => {
    setViewingCitizen(c);
    setIdDocs({});
    if (!canViewIdCards || (!c.hasFrontId && !c.hasBackId)) return;

    setLoadingDocs(true);
    try {
      const docs = await apiRequest<{ front?: string; back?: string }>(
        `/api/citizens/${c.id}/documents`
      );
      setIdDocs(docs);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذر تحميل صور البطاقة.', 'error');
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleSaveCitizen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const nidErr = validateNationalId(nationalId);
    if (nidErr) {
      showToast(nidErr, 'warning');
      return;
    }
    const phoneErr = validateEgyptPhone(phone);
    if (phoneErr) {
      showToast(phoneErr, 'warning');
      return;
    }
    const ageNum = Number(age);
    if (!Number.isInteger(ageNum) || ageNum < 1 || ageNum > 120) {
      showToast('يرجى إدخال سن صحيح.', 'warning');
      return;
    }
    if (fullName.trim().length < 2 || !center.trim() || !detailedAddress.trim()) {
      showToast('يرجى استكمال الاسم والقسم/المركز والعنوان التفصيلي.', 'warning');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        fullName: fullName.trim(),
        age: ageNum,
        nationalId: nationalId.trim(),
        phone: phone.trim(),
        whatsapp: whatsapp.trim() || phone.trim(),
        governorate,
        center: center.trim(),
        village: village.trim(),
        detailedAddress: detailedAddress.trim(),
        reviewStatus,
        reviewNotes: reviewNotes.trim(),
        frontIdDataUrl: frontFile?.dataUrl || undefined,
        backIdDataUrl: backFile?.dataUrl || undefined,
      };

      if (editingCitizen) {
        await apiRequest(`/api/citizens/${editingCitizen.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('تم تحديث بيانات المواطن وحفظها في سجل Excel المحلي.', 'success');
      } else {
        const res = await apiRequest<{ citizen: Citizen }>('/api/citizens', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast(
          `تم تسجيل المواطن بنجاح برقم ${res.citizen.registrationNumber} وحفظ مجلده وملف Excel محلياً.`,
          'success'
        );
      }
      await onRefresh();
      setShowFormModal(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر حفظ بيانات المواطن.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReviewStatusChange = async (c: Citizen, newStatus: CitizenReviewStatus) => {
    if (!canReview) return;
    try {
      await apiRequest(`/api/citizens/${c.id}`, {
        method: 'PUT',
        body: JSON.stringify({ reviewStatus: newStatus }),
      });
      await onRefresh();
      if (viewingCitizen?.id === c.id) {
        setViewingCitizen({ ...c, reviewStatus: newStatus });
      }
      showToast(`تم تحديث الحالة إلى "${newStatus}"`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر تحديث الحالة.', 'error');
    }
  };

  const handleDeleteCitizen = async (c: Citizen) => {
    if (!canDelete) return;
    try {
      await apiRequest(`/api/citizens/${c.id}`, { method: 'DELETE' });
      await onRefresh();
      setViewingCitizen(null);
      showToast('تم حذف سجل المواطن.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر حذف المواطن.', 'error');
    }
  };

  const handleExportExcel = () => {
    if (!canExport) return;
    const rows = filteredCitizens.map((c) => ({
      'الرقم المسلسل': c.seqNumber,
      'رقم التسجيل': c.registrationNumber,
      'الاسم الرباعي': c.fullName,
      'السن': c.age,
      'الرقم القومي': c.nationalId,
      'رقم الهاتف': c.phone,
      'الواتساب': c.whatsapp || '',
      'المحافظة': c.governorate,
      'القسم / المركز': c.center,
      'القرية': c.village || '',
      'العنوان التفصيلي': c.detailedAddress,
      'حالة البيانات': c.reviewStatus,
      'مصدر التسجيل': c.registrationSource,
      'الموظف المسجل': c.registeredByName,
      'تاريخ التسجيل': formatDateDMY(c.createdAt),
    }));
    exportRowsToExcel(rows, 'المواطنين', `بيانات_المواطنين_${toIsoDate()}.xlsx`);
    showToast('تم تصدير ملف Excel بنجاح.', 'success');
  };

  const handleExportPdf = () => {
    if (!canExport) return;
    exportTableToArabicPdf({
      title: 'سجل قاعدة بيانات المواطنين',
      subtitle: 'تقرير شامل ببيانات المواطنين المسجلين وحالات المراجعة',
      summary: [
        { label: 'إجمالي المعروض', value: filteredCitizens.length },
        { label: 'بيانات كاملة', value: filteredCitizens.filter((c) => c.reviewStatus === 'بيانات كاملة').length },
        { label: 'بانتظار المراجعة', value: filteredCitizens.filter((c) => c.reviewStatus === 'بانتظار المراجعة').length },
      ],
      columns: [
        '#',
        'رقم التسجيل',
        'الاسم الرباعي',
        'السن',
        'الرقم القومي',
        'الهاتف',
        'المحافظة',
        'القسم / المركز',
        'الحالة',
        'تاريخ التسجيل',
      ],
      rows: filteredCitizens.map((c) => [
        c.seqNumber,
        c.registrationNumber,
        c.fullName,
        c.age,
        c.nationalId,
        c.phone,
        c.governorate,
        c.center,
        c.reviewStatus,
        formatDateDMY(c.createdAt),
      ]),
    });
    showToast('تم فتح نافذة تصدير سجل المواطنين بصيغة PDF.', 'success');
  };

  const handleDownloadServerWorkbook = async () => {
    try {
      await downloadAuthorizedFile('/api/local-storage/excel/citizens', 'سجل_المواطنين.xlsx');
      showToast('تم تنزيل شيت Excel المنظم من مجلد المكتب.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذر تنزيل الملف.', 'error');
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canCreate) return;
    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer);
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet);
      if (rawRows.length === 0) {
        showToast('الملف المرفوع فارغ ولا يحتوي على سجلات.', 'warning');
        setImporting(false);
        return;
      }
      const res = await apiRequest<{ importedCount: number; skippedCount: number }>(
        '/api/citizens/import',
        {
          method: 'POST',
          body: JSON.stringify({ rows: rawRows }),
        }
      );
      await onRefresh();
      showToast(
        `تم استيراد ${res.importedCount} مواطن بنجاح (تم تخطي ${res.skippedCount}).`,
        'success'
      );
    } catch {
      showToast('تعذر قراءة ملف Excel. تأكد من تنسيق الأعمدة.', 'error');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#0F2C59]">قاعدة بيانات المواطنين</h2>
          <p className="text-xs text-slate-500 mt-1">
            إجمالي السجلات المسجلة: <span className="font-bold text-slate-800 font-mono-num">{citizens.length}</span> مواطن · الحفظ التلقائي في <span className="font-bold text-[#0F2C59]">سجل_المواطنين.xlsx</span> ومجلد منفصل لكل مواطن
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {canCreate && (
            <>
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap">
                <Upload className="w-4 h-4" />
                <span>{importing ? 'جارٍ الاستيراد...' : 'استيراد Excel / CSV'}</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  disabled={importing}
                  onChange={(e) => void handleImportExcel(e)}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F2C59] text-white text-xs font-semibold hover:bg-[#0A1E3D] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>تسجيل مواطن جديد</span>
              </button>
            </>
          )}
          {canExport && (
            <button
              type="button"
              onClick={() => void handleDownloadServerWorkbook()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>شيت المواطنين (.xlsx)</span>
            </button>
          )}
          {canExport && citizens.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#C5A253] bg-[#C5A253]/10 text-[#0F2C59] text-xs font-semibold hover:bg-[#C5A253]/20 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                <span>تصدير Excel</span>
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-rose-300 bg-rose-50 text-rose-800 text-xs font-semibold hover:bg-rose-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <FileDown className="w-4 h-4" />
                <span>تصدير PDF</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم، الرقم القومي، الهاتف، رقم التسجيل..."
            className="w-full rounded-lg border border-slate-300 pr-9 pl-3 py-2 text-xs focus:border-[#0F2C59] focus:outline-none"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-[#0F2C59] focus:outline-none"
        >
          <option value="الكل">كل الحالات</option>
          {CITIZEN_REVIEW_STATUSES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>

        <select
          value={govFilter}
          onChange={(e) => setGovFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-[#0F2C59] focus:outline-none"
        >
          <option value="الكل">كل المحافظات</option>
          {EGYPT_GOVERNORATES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        <select
          value={ageRange}
          onChange={(e) => setAgeRange(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-[#0F2C59] focus:outline-none"
        >
          <option value="الكل">كل الفئات العمرية</option>
          <option value="18-30">18 – 30 سنة</option>
          <option value="31-50">31 – 50 سنة</option>
          <option value="51+">51 سنة فأكثر</option>
        </select>
      </div>

      {/* Citizens Table or Empty State */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filteredCitizens.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-[#0F2C59]/10 text-[#0F2C59] flex items-center justify-center mx-auto mb-4">
              <Users className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1.5">
              {citizens.length === 0
                ? 'جدول المواطنين فارغ حالياً'
                : 'لا توجد نتائج مطابقة لمعايير البحث'}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mb-6 leading-relaxed">
              {citizens.length === 0
                ? 'لم يتم تسجيل أي مواطنين بعد. يمكنك البدء بتسجيل مواطن جديد مباشرة، أو استيراد ملف Excel، أو انتظار التسجيلات الواردة من بوابة المواطن.'
                : 'جرّب تغيير كلمات البحث أو إعادة ضبط فلاتر المحافظة والحالة.'}
            </p>
            {citizens.length === 0 && canCreate && (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0F2C59] text-white text-xs font-semibold hover:bg-[#0A1E3D] transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>تسجيل أول مواطن</span>
                </button>
                <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>استيراد ملف Excel</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => void handleImportExcel(e)}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600">
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">رقم التسجيل</th>
                  <th className="py-3 px-4">الاسم الرباعي</th>
                  <th className="py-3 px-4">الرقم القومي</th>
                  <th className="py-3 px-4">الهاتف</th>
                  <th className="py-3 px-4">النطاق الجغرافي</th>
                  <th className="py-3 px-4">الحالة</th>
                  <th className="py-3 px-4">تاريخ التسجيل</th>
                  <th className="py-3 px-4">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredCitizens.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono-num text-slate-500">{c.seqNumber}</td>
                    <td className="py-3 px-4 font-mono-num font-semibold text-[#0F2C59]">
                      {c.registrationNumber}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{c.fullName}</td>
                    <td className="py-3 px-4 font-mono-num text-slate-700">{c.nationalId}</td>
                    <td className="py-3 px-4 font-mono-num text-slate-700">{c.phone}</td>
                    <td className="py-3 px-4 text-slate-600">
                      {c.governorate} · {c.center}
                    </td>
                    <td className="py-3 px-4">
                      <StatusTag status={c.reviewStatus} />
                    </td>
                    <td className="py-3 px-4 font-mono-num text-slate-500">
                      {formatDateDMY(c.createdAt)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void openProfile(c)}
                          className="p-1.5 rounded hover:bg-slate-100 text-[#0F2C59] cursor-pointer"
                          title="عرض الملف الشخصي"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => openEditModal(c)}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-600 cursor-pointer"
                            title="تعديل البيانات"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Citizen Modal */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h3 className="text-base font-bold text-[#0F2C59]">
                {editingCitizen ? `تعديل بيانات: ${editingCitizen.fullName}` : 'تسجيل مواطن جديد'}
              </h3>
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                className="p-1.5 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCitizen} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">الاسم الرباعي *</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-[#0F2C59] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">الرقم القومي (14 رقماً) *</label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingCitizen)}
                    maxLength={14}
                    value={nationalId}
                    onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ''))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono-num disabled:bg-slate-100 focus:border-[#0F2C59] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">السن *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={120}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono-num focus:border-[#0F2C59] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">رقم الهاتف (11 رقماً) *</label>
                  <input
                    type="tel"
                    required
                    maxLength={11}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono-num focus:border-[#0F2C59] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">رقم الواتساب</label>
                  <input
                    type="tel"
                    maxLength={15}
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ''))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono-num focus:border-[#0F2C59] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">المحافظة *</label>
                  <select
                    value={governorate}
                    onChange={(e) => {
                      setGovernorate(e.target.value);
                      setCenter('');
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-[#0F2C59] focus:outline-none"
                  >
                    {EGYPT_GOVERNORATES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">القسم / المركز / الحي *</label>
                  <DistrictSelect
                    governorate={governorate}
                    value={center}
                    customDistricts={customDistricts}
                    onChange={(val) => setCenter(val)}
                    onCustomDistrictAdded={onCustomDistrictsChange}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">القرية / الشياخة</label>
                  <input
                    type="text"
                    value={village}
                    onChange={(e) => setVillage(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-[#0F2C59] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">حالة البيانات</label>
                  <select
                    value={reviewStatus}
                    onChange={(e) => setReviewStatus(e.target.value as CitizenReviewStatus)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-[#0F2C59] focus:outline-none"
                  >
                    {CITIZEN_REVIEW_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">العنوان التفصيلي *</label>
                  <input
                    type="text"
                    required
                    value={detailedAddress}
                    onChange={(e) => setDetailedAddress(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-[#0F2C59] focus:outline-none"
                  />
                </div>
                <IdCardCaptureInput
                  label="صورة البطاقة الأمامية"
                  value={frontFile}
                  onChange={setFrontFile}
                />
                <IdCardCaptureInput
                  label="صورة البطاقة الخلفية"
                  value={backFile}
                  onChange={setBackFile}
                />
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">ملاحظات المراجعة</label>
                  <textarea
                    rows={2}
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-[#0F2C59] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-[#0F2C59] text-white text-xs font-semibold hover:bg-[#0A1E3D] disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'جارٍ الحفظ...' : 'حفظ البيانات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Citizen Profile & Protected ID Viewer Modal */}
      {viewingCitizen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-6 space-y-6">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold text-[#0F2C59]">{viewingCitizen.fullName}</h3>
                  <StatusTag status={viewingCitizen.reviewStatus} />
                </div>
                <p className="text-xs text-slate-500 mt-1 font-mono-num">
                  رقم التسجيل: {viewingCitizen.registrationNumber} · الرقم القومي: {viewingCitizen.nationalId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingCitizen(null)}
                className="p-1.5 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs bg-[#F5F7FA] rounded-lg p-4 border border-slate-200">
              <div>
                <p className="text-slate-500">السن</p>
                <p className="font-bold text-slate-900 mt-0.5 font-mono-num">{viewingCitizen.age} سنة</p>
              </div>
              <div>
                <p className="text-slate-500">الهاتف</p>
                <p className="font-bold text-slate-900 mt-0.5 font-mono-num">{viewingCitizen.phone}</p>
              </div>
              <div>
                <p className="text-slate-500">الواتساب</p>
                <p className="font-bold text-slate-900 mt-0.5 font-mono-num">{viewingCitizen.whatsapp || '—'}</p>
              </div>
              <div>
                <p className="text-slate-500">تاريخ التسجيل</p>
                <p className="font-bold text-slate-900 mt-0.5 font-mono-num">{formatDateDMY(viewingCitizen.createdAt)}</p>
              </div>
              <div className="col-span-2 sm:col-span-4 pt-2 border-t border-slate-200">
                <p className="text-slate-500">العنوان الكامل</p>
                <p className="font-semibold text-slate-900 mt-0.5">
                  {viewingCitizen.governorate} – {viewingCitizen.center}
                  {viewingCitizen.village ? ` – ${viewingCitizen.village}` : ''} · {viewingCitizen.detailedAddress}
                </p>
              </div>
            </div>

            {canReview && (
              <div className="flex flex-wrap items-center gap-2 border-t border-b border-slate-100 py-3">
                <span className="text-xs font-bold text-slate-700 ml-2">إجراء المراجعة:</span>
                <button
                  type="button"
                  onClick={() => void handleReviewStatusChange(viewingCitizen, 'بيانات كاملة')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold hover:bg-emerald-100 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>اعتماد (بيانات كاملة)</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleReviewStatusChange(viewingCitizen, 'مطلوب استكمال بيانات')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold hover:bg-amber-100 cursor-pointer"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>طلب استكمال</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleReviewStatusChange(viewingCitizen, 'مرفوض')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-800 border border-red-200 text-xs font-semibold hover:bg-red-100 cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>رفض التسجيل</span>
                </button>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-[#0F2C59] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>صور بطاقة الرقم القومي (وصول مسجل ومقيد)</span>
                </h4>
              </div>
              {!canViewIdCards ? (
                <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-4">
                  صلاحيات دورك الوظيفي لا تسمح بالاطلاع على صور البطاقات الشخصية.
                </p>
              ) : loadingDocs ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="h-36 bg-slate-100 rounded-lg animate-pulse" />
                  <div className="h-36 bg-slate-100 rounded-lg animate-pulse" />
                </div>
              ) : !idDocs.front && !idDocs.back ? (
                <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-4">
                  لا توجد صور بطاقة مرفقة لهذا السجل حتى الآن.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {idDocs.front && (
                    <div className="border border-slate-200 rounded-lg p-2 bg-slate-50">
                      <p className="text-[11px] font-semibold text-slate-600 mb-1.5">الوجه الأمامي</p>
                      <img
                        src={idDocs.front}
                        alt="صورة البطاقة الأمامية"
                        className="w-full h-44 object-contain rounded bg-white"
                      />
                    </div>
                  )}
                  {idDocs.back && (
                    <div className="border border-slate-200 rounded-lg p-2 bg-slate-50">
                      <p className="text-[11px] font-semibold text-slate-600 mb-1.5">الوجه الخلفي</p>
                      <img
                        src={idDocs.back}
                        alt="صورة البطاقة الخلفية"
                        className="w-full h-44 object-contain rounded bg-white"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-xs font-bold text-[#0F2C59] mb-2">الطلبات المرتبطة بهذا المواطن</h4>
              {requests.filter((r) => r.citizenId === viewingCitizen.id).length === 0 ? (
                <p className="text-xs text-slate-500">لا توجد طلبات مسجلة لهذا المواطن.</p>
              ) : (
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
                  {requests
                    .filter((r) => r.citizenId === viewingCitizen.id)
                    .map((r) => (
                      <div key={r.id} className="p-3 flex items-center justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900">
                            {r.requestNumber} · {r.title}
                          </p>
                          <p className="text-slate-500 mt-0.5 font-mono-num">
                            {r.requestType} · {formatDateDMY(r.submissionDate)}
                          </p>
                        </div>
                        <StatusTag status={r.status} />
                      </div>
                    ))}
                </div>
              )}
            </div>

            {canDelete && (
              <div className="pt-4 border-t border-slate-200 flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleDeleteCitizen(viewingCitizen)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>حذف سجل المواطن</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
