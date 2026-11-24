import React, { useEffect, useMemo, useState } from 'react';
import {
  UserCog,
  Plus,
  Edit3,
  Power,
  X,
  BarChart3,
  Clock,
  FileSpreadsheet,
  ShieldCheck,
  FileDown,
  Send,
  Download,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiRequest, downloadAuthorizedFile } from '../../lib/api';
import {
  ALL_PERMISSIONS,
  Employee,
  EmployeeRole,
  PrintedDocument,
  RequestHistory,
  RequestRecord,
  ROLE_DEFAULT_PERMISSIONS,
  ROLE_LABELS,
} from '../../types/poms';
import { StatusTag } from '../common/StatusTag';
import { DateInputDMY } from '../common/DateInputDMY';
import { SendTaskModal } from '../common/SendTaskModal';
import {
  daysBetween,
  exportRowsToExcel,
  formatActiveHours,
  formatDateTimeDMY,
  toIsoDate,
} from '../../utils/formatters';
import { exportTableToArabicPdf } from '../../utils/pdfExport';

interface EmployeesViewProps {
  employees: Employee[];
  requests: RequestRecord[];
  requestHistory: RequestHistory[];
  printedDocs: PrintedDocument[];
  openCreateInitially?: boolean;
  onConsumeOpenCreate?: () => void;
  onRefresh: () => Promise<void>;
}

