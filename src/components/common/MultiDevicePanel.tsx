import { useEffect, useState } from 'react';
import {
  Laptop,
  Smartphone,
  Wifi,
  Copy,
  Check,
  Package,
  QrCode,
  Globe,
  Terminal,
} from 'lucide-react';
import QRCode from 'qrcode';
import { apiRequest, downloadAuthorizedFile } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { toIsoDate } from '../../utils/formatters';
import { PWAInstallButton } from './PWAInstallButton';

interface LanEndpoint {
  interfaceName: string;
  address: string;
  appUrl: string;
  portalUrl: string;
}

interface NetworkInfoResponse {
  hostname: string;
  port: number;
  localUrl: string;
  lanUrls: LanEndpoint[];
}

export function MultiDevicePanel() {
  const { showToast } = useToast();
  const [netInfo, setNetInfo] = useState<NetworkInfoResponse | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string>(() => window.location.origin);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [downloadingPkg, setDownloadingPkg] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest<NetworkInfoResponse>('/api/system/network-info')
      .then((info) => {
        if (!active) return;
        setNetInfo(info);
        if (window.location.hostname === 'localhost' && info.lanUrls.length > 0) {
          setSelectedUrl(info.lanUrls[0].appUrl);
        }
      })
      .catch(() => {
        // Ignore silently if offline
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedUrl) return;
    QRCode.toDataURL(selectedUrl, {
      width: 200,
      margin: 2,
      color: { dark: '#0F2C59', light: '#FFFFFF' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [selectedUrl]);

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      showToast('تم نسخ الرابط إلى الحافظة.', 'success');
      window.setTimeout(() => setCopiedUrl(null), 2000);
    } catch {
      showToast('تعذر النسخ التلقائي، يمكنك نسخ الرابط يدوياً.', 'warning');
    }
  };

  const handleDownloadProjectPackage = async () => {
    setDownloadingPkg(true);
    try {
      await downloadAuthorizedFile(
        '/api/system/download-project-zip',
        `POMS_V3_Local_Package_${toIsoDate()}.zip`
      );
      showToast('تم تنزيل حزمة المشروع كاملة للتشغيل على جهازك.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذر تنزيل حزمة المشروع.', 'error');
    } finally {
      setDownloadingPkg(false);
    }
  };

  const originUrl = window.location.origin;
  const portalOriginUrl = `${originUrl}/register`;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#0F2C59] text-[#C5A253] flex items-center justify-center shrink-0">
            <Laptop className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#0F2C59]">
              تحميل المشروع وتشغيله على الهواتف وأجهزة الكمبيوتر
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              يمكن تشغيل المنظومة محلياً على جهاز المكتب الرئيسي وربط جميع الهواتف وأجهزة الموظفين بنفس قاعدة البيانات.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <PWAInstallButton />
          <button
            type="button"
            disabled={downloadingPkg}
            onClick={() => void handleDownloadProjectPackage()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F2C59] text-white text-xs font-bold hover:bg-[#0A1E3D] cursor-pointer disabled:opacity-60"
          >
            <Package className="w-4 h-4 text-[#C5A253]" />
            <span>{downloadingPkg ? 'جارٍ تجهيز الحزمة...' : 'تنزيل حزمة المشروع للتشغيل المحلي (.zip)'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Column 1: Links & Network Endpoints */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-lg border border-slate-200 bg-[#F5F7FA] p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#0F2C59]">
              <Wifi className="w-4 h-4 text-[#C5A253]" />
              <span>روابط التشغيل على الأجهزة الأخرى (الهواتف والكمبيوتر)</span>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-[#0F2C59]" />
                    <span>الرابط المباشر الحالي (يعمل من أي هاتف أو كمبيوتر)</span>
                  </p>
                  <p className="text-xs font-mono-num text-[#0F2C59] truncate mt-0.5" dir="ltr">
                    {originUrl}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedUrl(originUrl)}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                      selectedUrl === originUrl
                        ? 'bg-[#0F2C59] text-white'
                        : 'border border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    عرض QR
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopy(originUrl)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 text-[11px] font-semibold hover:bg-slate-50 cursor-pointer"
                  >
                    {copiedUrl === originUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>نسخ</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-slate-700">رابط بوابة التسجيل الذاتي للمواطنين (/register)</p>
                  <p className="text-xs font-mono-num text-slate-600 truncate mt-0.5" dir="ltr">
                    {portalOriginUrl}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedUrl(portalOriginUrl)}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                      selectedUrl === portalOriginUrl
                        ? 'bg-[#0F2C59] text-white'
                        : 'border border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    عرض QR
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopy(portalOriginUrl)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 text-[11px] font-semibold hover:bg-slate-50 cursor-pointer"
                  >
                    {copiedUrl === portalOriginUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>نسخ</span>
                  </button>
                </div>
              </div>

              {netInfo && netInfo.lanUrls.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[11px] font-bold text-slate-600">
                    عناوين الشبكة المحلية (Wi-Fi / LAN) المكتشفة على الخادم ({netInfo.hostname}):
                  </p>
                  {netInfo.lanUrls.map((lan) => (
                    <div
                      key={lan.address}
                      className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-[11px] text-slate-500">شبكة: {lan.interfaceName}</p>
                        <p className="text-xs font-mono-num font-bold text-[#0F2C59]" dir="ltr">
                          {lan.appUrl}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedUrl(lan.appUrl)}
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                            selectedUrl === lan.appUrl
                              ? 'bg-[#0F2C59] text-white'
                              : 'border border-slate-300 bg-white text-slate-700'
                          }`}
                        >
                          عرض QR
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCopy(lan.appUrl)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 text-[11px] font-semibold hover:bg-slate-50 cursor-pointer"
                        >
                          {copiedUrl === lan.appUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>نسخ</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Step-by-step guide for running locally across PCs and Phones */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-slate-200 p-3.5 space-y-1.5">
              <p className="font-bold text-[#0F2C59] flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-[#C5A253]" />
                <span>أولاً: التشغيل على جهاز المكتب الرئيسي</span>
              </p>
              <ol className="list-decimal list-inside space-y-1 text-slate-600 leading-relaxed text-[11px]">
                <li>اضغط <strong>تنزيل حزمة المشروع (.zip)</strong> وفك الضغط.</li>
                <li>تأكد من تثبيت <strong>Node.js 20+</strong> على الكمبيوتر الرئيسي.</li>
                <li>على ويندوز: افتح ملف <span dir="ltr" className="font-mono-num font-bold text-slate-800">start-poms.bat</span> (وعلى لينكس <span dir="ltr" className="font-mono-num font-bold text-slate-800">start-poms.sh</span>).</li>
                <li>تُحفظ كل المجلدات والبيانات محلياً داخل مجلد <span className="font-bold text-slate-800">مجلد_المكتب</span>.</li>
              </ol>
            </div>

            <div className="rounded-lg border border-slate-200 p-3.5 space-y-1.5">
              <p className="font-bold text-[#0F2C59] flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-[#C5A253]" />
                <span>ثانياً: الدخول من الهواتف والأجهزة الأخرى</span>
              </p>
              <ol className="list-decimal list-inside space-y-1 text-slate-600 leading-relaxed text-[11px]">
                <li>صل جميع الهواتف وأجهزة الكمبيوتر <strong>بنفس شبكة الواي فاي</strong>.</li>
                <li>امسح <strong>رمز QR</strong> أو اكتب عنوان <span dir="ltr" className="font-mono-num">http://IP:3000</span> في متصفح الهاتف.</li>
                <li>يدخل كل موظف بحسابه ويعمل الجميع على نفس قاعدة البيانات لحظياً.</li>
                <li>يمكن تثبيت المنظومة كتطبيق على شاشة الهاتف عبر زر <strong>تثبيت التطبيق</strong>.</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Column 2: QR Code Scanner Card */}
        <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-4 flex flex-col items-center justify-center text-center">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#0F2C59] mb-2">
            <QrCode className="w-4 h-4 text-[#C5A253]" />
            <span>امسح الكود بكاميرا الهاتف</span>
          </div>
          {qrDataUrl ? (
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
              <img src={qrDataUrl} alt="رمز QR لفتح النظام على الهاتف" className="w-44 h-44" />
            </div>
          ) : (
            <div className="w-44 h-44 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-xs text-slate-400">
              جارٍ توليد الرمز...
            </div>
          )}
          <p className="text-[11px] font-mono-num text-slate-600 mt-3 break-all" dir="ltr">
            {selectedUrl}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            افتح كاميرا أي هاتف أندرويد أو آيفون وامسح الرمز لفتح النظام مباشرة
          </p>
        </div>
      </div>
    </div>
  );
}
