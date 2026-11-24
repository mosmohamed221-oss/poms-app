import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  FolderTree,
  FolderOpen,
  File,
  Search,
  Upload,
  Download,
  Eye,
  Trash2,
  X,
  FileText,
  Lock,
  FileSpreadsheet,
  FileDown,
  RefreshCw,
  FolderArchive,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiRequest, downloadAuthorizedFile } from '../../lib/api';
import {
  ArchiveDocument,
  LocalFolderNode,
  Ministry,
  REQUEST_TYPES,
  RequestRecord,
  StorageStats,
} from '../../types/poms';
import { exportRowsToExcel, formatDateTimeDMY, readArchiveFileAsDataUrl, toIsoDate } from '../../utils/formatters';
import { exportTableToArabicPdf } from '../../utils/pdfExport';
import { syncArchiveFileToPCFolder } from '../../utils/localFolderSync';

interface ArchiveViewProps {
  archiveDocs: ArchiveDocument[];
  requests: RequestRecord[];
  ministries: Ministry[];
  localTree: LocalFolderNode[];
  officeBaseDir: string;
  storageStats?: StorageStats | null;
  loading: boolean;
  openUploadInitially?: boolean;
  onConsumeOpenUpload?: () => void;
  initialSearchQuery?: string;
  onRefresh: () => Promise<void>;
}

