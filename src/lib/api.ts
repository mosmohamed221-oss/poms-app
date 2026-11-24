let memoryAuthToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setMemoryAuthToken(token: string | null): void {
  memoryAuthToken = token;
}

export function getMemoryAuthToken(): string | null {
  return memoryAuthToken;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('X-Requested-With')) {
    headers.set('X-Requested-With', 'XMLHttpRequest');
  }
  if (memoryAuthToken) {
    headers.set('Authorization', `Bearer ${memoryAuthToken}`);
  }

  const res = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers,
  });

  if (res.status === 401 && memoryAuthToken && unauthorizedHandler) {
    unauthorizedHandler();
  }

  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const errMsg = (data && (data.error || data.message)) || `فشل الطلب (${res.status})`;
    throw new Error(errMsg);
  }

  return data as T;
}

export async function downloadAuthorizedFile(url: string, fallbackFileName: string): Promise<void> {
  const headers = new Headers();
  if (memoryAuthToken) {
    headers.set('Authorization', `Bearer ${memoryAuthToken}`);
  }
  const res = await fetch(url, { headers });
  if (res.status === 401 && memoryAuthToken && unauthorizedHandler) {
    unauthorizedHandler();
  }
  if (!res.ok) {
    throw new Error('تعذر تحميل الملف المطلوب أو لا تملك صلاحية الوصول إليه.');
  }
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = fallbackFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objUrl);
}
