import React, { useMemo, useState } from 'react';
import {
  Printer,
  FileDown,
  Save,
  Trash2,
  CheckCircle2,
  FileText,
  Send,
  FileSpreadsheet,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiRequest, downloadAuthorizedFile } from '../../lib/api';
import {
  Citizen,
  LetterTemplate,
  OfficeSettings,
  PrintedDocument,
  RequestRecord,
} from '../../types/poms';
import { StatusTag } from '../common/StatusTag';
import { exportLetterToDocx, formatDateDMY, toIsoDate } from '../../utils/formatters';
import { exportDocumentToArabicPdf, exportTableToArabicPdf } from '../../utils/pdfExport';

interface LetterBuilderViewProps {
  requests: RequestRecord[];
  citizens: Citizen[];
  templates: LetterTemplate[];
  printedDocs: PrintedDocument[];
  officeSettings: OfficeSettings | null;
  onRefresh: () => Promise<void>;
}

const DEFAULT_BODY = `السيد الأستاذ الدكتور / {{ministry_name}}
تحية طيبة وبعد،،،

نتشرف بإحالة طلب المواطن / {{citizen_name}}، الرقم القومي ({{national_id}})، المقيد بمكتبنا برقم ({{request_number}}) وتاريخ {{date}}.

برجاء التفضل بالنظر واتخاذ اللازم نحو دراسة الطلب وإفادتنا بما تم في هذا الشأن.

وتفضلوا بقبول فائق الاحترام والتقدير،،،`;

