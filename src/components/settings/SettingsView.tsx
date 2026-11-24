import React, { useEffect, useState } from 'react';
import { Settings, ShieldCheck, Download, Save, FolderSync, HardDrive, RefreshCw, FolderArchive } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiRequest, downloadAuthorizedFile } from '../../lib/api';
import {
  AuditLog,
  Citizen,
  Employee,
  Ministry,
  OfficeSettings,
  RequestRecord,
  StorageStats,
} from '../../types/poms';
import { formatDateTimeDMY, toIsoDate } from '../../utils/formatters';
import {
  getLinkedFolderName,
  isFileSystemSyncSupported,
  pickLocalOfficeDirectory,
  syncLocalPCFolder,
} from '../../utils/localFolderSync';
import { MultiDevicePanel } from '../common/MultiDevicePanel';

interface SettingsViewProps {
  officeSettings: OfficeSettings | null;
  officeBaseDir: string;
  storageStats?: StorageStats | null;
  auditLogs: AuditLog[];
  citizens: Citizen[];
  requests: RequestRecord[];
  ministries: Ministry[];
  employees: Employee[];
  onRefresh: () => Promise<void>;
}

export function SettingsView({
  officeSettings,
  officeBaseDir,
  storageStats,
  auditLogs,
  citizens,
  requests,
  ministries,
  employees,
  onRefresh,
}: SettingsViewProps) {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();

  const canManage = hasPermission('settings.manage');

  const [officeName, setOfficeName] = useState(officeSettings?.officeName || 'مكتب النائب محمد كليب');
  const [deputyName, setDeputyName] = useState(officeSettings?.deputyName || 'السيد النائب محمد كليب');
  const [governorate, setGovernorate] = useState(officeSettings?.governorate || 'القاهرة');
  const [address, setAddress] = useState(officeSettings?.address || '');
  const [phone, setPhone] = useState(officeSettings?.phone || '');
  const [email, setEmail] = useState(officeSettings?.email || '');
  const [defaultFooter, setDefaultFooter] = useState(
    officeSettings?.defaultFooter || 'مكتب النائب محمد كليب لخدمة المواطنين – المراسلات الرسمية'
  );
  const [saving, setSaving] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);
  const [linkedName, setLinkedName] = useState<string | null>(() => getLinkedFolderName());

  useEffect(() => {
    if (!officeSettings) return;
    setOfficeName(officeSettings.officeName || 'مكتب النائب محمد كليب');
    setDeputyName(officeSettings.deputyName || 'السيد النائب محمد كليب');
    setGovernorate(officeSettings.governorate || 'القاهرة');
    setAddress(officeSettings.address || '');
    setPhone(officeSettings.phone || '');
    setEmail(officeSettings.email || '');
    setDefaultFooter(officeSettings.defaultFooter || 'مكتب النائب محمد كليب لخدمة المواطنين – المراسلات الرسمية');
  }, [officeSettings]);

  if (!canManage) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
        <p className="text-sm font-bold text-slate-900">صلاحية مقصورة على مدير المكتب</p>
      </div>
    );
  }

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          officeName: officeName.trim(),
          deputyName: deputyName.trim(),
          governorate: governorate.trim(),
          address: address.trim(),
          phone: phone.trim(),
          email: email.trim(),
          defaultFooter: defaultFooter.trim(),
        }),
      });
      await onRefresh();
      showToast('تم حفظ إعدادات المكتب بنجاح.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر حفظ الإعدادات.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleLinkPCDir = async () => {
    try {
      const name = await pickLocalOfficeDirectory();
      if (name) {
        setLinkedName(name);
        await syncLocalPCFolder({ citizens, employees, requests, ministries });
        showToast(`تم ربط المجلد "${name}" ومزامنة كافة ملفات Excel والمجلدات فيه بنجاح.`, 'success');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذر ربط المجلد المحلي.', 'warning');
    }
  };

  const handleExportBackup = () => {
    const backup = {
      exportedAt: new Date().toISOString(),
      officeSettings,
      counts: {
        citizens: citizens.length,
        requests: requests.length,
        ministries: ministries.length,
        employees: employees.length,
      },
      citizens,
      requests,
      ministries,
      employees,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `poms_v3_backup_${toIsoDate()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('تم تنزيل النسخة الاحتياطية الكاملة بنجاح.', 'success');
  };

  const handleForceSync = async () => {
    setSyncingNow(true);
    try {
      await apiRequest('/api/local-storage/sync', { method: 'POST' });
      await onRefresh();
      showToast('تم تحديث ومزامنة جميع ملفات Excel والمجلدات المحلية بنجاح.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذر مزامنة التخزين المحلي.', 'error');
    } finally {
      setSyncingNow(false);
    }
  };

  const handleDownloadZip = async () => {
    try {
      await downloadAuthorizedFile('/api/local-storage/export-zip', `مجلد_المكتب_${toIsoDate()}.zip`);
      showToast('تم تنزيل نسخة كاملة من مجلد المكتب (ZIP).', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذر تنزيل المجلد المضغوط.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Local Storage & PC Folder Sync Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#0F2C59]/10 text-[#0F2C59] flex items-center justify-center shrink-0">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#0F2C59]">الحفظ المحلي التلقائي للمكتب</h3>
            <p className="text-xs text-slate-600 mt-0.5">
              يتم حفظ جميع السجلات وملفات Excel والأرشيف المنظم والخطابات تلقائياً على المسار المحلي:
            </p>
            <p className="text-[11px] font-mono-num text-slate-500 mt-1" dir="ltr">
              {officeBaseDir}
            </p>
            {storageStats && (
              <p className="text-[11px] text-slate-600 mt-1">
                المجلدات: <strong className="font-mono-num">{storageStats.totalFolders}</strong> · الملفات:{' '}
                <strong className="font-mono-num">{storageStats.totalFiles}</strong> · الحجم:{' '}
                <strong className="font-mono-num">{Math.round(storageStats.totalSizeBytes / 1024)} KB</strong>
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={syncingNow}
            onClick={() => void handleForceSync()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-[#0F2C59] bg-[#0F2C59]/5 text-[#0F2C59] text-xs font-bold hover:bg-[#0F2C59]/10 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${syncingNow ? 'animate-spin' : ''}`} />
            <span>{syncingNow ? 'جارٍ التحديث...' : 'فحص ومزامنة الآن'}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleDownloadZip()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-[#0F2C59] text-white text-xs font-bold hover:bg-[#0A1E3D] cursor-pointer"
          >
            <FolderArchive className="w-4 h-4 text-[#C5A253]" />
            <span>تنزيل المجلد كاملاً (ZIP)</span>
          </button>
          {isFileSystemSyncSupported() && (
            <button
              type="button"
              onClick={() => void handleLinkPCDir()}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-[#C5A253] bg-[#C5A253]/15 text-[#0F2C59] text-xs font-bold hover:bg-[#C5A253]/25 cursor-pointer"
            >
              <FolderSync className="w-4 h-4" />
              <span>
                {linkedName ? `متزامن: ${linkedName}` : 'ربط مجلد على الجهاز'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Multi-device LAN + Project Download Package + QR Scanner */}
      <MultiDevicePanel />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={handleSaveSettings} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <Settings className="w-5 h-5 text-[#0F2C59]" />
            <h2 className="text-base font-bold text-[#0F2C59]">إعدادات المكتب الرسمية</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">اسم المكتب *</label>
              <input
                type="text"
                required
                value={officeName}
                onChange={(e) => setOfficeName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">اسم / لقب النائب *</label>
              <input
                type="text"
                required
                value={deputyName}
                onChange={(e) => setDeputyName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">المحافظة *</label>
              <input
                type="text"
                required
                value={governorate}
                onChange={(e) => setGovernorate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">هاتف المكتب</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">البريد الإلكتروني</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">عنوان المقر</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">تذييل المراسلات الافتراضي</label>
              <input
                type="text"
                value={defaultFooter}
                onChange={(e) => setDefaultFooter(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={handleExportBackup}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#C5A253] bg-[#C5A253]/10 text-[#0F2C59] text-xs font-semibold cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>نسخة احتياطية (JSON)</span>
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#0F2C59] text-white text-xs font-semibold cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}</span>
            </button>
          </div>
        </form>

        {/* Security Audit Logs */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3 mb-4">
            <ShieldCheck className="w-5 h-5 text-[#0F2C59]" />
            <h2 className="text-base font-bold text-[#0F2C59]">سجل التدقيق الأمني الكامل</h2>
          </div>
          {auditLogs.length === 0 ? (
            <p className="text-xs text-slate-500 py-10 text-center">لا توجد أحداث تدقيق مسجلة بعد.</p>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto text-xs">
              {auditLogs.map((log) => (
                <div key={log.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900">{log.action}</p>
                    <p className="text-slate-600 mt-0.5">
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
