import React, { useState } from 'react';
import { ShieldCheck, UserPlus, LogIn, Lock, Building2, UserCheck, KeyRound, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PWAInstallButton } from '../common/PWAInstallButton';

interface LoginScreenProps {
  onOpenCitizenPortal: () => void;
}

export function LoginScreen({ onOpenCitizenPortal }: LoginScreenProps) {
  const { loginWithCredentials, setupInitialAdmin, needsSetup, envPasscodeActive, authError, loading } = useAuth();
  const [bannerError, setBannerError] = useState(false);
  const [emblemError, setEmblemError] = useState(false);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('مدير المكتب');
  const [jobTitle, setJobTitle] = useState('مدير مكتب النائب محمد كليب');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setLocalError(null);
    setSubmitting(true);
    try {
      await loginWithCredentials(username, password);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setLocalError(null);
    setSubmitting(true);
    try {
      await setupInitialAdmin({
        username,
        password,
        fullName,
        jobTitle,
        phone,
      });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'تعذر إعداد حساب مدير المكتب.');
    } finally {
      setSubmitting(false);
    }
  };

  const activeError = localError || authError;

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col lg:flex-row">
      {/* Right Visual Panel */}
      <div className="lg:w-7/12 relative bg-[#0F2C59] text-white flex flex-col justify-between p-8 lg:p-14 overflow-hidden">
        {!bannerError ? (
          <img
            src="/src/assets/images/office_portal_banner_1795464640731.jpg"
            alt="مقر مكتب النائب البرلماني"
            referrerPolicy="no-referrer"
            onError={() => setBannerError(true)}
            className="absolute inset-0 w-full h-full object-cover opacity-25"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A1E3D]/95 via-[#0F2C59]/80 to-[#0F2C59]/70" />

        <div className="relative z-10 flex items-center gap-4">
          {!emblemError ? (
            <img
              src="/assets/aistudio/Gemini_Generated_Image_mlu9oomlu9oomlu9_51cff395.jpeg"
              alt="النائب محمد كليب"
              onError={() => setEmblemError(true)}
              className="w-14 h-14 rounded-xl object-cover object-top border-2 border-[#C5A253] shadow-lg"
            />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-white/10 border border-[#C5A253]/50 flex items-center justify-center">
              <Building2 className="w-7 h-7 text-[#C5A253]" />
            </div>
          )}
          <div>
            <p className="text-xs font-semibold tracking-wide text-[#C5A253]">
              جمهورية مصر العربية · الأمانة الفنية
            </p>
            <h1 className="text-xl lg:text-2xl font-bold text-white">
              مكتب النائب محمد كليب
            </h1>
          </div>
        </div>

        <div className="relative z-10 my-10 lg:my-0 flex flex-col items-center text-center max-w-lg mx-auto">
          {!emblemError && (
            <div className="mb-6">
              <img
                src="/assets/aistudio/Gemini_Generated_Image_mlu9oomlu9oomlu9_51cff395.jpeg"
                alt="صورة النائب محمد كليب"
                className="w-44 h-52 sm:w-52 sm:h-60 rounded-2xl object-cover object-top border-2 border-[#C5A253] shadow-2xl mx-auto"
              />
              <p className="mt-3 text-sm font-bold tracking-wide text-[#C5A253]">
                السيد النائب محمد كليب
              </p>
            </div>
          )}
          <h2 className="text-2xl lg:text-3xl font-extrabold leading-snug text-white">
            نظام الإدارة الرقمية لمكتب النائب محمد كليب
          </h2>
        </div>

        <div className="relative z-10 flex items-center justify-end text-xs">
          <button
            type="button"
            onClick={onOpenCitizenPortal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 border border-[#C5A253]/40 text-[#C5A253] hover:bg-white/15 hover:text-white font-semibold transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>بوابة التسجيل الذاتي للمواطنين</span>
          </button>
        </div>
      </div>

      {/* Left Sign-In / First-Run Setup Form */}
      <div className="lg:w-5/12 flex items-center justify-center p-6 sm:p-10 lg:p-14">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8">
          <div className="flex items-start justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-[#0F2C59]/10 text-[#0F2C59] flex items-center justify-center shrink-0">
                {needsSetup ? <KeyRound className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {needsSetup ? 'إعداد حساب مدير المكتب الأول' : 'تسجيل دخول الموظفين'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {needsSetup
                    ? 'التشغيل الأول: أنشئ اسم المستخدم وكلمة المرور لمدير المكتب'
                    : 'أدخل اسم المستخدم وكلمة المرور المحددين من المسؤول'}
                </p>
              </div>
            </div>
            <PWAInstallButton compact />
          </div>

          {envPasscodeActive && !needsSetup && (
            <div className="mb-5 rounded-lg border border-[#0F2C59]/20 bg-[#0F2C59]/5 p-3.5 text-xs text-[#0F2C59] leading-relaxed">
              <p className="font-bold mb-1">بيانات دخول مدير المكتب المفعّلة:</p>
              <p>
                اسم المستخدم: <span dir="ltr" className="font-mono-num font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">admin</span>
              </p>
              <p className="mt-1">
                كلمة المرور: قيمة <span dir="ltr" className="font-mono-num font-bold">ADMIN_PASSCODE</span> المسجلة في إعدادات البيئة (Secrets).
              </p>
            </div>
          )}

          {activeError && (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 leading-relaxed">
              <p className="font-bold mb-0.5">تنبيه</p>
              <p>{activeError}</p>
            </div>
          )}

          {needsSetup ? (
            <form onSubmit={handleSetupSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">الاسم الكامل للمدير *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#0F2C59] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">المسمى الوظيفي *</label>
                  <input
                    type="text"
                    required
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-[#0F2C59] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">رقم الهاتف</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="01012345678"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono-num focus:border-[#0F2C59] focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">اسم المستخدم *</label>
                <input
                  type="text"
                  dir="auto"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ''))}
                  placeholder="مثال: admin"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm font-mono-num focus:border-[#0F2C59] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">كلمة المرور (6 أحرف على الأقل) *</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    dir="ltr"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 pl-10 text-sm text-left focus:border-[#0F2C59] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting || loading}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#0F2C59] text-white font-bold text-sm hover:bg-[#0A1E3D] transition-colors disabled:opacity-60 cursor-pointer"
              >
                <UserCheck className="w-4 h-4" />
                <span>{submitting ? 'جارٍ تفعيل الحساب...' : 'تفعيل حساب مدير المكتب والدخول'}</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">اسم المستخدم *</label>
                <input
                  type="text"
                  dir="auto"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ''))}
                  placeholder="مثال: admin"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm font-mono-num focus:border-[#0F2C59] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">كلمة المرور *</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    dir="ltr"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 pl-10 text-sm text-left focus:border-[#0F2C59] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting || loading}
                className="w-full flex items-center justify-center gap-2.5 px-5 py-3 rounded-lg bg-[#0F2C59] text-white font-semibold text-sm hover:bg-[#0A1E3D] transition-colors disabled:opacity-60 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>{submitting ? 'جارٍ التحقق من البيانات...' : 'دخول إلى المنظومة'}</span>
              </button>
            </form>
          )}

          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-slate-400">خدمات المواطنين</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenCitizenPortal}
            className="w-full flex items-center justify-center gap-2.5 px-5 py-3 rounded-lg border border-[#C5A253] bg-[#C5A253]/10 text-[#0F2C59] font-semibold text-sm hover:bg-[#C5A253]/20 transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>بوابة تسجيل طلب مواطن جديد (/register)</span>
          </button>

          <div className="mt-6 pt-5 border-t border-slate-100 flex items-start gap-2.5 text-xs text-slate-500 leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-[#0F2C59] shrink-0 mt-0.5" />
            <span>
              يتم احتساب ساعات العمل الفعلية للموظف وتوثيق كافة العمليات تلقائياً في السجل المحلي وملفات Excel.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
