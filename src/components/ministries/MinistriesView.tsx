import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Plus,
  Search,
  Edit3,
  Power,
  Trash2,
  Upload,
  X,
  FileSpreadsheet,
  FileDown,
  Download,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiRequest, downloadAuthorizedFile } from '../../lib/api';
import { Ministry, RequestRecord } from '../../types/poms';
import { exportRowsToExcel, toIsoDate } from '../../utils/formatters';
import { exportTableToArabicPdf } from '../../utils/pdfExport';
import { StatusTag } from '../common/StatusTag';

interface MinistriesViewProps {
  ministries: Ministry[];
  requests: RequestRecord[];
  loading: boolean;
  openCreateInitially?: boolean;
  onConsumeOpenCreate?: () => void;
  initialSearchQuery?: string;
  onRefresh: () => Promise<void>;
}

export function MinistriesView({
  ministries,
  requests,
  loading,
  openCreateInitially,
  onConsumeOpenCreate,
  initialSearchQuery,
  onRefresh,
}: MinistriesViewProps) {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || '');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Ministry | null>(null);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [sector, setSector] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [departmentsText, setDepartmentsText] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialSearchQuery !== undefined && initialSearchQuery !== '') {
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  useEffect(() => {
    if (openCreateInitially) {
      openCreate();
      onConsumeOpenCreate?.();
    }
  }, [openCreateInitially]);

  const canManage = hasPermission('ministries.manage');
  const canDelete = hasPermission('employees.manage');

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ministries.filter(
      (m) =>
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.code.toLowerCase().includes(q) ||
        m.sector.toLowerCase().includes(q)
    );
  }, [ministries, searchQuery]);

  const requestCountByMinistry = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of requests) {
      if (r.ministryId) {
        map.set(r.ministryId, (map.get(r.ministryId) || 0) + 1);
      }
    }
    return map;
  }, [requests]);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setCode('');
    setSector('خدمات عامة');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setAddress('');
    setDepartmentsText('');
    setNotes('');
    setShowModal(true);
  };

  const openEdit = (m: Ministry) => {
    setEditing(m);
    setName(m.name);
    setCode(m.code);
    setSector(m.sector);
    setContactPerson(m.contactPerson || '');
    setPhone(m.phone || '');
    setEmail(m.email || '');
    setAddress(m.address || '');
    setDepartmentsText(m.departments.join('، '));
    setNotes(m.notes || '');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || saving) return;

    const trimmedName = name.trim();
    const departments = departmentsText
      .split(/[,،]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 30);

    setSaving(true);
    try {
      const payload = {
        name: trimmedName,
        code: code.trim() || editing?.code || `MIN-${ministries.length + 1}`,
        sector: sector.trim() || 'عام',
        contactPerson: contactPerson.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        departments,
        notes: notes.trim(),
      };
      if (editing) {
        await apiRequest(`/api/ministries/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('تم تحديث بيانات الوزارة بنجاح.', 'success');
      } else {
        await apiRequest('/api/ministries', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('تمت إضافة الوزارة وإنشاء مجلدها الخاص بالأرشيف.', 'success');
      }
      await onRefresh();
      setShowModal(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر حفظ الوزارة.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (m: Ministry) => {
    if (!canManage) return;
    try {
      await apiRequest(`/api/ministries/${m.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !m.isActive }),
      });
      await onRefresh();
      showToast(m.isActive ? 'تم تعطيل الوزارة.' : 'تم تفعيل الوزارة.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر التحديث.', 'error');
    }
  };

  const handleSafeDelete = async (m: Ministry) => {
    if (!canDelete) return;
    try {
      await apiRequest(`/api/ministries/${m.id}`, { method: 'DELETE' });
      await onRefresh();
      showToast('تم حذف الوزارة بنجاح.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر حذف الوزارة.', 'warning');
    }
  };

  const handleImportMinistries = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canManage) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
      const res = await apiRequest<{ added: number }>('/api/ministries/import', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      await onRefresh();
      showToast(`تم استيراد ${res.added} وزارة بدون تكرار.`, 'success');
    } catch {
      showToast('تعذر قراءة ملف الوزارات.', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleExportMinistriesExcel = () => {
    const rows = filtered.map((m) => ({
      'الكود': m.code,
      'اسم الوزارة / الجهة': m.name,
      'القطاع': m.sector,
      'مسؤول الاتصال': m.contactPerson || '—',
      'الهاتف': m.phone || '—',
      'إجمالي الطلبات': requestCountByMinistry.get(m.id) || 0,
      'الحالة': m.isActive ? 'نشط' : 'معطل',
    }));
    exportRowsToExcel(rows, 'الوزارات', `الوزارات_والجهات_${toIsoDate()}.xlsx`);
    showToast('تم تصدير سجل الوزارات بصيغة Excel.', 'success');
  };

  const handleExportMinistriesPdf = () => {
    exportTableToArabicPdf({
      title: 'دليل الوزارات والجهات الحكومية',
      subtitle: 'كشف الجهات المتعامل معها مكتب النائب محمد كليب وإحصائية الطلبات المرتبطة',
      summary: [
        { label: 'إجمالي الجهات', value: filtered.length },
        { label: 'جهات نشطة', value: filtered.filter((m) => m.isActive).length },
      ],
      columns: ['الكود', 'اسم الوزارة / الجهة', 'القطاع', 'مسؤول الاتصال', 'الهاتف', 'عدد الطلبات', 'الحالة'],
      rows: filtered.map((m) => [
        m.code,
        m.name,
        m.sector,
        m.contactPerson || '—',
        m.phone || '—',
        requestCountByMinistry.get(m.id) || 0,
        m.isActive ? 'نشط' : 'معطل',
      ]),
    });
    showToast('تم فتح نافذة تصدير دليل الوزارات بصيغة PDF.', 'success');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#0F2C59]">قاعدة بيانات الوزارات والجهات الحكومية</h2>
          <p className="text-xs text-slate-500 mt-1">
            إجمالي الجهات المسجلة: <span className="font-bold font-mono-num text-slate-900">{ministries.length}</span> جهة · يتم إنشاء مجلد أرشيف مستقل لكل وزارة
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void downloadAuthorizedFile('/api/local-storage/excel/ministries', 'سجل_الوزارات.xlsx')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>شيت الوزارات (.xlsx)</span>
          </button>
          {filtered.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleExportMinistriesExcel}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#C5A253] bg-[#C5A253]/10 text-[#0F2C59] text-xs font-semibold hover:bg-[#C5A253]/20 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>تصدير Excel</span>
              </button>
              <button
                type="button"
                onClick={handleExportMinistriesPdf}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-rose-300 bg-rose-50 text-rose-800 text-xs font-semibold hover:bg-rose-100 cursor-pointer"
              >
                <FileDown className="w-4 h-4" />
                <span>تصدير PDF</span>
              </button>
            </>
          )}
          {canManage && (
            <>
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>استيراد Excel</span>
                <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => void handleImportMinistries(e)} className="hidden" />
              </label>
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F2C59] text-white text-xs font-semibold hover:bg-[#0A1E3D] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة وزارة / جهة</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث باسم الوزارة أو الكود أو القطاع..."
            className="w-full rounded-lg border border-slate-300 pr-9 pl-3 py-2 text-xs focus:border-[#0F2C59] focus:outline-none"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-[#0F2C59]/10 text-[#0F2C59] flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1.5">لا توجد وزارات مسجلة حالياً</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mb-5">
              يمكنك إضافة الوزارات والجهات الحكومية يدوياً أو استيراد ملف قائمة الوزارات الرسمي بدون تكرار.
            </p>
            {canManage && (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0F2C59] text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة أول وزارة</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600">
                  <th className="py-3 px-4">الكود</th>
                  <th className="py-3 px-4">اسم الوزارة / الجهة</th>
                  <th className="py-3 px-4">القطاع</th>
                  <th className="py-3 px-4">مسؤول الاتصال</th>
                  <th className="py-3 px-4">الطلبات المرتبطة</th>
                  <th className="py-3 px-4">الحالة</th>
                  {canManage && <th className="py-3 px-4">إجراءات</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map((m) => {
                  const reqs = requests.filter((r) => r.ministryId === m.id);
                  const completed = reqs.filter((r) => r.status === 'مكتمل').length;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono-num font-bold text-[#0F2C59]">{m.code}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {m.name}
                        {m.departments.length > 0 && (
                          <span className="block text-[11px] font-normal text-slate-500 mt-0.5">
                            الإدارات: {m.departments.join('، ')}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{m.sector}</td>
                      <td className="py-3 px-4 text-slate-600">
                        {m.contactPerson || '—'}
                        {m.phone && <span className="block font-mono-num text-[11px]">{m.phone}</span>}
                      </td>
                      <td className="py-3 px-4 font-mono-num">
                        <span className="font-bold text-slate-900">{reqs.length}</span>
                        <span className="text-slate-400 mx-1">/</span>
                        <span className="text-emerald-700">مكتمل: {completed}</span>
                      </td>
                      <td className="py-3 px-4">
                        <StatusTag status={m.isActive ? 'نشط' : 'معطل'} />
                      </td>
                      {canManage && (
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEdit(m)}
                              className="p-1.5 rounded hover:bg-slate-100 text-slate-600 cursor-pointer"
                              title="تعديل"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleActive(m)}
                              className="p-1.5 rounded hover:bg-slate-100 text-amber-700 cursor-pointer"
                              title={m.isActive ? 'تعطيل' : 'تفعيل'}
                            >
                              <Power className="w-4 h-4" />
                            </button>
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => void handleSafeDelete(m)}
                                className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                                title="حذف آمن"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h3 className="text-base font-bold text-[#0F2C59]">
                {editing ? `تعديل: ${editing.name}` : 'إضافة وزارة أو جهة حكومية'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">اسم الوزارة / الجهة *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">الكود المختصر *</label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="MOH"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">القطاع *</label>
                  <input
                    type="text"
                    required
                    value={sector}
                    onChange={(e) => setSector(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">مسؤول الاتصال</label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">رقم الهاتف</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono-num"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">العنوان</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">الإدارات التابعة (مفصولة بفاصلة)</label>
                  <input
                    type="text"
                    value={departmentsText}
                    onChange={(e) => setDepartmentsText(e.target.value)}
                    placeholder="إدارة التخطيط، إدارة خدمة المواطنين، الشؤون القانونية"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-[#0F2C59] text-white text-xs font-semibold cursor-pointer"
                >
                  {saving ? 'جارٍ الحفظ...' : 'حفظ الوزارة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
