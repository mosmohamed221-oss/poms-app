import { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import { dmyToIso, isoToDMY } from '../../utils/formatters';

interface DateInputDMYProps {
  value: string; // Stored as YYYY-MM-DD
  onChange: (isoDate: string) => void;
  placeholder?: string;
}

/**
 * Date input strictly ordered Day / Month / Year (DD/MM/YYYY)
 */
export function DateInputDMY({
  value,
  onChange,
  placeholder = 'يوم/شهر/سنة (مثال: 23/11/2026)',
}: DateInputDMYProps) {
  const [text, setText] = useState(() => isoToDMY(value));

  useEffect(() => {
    setText(isoToDMY(value));
  }, [value]);

  const handleTextChange = (raw: string) => {
    // Allow digits and '/' only
    const cleaned = raw.replace(/[^0-9/]/g, '').slice(0, 10);
    setText(cleaned);
    if (!cleaned) {
      onChange('');
      return;
    }
    const iso = dmyToIso(cleaned);
    if (iso) {
      onChange(iso);
    }
  };

  return (
    <div className="relative flex items-center">
      <input
        type="text"
        dir="ltr"
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 bg-white pr-3 pl-9 py-2 text-xs font-mono-num text-right focus:border-[#0F2C59] focus:outline-none"
      />
      <label className="absolute left-2.5 text-slate-400 hover:text-[#0F2C59] cursor-pointer" title="اختيار من التقويم">
        <Calendar className="w-4 h-4" />
        <input
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="sr-only"
        />
      </label>
    </div>
  );
}
