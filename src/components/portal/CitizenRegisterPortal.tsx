import React, { useEffect, useState } from 'react';
import {
  UserPlus,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import { EGYPT_GOVERNORATES, REQUEST_TYPES, RequestType } from '../../types/poms';
import {
  formatDateDMY,
  validateEgyptPhone,
  validateNationalId,
  validateQuadrupleName,
} from '../../utils/formatters';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { DistrictSelect } from '../common/DistrictSelect';
import { IdCardCaptureInput } from '../common/IdCardCaptureInput';

interface CitizenRegisterPortalProps {
  onBackToLogin: () => void;
}

interface IdImageState {
  dataUrl: string;
  mimeType: 'image/jpeg';
  fileName: string;
  size: number;
}

export function CitizenRegisterPortal({ onBackToLogin }: CitizenRegisterPortalProps) {
  const { showToast } = useToast();
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [governorate, setGovernorate] = useState<string>('القاهرة');
  const [center, setCenter] = useState('');
  const [village, setVillage] = useState('');
  const [detailedAddress, setDetailedAddress] = useState('');
  const [requestType, setRequestType] = useState<RequestType>('طلب');
  const [requestDescription, setRequestDescription] = useState('');
  const [frontId, setFrontId] = useState<IdImageState | null>(null);
  const [backId, setBackId] = useState<IdImageState | null>(null);

  const [customDistricts, setCustomDistricts] = useState<Record<string, string[]>>({});
  const [checkingNid, setCheckingNid] = useState(false);
  const [nidDuplicate, setNidDuplicate] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    registrationNumber: string;
    requestNumber: string;
    fullName: string;
  } | null>(null);

  useEffect(() => {
    void apiRequest<{ customDistricts: Record<string, string[]> }>('/api/public/districts')
      .then((res) => setCustomDistricts(res.customDistricts || {}))
      .catch(() => {});
  }, []);

  const checkNationalIdDuplicate = async (nidValue: string) => {
    const cleaned = nidValue.trim();
    if (!/^[0-9]{14}$/.test(cleaned)) {
      setNidDuplicate(false);
      return;
    }
    setCheckingNid(true);
    try {
      const res = await apiRequest<{ exists: boolean }>(`/api/public/check-nid/${cleaned}`);
      setNidDuplicate(res.exists);
    } catch {
      setNidDuplicate(false);
    } finally {
      setCheckingNid(false);
    }
  };

  const validateAll = async (): Promise<boolean> => {
    const nextErrors: Record<string, string> = {};

    const nameErr = validateQuadrupleName(fullName);
    if (nameErr) nextErrors.fullName = nameErr;

    const ageNum = Number(age);
    if (!age || !Number.isInteger(ageNum) || ageNum < 16 || ageNum > 110) {
      nextErrors.age = 'يرجى إدخال السن الصحيح (من 16 إلى 110 سنة).';
    }

    const nidErr = validateNationalId(nationalId);
    if (nidErr) {
      nextErrors.nationalId = nidErr;
    } else {
      try {
        const res = await apiRequest<{ exists: boolean }>(`/api/public/check-nid/${nationalId.trim()}`);
        if (res.exists) {
          setNidDuplicate(true);
          nextErrors.nationalId = 'هذا الرقم القومي مسجل بالفعل في النظام ولا يمكن تكراره.';
        }
      } catch {
        // Handled server-side on submit
      }
    }

    const phoneErr = validateEgyptPhone(phone);
    if (phoneErr) nextErrors.phone = phoneErr;

    if (whatsapp.trim() && !/^[0-9+]{10,15}$/.test(whatsapp.trim())) {
      nextErrors.whatsapp = 'يرجى إدخال رقم واتساب صحيح.';
    }

    if (!governorate.trim()) nextErrors.governorate = 'يرجى اختيار المحافظة.';
    if (!center.trim()) nextErrors.center = 'يرجى اختيار القسم / المركز أو إضافته يدوياً.';
    if (!detailedAddress.trim()) nextErrors.detailedAddress = 'يرجى إدخال العنوان التفصيلي.';
    if (!frontId) nextErrors.frontId = 'يرجى إرفاق أو تصوير البطاقة الأمامية.';
    if (!backId) nextErrors.backId = 'يرجى إرفاق أو تصوير البطاقة الخلفية.';
    if (requestDescription.trim().length < 10) {
      nextErrors.requestDescription = 'يرجى كتابة وصف واضح للطلب (10 أحرف على الأقل).';
    }

    setErrors(nextErrors);
    return Object.values(nextErrors).every((v) => !v);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    try {
      const ok = await validateAll();
      if (!ok) {
        showToast('يرجى مراجعة الحقول المطلوبة وإصلاح الأخطاء الموضحة.', 'warning');
        setSubmitting(false);
        return;
      }

      const res = await apiRequest<{
        registrationNumber: string;
        requestNumber: string;
        fullName: string;
      }>('/api/public/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName: fullName.trim(),
          age: Number(age),
          nationalId: nationalId.trim(),
          phone: phone.trim(),
          whatsapp: whatsapp.trim() || phone.trim(),
          governorate: governorate.trim(),
          center: center.trim(),
          village: village.trim(),
          detailedAddress: detailedAddress.trim(),
          requestType,
          requestDescription: requestDescription.trim(),
          frontIdDataUrl: frontId?.dataUrl || '',
          backIdDataUrl: backId?.dataUrl || '',
        }),
      });

      setConfirmation(res);
      showToast('تم إرسال طلبك بنجاح وحفظه في منظومة المكتب.', 'success');
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'تعذر إتمام التسجيل.',
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFullName('');
    setAge('');
    setNationalId('');
    setPhone('');
    setWhatsapp('');
    setCenter('');
    setVillage('');
    setDetailedAddress('');
    setRequestDescription('');
    setFrontId(null);
    setBackId(null);
    setErrors({});
    setNidDuplicate(false);
    setConfirmation(null);
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <header className="bg-[#0F2C59] text-white border-b border-[#C5A253]/40">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src="/assets/aistudio/Gemini_Generated_Image_mlu9oomlu9oomlu9_51cff395.jpeg"
              alt="النائب محمد كليب"
              className="w-12 h-12 rounded-xl object-cover object-top border-2 border-[#C5A253] shrink-0"
            />
            <div>
              <h1 className="text-base sm:text-lg font-bold">مكتب النائب محمد كليب</h1>
              <p className="text-xs text-[#C5A253]">بوابة التسجيل الذاتي للمواطنين · نظام إدارة الطلبات (POMS V3)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onBackToLogin}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
            <span>دخول الموظفين</span>
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {confirmation ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <h2 className="text-2xl font-bold text-[#0F2C59] mb-2">
              تم استلام تسجيلك بنجاح
            </h2>
            <p className="text-sm text-slate-600 mb-2">
              أهلاً بك يا <span className="font-bold text-slate-900">{confirmation.fullName}</span>. تم إرسال بياناتك وطلبك إلى وحدة المراجعة بحالة: <span className="font-bold text-[#0F2C59]">بانتظار المراجعة</span>.
            </p>
            <p className="text-xs text-slate-500 font-mono-num mb-6">
              تاريخ التقديم: {formatDateDMY(new Date())}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto mb-8 text-right">
              <div className="rounded-lg border border-slate-200 bg-[#F5F7FA] p-4">
                <p className="text-xs text-slate-500">رقم التسجيل المرجعي</p>
                <p className="text-lg font-bold text-[#0F2C59] font-mono-num mt-1">
                  {confirmation.registrationNumber}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-[#F5F7FA] p-4">
                <p className="text-xs text-slate-500">رقم الطلب الوارد</p>
                <p className="text-lg font-bold text-[#0F2C59] font-mono-num mt-1">
                  {confirmation.requestNumber}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={resetForm}
                className="px-5 py-2.5 rounded-lg bg-[#0F2C59] text-white text-sm font-semibold hover:bg-[#0A1E3D] transition-colors cursor-pointer"
              >
                تسجيل مواطن آخر
              </button>
              <button
                type="button"
                onClick={onBackToLogin}
                className="px-5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
              >
                العودة إلى صفحة الدخول
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-8">
            <div className="border-b border-slate-200 pb-5">
              <div className="flex items-center gap-2.5 text-[#0F2C59] mb-1">
                <UserPlus className="w-5 h-5" />
                <h2 className="text-xl font-bold">نموذج تسجيل مواطن وتقديم طلب</h2>
              </div>
              <p className="text-sm text-slate-600">
                يرجى إدخال البيانات بدقة مطابقة لبطاقة الرقم القومي. يمكنك رفع صور البطاقة أو تصويرها مباشرة بالكاميرا.
              </p>
            </div>

            {/* Section 1: Personal Info */}
            <section className="space-y-4">
              <h3 className="text-sm font-bold text-[#0F2C59]">1. البيانات الشخصية</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    الاسم الرباعي كاملاً <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="مثال: محمد أحمد محمود عبد الله"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#0F2C59] focus:outline-none"
                  />
                  {errors.fullName && <p className="text-xs text-red-600 mt-1">{errors.fullName}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    الرقم القومي (14 رقماً) <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={14}
                    value={nationalId}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setNationalId(val);
                      if (val.length === 14) {
                        void checkNationalIdDuplicate(val);
                      } else {
                        setNidDuplicate(false);
                      }
                    }}
                    placeholder="29001010101234"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm font-mono-num focus:border-[#0F2C59] focus:outline-none"
                  />
                  {checkingNid && (
                    <p className="text-xs text-slate-500 mt-1">جارٍ التحقق من عدم تكرار الرقم القومي...</p>
                  )}
                  {nidDuplicate && (
                    <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      هذا الرقم القومي مسجل مسبقاً في قاعدة البيانات.
                    </p>
                  )}
                  {errors.nationalId && !nidDuplicate && (
                    <p className="text-xs text-red-600 mt-1">{errors.nationalId}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    السن <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="number"
                    min={16}
                    max={110}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="35"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm font-mono-num focus:border-[#0F2C59] focus:outline-none"
                  />
                  {errors.age && <p className="text-xs text-red-600 mt-1">{errors.age}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    رقم الهاتف (11 رقماً) <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={11}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="01012345678"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm font-mono-num focus:border-[#0F2C59] focus:outline-none"
                  />
                  {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    رقم الواتساب (اختياري)
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={15}
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ''))}
                    placeholder="يترك فارغاً إذا كان مطابقاً للهاتف"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm font-mono-num focus:border-[#0F2C59] focus:outline-none"
                  />
                  {errors.whatsapp && <p className="text-xs text-red-600 mt-1">{errors.whatsapp}</p>}
                </div>
              </div>
            </section>

            {/* Section 2: Address with cascading Governorate -> Districts + manual add */}
            <section className="space-y-4 pt-4 border-t border-slate-100">
              <h3 className="text-sm font-bold text-[#0F2C59]">2. العنوان الجغرافي</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    المحافظة <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={governorate}
                    onChange={(e) => {
                      setGovernorate(e.target.value);
                      setCenter('');
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs focus:border-[#0F2C59] focus:outline-none"
                  >
                    {EGYPT_GOVERNORATES.map((gov) => (
                      <option key={gov} value={gov}>
                        {gov}
                      </option>
                    ))}
                  </select>
                  {errors.governorate && <p className="text-xs text-red-600 mt-1">{errors.governorate}</p>}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    المركز / القسم / الحي <span className="text-red-600">*</span>
                  </label>
                  <DistrictSelect
                    governorate={governorate}
                    value={center}
                    customDistricts={customDistricts}
                    onChange={(val) => setCenter(val)}
                    onCustomDistrictAdded={setCustomDistricts}
                  />
                  {errors.center && <p className="text-xs text-red-600 mt-1">{errors.center}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    القرية / الشياخة
                  </label>
                  <input
                    type="text"
                    value={village}
                    onChange={(e) => setVillage(e.target.value)}
                    placeholder="اختياري"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-xs focus:border-[#0F2C59] focus:outline-none"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    العنوان التفصيلي <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={detailedAddress}
                    onChange={(e) => setDetailedAddress(e.target.value)}
                    placeholder="الشارع، رقم المنزل، معلم مميز"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-xs focus:border-[#0F2C59] focus:outline-none"
                  />
                  {errors.detailedAddress && (
                    <p className="text-xs text-red-600 mt-1">{errors.detailedAddress}</p>
                  )}
                </div>
              </div>
            </section>

            {/* Section 3: ID Images (Upload OR Camera Capture) */}
            <section className="space-y-4 pt-4 border-t border-slate-100">
              <h3 className="text-sm font-bold text-[#0F2C59]">3. صور بطاقة الرقم القومي (رفع صورة أو التصوير بالكاميرا)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <IdCardCaptureInput
                  label="صورة البطاقة الأمامية"
                  required
                  value={frontId}
                  onChange={(val) => {
                    setFrontId(val);
                    setErrors((prev) => ({ ...prev, frontId: '' }));
                  }}
                  error={errors.frontId}
                />
                <IdCardCaptureInput
                  label="صورة البطاقة الخلفية"
                  required
                  value={backId}
                  onChange={(val) => {
                    setBackId(val);
                    setErrors((prev) => ({ ...prev, backId: '' }));
                  }}
                  error={errors.backId}
                />
              </div>
            </section>

            {/* Section 4: Request Details */}
            <section className="space-y-4 pt-4 border-t border-slate-100">
              <h3 className="text-sm font-bold text-[#0F2C59]">4. تفاصيل الطلب</h3>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    نوع الطلب <span className="text-red-600">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {REQUEST_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setRequestType(type)}
                        className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                          requestType === type
                            ? 'bg-[#0F2C59] text-white border-[#0F2C59]'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    وصف الطلب بالتفصيل <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    rows={4}
                    value={requestDescription}
                    onChange={(e) => setRequestDescription(e.target.value)}
                    placeholder="اكتب تفاصيل الشكوى أو الطلب والجهة المعنية إن وجدت..."
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#0F2C59] focus:outline-none"
                  />
                  {errors.requestDescription && (
                    <p className="text-xs text-red-600 mt-1">{errors.requestDescription}</p>
                  )}
                </div>
              </div>
            </section>

            <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="w-4 h-4 text-[#0F2C59]" />
                <span>تُحفظ البيانات تلقائياً في المجلد المحلي للمكتب وسجل المراجعة</span>
              </div>
              <button
                type="submit"
                disabled={submitting || nidDuplicate}
                className="px-6 py-3 rounded-lg bg-[#0F2C59] text-white text-sm font-bold hover:bg-[#0A1E3D] transition-colors disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'جارٍ حفظ وإرسال الطلب...' : 'إرسال طلب التسجيل'}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
