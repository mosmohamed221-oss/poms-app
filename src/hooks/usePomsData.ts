import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../lib/api';
import {
  ArchiveDocument,
  AuditLog,
  Citizen,
  Employee,
  EmployeeNotification,
  LetterTemplate,
  LocalFolderNode,
  Ministry,
  OfficeSettings,
  PrintedDocument,
  RequestHistory,
  RequestRecord,
  StorageStats,
} from '../types/poms';
import { getLinkedFolderName, syncLocalPCFolder } from '../utils/localFolderSync';

interface ApiDataResponse {
  citizens: Citizen[];
  requests: RequestRecord[];
  requestHistory: RequestHistory[];
  ministries: Ministry[];
  employees: Employee[];
  archiveDocs: ArchiveDocument[];
  letterTemplates: LetterTemplate[];
  printedDocs: PrintedDocument[];
  notifications: EmployeeNotification[];
  auditLogs: AuditLog[];
  officeSettings: OfficeSettings | null;
  customDistricts: Record<string, string[]>;
  officeBaseDir: string;
  storageStats?: StorageStats | null;
}

interface LocalTreeResponse {
  baseDir: string;
  tree: LocalFolderNode[];
  stats?: StorageStats;
}

export interface PomsDataState {
  citizens: Citizen[];
  requests: RequestRecord[];
  requestHistory: RequestHistory[];
  ministries: Ministry[];
  employees: Employee[];
  archiveDocs: ArchiveDocument[];
  letterTemplates: LetterTemplate[];
  printedDocs: PrintedDocument[];
  notifications: EmployeeNotification[];
  unreadNotificationsCount: number;
  auditLogs: AuditLog[];
  officeSettings: OfficeSettings | null;
  customDistricts: Record<string, string[]>;
  setCustomDistricts: (next: Record<string, string[]>) => void;
  officeBaseDir: string;
  localTree: LocalFolderNode[];
  storageStats: StorageStats | null;
  loadingData: boolean;
  refresh: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

export function usePomsData(): PomsDataState {
  const { employee } = useAuth();
  const { showToast } = useToast();
  const [citizens, setCitizens] = useState<Citizen[]>([]);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [requestHistory, setRequestHistory] = useState<RequestHistory[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [archiveDocs, setArchiveDocs] = useState<ArchiveDocument[]>([]);
  const [letterTemplates, setLetterTemplates] = useState<LetterTemplate[]>([]);
  const [printedDocs, setPrintedDocs] = useState<PrintedDocument[]>([]);
  const [notifications, setNotifications] = useState<EmployeeNotification[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [officeSettings, setOfficeSettings] = useState<OfficeSettings | null>(null);
  const [customDistricts, setCustomDistricts] = useState<Record<string, string[]>>({});
  const [officeBaseDir, setOfficeBaseDir] = useState<string>('');
  const [localTree, setLocalTree] = useState<LocalFolderNode[]>([]);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const knownNotifIdsRef = useRef<Set<string>>(new Set());
  const initializedNotifsRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!employee || employee.status !== 'active') {
      setCitizens([]);
      setRequests([]);
      setRequestHistory([]);
      setMinistries([]);
      setEmployees([]);
      setArchiveDocs([]);
      setLetterTemplates([]);
      setPrintedDocs([]);
      setNotifications([]);
      setAuditLogs([]);
      setOfficeSettings(null);
      setLocalTree([]);
      setStorageStats(null);
      knownNotifIdsRef.current = new Set();
      initializedNotifsRef.current = false;
      setLoadingData(false);
      return;
    }

    try {
      const canViewTree =
        employee.role === 'super_admin' ||
        employee.permissions.includes('archive.view') ||
        employee.permissions.includes('settings.manage');

      const [dataRes, treeRes] = await Promise.all([
        apiRequest<ApiDataResponse>('/api/data'),
        canViewTree
          ? apiRequest<LocalTreeResponse>('/api/local-storage/tree').catch(
              (): LocalTreeResponse => ({
                baseDir: '',
                tree: [],
              })
            )
          : Promise.resolve<LocalTreeResponse>({ baseDir: '', tree: [] }),
      ]);
      const nextNotifs = dataRes.notifications || [];
      if (!initializedNotifsRef.current) {
        knownNotifIdsRef.current = new Set(nextNotifs.map((n) => n.id));
        initializedNotifsRef.current = true;
      } else {
        for (const n of nextNotifs) {
          if (!knownNotifIdsRef.current.has(n.id)) {
            knownNotifIdsRef.current.add(n.id);
            if (!n.isRead) {
              showToast(`إشعار عمل جديد: ${n.title}`, 'info');
            }
          }
        }
      }

      setCitizens(dataRes.citizens || []);
      setRequests(dataRes.requests || []);
      setRequestHistory(dataRes.requestHistory || []);
      setMinistries(dataRes.ministries || []);
      setEmployees(dataRes.employees || []);
      setArchiveDocs(dataRes.archiveDocs || []);
      setLetterTemplates(dataRes.letterTemplates || []);
      setPrintedDocs(dataRes.printedDocs || []);
      setNotifications(nextNotifs);
      setAuditLogs(dataRes.auditLogs || []);
      setOfficeSettings(dataRes.officeSettings || null);
      setCustomDistricts(dataRes.customDistricts || {});
      setOfficeBaseDir(dataRes.officeBaseDir || treeRes.baseDir || '');
      setLocalTree(treeRes.tree || []);
      setStorageStats(dataRes.storageStats || treeRes.stats || null);

      if (getLinkedFolderName()) {
        void syncLocalPCFolder({
          citizens: dataRes.citizens || [],
          employees: dataRes.employees || [],
          requests: dataRes.requests || [],
          ministries: dataRes.ministries || [],
          notifications: nextNotifs,
          printedDocs: dataRes.printedDocs || [],
        });
      }
    } catch (err) {
      console.error('Failed loading POMS data:', err);
    } finally {
      setLoadingData(false);
    }
  }, [employee?.uid, employee?.status, showToast]);

  const refreshNotifications = useCallback(async () => {
    if (!employee || employee.status !== 'active') return;
    try {
      const res = await apiRequest<{ notifications: EmployeeNotification[] }>('/api/notifications');
      const nextNotifs = res.notifications || [];
      for (const n of nextNotifs) {
        if (!knownNotifIdsRef.current.has(n.id)) {
          knownNotifIdsRef.current.add(n.id);
          if (!n.isRead) {
            showToast(`إشعار تكليف جديد من ${n.senderName}: ${n.title}`, 'info');
          }
        }
      }
      setNotifications(nextNotifs);
    } catch {
      // Ignore transient polling error
    }
  }, [employee?.uid, employee?.status, showToast]);

  useEffect(() => {
    setLoadingData(true);
    void refresh();
  }, [refresh]);

  // Poll notifications every 15s so assignments sent by colleagues appear promptly
  useEffect(() => {
    if (!employee || employee.status !== 'active') return;
    const interval = window.setInterval(() => {
      void refreshNotifications();
    }, 15000);
    return () => window.clearInterval(interval);
  }, [employee?.uid, employee?.status, refreshNotifications]);

  const unreadNotificationsCount = notifications.filter((n) => !n.isRead).length;

  return {
    citizens,
    requests,
    requestHistory,
    ministries,
    employees,
    archiveDocs,
    letterTemplates,
    printedDocs,
    notifications,
    unreadNotificationsCount,
    auditLogs,
    officeSettings,
    customDistricts,
    setCustomDistricts,
    officeBaseDir,
    localTree,
    storageStats,
    loadingData,
    refresh,
    refreshNotifications,
  };
}
