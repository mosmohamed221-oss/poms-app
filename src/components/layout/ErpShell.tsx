import React, { useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  FileText,
  Building2,
  Archive,
  Printer,
  UserCog,
  BarChart2,
  Settings,
  LogOut,
  Menu,
  X,
  UserPlus,
  Search,
  FolderSync,
  Bell,
  CheckCheck,
  Send,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiRequest } from '../../lib/api';
import {
  AppSection,
  ArchiveDocument,
  Citizen,
  Employee,
  EmployeeNotification,
  Ministry,
  PrintedDocument,
  RequestRecord,
  ROLE_LABELS,
} from '../../types/poms';
import { formatDateTimeDMY } from '../../utils/formatters';
import {
  getLinkedFolderName,
  isFileSystemSyncSupported,
  pickLocalOfficeDirectory,
  syncLocalPCFolder,
} from '../../utils/localFolderSync';
import { SendTaskModal } from '../common/SendTaskModal';
import { PWAInstallButton } from '../common/PWAInstallButton';

interface ErpShellProps {
  activeSection: AppSection;
  onSelectSection: (section: AppSection) => void;
  onJumpToSearchResult: (section: AppSection, query: string) => void;
  onOpenCitizenPortal: () => void;
  pendingReviewCount: number;
  pendingPrintCount: number;
  citizens: Citizen[];
  requests: RequestRecord[];
  ministries: Ministry[];
  archiveDocs: ArchiveDocument[];
  employees: Employee[];
  printedDocs: PrintedDocument[];
  notifications: EmployeeNotification[];
  onRefreshNotifications: () => Promise<void>;
  children: React.ReactNode;
}

interface NavItem {
  id: AppSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
  badge?: number;
}

interface GlobalSearchResult {
  key: string;
  section: AppSection;
  category: string;
  title: string;
  subtitle: string;
  queryValue: string;
}

