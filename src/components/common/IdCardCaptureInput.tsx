import React, { useEffect, useRef, useState } from 'react';
import { Camera, Upload, X, Check } from 'lucide-react';
import { compressIdCardDataUrl } from '../../utils/formatters';
import { useToast } from '../../context/ToastContext';

interface IdImageResult {
  dataUrl: string;
  mimeType: 'image/jpeg';
  fileName: string;
  size: number;
}

interface IdCardCaptureInputProps {
  label: string;
  required?: boolean;
  value: IdImageResult | null;
  onChange: (val: IdImageResult | null) => void;
  error?: string;
}

export function IdCardCaptureInput({
  label,
  required,
  value,
  onChange,
  error,
}: IdCardCaptureInputProps) {
  const { showToast } = useToast();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const openCamera = async () => {
    setCameraError(null);
    setCameraOpen(true);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('المتصفح لا يدعم تشغيل الكاميرا مباشرة. يمكنك استخدام زر رفع الصورة.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setCameraError('تعذر فتح الكاميرا. يرجى التأكد من منح إذن الكاميرا أو توصيل كاميرا.');
    }
  };

  const closeCamera = () => {
    stopCamera();
    setCameraOpen(false);
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1000;
    canvas.height = video.videoHeight || 700;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const rawDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    try {
      const compressed = await compressIdCardDataUrl(rawDataUrl);
      onChange({
        ...compressed,
        fileName: `camera_id_${Date.now()}.jpg`,
      });
      closeCamera();
    } catch {
      showToast('تعذر التقاط الصورة.', 'error');
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressIdCardDataUrl(file);
      onChange({
        ...compressed,
        fileName: file.name.slice(0, 140),
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذر قراءة الصورة.', 'error');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-4 bg-[#F5F7FA]/60">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-700">
          {label} {required && <span className="text-red-600">*</span>}
        </span>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[11px] text-red-600 hover:underline cursor-pointer"
          >
            إزالة الصورة
          </button>
        )}
      </div>

      {value ? (
        <div className="space-y-2">
          <img
            src={value.dataUrl}
            alt={label}
            className="w-full h-36 object-contain rounded-lg border border-slate-200 bg-white"
          />
          <p className="text-[11px] text-slate-500 truncate">{value.fileName}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <label className="flex flex-col items-center justify-center gap-1.5 py-5 px-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-[#0F2C59] hover:text-[#0F2C59] cursor-pointer transition-colors">
            <Upload className="w-5 h-5" />
            <span className="text-xs font-semibold text-center">رفع ملف صورة</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => void handleFile(e)}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={() => void openCamera()}
            className="flex flex-col items-center justify-center gap-1.5 py-5 px-2 rounded-lg border border-[#C5A253] bg-[#C5A253]/10 text-[#0F2C59] hover:bg-[#C5A253]/20 cursor-pointer transition-colors"
          >
            <Camera className="w-5 h-5" />
            <span className="text-xs font-semibold text-center">التقاط بالكاميرا</span>
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {cameraOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg overflow-hidden border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <p className="text-sm font-bold text-[#0F2C59]">تصوير {label} بالكاميرا</p>
              <button
                type="button"
                onClick={closeCamera}
                className="p-1.5 rounded hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-slate-950 flex items-center justify-center min-h-[280px]">
              {cameraError ? (
                <div className="text-center text-white space-y-3 p-4">
                  <p className="text-xs text-amber-300">{cameraError}</p>
                  <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C5A253] text-[#0F2C59] text-xs font-bold cursor-pointer">
                    <Camera className="w-4 h-4" />
                    <span>فتح كاميرا الجهاز</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => {
                        closeCamera();
                        void handleFile(e);
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full max-h-[360px] rounded object-contain"
                />
              )}
            </div>
            <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-end gap-2 bg-white">
              <button
                type="button"
                onClick={closeCamera}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
              {!cameraError && (
                <button
                  type="button"
                  onClick={() => void capturePhoto()}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#0F2C59] text-white text-xs font-semibold cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>التقاط وحفظ الصورة</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
