import { useState } from 'react';
import { FileSpreadsheet, FileDown, BarChart2, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { downloadAuthorizedFile } from '../../lib/api';
import {
  Citizen,
  Employee,
  Ministry,
  RequestRecord,
  ROLE_LABELS,
} from '../../types/poms';
import {
  daysBetween,
  exportRowsToExcel,
  formatActiveHours,
  formatDateDMY,
  toIsoDate,
} from '../../utils/formatters';
import { exportTableToArabicPdf } from '../../utils/pdfExport';

interface ReportsViewProps {
  citizens: Citizen[];
  requests: RequestRecord[];
  ministries: Ministry[];
  employees: Employee[];
}

type ReportType =
  | 'citizens'
  | 'requests'
  | 'incoming'
  | 'outgoing'
  | 'ministries'
  | 'employees'
  | 'overdue';

export function ReportsView({
  citizens,
  requests,
  ministries,
  employees,
}: ReportsViewProps) {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();

  const [reportType, setReportType] = useState<ReportType>('requests');
  const canViewReports = hasPermission('reports.view');
  const canExportSensitive = hasPermission('reports.export') || hasPermission('citizens.export');

  if (!canViewReports) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
        <Lock className="w-8 h-8 text-red-700 mx-auto mb-3" />
        <p className="text-sm font-bold text-slate-900">صلاحية مقيدة</p>
        <p className="text-xs text-slate-500 mt-1">
          لا يملك دورك الوظيفي صلاحية عرض التقارير الإحصائية أو تصديرها.
        </p>
      </div>
    );
  }

  const getReportRows = (): { title: string; rows: Record<string, string | number>[] } => {
    switch (reportType) {
      case 'citizens':
        return {
          title: 'تقرير قاعدة بيانات المواطنين',
          rows: citizens.map((c) => ({
            'رقم التسجيل': c.registrationNumber,
            'الاسم': c.fullName,
            'الرقم القومي': canExportSensitive ? c.nationalId : 'مقيد الصلاحية',
            'الهاتف': c.phone,
            'المحافظة': c.governorate,
            'القسم / المركز': c.center,
            'الحالة': c.reviewStatus,
            'تاريخ التسجيل': formatDateDMY(c.createdAt),
          })),
        };
      case 'incoming':
        return {
          title: 'تقرير المراسلات الواردة',
          rows: requests
            .filter((r) => r.direction === 'وارد')
            .map((r) => ({
              'رقم الطلب': r.requestNumber,
              'رقم الوارد': r.waredNumber || '',
              'الموضوع': r.title,
              'المواطن': r.citizenName,
              'الحالة': r.status,
              'التاريخ': formatDateDMY(r.submissionDate),
            })),
        };
      case 'outgoing':
        return {
          title: 'تقرير المراسلات الصادرة',
          rows: requests
            .filter((r) => r.direction === 'صادر')
            .map((r) => ({
              'رقم الطلب': r.requestNumber,
              'رقم الصادر': r.saderNumber || '',
              'الموضوع': r.title,
              'الوزارة': r.ministryName || '—',
              'الحالة': r.status,
              'التاريخ': formatDateDMY(r.submissionDate),
            })),
        };
      case 'ministries':
        return {
          title: 'تقرير أداء الوزارات والجهات',
          rows: ministries.map((m) => {
            const list = requests.filter((r) => r.ministryId === m.id);
            const done = list.filter((r) => r.status === 'مكتمل').length;
            return {
              'الكود': m.code,
              'الوزارة': m.name,
              'إجمالي الطلبات': list.length,
              'المكتملة': done,
              'نسبة الاستجابة %': list.length > 0 ? Math.round((done / list.length) * 100) : 0,
            };
          }),
        };
      case 'employees':
        return {
          title: 'تقرير أداء ونشاط الموظفين',
          rows: employees.map((emp) => {
            const list = requests.filter((r) => r.assignedToUid === emp.uid || r.createdByUid === emp.uid);
            const done = list.filter((r) => r.status === 'مكتمل').length;
            return {
              'الموظف': emp.fullName,
              'المسمى الوظيفي': emp.jobTitle,
              'الدور': ROLE_LABELS[emp.role],
              'ساعات العمل': formatActiveHours(emp.activeSeconds),
              'الشكاوى/الطلبات': emp.requestsCreatedCount || 0,
              'الخطابات': emp.lettersCreatedCount || 0,
              'المكتملة': done,
            };
          }),
        };
      case 'overdue':
        return {
          title: 'تقرير الطلبات المتأخرة (> 7 أيام)',
          rows: requests
            .filter((r) => !['مكتمل', 'مرفوض'].includes(r.status) && daysBetween(r.submissionDate) > 7)
            .map((r) => ({
              'رقم الطلب': r.requestNumber,
              'الموضوع': r.title,
              'المواطن': r.citizenName,
              'الوزارة': r.ministryName || '—',
              'أيام التأخير': daysBetween(r.submissionDate),
              'الحالة': r.status,
            })),
        };
      case 'requests':
      default:
        return {
          title: 'التقرير الشامل للطلبات',
          rows: requests.map((r) => ({
            'رقم الطلب': r.requestNumber,
            'النوع': r.requestType,
            'الاتجاه': r.direction,
            'الموضوع': r.title,
            'المواطن': r.citizenName,
            'الوزارة': r.ministryName || '—',
            'الحالة': r.status,
            'تاريخ التقديم': formatDateDMY(r.submissionDate),
          })),
        };
    }
  };

  const { title, rows } = getReportRows();
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

  const handleExportExcel = () => {
    if (rows.length === 0) {
      showToast('لا توجد بيانات في هذا التقرير لتصديرها.', 'warning');
      return;
    }
    exportRowsToExcel(rows, title.slice(0, 28), `${title}_${toIsoDate()}.xlsx`);
    showToast('تم تصدير التقرير بصيغة Excel.', 'success');
  };

  const handleExportPdf = () => {
    exportTableToArabicPdf({
      title,
      subtitle: `تقرير إحصائي صادر من نظام مكتب النائب محمد كليب · عدد السجلات: ${rows.length}`,
      summary: [
        { label: 'نوع التقرير', value: title },
        { label: 'إجمالي السجلات', value: rows.length },
      ],
      columns: headers.length > 0 ? headers : ['البيان'],
      rows: rows.map((r) => headers.map((h) => r[h])),
    });
    showToast('تم فتح نافذة تصدير التقرير بصيغة PDF.', 'success');
  };

  const handleExportKindPdf = (kind: 'citizens' | 'employees' | 'requests' | 'ministries') => {
    if (kind === 'citizens') {
      exportTableToArabicPdf({
        title: 'سجل المواطنين الكامل',
        columns: ['رقم التسجيل', 'الاسم الرباعي', 'الرقم القومي', 'الهاتف', 'المحافظة', 'المركز', 'الحالة', 'تاريخ التسجيل'],
        rows: citizens.map((c) => [c.registrationNumber, c.fullName, c.nationalId, c.phone, c.governorate, c.center, c.reviewStatus, formatDateDMY(c.createdAt)]),
      });
    } else if (kind === 'employees') {
      exportTableToArabicPdf({
        title: 'سجل الموظفين والأداء',
        columns: ['الاسم الكامل', 'المسمى الوظيفي', 'القسم', 'ساعات العمل', 'الطلبات', 'الخطابات', 'الطباعة'],
        rows: employees.map((e) => [e.fullName, e.jobTitle, e.department, formatActiveHours(e.activeSeconds), e.requestsCreatedCount || 0, e.lettersCreatedCount || 0, e.printsCount || 0]),
      });
    } else if (kind === 'ministries') {
      exportTableToArabicPdf({
        title: 'سجل الوزارات والجهات الحكومية',
        columns: ['الكود', 'اسم الوزارة', 'القطاع', 'مسؤول الاتصال', 'الهاتف', 'الحالة'],
        rows: ministries.map((m) => [m.code, m.name, m.sector, m.contactPerson || '—', m.phone || '—', m.isActive ? 'نشط' : 'معطل']),
      });
    } else {
      exportTableToArabicPdf({
        title: 'سجل الطلبات والشكاوى (الصادر والوارد)',
        columns: ['رقم الطلب', 'الاتجاه', 'النوع', 'الموضوع', 'المواطن', 'الوزارة', 'الحالة', 'التاريخ'],
        rows: requests.map((r) => [r.requestNumber, r.direction, r.requestType, r.title, r.citizenName, r.ministryName || '—', r.status, formatDateDMY(r.submissionDate)]),
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
        <div>
          <h2 className="text-lg font-bold text-[#0F2C59]">التقارير الإحصائية وملفات Excel و PDF</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            استخراج تقارير دقيقة بصيغتي Excel و PDF أو تنزيل شيتات قاعدة البيانات المحدثة تلقائياً
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F2C59] text-white text-xs font-semibold cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>تصدير التقرير الحالي (.xlsx)</span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-rose-300 bg-rose-50 text-rose-800 text-xs font-semibold hover:bg-rose-100 cursor-pointer"
          >
            <FileDown className="w-4 h-4" />
            <span>تصدير التقرير الحالي (PDF)</span>
          </button>
        </div>
      </div>

      {/* Direct Server Excel Sheets + Matching PDF Exports */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 no-print">
        <span className="text-xs font-bold text-[#0F2C59] block">تنزيل شيتات قاعدة البيانات المنفصلة (Excel + PDF):</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {(
            [
              ['citizens', 'سجل_المواطنين.xlsx', 'المواطنون'],
              ['employees', 'سجل_الموظفين.xlsx', 'الموظفون'],
              ['requests', 'سجل_الطلبات.xlsx', 'الطلبات والشكاوى'],
              ['ministries', 'سجل_الوزارات.xlsx', 'الوزارات'],
            ] as const
          ).map(([kind, fileName, shortLabel]) => (
            <div key={kind} className="flex items-center gap-1.5 p-2 rounded-lg border border-slate-200 bg-[#F5F7FA]">
              <button
                type="button"
                onClick={() => void downloadAuthorizedFile(`/api/local-storage/excel/${kind}`, fileName)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded bg-emerald-50 border border-emerald-300 text-emerald-800 text-[11px] font-bold hover:bg-emerald-100 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{shortLabel} Excel</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportKindPdf(kind)}
                className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded bg-rose-50 border border-rose-300 text-rose-800 text-[11px] font-bold hover:bg-rose-100 cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>PDF</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Report Selector */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap gap-2 no-print">
        {(
          [
            ['requests', 'الطلبات الشامل'],
            ['citizens', 'المواطنين'],
            ['incoming', 'الوارد'],
            ['outgoing', 'الصادر'],
            ['ministries', 'أداء الوزارات'],
            ['employees', 'أداء الموظفين وساعات العمل'],
            ['overdue', 'الطلبات المتأخرة'],
          ] as Array<[ReportType, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setReportType(key)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              reportType === key
                ? 'bg-[#0F2C59] text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Printable Report Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 print-sheet">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-[#0F2C59]" />
            <h3 className="text-base font-bold text-[#0F2C59]">{title}</h3>
          </div>
          <span className="text-xs text-slate-500 font-mono-num">
            تاريخ الاستخراج: {formatDateDMY(new Date())} · العدد: {rows.length}
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="text-xs text-slate-500 py-10 text-center">
            لا توجد بيانات متاحة لهذا التقرير حالياً.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600">
                  {headers.map((h) => (
                    <th key={h} className="py-2.5 px-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {rows.map((row, idx) => (
                  <tr key={idx}>
                    {headers.map((h) => (
                      <td key={h} className="py-2.5 px-3 text-slate-800">
                        {String(row[h] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