export function ErpShell({
  activeSection,
  onSelectSection,
  onJumpToSearchResult,
  onOpenCitizenPortal,
  pendingReviewCount,
  pendingPrintCount,
  citizens,
  requests,
  ministries,
  archiveDocs,
  employees,
  printedDocs,
  notifications,
  onRefreshNotifications,
  children,
}: ErpShellProps) {
  const { employee, hasPermission, signOut } = useAuth();
  const { showToast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [omniQuery, setOmniQuery] = useState('');
  const [omniOpen, setOmniOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [sendTaskOpen, setSendTaskOpen] = useState(false);
  const [linkedDirName, setLinkedDirName] = useState<string | null>(() => getLinkedFolderName());

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
    {
      id: 'citizens',
      label: 'المواطنون',
      icon: Users,
      permission: 'citizens.view',
      badge: pendingReviewCount > 0 ? pendingReviewCount : undefined,
    },
    { id: 'requests', label: 'الطلبات (صادر / وارد)', icon: FileText, permission: 'requests.view' },
    { id: 'ministries', label: 'الوزارات والجهات', icon: Building2, permission: 'ministries.view' },
    { id: 'archive', label: 'الأرشيف والمجلد المحلي', icon: Archive, permission: 'archive.view' },
    {
      id: 'letters',
      label: 'الخطابات والطباعة',
      icon: Printer,
      badge: pendingPrintCount > 0 ? pendingPrintCount : undefined,
    },
    { id: 'employees', label: 'الموظفون والأداء', icon: UserCog, permission: 'employees.manage' },
    { id: 'reports', label: 'التقارير والتصدير', icon: BarChart2, permission: 'reports.view' },
    { id: 'settings', label: 'الإعدادات والتدقيق', icon: Settings, permission: 'settings.manage' },
  ];

  const visibleNav = navItems.filter((item) => !item.permission || hasPermission(item.permission));
  const currentLabel = visibleNav.find((n) => n.id === activeSection)?.label || 'لوحة التحكم';

  const globalResults = useMemo<GlobalSearchResult[]>(() => {
    const q = omniQuery.trim().toLowerCase();
    if (q.length < 1) return [];
    const results: GlobalSearchResult[] = [];

    if (hasPermission('citizens.view')) {
      for (const c of citizens) {
        if (
          c.fullName.toLowerCase().includes(q) ||
          c.nationalId.includes(q) ||
          c.phone.includes(q) ||
          c.registrationNumber.toLowerCase().includes(q)
        ) {
          results.push({
            key: `cit_${c.id}`,
            section: 'citizens',
            category: 'مواطن',
            title: c.fullName,
            subtitle: `${c.registrationNumber} · قومي: ${c.nationalId} · ${c.governorate}`,
            queryValue: c.nationalId,
          });
        }
      }
    }

    if (hasPermission('requests.view')) {
      for (const r of requests) {
        if (
          r.requestNumber.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.citizenName.toLowerCase().includes(q) ||
          (r.citizenNationalId || '').includes(q) ||
          (r.citizenPhone || '').includes(q) ||
          (r.saderNumber || '').toLowerCase().includes(q) ||
          (r.waredNumber || '').toLowerCase().includes(q) ||
          (r.ministryName || '').toLowerCase().includes(q)
        ) {
          results.push({
            key: `req_${r.id}`,
            section: 'requests',
            category: r.requestType,
            title: `${r.requestNumber} · ${r.title}`,
            subtitle: `${r.citizenName} · ${r.status} · ${r.ministryName || 'بدون وزارة'}`,
            queryValue: r.requestNumber,
          });
        }
      }
    }

    if (hasPermission('ministries.view')) {
      for (const m of ministries) {
        if (m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q)) {
          results.push({
            key: `min_${m.id}`,
            section: 'ministries',
            category: 'وزارة / جهة',
            title: m.name,
            subtitle: `${m.code} · ${m.sector}`,
            queryValue: m.name,
          });
        }
      }
    }

    if (hasPermission('archive.view')) {
      for (const a of archiveDocs) {
        if (
          a.fileName.toLowerCase().includes(q) ||
          a.archivePath.toLowerCase().includes(q) ||
          a.requestNumber.toLowerCase().includes(q) ||
          a.ministryName.toLowerCase().includes(q) ||
          (a.citizenName || '').toLowerCase().includes(q)
        ) {
          results.push({
            key: `arc_${a.id}`,
            section: 'archive',
            category: 'أرشيف',
            title: a.fileName,
            subtitle: a.archivePath,
            queryValue: a.fileName,
          });
        }
      }
    }

    if (hasPermission('employees.manage')) {
      for (const e of employees) {
        if (
          e.fullName.toLowerCase().includes(q) ||
          e.username.toLowerCase().includes(q) ||
          e.jobTitle.toLowerCase().includes(q)
        ) {
          results.push({
            key: `emp_${e.id}`,
            section: 'employees',
            category: 'موظف',
            title: `${e.fullName} (${e.jobTitle})`,
            subtitle: `@${e.username} · ${e.department}`,
            queryValue: e.username,
          });
        }
      }
    }

    for (const p of printedDocs) {
      if (
        p.referenceNumber.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        (p.citizenName || '').toLowerCase().includes(q)
      ) {
        results.push({
          key: `prt_${p.id}`,
          section: 'letters',
          category: 'خطاب رسمي',
          title: `${p.referenceNumber} · ${p.title}`,
          subtitle: `${p.citizenName || '—'} · ${p.ministryName || '—'}`,
          queryValue: p.referenceNumber,
        });
      }
    }

    return results.slice(0, 15);
  }, [omniQuery, citizens, requests, ministries, archiveDocs, employees, printedDocs, hasPermission]);

  const handleNavClick = (section: AppSection) => {
    onSelectSection(section);
    setMobileMenuOpen(false);
  };

  const handleLinkLocalFolder = async () => {
    try {
      const name = await pickLocalOfficeDirectory();
      if (name) {
        setLinkedDirName(name);
        await syncLocalPCFolder({ citizens, employees, requests, ministries, notifications, printedDocs });
        showToast(`تم ربط مجلد "${name}" وحفظ بيانات المكتب وملفات Excel فيه بنجاح.`, 'success');
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'تعذر ربط المجلد المحلي على الجهاز.',
        'warning'
      );
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      await apiRequest(`/api/notifications/${id}/read`, { method: 'POST' });
      await onRefreshNotifications();
    } catch {
      // Ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiRequest('/api/notifications/read-all', { method: 'POST' });
      await onRefreshNotifications();
      showToast('تم تحديد جميع الإشعارات كمقروءة.', 'success');
    } catch {
      // Ignore
    }
  };

  const handleOpenNotificationTarget = async (n: EmployeeNotification) => {
    if (!n.isRead) {
      await handleMarkNotificationRead(n.id);
    }
    setNotifOpen(false);
    if (n.targetRef) {
      onJumpToSearchResult(n.targetSection, n.targetRef);
    } else {
      onSelectSection(n.targetSection);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden no-print"
        />
      )}

      {/* Dark Navy Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 right-0 z-50 w-64 bg-[#0A1E3D] text-white flex flex-col justify-between transition-transform duration-200 no-print ${
          mobileMenuOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        <div>
          <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="/assets/aistudio/Gemini_Generated_Image_mlu9oomlu9oomlu9_51cff395.jpeg"
                alt="النائب محمد كليب"
                className="w-11 h-11 rounded-xl object-cover object-top border-2 border-[#C5A253] shrink-0"
              />
              <div>
                <h1 className="text-xs font-extrabold text-white leading-tight">مكتب النائب محمد كليب</h1>
                <p className="text-[11px] text-[#C5A253] font-semibold mt-0.5">نظام الإدارة الموحد</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 rounded text-slate-300 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="p-3 space-y-1">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#0F2C59] text-[#C5A253] border border-[#C5A253]/30'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge !== undefined && (
                    <span className="font-mono-num text-[11px] font-bold text-[#C5A253]">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-white/10 space-y-2.5">
          {isFileSystemSyncSupported() && (
            <button
              type="button"
              onClick={() => void handleLinkLocalFolder()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-[#C5A253]/40 bg-[#C5A253]/10 hover:bg-[#C5A253]/20 text-[11px] font-semibold text-[#C5A253] transition-colors cursor-pointer"
            >
              <FolderSync className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {linkedDirName ? `مزامنة: ${linkedDirName}` : 'ربط مجلد حفظ على جهازك'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenCitizenPortal}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-slate-100 transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-[#C5A253]" />
            <span>بوابة المواطن (/register)</span>
          </button>

          {employee && (
            <div className="pt-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">{employee.fullName}</p>
                <p className="text-[11px] text-[#C5A253] truncate">
                  {employee.jobTitle || ROLE_LABELS[employee.role]}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="تسجيل الخروج"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-700"
              aria-label="فتح القائمة"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
              <span className="font-bold text-[#0F2C59] whitespace-nowrap">مكتب النائب محمد كليب</span>
              <span aria-hidden="true">/</span>
              <span className="font-semibold text-slate-800 whitespace-nowrap">{currentLabel}</span>
            </div>
          </div>

          {/* Global Omni-Search across ALL system sections */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={omniQuery}
              onFocus={() => setOmniOpen(true)}
              onBlur={() => window.setTimeout(() => setOmniOpen(false), 180)}
              onChange={(e) => {
                setOmniQuery(e.target.value);
                setOmniOpen(true);
              }}
              placeholder="بحث شامل في النظام (مواطن، طلب، رقم قومي، وزارة، أرشيف، موظف)..."
              className="w-full rounded-lg border border-slate-300 bg-[#F5F7FA] focus:bg-white pr-9 pl-8 py-2 text-xs focus:border-[#0F2C59] focus:outline-none"
            />
            {omniQuery && (
              <button
                type="button"
                onClick={() => setOmniQuery('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {omniOpen && omniQuery.trim().length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-lg max-h-96 overflow-y-auto divide-y divide-slate-100">
                {globalResults.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    لا توجد نتائج مطابقة في أي قسم من أقسام النظام.
                  </div>
                ) : (
                  globalResults.map((res) => (
                    <button
                      key={res.key}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onJumpToSearchResult(res.section, res.queryValue);
                        setOmniOpen(false);
                      }}
                      className="w-full text-right px-4 py-2.5 hover:bg-slate-50 flex items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#0F2C59] truncate">{res.title}</p>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{res.subtitle}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-[#0F2C59]/10 text-[#0F2C59] text-[10px] font-bold shrink-0">
                        {res.category}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton compact />
            {/* Send Task Quick Button */}
            <button
              type="button"
              onClick={() => setSendTaskOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0F2C59]/10 text-[#0F2C59] hover:bg-[#0F2C59]/15 text-xs font-semibold cursor-pointer whitespace-nowrap"
              title="إرسال تكليف عمل لموظف"
            >
              <Send className="w-3.5 h-3.5" />
              <span>تكليف موظف</span>
            </button>

            {/* Notifications Bell & Panel */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                className="relative p-2 rounded-lg border border-slate-300 bg-white text-[#0F2C59] hover:bg-slate-50 cursor-pointer"
                aria-label="إشعارات العمل"
                title="إشعارات العمل والتكليفات"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center font-mono-num">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <>
                  <div
                    onClick={() => setNotifOpen(false)}
                    className="fixed inset-0 z-40"
                  />
                  <div className="absolute left-0 top-full mt-2 z-50 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                    <div className="px-4 py-3 bg-[#0F2C59] text-white flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold">إشعارات المهام والعمل ({unreadCount} جديد)</p>
                        <p className="text-[10px] text-[#C5A253]">
                          المهام والطلبات الموجّهة لك للعمل عليها
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {unreadCount > 0 && (
                          <button
                            type="button"
                            onClick={() => void handleMarkAllRead()}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-semibold cursor-pointer"
                            title="تحديد الكل كمقروء"
                          >
                            <CheckCheck className="w-3 h-3" />
                            <span>قراءة الكل</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setNotifOpen(false);
                            setSendTaskOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#C5A253] text-[#0F2C59] text-[10px] font-bold cursor-pointer"
                        >
                          <Send className="w-3 h-3" />
                          <span>إرسال</span>
                        </button>
                      </div>
                    </div>

                    <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500">
                          لا توجد إشعارات أو تكليفات عمل حالياً.
                        </div>
                      ) : (
                        notifications.slice(0, 25).map((n) => (
                          <div
                            key={n.id}
                            className={`p-3.5 transition-colors ${
                              n.isRead ? 'bg-white' : 'bg-amber-50/60'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {!n.isRead && (
                                  <span className="w-2 h-2 rounded-full bg-red-600 shrink-0" />
                                )}
                                <p className="text-xs font-bold text-[#0F2C59] truncate">
                                  {n.title}
                                </p>
                              </div>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                                  n.priority === 'طارئ'
                                    ? 'bg-red-100 text-red-700'
                                    : n.priority === 'عاجل'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {n.priority}
                              </span>
                            </div>

                            <p className="text-[11px] text-slate-700 mt-1 leading-relaxed">
                              {n.message}
                            </p>

                            <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-500">
                              <span>
                                من: <strong className="text-slate-700">{n.senderName}</strong>
                                {n.senderJobTitle ? ` (${n.senderJobTitle})` : ''}
                              </span>
                              <span className="font-mono-num">{formatDateTimeDMY(n.createdAt)}</span>
                            </div>

                            <div className="mt-2.5 flex items-center justify-end gap-2">
                              {!n.isRead && (
                                <button
                                  type="button"
                                  onClick={() => void handleMarkNotificationRead(n.id)}
                                  className="px-2.5 py-1 rounded border border-slate-200 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                                >
                                  تمت القراءة
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void handleOpenNotificationTarget(n)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#0F2C59] text-white text-[10px] font-semibold hover:bg-[#0A1E3D] cursor-pointer"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>بدء العمل</span>
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={onOpenCitizenPortal}
              className="hidden md:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-[#0F2C59] hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>بوابة المواطن</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>

      <SendTaskModal
        isOpen={sendTaskOpen}
        onClose={() => setSendTaskOpen(false)}
        employees={employees}
        onSent={onRefreshNotifications}
      />
    </div>
  );
}