export function LetterBuilderView({
  requests,
  citizens,
  templates,
  printedDocs,
  officeSettings,
  onRefresh,
}: LetterBuilderViewProps) {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();

  const canDesign = hasPermission('letters.design');
  const canManageTemplates = hasPermission('letters.templates');
  const canPrint = hasPermission('printing.execute');

  const [tab, setTab] = useState<'builder' | 'queue' | 'templates'>(
    canDesign ? 'builder' : 'queue'
  );

  // Builder State
  const [selectedReqId, setSelectedReqId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [referenceNumber, setReferenceNumber] = useState(
    `REF-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
  );
  const [letterTitle, setLetterTitle] = useState('خطاب رسمي موجه للجهة المختصة');
  const [officeTitle, setOfficeTitle] = useState(
    officeSettings?.officeName || 'مكتب النائب محمد كليب'
  );
  const [deputyName, setDeputyName] = useState(
    officeSettings?.deputyName || 'السيد النائب محمد كليب'
  );
  const [bodyTemplate, setBodyTemplate] = useState(DEFAULT_BODY);
  const [signatureTitle, setSignatureTitle] = useState('السيد النائب محمد كليب – عضو مجلس النواب');
  const [footerText, setFooterText] = useState(
    officeSettings?.defaultFooter || 'مكتب النائب محمد كليب لخدمة المواطنين – المراسلات الرسمية'
  );
  const [saving, setSaving] = useState(false);

  // Template management state
  const [newTplName, setNewTplName] = useState('');
  const [newTplCategory, setNewTplCategory] = useState('مخاطبة وزارة');

  // Active print preview doc (for queue printing)
  const [activePrintDoc, setActivePrintDoc] = useState<PrintedDocument | null>(null);

  const selectedRequest = useMemo(
    () => requests.find((r) => r.id === selectedReqId) || null,
    [requests, selectedReqId]
  );

  const selectedCitizen = useMemo(
    () =>
      selectedRequest
        ? citizens.find((c) => c.id === selectedRequest.citizenId) || null
        : null,
    [citizens, selectedRequest]
  );

  const renderedBody = useMemo(() => {
    const replacements: Record<string, string> = {
      '{{citizen_name}}': selectedCitizen?.fullName || selectedRequest?.citizenName || 'اسم المواطن',
      '{{national_id}}': selectedCitizen?.nationalId || selectedRequest?.citizenNationalId || 'الرقم القومي',
      '{{request_number}}': selectedRequest?.requestNumber || 'رقم الطلب',
      '{{ministry_name}}': selectedRequest?.ministryName || 'الجهة المعنية',
      '{{date}}': formatDateDMY(new Date()),
      '{{reference_number}}': referenceNumber,
    };
    let output = bodyTemplate;
    for (const [token, val] of Object.entries(replacements)) {
      output = output.split(token).join(val);
    }
    return output;
  }, [bodyTemplate, referenceNumber, selectedCitizen, selectedRequest]);

  const applyTemplate = (tplId: string) => {
    setSelectedTemplateId(tplId);
    const tpl = templates.find((t) => t.id === tplId);
    if (!tpl) return;
    setOfficeTitle(tpl.officeTitle);
    setDeputyName(tpl.deputyName);
    setBodyTemplate(tpl.bodyTemplate);
    setSignatureTitle(tpl.signatureTitle);
    setFooterText(tpl.footerText);
  };

  const handleQueueForPrint = async () => {
    if (!canDesign || saving) return;
    setSaving(true);
    try {
      await apiRequest('/api/printed-documents', {
        method: 'POST',
        body: JSON.stringify({
          referenceNumber,
          title: letterTitle.trim(),
          requestId: selectedRequest?.id || '',
          requestNumber: selectedRequest?.requestNumber || '',
          citizenName: selectedCitizen?.fullName || selectedRequest?.citizenName || '',
          ministryName: selectedRequest?.ministryName || '',
          renderedContent: renderedBody,
          officeTitle,
          deputyName,
          signatureTitle,
          footerText,
        }),
      });
      await onRefresh();
      showToast('تم إرسال الخطاب المعتمد إلى قائمة انتظار الطباعة وتسجيله في نشاطك.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر اعتماد الخطاب.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleExportDocx = async () => {
    try {
      await exportLetterToDocx({
        officeTitle,
        deputyName,
        referenceNumber,
        dateLabel: formatDateDMY(new Date()),
        title: letterTitle,
        bodyText: renderedBody,
        signatureTitle,
        footerText,
        fileName: `${referenceNumber}_${toIsoDate()}.docx`,
      });
      showToast('تم تصدير ملف Word (.docx) بنجاح.', 'success');
    } catch {
      showToast('تعذر تصدير ملف Word.', 'error');
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageTemplates || !newTplName.trim()) return;
    try {
      await apiRequest('/api/letter-templates', {
        method: 'POST',
        body: JSON.stringify({
          name: newTplName.trim(),
          category: newTplCategory.trim() || 'عام',
          officeTitle,
          deputyName,
          headerSubtitle: '',
          bodyTemplate,
          signatureTitle,
          footerText,
        }),
      });
      await onRefresh();
      setNewTplName('');
      showToast('تم حفظ القالب الرسمي بنجاح.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر حفظ القالب.', 'error');
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await apiRequest(`/api/letter-templates/${id}`, { method: 'DELETE' });
      await onRefresh();
      showToast('تم حذف القالب.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر حذف القالب.', 'error');
    }
  };

  const handleExecutePrint = async (docItem: PrintedDocument) => {
    if (!canPrint) return;
    setActivePrintDoc(docItem);
    try {
      await apiRequest(`/api/printed-documents/${docItem.id}/print`, {
        method: 'POST',
      });
      await onRefresh();
      window.setTimeout(() => window.print(), 200);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر تسجيل الطباعة.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 no-print">
        <div>
          <h2 className="text-lg font-bold text-[#0F2C59]">منظومة الخطابات الرسمية والطباعة</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            إعداد المراسلات الرسمية بالترويسة المعتمدة وتصديرها بصيغة DOCX وPDF
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {canDesign && (
            <button
              type="button"
              onClick={() => setTab('builder')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                tab === 'builder' ? 'bg-white text-[#0F2C59] shadow-sm' : 'text-slate-600'
              }`}
            >
              مصمم الخطابات
            </button>
          )}
          <button
            type="button"
            onClick={() => setTab('queue')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
              tab === 'queue' ? 'bg-white text-[#0F2C59] shadow-sm' : 'text-slate-600'
            }`}
          >
            قائمة الطباعة ({printedDocs.filter((p) => p.status === 'pending_print').length})
          </button>
          {canManageTemplates && (
            <button
              type="button"
              onClick={() => setTab('templates')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                tab === 'templates' ? 'bg-white text-[#0F2C59] shadow-sm' : 'text-slate-600'
              }`}
            >
              إدارة القوالب ({templates.length})
            </button>
          )}
        </div>
      </div>

      {/* Builder Tab */}
      {tab === 'builder' && canDesign && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4 no-print">
            <h3 className="text-sm font-bold text-[#0F2C59]">إعداد بيانات الخطاب</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">ربط بطلب حالي</label>
                <select
                  value={selectedReqId}
                  onChange={(e) => setSelectedReqId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                >
                  <option value="">-- خطاب حر --</option>
                  {requests.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.requestNumber} · {r.citizenName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">اختيار قالب</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => applyTemplate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                >
                  <option value="">-- القالب الافتراضي --</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">الرقم المرجعي</label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">عنوان الخطاب</label>
                <input
                  type="text"
                  value={letterTitle}
                  onChange={(e) => setLetterTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">اسم المكتب في الترويسة</label>
                <input
                  type="text"
                  value={officeTitle}
                  onChange={(e) => setOfficeTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">صفة / اسم النائب</label>
                <input
                  type="text"
                  value={deputyName}
                  onChange={(e) => setDeputyName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">نص الخطاب (يدعم الحقول الديناميكية)</label>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {[
                  '{{citizen_name}}',
                  '{{national_id}}',
                  '{{request_number}}',
                  '{{ministry_name}}',
                  '{{date}}',
                ].map((token) => (
                  <button
                    key={token}
                    type="button"
                    onClick={() => setBodyTemplate((prev) => `${prev} ${token}`)}
                    className="px-2 py-1 rounded bg-slate-100 text-[11px] font-mono-num text-[#0F2C59] hover:bg-slate-200 cursor-pointer"
                  >
                    {token}
                  </button>
                ))}
              </div>
              <textarea
                rows={8}
                value={bodyTemplate}
                onChange={(e) => setBodyTemplate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">توقيع المسؤول</label>
                <input
                  type="text"
                  value={signatureTitle}
                  onChange={(e) => setSignatureTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">تذييل الصفحة</label>
                <input
                  type="text"
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  exportDocumentToArabicPdf({
                    officeTitle,
                    deputyName,
                    referenceNumber,
                    dateLabel: formatDateDMY(new Date()),
                    title: letterTitle,
                    bodyText: renderedBody,
                    signatureTitle,
                    footerText,
                  });
                  showToast('تم فتح نافذة حفظ وطباعة الخطاب بصيغة PDF.', 'success');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F2C59] text-white text-xs font-semibold hover:bg-[#0A1E3D] cursor-pointer"
              >
                <FileDown className="w-4 h-4" />
                <span>تصدير PDF / طباعة</span>
              </button>
              <button
                type="button"
                onClick={() => void handleExportDocx()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                <FileDown className="w-4 h-4" />
                <span>تصدير DOCX</span>
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleQueueForPrint()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#C5A253] bg-[#C5A253]/15 text-[#0F2C59] text-xs font-semibold hover:bg-[#C5A253]/25 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>اعتماد وإرسال للطباعة</span>
              </button>
            </div>
          </div>

          {/* Live A4 Preview */}
          <div className="xl:col-span-7">
            <div className="bg-white border border-slate-300 rounded-xl p-8 sm:p-12 print-sheet min-h-[700px] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b-2 border-[#0F2C59] pb-5 mb-6">
                  <div className="text-right">
                    <h4 className="text-lg font-extrabold text-[#0F2C59]">{officeTitle}</h4>
                    <p className="text-sm font-bold text-[#C5A253] mt-0.5">{deputyName}</p>
                    <p className="text-xs text-slate-500 mt-1 font-mono-num">
                      الرقم المرجعي: {referenceNumber} · التاريخ: {formatDateDMY(new Date())}
                    </p>
                  </div>
                  <img
                    src="/assets/aistudio/Gemini_Generated_Image_mlu9oomlu9oomlu9_51cff395.jpeg"
                    alt="النائب محمد كليب"
                    className="w-20 h-20 rounded-xl object-cover object-top border-2 border-[#C5A253]"
                  />
                </div>

                <h3 className="text-center text-base font-bold text-slate-900 underline underline-offset-8 mb-8">
                  {letterTitle}
                </h3>

                <div className="text-sm text-slate-800 leading-loose whitespace-pre-wrap">
                  {renderedBody}
                </div>
              </div>

              <div className="mt-14 space-y-10">
                <div className="flex justify-end">
                  <div className="text-center w-56">
                    <p className="text-sm font-bold text-[#0F2C59]">{signatureTitle}</p>
                    <div className="h-14 border-b border-dashed border-slate-300 mt-2" />
                  </div>
                </div>
                <div className="border-t border-slate-200 pt-3 text-center text-[11px] text-slate-500">
                  {footerText}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Queue Tab */}
      {tab === 'queue' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 no-print">
            <span className="text-xs font-bold text-[#0F2C59]">تصدير سجل الخطابات الرسمية:</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void downloadAuthorizedFile('/api/local-storage/excel/letters', 'سجل_الخطابات_المطبوعة.xlsx')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>سجل الخطابات (.xlsx)</span>
              </button>
              {printedDocs.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    exportTableToArabicPdf({
                      title: 'سجل الخطابات الرسمية المعتمدة',
                      officeName: officeTitle,
                      deputyName,
                      columns: ['الرقم المرجعي', 'العنوان', 'المواطن', 'الوزارة', 'الحالة', 'عدد الطباعة', 'التاريخ'],
                      rows: printedDocs.map((p) => [
                        p.referenceNumber,
                        p.title,
                        p.citizenName || '—',
                        p.ministryName || '—',
                        p.status === 'printed' ? 'تمت الطباعة' : 'بانتظار الطباعة',
                        p.printCount,
                        formatDateDMY(p.createdAt),
                      ]),
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-300 bg-rose-50 text-rose-800 text-xs font-semibold hover:bg-rose-100 cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>تصدير القائمة PDF</span>
                </button>
              )}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden no-print">
            {printedDocs.length === 0 ? (
              <div className="p-12 text-center">
                <FileText className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-800">لا توجد مستندات في قائمة الطباعة</p>
                <p className="text-xs text-slate-500 mt-1">
                  عند اعتماد خطابات من مصمم الخطابات ستظهر هنا للطباعة والتوثيق.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600">
                      <th className="py-3 px-4">الرقم المرجعي</th>
                      <th className="py-3 px-4">عنوان الخطاب</th>
                      <th className="py-3 px-4">المواطن / الوزارة</th>
                      <th className="py-3 px-4">الحالة</th>
                      <th className="py-3 px-4">مرات الطباعة</th>
                      <th className="py-3 px-4">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {printedDocs.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono-num font-bold text-[#0F2C59]">{p.referenceNumber}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">{p.title}</td>
                        <td className="py-3 px-4 text-slate-600">
                          {p.citizenName || '—'} · {p.ministryName || '—'}
                        </td>
                        <td className="py-3 px-4">
                          <StatusTag status={p.status === 'printed' ? 'تمت الطباعة' : 'جاهز للطباعة'} />
                        </td>
                        <td className="py-3 px-4 font-mono-num">{p.printCount}</td>
                        <td className="py-3 px-4 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setActivePrintDoc(p)}
                            className="px-3 py-1.5 rounded border border-slate-300 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
                          >
                            معاينة
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              exportDocumentToArabicPdf({
                                officeTitle: p.officeTitle || officeTitle,
                                deputyName: p.deputyName || deputyName,
                                referenceNumber: p.referenceNumber,
                                dateLabel: formatDateDMY(p.createdAt),
                                title: p.title,
                                bodyText: p.renderedContent,
                                signatureTitle: p.signatureTitle || signatureTitle,
                                footerText: p.footerText || footerText,
                              })
                            }
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-rose-300 bg-rose-50 text-rose-800 text-xs font-semibold cursor-pointer"
                          >
                            <FileDown className="w-3.5 h-3.5" />
                            <span>PDF</span>
                          </button>
                          {canPrint && (
                            <button
                              type="button"
                              onClick={() => void handleExecutePrint(p)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-[#0F2C59] text-white text-xs font-semibold cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>طباعة</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {activePrintDoc && (
            <div className="bg-white border border-slate-300 rounded-xl p-10 print-sheet">
              <div className="flex items-center justify-between border-b-2 border-[#0F2C59] pb-4 mb-6">
                <div>
                  <h4 className="text-lg font-extrabold text-[#0F2C59]">{activePrintDoc.officeTitle || officeTitle}</h4>
                  <p className="text-sm font-bold text-[#C5A253]">{activePrintDoc.deputyName || deputyName}</p>
                  <p className="text-xs text-slate-500 mt-1 font-mono-num">
                    الرقم المرجعي: {activePrintDoc.referenceNumber} · التاريخ: {formatDateDMY(activePrintDoc.createdAt)}
                  </p>
                </div>
                <img
                  src="/assets/aistudio/Gemini_Generated_Image_mlu9oomlu9oomlu9_51cff395.jpeg"
                  alt="النائب محمد كليب"
                  className="w-16 h-16 rounded-xl object-cover object-top border-2 border-[#C5A253]"
                />
              </div>
              <h3 className="text-center text-base font-bold underline mb-6">{activePrintDoc.title}</h3>
              <div className="text-sm leading-loose whitespace-pre-wrap">{activePrintDoc.renderedContent}</div>
              <div className="mt-12 text-left text-sm font-bold text-[#0F2C59]">
                {activePrintDoc.signatureTitle || signatureTitle}
              </div>
              <div className="mt-8 border-t border-slate-200 pt-3 text-center text-xs text-slate-500">
                {activePrintDoc.footerText || footerText}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Templates Tab */}
      {tab === 'templates' && canManageTemplates && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 no-print">
          <form onSubmit={handleSaveTemplate} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-[#0F2C59]">حفظ الترويسة والنص الحالي كقالب رسمي</h3>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">اسم القالب *</label>
              <input
                type="text"
                required
                value={newTplName}
                onChange={(e) => setNewTplName(e.target.value)}
                placeholder="مثال: خطاب تزكية لوزارة الصحة"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">التصنيف</label>
              <input
                type="text"
                value={newTplCategory}
                onChange={(e) => setNewTplCategory(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F2C59] text-white text-xs font-semibold cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>حفظ كقالب جديد</span>
            </button>
          </form>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-[#0F2C59]">القوالب المحفوظة</h3>
            {templates.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">لا توجد قوالب محفوظة بعد.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {templates.map((t) => (
                  <div key={t.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-slate-900">{t.name}</p>
                      <p className="text-slate-500 mt-0.5">{t.category}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          applyTemplate(t.id);
                          setTab('builder');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 font-semibold text-[#0F2C59] cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>استخدام</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteTemplate(t.id)}
                        className="p-1.5 rounded text-red-600 hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