export function EmployeesView({
  employees,
  requests,
  requestHistory,
  printedDocs,
  openCreateInitially,
  onConsumeOpenCreate,
  onRefresh,
}: EmployeesViewProps) {
  const { employee: currentEmp, hasPermission } = useAuth();
  const { showToast } = useToast();

  const [tab, setTab] = useState<'accounts' | 'performance'>('accounts');
  const [showModal, setShowModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [taskRecipientUid, setTaskRecipientUid] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [role, setRole] = useState<EmployeeRole>('reception');
  const [permissions, setPermissions] = useState<string[]>(ROLE_DEFAULT_PERMISSIONS.reception);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Performance filters (YYYY-MM-DD internal, input formatted DD/MM/YYYY via DateInputDMY)
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    if (openCreateInitially) {
      openCreateModal();
      onConsumeOpenCreate?.();
    }
  }, [openCreateInitially]);

  const canManage = hasPermission('employees.manage');

  const permissionGroups = useMemo(() => {
    const map = new Map<string, typeof ALL_PERMISSIONS>();
    for (const p of ALL_PERMISSIONS) {
      const list = map.get(p.group) || [];
      list.push(p);
      map.set(p.group, list);
    }
    return Array.from(map.entries());
  }, []);

  const performanceRows = useMemo(() => {
    return employees.map((emp) => {
      const assigned = requests.filter((r) => {
        if (r.assignedToUid !== emp.uid && r.createdByUid !== emp.uid) return false;
        if (dateFrom && r.submissionDate < dateFrom) return false;
        if (dateTo && r.submissionDate > dateTo) return false;
        return true;
      });
      const completed = assigned.filter((r) => r.status === 'مكتمل');
      const pending = assigned.filter((r) => !['مكتمل', 'مرفوض'].includes(r.status));
      const overdue = pending.filter((r) => daysBetween(r.submissionDate) > 7);

      const completionDays = completed
        .filter((r) => r.completionDate && r.submissionDate)
        .map((r) => Math.max(0, daysBetween(r.submissionDate, new Date(r.completionDate!))));
      const avgDays =
        completionDays.length > 0
          ? (completionDays.reduce((a, b) => a + b, 0) / completionDays.length).toFixed(1)
          : '—';

      const followups = requestHistory.filter((h) => h.actorUid === emp.uid).length;
      const prints = printedDocs.filter((p) => p.printedByUid === emp.uid).length;
      const completionRate =
        assigned.length > 0 ? Math.round((completed.length / assigned.length) * 100) : 0;

      return {
        emp,
        received: assigned.length,
        completed: completed.length,
        pending: pending.length,
        overdue: overdue.length,
        avgDays,
        completionRate,
        followups,
        prints,
      };
    });
  }, [employees, requests, requestHistory, printedDocs, dateFrom, dateTo]);

  if (!canManage) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
        <p className="text-sm font-bold text-slate-900">صلاحية مقصورة على مدير المكتب</p>
        <p className="text-xs text-slate-500 mt-1">لا تملك صلاحية إدارة حسابات الموظفين.</p>
      </div>
    );
  }

  const openCreateModal = () => {
    setEditingEmp(null);
    setUsername('');
    setPassword('');
    setFullName('');
    setPhone('');
    setNationalId('');
    setJobTitle('');
    setDepartment('استقبال المواطنين');
    setRole('reception');
    setPermissions([...ROLE_DEFAULT_PERMISSIONS.reception]);
    setNotes('');
    setShowModal(true);
  };

  const openEditModal = (emp: Employee) => {
    setEditingEmp(emp);
    setUsername(emp.username);
    setPassword('');
    setFullName(emp.fullName);
    setPhone(emp.phone || '');
    setNationalId(emp.nationalId || '');
    setJobTitle(emp.jobTitle);
    setDepartment(emp.department);
    setRole(emp.role);
    setPermissions([...emp.permissions]);
    setNotes(emp.notes || '');
    setShowModal(true);
  };

  const handleRolePresetChange = (nextRole: EmployeeRole) => {
    setRole(nextRole);
    setPermissions([...ROLE_DEFAULT_PERMISSIONS[nextRole]]);
  };

  const togglePermission = (key: string) => {
    setPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    if (!editingEmp && password.length < 6) {
      showToast('كلمة المرور يجب أن تكون 6 أحرف على الأقل.', 'warning');
      return;
    }

    setSaving(true);
    try {
      if (editingEmp) {
        await apiRequest(`/api/employees/${editingEmp.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            fullName: fullName.trim(),
            phone: phone.trim(),
            nationalId: nationalId.trim(),
            jobTitle: jobTitle.trim() || ROLE_LABELS[role],
            department: department.trim(),
            role,
            permissions,
            notes: notes.trim(),
            ...(password.length >= 6 ? { password } : {}),
          }),
        });
        showToast('تم تحديث بيانات الموظف وصلاحياته وحفظها في سجل Excel.', 'success');
      } else {
        await apiRequest('/api/employees', {
          method: 'POST',
          body: JSON.stringify({
            username: username.trim().toLowerCase(),
            password,
            fullName: fullName.trim(),
            phone: phone.trim(),
            nationalId: nationalId.trim(),
            jobTitle: jobTitle.trim() || ROLE_LABELS[role],
            department: department.trim() || 'مكتب النائب محمد كليب',
            role,
            permissions,
            notes: notes.trim(),
          }),
        });
        showToast('تم إنشاء حساب الموظف ومجلده الخاص وتحديث سجل الموظفين Excel.', 'success');
      }
      await onRefresh();
      setShowModal(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر حفظ بيانات الموظف.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleEmployeeStatus = async (emp: Employee) => {
    if (emp.uid === currentEmp?.uid) {
      showToast('لا يمكنك تعطيل حسابك النشط.', 'warning');
      return;
    }
    const next = emp.status === 'active' ? 'inactive' : 'active';
    try {
      await apiRequest(`/api/employees/${emp.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: next }),
      });
      await onRefresh();
      showToast(next === 'active' ? 'تم تفعيل حساب الموظف.' : 'تم تعطيل حساب الموظف.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر تغيير حالة الحساب.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#0F2C59]">إدارة الموظفين والصلاحيات وتتبع النشاط</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            حسابات دخول باسم المستخدم وكلمة المرور يحددها المدير، مع تحديد المسمى الوظيفي والصلاحيات وساعات العمل والخطابات والشكاوى
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setTab('accounts')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                tab === 'accounts' ? 'bg-white text-[#0F2C59] shadow-sm' : 'text-slate-600'
              }`}
            >
              الحسابات والصلاحيات
            </button>
            <button
              type="button"
              onClick={() => setTab('performance')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                tab === 'performance' ? 'bg-white text-[#0F2C59] shadow-sm' : 'text-slate-600'
              }`}
            >
              تقييم الأداء والنشاط
            </button>
          </div>
          <button
            type="button"
            onClick={() => void downloadAuthorizedFile('/api/local-storage/excel/employees', 'سجل_الموظفين.xlsx')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>شيت الموظفين (.xlsx)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const rows = employees.map((e) => ({
                'الاسم الكامل': e.fullName,
                'المسمى الوظيفي': e.jobTitle,
                'اسم المستخدم': e.username,
                'القسم': e.department,
                'الدور': ROLE_LABELS[e.role],
                'ساعات العمل': formatActiveHours(e.activeSeconds),
                'الشكاوى/الطلبات': e.requestsCreatedCount || 0,
                'الخطابات': e.lettersCreatedCount || 0,
                'الطباعة': e.printsCount || 0,
                'الحالة': e.status === 'active' ? 'نشط' : 'معطل',
              }));
              exportRowsToExcel(rows, 'الموظفين', `تقرير_الموظفين_${toIsoDate()}.xlsx`);
              showToast('تم تصدير سجل الموظفين بصيغة Excel.', 'success');
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#C5A253] bg-[#C5A253]/10 text-[#0F2C59] text-xs font-semibold hover:bg-[#C5A253]/20 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>تصدير Excel</span>
          </button>
          <button
            type="button"
            onClick={() => {
              exportTableToArabicPdf({
                title: 'سجل الموظفين والأداء وساعات العمل',
                subtitle: 'تقرير الصلاحيات والمسميات الوظيفية ومؤشرات الإنجاز',
                summary: [
                  { label: 'إجمالي الموظفين', value: employees.length },
                  { label: 'النشطون', value: employees.filter((e) => e.status === 'active').length },
                ],
                columns: ['الاسم', 'المسمى الوظيفي', 'اسم المستخدم', 'القسم', 'ساعات العمل', 'طلبات', 'خطابات', 'طباعة', 'الحالة'],
                rows: employees.map((e) => [
                  e.fullName,
                  e.jobTitle,
                  `@${e.username}`,
                  e.department,
                  formatActiveHours(e.activeSeconds),
                  e.requestsCreatedCount || 0,
                  e.lettersCreatedCount || 0,
                  e.printsCount || 0,
                  e.status === 'active' ? 'نشط' : 'معطل',
                ]),
              });
              showToast('تم فتح نافذة تصدير سجل الموظفين بصيغة PDF.', 'success');
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-rose-300 bg-rose-50 text-rose-800 text-xs font-semibold hover:bg-rose-100 cursor-pointer"
          >
            <FileDown className="w-4 h-4" />
            <span>تصدير PDF</span>
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F2C59] text-white text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة موظف</span>
          </button>
        </div>
      </div>

      {tab === 'accounts' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center gap-2 text-xs font-bold text-[#0F2C59]">
            <UserCog className="w-4 h-4" />
            <span>حسابات الموظفين المسجلة ({employees.length})</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600">
                  <th className="py-3 px-4">الاسم والمسمى الوظيفي</th>
                  <th className="py-3 px-4">اسم المستخدم والهاتف</th>
                  <th className="py-3 px-4">القسم / الدور</th>
                  <th className="py-3 px-4">ساعات العمل على النظام</th>
                  <th className="py-3 px-4">إحصائيات النشاط</th>
                  <th className="py-3 px-4">آخر دخول / نشاط</th>
                  <th className="py-3 px-4">الحالة</th>
                  <th className="py-3 px-4">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900">{emp.fullName}</span>
                        <span className="px-2 py-0.5 rounded bg-[#C5A253]/20 text-[#0F2C59] text-[11px] font-bold">
                          {emp.jobTitle}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 mt-0.5 block">
                        الصلاحيات الممنوحة: {emp.permissions.length} صلاحية
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <span className="font-mono-num font-bold text-[#0F2C59]">@{emp.username}</span>
                      {emp.phone && (
                        <span className="block font-mono-num text-[11px] text-slate-500">{emp.phone}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <span className="font-semibold text-slate-800">{emp.department}</span>
                      <span className="block text-[11px] text-[#0F2C59]">{ROLE_LABELS[emp.role]}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 font-mono-num font-bold text-[#0F2C59]">
                        <Clock className="w-3.5 h-3.5 text-[#C5A253]" />
                        {formatActiveHours(emp.activeSeconds)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[11px] text-slate-700 space-y-0.5 font-mono-num">
                      <p>شكاوى/طلبات: <strong>{emp.requestsCreatedCount || 0}</strong></p>
                      <p>خطابات: <strong>{emp.lettersCreatedCount || 0}</strong> · طباعة: <strong>{emp.printsCount || 0}</strong></p>
                      <p>مواطنون مسجلون: <strong>{emp.citizensRegisteredCount || 0}</strong></p>
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      <span className="font-mono-num">{formatDateTimeDMY(emp.lastLoginAt)}</span>
                      {emp.lastActivityLabel && (
                        <span className="block text-[11px] text-slate-400 truncate max-w-[160px]">
                          {emp.lastActivityLabel}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <StatusTag status={emp.status === 'active' ? 'نشط' : 'معطل'} />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        {emp.status === 'active' && (
                          <button
                            type="button"
                            onClick={() => setTaskRecipientUid(emp.uid)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#0F2C59]/10 hover:bg-[#0F2C59]/15 text-[#0F2C59] text-[11px] font-bold cursor-pointer"
                            title="إرسال إشعار وتكليف عمل للموظف"
                          >
                            <Send className="w-3 h-3" />
                            <span>تكليف</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEditModal(emp)}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
                          title="تعديل البيانات والصلاحيات وكلمة المرور"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {emp.uid !== currentEmp?.uid && (
                          <button
                            type="button"
                            onClick={() => void toggleEmployeeStatus(emp)}
                            className="p-1.5 rounded hover:bg-slate-100 text-amber-700 cursor-pointer"
                            title={emp.status === 'active' ? 'تعطيل' : 'تفعيل'}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2 font-bold text-[#0F2C59]">
              <BarChart3 className="w-4 h-4" />
              <span>تصفية الفترة (يوم / شهر / سنة):</span>
            </div>
            <div className="flex items-center gap-2">
              <span>من:</span>
              <div className="w-44">
                <DateInputDMY value={dateFrom} onChange={setDateFrom} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span>إلى:</span>
              <div className="w-44">
                <DateInputDMY value={dateTo} onChange={setDateTo} />
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600">
                    <th className="py-3 px-4">الموظف والمسمى الوظيفي</th>
                    <th className="py-3 px-4">ساعات التواجد بالنظام</th>
                    <th className="py-3 px-4">الطلبات المسجلة/المسندة</th>
                    <th className="py-3 px-4">المكتملة</th>
                    <th className="py-3 px-4">نسبة الإنجاز</th>
                    <th className="py-3 px-4">متوسط الزمن (يوم)</th>
                    <th className="py-3 px-4">الخطابات المحررة</th>
                    <th className="py-3 px-4">المتابعة</th>
                    <th className="py-3 px-4">الطباعة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-mono-num">
                  {performanceRows.map((row) => (
                    <tr key={row.emp.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-sans">
                        <p className="font-bold text-slate-900">{row.emp.fullName}</p>
                        <p className="text-[11px] text-[#0F2C59] font-semibold">{row.emp.jobTitle}</p>
                      </td>
                      <td className="py-3 px-4 font-bold text-[#0F2C59]">{formatActiveHours(row.emp.activeSeconds)}</td>
                      <td className="py-3 px-4">{row.received}</td>
                      <td className="py-3 px-4 text-emerald-700 font-bold">{row.completed}</td>
                      <td className="py-3 px-4 font-bold text-[#0F2C59]">{row.completionRate}%</td>
                      <td className="py-3 px-4">{row.avgDays}</td>
                      <td className="py-3 px-4">{row.emp.lettersCreatedCount || 0}</td>
                      <td className="py-3 px-4">{row.followups}</td>
                      <td className="py-3 px-4">{row.prints}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Employee Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-[#0F2C59]">
                {editingEmp ? `تعديل الموظف: ${editingEmp.fullName}` : 'إضافة موظف جديد (اسم مستخدم وكلمة مرور)'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">الاسم الكامل للموظف *</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">المسمى الوظيفي (يظهر بجانب الموظف) *</label>
                  <input
                    type="text"
                    required
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="مثال: أخصائي شؤون مواطنين / سكرتير تنفيذي"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">اسم المستخدم للدخول *</label>
                  <input
                    type="text"
                    dir="auto"
                    required
                    disabled={Boolean(editingEmp)}
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ''))}
                    placeholder="ahmed_ali"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono-num disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {editingEmp ? 'كلمة مرور جديدة (اتركها فارغة للإبقاء على الحالية)' : 'كلمة المرور (6 أحرف فأكثر) *'}
                  </label>
                  <input
                    type="password"
                    dir="ltr"
                    required={!editingEmp}
                    minLength={editingEmp ? undefined : 6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-left"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">رقم الهاتف</label>
                  <input
                    type="tel"
                    maxLength={11}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">الرقم القومي للموظف</label>
                  <input
                    type="text"
                    maxLength={14}
                    value={nationalId}
                    onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ''))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">القسم *</label>
                  <input
                    type="text"
                    required
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">الدور الافتراضي (لتحميل الصلاحيات بسرعة)</label>
                  <select
                    value={role}
                    onChange={(e) => handleRolePresetChange(e.target.value as EmployeeRole)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                  >
                    <option value="reception">موظف استقبال</option>
                    <option value="followup">موظف متابعة</option>
                    <option value="printing">موظف طباعة</option>
                    <option value="super_admin">مدير المكتب (كافة الصلاحيات)</option>
                  </select>
                </div>
              </div>

              {/* Granular Custom Permissions Checkboxes */}
              <div className="border border-slate-200 rounded-xl p-4 bg-[#F5F7FA]/60 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[#0F2C59] flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    <span>تخصيص صلاحيات الموظف بدقة ({permissions.length} محددة)</span>
                  </h4>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPermissions(ALL_PERMISSIONS.map((p) => p.key))}
                      className="text-[11px] font-semibold text-[#0F2C59] hover:underline cursor-pointer"
                    >
                      تحديد الكل
                    </button>
                    <button
                      type="button"
                      onClick={() => setPermissions([])}
                      className="text-[11px] font-semibold text-red-600 hover:underline cursor-pointer"
                    >
                      إلغاء الكل
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
                  {permissionGroups.map(([groupName, items]) => (
                    <div key={groupName} className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
                      <p className="text-[11px] font-bold text-[#0F2C59] border-b border-slate-100 pb-1">
                        {groupName}
                      </p>
                      {items.map((perm) => (
                        <label key={perm.key} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={permissions.includes(perm.key)}
                            onChange={() => togglePermission(perm.key)}
                            className="rounded border-slate-300"
                          />
                          <span>{perm.label}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">ملاحظات إدارية</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
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
                  {saving ? 'جارٍ الحفظ...' : editingEmp ? 'حفظ التعديلات' : 'إنشاء حساب الموظف'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <SendTaskModal
        isOpen={Boolean(taskRecipientUid)}
        onClose={() => setTaskRecipientUid(null)}
        employees={employees}
        defaultRecipientUid={taskRecipientUid || undefined}
        onSent={onRefresh}
      />
    </div>
  );
}
