import React, { useEffect, useState } from 'react';
import { Send, X } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { AppSection, Employee, RequestPriority, REQUEST_PRIORITIES } from '../../types/poms';

interface SendTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  defaultRecipientUid?: string;
  defaultTitle?: string;
  defaultMessage?: string;
  defaultSection?: AppSection;
  defaultRef?: string;
  onSent?: () => Promise<void> | void;
}

const SECTION_OPTIONS: Array<{ value: AppSection; label: string }> = [
  { value: 'requests', label: 'الطلبات والشكاوى (صادر / وارد)' },
  { value: 'citizens', label: 'سجل المواطنين' },
  { value: 'letters', label: 'الخطابات والطباعة' },
  { value: 'archive', label: 'الأرشيف والمجلد المحلي' },
  { value: 'ministries', label: 'الوزارات والجهات' },
  { value: 'reports', label: 'التقارير والتصدير' },
  { value: 'dashboard', label: 'لوحة التحكم' },
];

export function SendTaskModal({
  isOpen,
  onClose,
  employees,
  defaultRecipientUid,
  defaultTitle,
  defaultMessage,
  defaultSection = 'requests',
  defaultRef = '',
  onSent,
}: SendTaskModalProps) {
  const { showToast } = useToast();
  const activeEmployees = employees.filter((e) => e.status === 'active');

  const [recipientUid, setRecipientUid] = useState(defaultRecipientUid || '');
  const [priority, setPriority] = useState<RequestPriority>('عادي');
  const [targetSection, setTargetSection] = useState<AppSection>(defaultSection);
  const [targetRef, setTargetRef] = useState(defaultRef);
  const [title, setTitle] = useState(defaultTitle || '');
  const [message, setMessage] = useState(defaultMessage || '');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setRecipientUid(defaultRecipientUid || activeEmployees[0]?.uid || '');
    setTitle(defaultTitle || '');
    setMessage(defaultMessage || '');
    setTargetSection(defaultSection);
    setTargetRef(defaultRef);
    setPriority('عادي');
  }, [isOpen, defaultRecipientUid, defaultTitle, defaultMessage, defaultSection, defaultRef]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientUid || !title.trim() || !message.trim()) {
      showToast('يرجى اختيار الموظف وكتابة عنوان التكليف وتفاصيل العمل.', 'warning');
      return;
    }
    setSending(true);
    try {
      await apiRequest('/api/notifications/send', {
        method: 'POST',
        body: JSON.stringify({
          recipientUid,
          priority,
          targetSection,
          targetRef: targetRef.trim(),
          title: title.trim(),
          message: message.trim(),
          category: 'direct_task',
        }),
      });
      showToast('تم إرسال الإشعار وتكليف العمل للموظف بنجاح.', 'success');
      if (onSent) await onSent();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذر إرسال الإشعار للموظف.', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 bg-[#0F2C59] text-white flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold">إرسال تكليف وإشعار عمل لموظف</h3>
            <p className="text-[11px] text-[#C5A253] mt-0.5">
              يصل الإشعار فوراً للموظف مع تفاصيل المهمة والقسم المطلوب العمل فيه
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">الموظف المستلم *</label>
              <select
                required
                value={recipientUid}
                onChange={(e) => setRecipientUid(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white focus:border-[#0F2C59] focus:outline-none"
              >
                <option value="">— اختر الموظف —</option>
                {activeEmployees.map((emp) => (
                  <option key={emp.uid} value={emp.uid}>
                    {emp.fullName} ({emp.jobTitle})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">الأولوية *</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as RequestPriority)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white focus:border-[#0F2C59] focus:outline-none"
              >
                {REQUEST_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">القسم المرتبط بالعمل</label>
              <select
                value={targetSection}
                onChange={(e) => setTargetSection(e.target.value as AppSection)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white focus:border-[#0F2C59] focus:outline-none"
              >
                {SECTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">رقم المرجع / الطلب (اختياري)</label>
              <input
                type="text"
                value={targetRef}
                onChange={(e) => setTargetRef(e.target.value)}
                placeholder="مثال: REQ-2026-00001"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono-num focus:border-[#0F2C59] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">عنوان التكليف *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: متابعة شكوى عاجلة لوزارة الصحة"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-[#0F2C59] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">تفاصيل العمل المطلوب من الموظف *</label>
            <textarea
              required
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="اشرح للموظف الإجراء المطلوب بالضبط وما يجب متابعته..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-[#0F2C59] focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={sending}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#0F2C59] text-white text-xs font-semibold hover:bg-[#0A1E3D] disabled:opacity-60 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sending ? 'جارٍ الإرسال...' : 'إرسال الإشعار للموظف'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
