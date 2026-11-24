import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  PauseCircle,
  FileSearch,
  Send,
  ShieldAlert,
} from 'lucide-react';

interface StatusTagProps {
  status: string;
}

export function StatusTag({ status }: StatusTagProps) {
  let Icon = Clock;
  let colorClass = 'text-slate-700';

  switch (status) {
    case 'بيانات كاملة':
    case 'مكتمل':
    case 'active':
    case 'نشط':
    case 'printed':
    case 'تمت الطباعة':
      Icon = CheckCircle2;
      colorClass = 'text-emerald-700';
      break;
    case 'بانتظار المراجعة':
    case 'جديد':
    case 'قيد المراجعة':
    case 'pending_print':
    case 'جاهز للطباعة':
      Icon = FileSearch;
      colorClass = 'text-[#0F2C59]';
      break;
    case 'قيد التنفيذ':
    case 'بانتظار رد الوزارة':
      Icon = Send;
      colorClass = 'text-amber-700';
      break;
    case 'ناقص مراته':
    case 'ناقص جوزها':
    case 'ناقص بياناته كلها':
    case 'ناقص أزواجهم':
    case 'يحتاج استكمال بيانات':
    case 'مطلوب استكمال بيانات':
      Icon = AlertTriangle;
      colorClass = 'text-amber-700';
      break;
    case 'مرفوض':
    case 'inactive':
    case 'معطل':
      Icon = XCircle;
      colorClass = 'text-red-700';
      break;
    case 'مؤجل':
      Icon = PauseCircle;
      colorClass = 'text-slate-600';
      break;
    case 'طارئ':
    case 'عاجل':
      Icon = ShieldAlert;
      colorClass = 'text-red-700';
      break;
    default:
      Icon = Clock;
      colorClass = 'text-slate-700';
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${colorClass}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{status}</span>
    </span>
  );
}
