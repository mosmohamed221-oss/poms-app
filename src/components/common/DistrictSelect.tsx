import { useMemo, useState } from 'react';
import { Plus, Check, X } from 'lucide-react';
import { EGYPT_GOVERNORATE_DISTRICTS } from '../../data/egyptDistricts';
import { apiRequest } from '../../lib/api';

interface DistrictSelectProps {
  governorate: string;
  value: string;
  customDistricts: Record<string, string[]>;
  onChange: (value: string) => void;
  onCustomDistrictAdded: (updated: Record<string, string[]>) => void;
  required?: boolean;
}

export function DistrictSelect({
  governorate,
  value,
  customDistricts,
  onChange,
  onCustomDistrictAdded,
  required,
}: DistrictSelectProps) {
  const [addingManual, setAddingManual] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [saving, setSaving] = useState(false);

  const options = useMemo(() => {
    const base = EGYPT_GOVERNORATE_DISTRICTS[governorate] || [];
    const custom = customDistricts[governorate] || [];
    const merged = Array.from(new Set([...base, ...custom]));
    if (value && !merged.includes(value)) {
      merged.push(value);
    }
    return merged;
  }, [governorate, customDistricts, value]);

  const handleSaveManual = async () => {
    const trimmed = manualInput.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const res = await apiRequest<{ customDistricts: Record<string, string[]> }>('/api/public/districts', {
        method: 'POST',
        body: JSON.stringify({ governorate, district: trimmed }),
      });
      onCustomDistrictAdded(res.customDistricts);
      onChange(trimmed);
      setManualInput('');
      setAddingManual(false);
    } catch {
      onChange(trimmed);
      setAddingManual(false);
    } finally {
      setSaving(false);
    }
  };

  if (addingManual) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          placeholder={`اكتب اسم القسم أو الحي في ${governorate}...`}
          autoFocus
          className="flex-1 rounded-lg border border-[#0F2C59] px-3 py-2 text-xs focus:outline-none"
        />
        <button
          type="button"
          disabled={saving || !manualInput.trim()}
          onClick={() => void handleSaveManual()}
          className="p-2 rounded-lg bg-[#0F2C59] text-white hover:bg-[#0A1E3D] disabled:opacity-50 cursor-pointer"
          title="حفظ القسم"
        >
          <Check className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            setAddingManual(false);
            setManualInput('');
          }}
          className="p-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer"
          title="إلغاء"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        required={required}
        value={value}
        onChange={(e) => {
          if (e.target.value === '__ADD_MANUAL__') {
            setAddingManual(true);
          } else {
            onChange(e.target.value);
          }
        }}
        className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-[#0F2C59] focus:outline-none"
      >
        <option value="">-- اختر القسم / المركز / الحي --</option>
        {options.map((dist) => (
          <option key={dist} value={dist}>
            {dist}
          </option>
        ))}
        <option value="__ADD_MANUAL__">+ لم أجد القسم؟ إضافة يدوياً...</option>
      </select>
      <button
        type="button"
        onClick={() => setAddingManual(true)}
        className="p-2 rounded-lg border border-slate-300 bg-white text-[#0F2C59] hover:bg-slate-50 cursor-pointer shrink-0"
        title="إضافة قسم أو حي يدوياً"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
