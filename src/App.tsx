/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { OfflineIndicator } from './components/common/PWAInstallButton';
import { LoginScreen } from './components/auth/LoginScreen';
import { CitizenRegisterPortal } from './components/portal/CitizenRegisterPortal';
import { ErpShell } from './components/layout/ErpShell';
import { RoleDashboard } from './components/dashboards/RoleDashboard';
import { CitizensView } from './components/citizens/CitizensView';
import { RequestsView } from './components/requests/RequestsView';
import { MinistriesView } from './components/ministries/MinistriesView';
import { ArchiveView } from './components/archive/ArchiveView';
import { LetterBuilderView } from './components/letters/LetterBuilderView';
import { EmployeesView } from './components/employees/EmployeesView';
import { ReportsView } from './components/reports/ReportsView';
import { SettingsView } from './components/settings/SettingsView';
import { usePomsData } from './hooks/usePomsData';
import { AppSection } from './types/poms';

const VALID_SECTIONS: AppSection[] = [
  'dashboard',
  'citizens',
  'requests',
  'ministries',
  'archive',
  'letters',
  'employees',
  'reports',
  'settings',
];

function getInitialSectionFromHash(): AppSection {
  const hash = window.location.hash.replace(/^#/, '') as AppSection;
  return VALID_SECTIONS.includes(hash) ? hash : 'dashboard';
}

function PomsAppContent() {
  const { employee, loading } = useAuth();
  const data = usePomsData();

  const [isPublicPortal, setIsPublicPortal] = useState<boolean>(() =>
    window.location.pathname.startsWith('/register')
  );
  const [activeSection, setActiveSection] = useState<AppSection>(() => getInitialSectionFromHash());
  const [openCreateCitizen, setOpenCreateCitizen] = useState(false);
  const [openCreateRequest, setOpenCreateRequest] = useState(false);
  const [openCreateMinistry, setOpenCreateMinistry] = useState(false);
  const [openUploadArchive, setOpenUploadArchive] = useState(false);
  const [openCreateEmployee, setOpenCreateEmployee] = useState(false);
  const [searchCarryOver, setSearchCarryOver] = useState<{ section: AppSection; query: string } | null>(null);

  useEffect(() => {
    const onPopState = () => {
      setIsPublicPortal(window.location.pathname.startsWith('/register'));
      setActiveSection(getInitialSectionFromHash());
    };
    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('hashchange', onPopState);
    };
  }, []);

  useEffect(() => {
    if (employee && !isPublicPortal) {
      const targetHash = `#${activeSection}`;
      if (window.location.hash !== targetHash) {
        window.history.replaceState({}, '', `${window.location.pathname}${targetHash}`);
      }
    } else if (!employee && !loading && !window.location.hash) {
      setActiveSection('dashboard');
    }
  }, [employee, loading, isPublicPortal, activeSection]);

  const navigatePortal = (showPortal: boolean) => {
    setIsPublicPortal(showPortal);
    const nextPath = showPortal ? '/register' : '/';
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
  };

  const handleJumpToSearchResult = (section: AppSection, query: string) => {
    setSearchCarryOver({ section, query });
    setActiveSection(section);
  };

  if (isPublicPortal) {
    return <CitizenRegisterPortal onBackToLogin={() => navigatePortal(false)} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="bg-white border border-slate-200 rounded-xl px-8 py-6 text-center">
          <div className="w-8 h-8 border-2 border-[#0F2C59] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-[#0F2C59]">جارٍ تحميل نظام مكتب النائب محمد كليب...</p>
        </div>
      </div>
    );
  }

  if (!employee) {
    return <LoginScreen onOpenCitizenPortal={() => navigatePortal(true)} />;
  }

  const pendingReviewCount = data.citizens.filter((c) => c.reviewStatus === 'بانتظار المراجعة').length;
  const pendingPrintCount = data.printedDocs.filter((p) => p.status === 'pending_print').length;

  return (
    <ErpShell
      activeSection={activeSection}
      onSelectSection={(sec) => {
        setSearchCarryOver(null);
        setActiveSection(sec);
      }}
      onJumpToSearchResult={handleJumpToSearchResult}
      onOpenCitizenPortal={() => navigatePortal(true)}
      pendingReviewCount={pendingReviewCount}
      pendingPrintCount={pendingPrintCount}
      citizens={data.citizens}
      requests={data.requests}
      ministries={data.ministries}
      archiveDocs={data.archiveDocs}
      employees={data.employees}
      printedDocs={data.printedDocs}
      notifications={data.notifications}
      onRefreshNotifications={data.refreshNotifications}
    >
      {activeSection === 'dashboard' && (
        <RoleDashboard
          citizens={data.citizens}
          requests={data.requests}
          ministries={data.ministries}
          employees={data.employees}
          printedDocs={data.printedDocs}
          auditLogs={data.auditLogs}
          onNavigate={setActiveSection}
          onQuickCreateCitizen={() => {
            setOpenCreateCitizen(true);
            setActiveSection('citizens');
          }}
          onQuickCreateRequest={() => {
            setOpenCreateRequest(true);
            setActiveSection('requests');
          }}
          onQuickCreateMinistry={() => {
            setOpenCreateMinistry(true);
            setActiveSection('ministries');
          }}
          onQuickUploadArchive={() => {
            setOpenUploadArchive(true);
            setActiveSection('archive');
          }}
          onQuickCreateEmployee={() => {
            setOpenCreateEmployee(true);
            setActiveSection('employees');
          }}
        />
      )}

      {activeSection === 'citizens' && (
        <CitizensView
          citizens={data.citizens}
          requests={data.requests}
          customDistricts={data.customDistricts}
          onCustomDistrictsChange={data.setCustomDistricts}
          loading={data.loadingData}
          openCreateInitially={openCreateCitizen}
          onConsumeOpenCreate={() => setOpenCreateCitizen(false)}
          initialSearchQuery={searchCarryOver?.section === 'citizens' ? searchCarryOver.query : undefined}
          onRefresh={data.refresh}
        />
      )}

      {activeSection === 'requests' && (
        <RequestsView
          requests={data.requests}
          history={data.requestHistory}
          citizens={data.citizens}
          ministries={data.ministries}
          employees={data.employees}
          loading={data.loadingData}
          openCreateInitially={openCreateRequest}
          onConsumeOpenCreate={() => setOpenCreateRequest(false)}
          initialSearchQuery={searchCarryOver?.section === 'requests' ? searchCarryOver.query : undefined}
          onRefresh={data.refresh}
        />
      )}

      {activeSection === 'ministries' && (
        <MinistriesView
          ministries={data.ministries}
          requests={data.requests}
          loading={data.loadingData}
          openCreateInitially={openCreateMinistry}
          onConsumeOpenCreate={() => setOpenCreateMinistry(false)}
          initialSearchQuery={searchCarryOver?.section === 'ministries' ? searchCarryOver.query : undefined}
          onRefresh={data.refresh}
        />
      )}

      {activeSection === 'archive' && (
        <ArchiveView
          archiveDocs={data.archiveDocs}
          requests={data.requests}
          ministries={data.ministries}
          localTree={data.localTree}
          officeBaseDir={data.officeBaseDir}
          storageStats={data.storageStats}
          loading={data.loadingData}
          openUploadInitially={openUploadArchive}
          onConsumeOpenUpload={() => setOpenUploadArchive(false)}
          initialSearchQuery={searchCarryOver?.section === 'archive' ? searchCarryOver.query : undefined}
          onRefresh={data.refresh}
        />
      )}

      {activeSection === 'letters' && (
        <LetterBuilderView
          requests={data.requests}
          citizens={data.citizens}
          templates={data.letterTemplates}
          printedDocs={data.printedDocs}
          officeSettings={data.officeSettings}
          onRefresh={data.refresh}
        />
      )}

      {activeSection === 'employees' && (
        <EmployeesView
          employees={data.employees}
          requests={data.requests}
          requestHistory={data.requestHistory}
          printedDocs={data.printedDocs}
          openCreateInitially={openCreateEmployee}
          onConsumeOpenCreate={() => setOpenCreateEmployee(false)}
          onRefresh={data.refresh}
        />
      )}

      {activeSection === 'reports' && (
        <ReportsView
          citizens={data.citizens}
          requests={data.requests}
          ministries={data.ministries}
          employees={data.employees}
        />
      )}

      {activeSection === 'settings' && (
        <SettingsView
          officeSettings={data.officeSettings}
          officeBaseDir={data.officeBaseDir}
          storageStats={data.storageStats}
          auditLogs={data.auditLogs}
          citizens={data.citizens}
          requests={data.requests}
          ministries={data.ministries}
          employees={data.employees}
          onRefresh={data.refresh}
        />
      )}
    </ErpShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <PomsAppContent />
          <OfflineIndicator />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