function FolderNodeItem({
  node,
  depth,
  onDownload,
}: {
  node: LocalFolderNode;
  depth: number;
  onDownload: (relPath: string, name: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);

  if (node.type === 'dir') {
    return (
      <div className="select-none">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 text-xs text-right cursor-pointer"
          style={{ paddingRight: `${depth * 18 + 12}px` }}
        >
          <span className="flex items-center gap-2 font-bold text-[#0F2C59]">
            <FolderOpen className="w-4 h-4 text-[#C5A253] shrink-0" />
            <span>{node.name}</span>
          </span>
          <span className="text-[11px] font-mono-num text-slate-400">
            {node.children ? `${node.children.length} عنصر` : 'فارغ'}
          </span>
        </button>
        {expanded && node.children && node.children.length > 0 && (
          <div className="border-r border-slate-200 mr-4">
            {node.children.map((child) => (
              <FolderNodeItem
                key={child.relPath}
                node={child}
                depth={depth + 1}
                onDownload={onDownload}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 text-xs"
      style={{ paddingRight: `${depth * 18 + 12}px` }}
    >
      <span className="flex items-center gap-2 text-slate-800 truncate">
        <File className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="truncate">{node.name}</span>
      </span>
      <div className="flex items-center gap-3 shrink-0">
        {node.size !== undefined && (
          <span className="text-[11px] font-mono-num text-slate-400">
            {Math.max(1, Math.round(node.size / 1024))} KB
          </span>
        )}
        <button
          type="button"
          onClick={() => onDownload(node.relPath, node.name)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 text-[11px] font-semibold text-[#0F2C59] hover:bg-slate-100 cursor-pointer"
        >
          <Download className="w-3 h-3" />
          <span>تنزيل</span>
        </button>
      </div>
    </div>
  );
}

export function ArchiveView({
  archiveDocs,
  requests,
  ministries,
  localTree,
  officeBaseDir,
  storageStats,
  loading,
  openUploadInitially,
  onConsumeOpenUpload,
  initialSearchQuery,
  onRefresh,
}: ArchiveViewProps) {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [syncingNow, setSyncingNow] = useState(false);

  const [tab, setTab] = useState<'records' | 'folders'>('records');
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || '');
  const [typeFilter, setTypeFilter] = useState('الكل');
  const [ministryFilter, setMinistryFilter] = useState('الكل');
  const [monthFilter, setMonthFilter] = useState('الكل');

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [previewData, setPreviewData] = useState<{
    doc: ArchiveDocument;
    dataUrl: string;
  } | null>(null);

  const [requestType, setRequestType] = useState<string>('طلب');
  const [ministryName, setMinistryName] = useState('');
  const [requestNumber, setRequestNumber] = useState('');
  const [citizenName, setCitizenName] = useState('');
  const [monthFolder, setMonthFolder] = useState(() => new Date().toISOString().slice(0, 7));
  const [notes, setNotes] = useState('');
  const [fileObj, setFileObj] = useState<{
    fileName: string;
    fileFormat: 'pdf' | 'docx' | 'image';
    mimeType: string;
    fileSize: number;
    dataUrl: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (initialSearchQuery !== undefined && initialSearchQuery !== '') {
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  useEffect(() => {
    if (openUploadInitially) {
      setShowUploadModal(true);
      onConsumeOpenUpload?.();
    }
  }, [openUploadInitially]);

  const canView = hasPermission('archive.view');
  const canUpload = hasPermission('archive.upload');
  const canDelete = hasPermission('archive.delete');

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const d of archiveDocs) {
      if (d.monthFolder) set.add(d.monthFolder);
    }
    return Array.from(set).sort().reverse();
  }, [archiveDocs]);

  const availableMinistries = useMemo(() => {
    const set = new Set<string>(ministries.map((m) => m.name));
    for (const d of archiveDocs) {
      if (d.ministryName) set.add(d.ministryName);
    }
    return Array.from(set).sort();
  }, [ministries, archiveDocs]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return archiveDocs.filter((d) => {
      if (typeFilter !== 'الكل' && d.requestType !== typeFilter) return false;
      if (ministryFilter !== 'الكل' && d.ministryName !== ministryFilter) return false;
      if (monthFilter !== 'الكل' && d.monthFolder !== monthFilter) return false;
      if (!q) return true;
      return (
        d.fileName.toLowerCase().includes(q) ||
        d.archivePath.toLowerCase().includes(q) ||
        d.requestNumber.toLowerCase().includes(q) ||
        d.ministryName.toLowerCase().includes(q) ||
        d.monthFolder.includes(q) ||
        (d.citizenName || '').toLowerCase().includes(q)
      );
    });
  }, [archiveDocs, searchQuery, typeFilter, ministryFilter, monthFilter]);

  if (!canView) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 text-red-700 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-900">صلاحية مقيدة</h3>
        <p className="text-xs text-slate-500 mt-1">
          لا يملك دورك الوظيفي صلاحية الوصول إلى الأرشيف الإلكتروني المقيد.
        </p>
      </div>
    );
  }

  const handleSelectRequest = (reqId: string) => {
    const req = requests.find((r) => r.id === reqId);
    if (!req) return;
    setRequestNumber(req.requestNumber);
    setRequestType(req.requestType);
    setMinistryName(req.ministryName || 'عام');
    setCitizenName(req.citizenName);
    if (req.submissionDate && req.submissionDate.length >= 7) {
      setMonthFolder(req.submissionDate.slice(0, 7));
    }
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await readArchiveFileAsDataUrl(file);
      setFileObj({
        fileName: file.name.slice(0, 170),
        ...parsed,
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذر قراءة الملف.', 'error');
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUpload || !fileObj || uploading) return;

    const minLabel = ministryName.trim() || 'عام';
    const reqLabel = requestNumber.trim() || 'بدون-رقم';

    setUploading(true);
    try {
      const res = await apiRequest<{ archiveDoc: ArchiveDocument }>('/api/archive', {
        method: 'POST',
        body: JSON.stringify({
          requestType,
          ministryName: minLabel,
          requestNumber: reqLabel,
          citizenName: citizenName.trim(),
          monthFolder,
          fileName: fileObj.fileName,
          fileFormat: fileObj.fileFormat,
          mimeType: fileObj.mimeType,
          fileSize: fileObj.fileSize,
          dataUrl: fileObj.dataUrl,
          notes: notes.trim(),
        }),
      });
      await syncArchiveFileToPCFolder({
        ministryName: minLabel,
        requestType,
        monthFolder,
        requestNumber: reqLabel,
        fileName: fileObj.fileName,
        dataUrl: fileObj.dataUrl,
      });
      await onRefresh();
      showToast(`تم الحفظ محلياً في المسار: ${res.archiveDoc.archivePath}`, 'success');
      setShowUploadModal(false);
      setFileObj(null);
      setNotes('');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر أرشفة الملف.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handlePreview = async (d: ArchiveDocument) => {
    try {
      const res = await apiRequest<{ dataUrl: string }>(`/api/archive/${d.id}/file`);
      setPreviewData({ doc: d, dataUrl: res.dataUrl });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر فتح المعاينة.', 'error');
    }
  };

  const handleDownload = async (d: ArchiveDocument) => {
    try {
      const res = await apiRequest<{ dataUrl: string; fileName: string }>(`/api/archive/${d.id}/file`);
      const anchor = document.createElement('a');
      anchor.href = res.dataUrl;
      anchor.download = res.fileName || d.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر تنزيل الملف.', 'error');
    }
  };

  const handleDelete = async (d: ArchiveDocument) => {
    if (!canDelete) return;
    try {
      await apiRequest(`/api/archive/${d.id}`, { method: 'DELETE' });
      await onRefresh();
      showToast('تم حذف المستند من الأرشيف والمجلد المحلي.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر حذف المستند.', 'error');
    }
  };

  const handleTreeFileDownload = async (relPath: string, name: string) => {
    try {
      await downloadAuthorizedFile(
        `/api/local-storage/download?relPath=${encodeURIComponent(relPath)}`,
        name
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذر تنزيل الملف.', 'error');
    }
  };

  const handleExportArchiveExcel = () => {
    const rows = filtered.map((d) => ({
      'اسم الملف': d.fileName,
      'الوزارة / الجهة': d.ministryName,
      'نوع الطلب': d.requestType,
      'الشهر': d.monthFolder,
      'رقم الطلب': d.requestNumber,
      'المواطن': d.citizenName || '—',
      'الصيغة': d.fileFormat.toUpperCase(),
      'تاريخ الأرشفة': formatDateTimeDMY(d.createdAt),
      'المسار المحلي': d.archivePath,
    }));
    exportRowsToExcel(rows, 'فهرس_الأرشيف', `فهرس_الأرشيف_${toIsoDate()}.xlsx`);
    showToast('تم تصدير فهرس الأرشيف بصيغة Excel.', 'success');
  };

  const handleExportArchivePdf = () => {
    exportTableToArabicPdf({
      title: 'فهرس الأرشيف الإلكتروني المنظم',
      subtitle: 'كشف المستندات المؤرشفة حسب الوزارة ونوع الطلب والشهر',
      summary: [
        { label: 'إجمالي الملفات المعروضة', value: filtered.length },
        { label: 'الوزارات', value: new Set(filtered.map((d) => d.ministryName)).size },
      ],
      columns: ['اسم الملف', 'الوزارة', 'نوع الطلب', 'الشهر', 'رقم الطلب', 'المواطن', 'الصيغة', 'التاريخ', 'المسار المحلي'],
      rows: filtered.map((d) => [
        d.fileName,
        d.ministryName,
        d.requestType,
        d.monthFolder,
        d.requestNumber,
        d.citizenName || '—',
        d.fileFormat.toUpperCase(),
        formatDateTimeDMY(d.createdAt),
        d.archivePath,
      ]),
    });
    showToast('تم فتح نافذة تصدير فهرس الأرشيف بصيغة PDF.', 'success');
  };

  const handleForceSyncLocal = async () => {
    setSyncingNow(true);
    try {
      await apiRequest('/api/local-storage/sync', { method: 'POST' });
      await onRefresh();
      showToast('تمت مزامنة وتحديث جميع ملفات Excel ومجلدات المكتب المحلية بنجاح.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذرت المزامنة المحلية.', 'error');
    } finally {
      setSyncingNow(false);
    }
  };

  const handleDownloadOfficeZip = async () => {
    try {
      await downloadAuthorizedFile('/api/local-storage/export-zip', `مجلد_المكتب_${toIsoDate()}.zip`);
      showToast('تم تنزيل مجلد المكتب كاملاً بصيغة ZIP بنجاح.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذر تنزيل الأرشيف المضغوط.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#0F2C59]">الأرشيف الإلكتروني والمجلد المحلي المنظم</h2>
          <p className="text-xs text-slate-500 mt-1">
            التصنيف الهرمي التلقائي: <span className="font-bold text-[#0F2C59]">مجلد_المكتب / الأرشيف / اسم_الوزارة / نوع_الطلب / الشهر (YYYY-MM) / رقم_الطلب</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setTab('records')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                tab === 'records' ? 'bg-white text-[#0F2C59] shadow-sm' : 'text-slate-600'
              }`}
            >
              قائمة المستندات ({archiveDocs.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('folders')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                tab === 'folders' ? 'bg-white text-[#0F2C59] shadow-sm' : 'text-slate-600'
              }`}
            >
              تصفح المجلد المحلي
            </button>
          </div>
          {filtered.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleExportArchiveExcel}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#C5A253] bg-[#C5A253]/10 text-[#0F2C59] text-xs font-semibold hover:bg-[#C5A253]/20 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>تصدير Excel</span>
              </button>
              <button
                type="button"
                onClick={handleExportArchivePdf}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-300 bg-rose-50 text-rose-800 text-xs font-semibold hover:bg-rose-100 cursor-pointer"
              >
                <FileDown className="w-4 h-4" />
                <span>تصدير PDF</span>
              </button>
            </>
          )}
          {canUpload && (
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F2C59] text-white text-xs font-semibold hover:bg-[#0A1E3D] cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>رفع وأرشفة مستند</span>
            </button>
          )}
        </div>
      </div>

      {tab === 'folders' ? (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-sm font-bold text-[#0F2C59]">شجرة المجلدات المحلية للمكتب على الجهاز</h3>
              <p className="text-[11px] text-slate-500 font-mono-num mt-0.5" dir="ltr">
                {officeBaseDir}
              </p>
              {storageStats && (
                <p className="text-[11px] text-slate-600 mt-1">
                  المجلدات: <strong className="font-mono-num">{storageStats.totalFolders}</strong> · الملفات:{' '}
                  <strong className="font-mono-num">{storageStats.totalFiles}</strong> · الحجم الكلي:{' '}
                  <strong className="font-mono-num">{Math.round(storageStats.totalSizeBytes / 1024)} KB</strong>
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={syncingNow}
                onClick={() => void handleForceSyncLocal()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#0F2C59] bg-[#0F2C59]/5 text-[#0F2C59] text-[11px] font-bold hover:bg-[#0F2C59]/10 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingNow ? 'animate-spin' : ''}`} />
                <span>{syncingNow ? 'جارٍ التحديث...' : 'تحديث ومزامنة المجلد'}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadOfficeZip()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F2C59] text-white text-[11px] font-bold hover:bg-[#0A1E3D] cursor-pointer"
              >
                <FolderArchive className="w-3.5 h-3.5 text-[#C5A253]" />
                <span>تنزيل المجلد كاملاً (ZIP)</span>
              </button>
              {(
                [
                  ['citizens', 'سجل_المواطنين.xlsx'],
                  ['employees', 'سجل_الموظفين.xlsx'],
                  ['requests', 'سجل_الطلبات.xlsx'],
                  ['ministries', 'سجل_الوزارات.xlsx'],
                  ['archive', 'فهرس_الأرشيف.xlsx'],
                  ['letters', 'سجل_الخطابات_المطبوعة.xlsx'],
                  ['notifications', 'سجل_التكليفات_والاشعارات.xlsx'],
                ] as const
              ).map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => void downloadAuthorizedFile(`/api/local-storage/excel/${kind}`, label)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-[11px] font-semibold hover:bg-emerald-100 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {localTree.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">المجلد قيد التهيئة...</p>
          ) : (
            <div className="space-y-1">
              {localTree.map((node) => (
                <FolderNodeItem
                  key={node.relPath}
                  node={node}
                  depth={0}
                  onDownload={(relPath, name) => void handleTreeFileDownload(relPath, name)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث باسم الملف، رقم الطلب، الوزارة، الشهر..."
                className="w-full rounded-lg border border-slate-300 pr-9 pl-3 py-2 text-xs focus:border-[#0F2C59] focus:outline-none"
              />
            </div>
            <select
              value={ministryFilter}
              onChange={(e) => setMinistryFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
            >
              <option value="الكل">كل الوزارات / الجهات</option>
              {availableMinistries.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
            >
              <option value="الكل">كل الأنواع (شكوى / طلب / تزكية...)</option>
              {REQUEST_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono-num"
            >
              <option value="الكل">كل الشهور</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  شهر {m}
                </option>
              ))}
            </select>
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
                  <Archive className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-1.5">الأرشيف فارغ حالياً</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  عند رفع الملفات أو أرشفة الخطابات، سيتم حفظها تلقائياً داخل مجلد الوزارة ← مجلد نوع الطلب ← مجلد الشهر لسهولة جلبها لاحقاً.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600">
                      <th className="py-3 px-4">المسار الهرمي المحلي</th>
                      <th className="py-3 px-4">اسم الملف</th>
                      <th className="py-3 px-4">الوزارة / النوع</th>
                      <th className="py-3 px-4">الشهر</th>
                      <th className="py-3 px-4">تاريخ الأرشفة</th>
                      <th className="py-3 px-4">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filtered.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 text-slate-600">
                          <span className="inline-flex items-center gap-1.5 text-[#0F2C59] font-semibold">
                            <FolderTree className="w-3.5 h-3.5 shrink-0" />
                            <span>{d.archivePath}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">{d.fileName}</td>
                        <td className="py-3 px-4 text-slate-600">
                          {d.ministryName} · <span className="font-semibold">{d.requestType}</span>
                        </td>
                        <td className="py-3 px-4 font-mono-num text-slate-700">{d.monthFolder}</td>
                        <td className="py-3 px-4 font-mono-num text-slate-500">
                          {formatDateTimeDMY(d.createdAt)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            {(d.fileFormat === 'pdf' || d.fileFormat === 'image') && (
                              <button
                                type="button"
                                onClick={() => void handlePreview(d)}
                                className="p-1.5 rounded hover:bg-slate-100 text-[#0F2C59] cursor-pointer"
                                title="معاينة"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleDownload(d)}
                              className="p-1.5 rounded hover:bg-slate-100 text-emerald-700 cursor-pointer"
                              title="تنزيل الملف"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => void handleDelete(d)}
                                className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                                title="حذف"
                              >
                                <Trash2 className="w-4 h-4" />
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
        </>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h3 className="text-base font-bold text-[#0F2C59]">رفع مستند للأرشيف المحلي المنظم</h3>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="p-1.5 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUploadSubmit} className="space-y-4">
              {requests.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">ربط بطلب حالي (اختياري)</label>
                  <select
                    onChange={(e) => handleSelectRequest(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                  >
                    <option value="">-- اختر طلباً لملء البيانات تلقائياً --</option>
                    {requests.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.requestNumber} · {r.citizenName} ({r.title})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">الوزارة / الجهة *</label>
                  <input
                    type="text"
                    list="ministries-datalist"
                    required
                    value={ministryName}
                    onChange={(e) => setMinistryName(e.target.value)}
                    placeholder="اسم الوزارة"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                  <datalist id="ministries-datalist">
                    {ministries.map((m) => (
                      <option key={m.id} value={m.name} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">تصنيف المستند (شكوى / طلب...) *</label>
                  <select
                    value={requestType}
                    onChange={(e) => setRequestType(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                  >
                    {REQUEST_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">مجلد الشهر (سنة-شهر) *</label>
                  <input
                    type="month"
                    required
                    value={monthFolder}
                    onChange={(e) => setMonthFolder(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">رقم الطلب *</label>
                  <input
                    type="text"
                    required
                    value={requestNumber}
                    onChange={(e) => setRequestNumber(e.target.value)}
                    placeholder="REQ-2026-00001"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono-num"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">اسم المواطن</label>
                <input
                  type="text"
                  value={citizenName}
                  onChange={(e) => setCitizenName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">الملف (PDF / DOCX / صورة حتى 8MB) *</label>
                <input
                  type="file"
                  required
                  accept=".pdf,.docx,image/*"
                  onChange={(e) => void handleFilePick(e)}
                  className="w-full text-xs text-slate-600"
                />
                {fileObj && (
                  <p className="text-[11px] text-emerald-700 mt-1 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    <span>تم اختيار: {fileObj.fileName}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">ملاحظات</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-600">
                سيُحفظ الملف تلقائياً في:
                <span className="block font-bold text-[#0F2C59] mt-1">
                  مجلد_المكتب / الأرشيف / {ministryName.trim() || 'عام'} / {requestType} / {monthFolder} / {requestNumber.trim() || 'بدون-رقم'}
                </span>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={uploading || !fileObj}
                  className="px-5 py-2 rounded-lg bg-[#0F2C59] text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {uploading ? 'جارٍ الحفظ محلياً...' : 'حفظ في الأرشيف'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <p className="text-sm font-bold text-[#0F2C59]">{previewData.doc.fileName}</p>
              <button
                type="button"
                onClick={() => setPreviewData(null)}
                className="p-1.5 rounded hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 bg-slate-100 p-4 overflow-auto flex items-center justify-center">
              {previewData.doc.fileFormat === 'pdf' ? (
                <iframe
                  title={previewData.doc.fileName}
                  src={previewData.dataUrl}
                  className="w-full h-full rounded border border-slate-200 bg-white"
                />
              ) : (
                <img
                  src={previewData.dataUrl}
                  alt={previewData.doc.fileName}
                  className="max-w-full max-h-full object-contain rounded"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
