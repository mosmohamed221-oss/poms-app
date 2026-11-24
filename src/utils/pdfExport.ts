import { formatDateDMY, formatDateTimeDMY } from './formatters';

function escapeHtml(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function triggerHiddenIframePrint(html: string): void {
  const existing = document.getElementById('poms-pdf-print-frame');
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'poms-pdf-print-frame';
  iframe.style.position = 'fixed';
  iframe.style.right = '-9999px';
  iframe.style.bottom = '0';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('sandbox', 'allow-same-origin allow-modals');

  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) return;
    const doPrint = () => {
      try {
        win.focus();
        win.print();
      } finally {
        window.setTimeout(() => {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        }, 1500);
      }
    };

    const docFonts = (win.document as Document & { fonts?: FontFaceSet }).fonts;
    if (docFonts && docFonts.ready) {
      docFonts.ready.then(() => window.setTimeout(doPrint, 180)).catch(() => window.setTimeout(doPrint, 300));
    } else {
      window.setTimeout(doPrint, 300);
    }
  };

  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}

export interface PdfSummaryItem {
  label: string;
  value: string | number;
}

export function exportTableToArabicPdf(params: {
  title: string;
  subtitle?: string;
  officeName?: string;
  deputyName?: string;
  summary?: PdfSummaryItem[];
  columns: string[];
  rows: Array<Array<string | number | boolean | null | undefined>>;
  landscape?: boolean;
}): void {
  const printedAt = formatDateTimeDMY(new Date());
  const dateOnly = formatDateDMY(new Date());
  const orientation = params.landscape !== false ? 'A4 landscape' : 'A4 portrait';

  const summaryHtml =
    params.summary && params.summary.length > 0
      ? `<div class="summary-grid">
          ${params.summary
            .map(
              (item) => `<div class="summary-card">
                <div class="summary-label">${escapeHtml(item.label)}</div>
                <div class="summary-value">${escapeHtml(item.value)}</div>
              </div>`
            )
            .join('')}
        </div>`
      : '';

  const theadHtml = `<tr>${params.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr>`;
  const tbodyHtml =
    params.rows.length > 0
      ? params.rows
          .map(
            (row) =>
              `<tr>${row.map((cell) => `<td>${escapeHtml(cell ?? '—')}</td>`).join('')}</tr>`
          )
          .join('')
      : `<tr><td colspan="${Math.max(1, params.columns.length)}" style="text-align:center;color:#64748b;padding:24px;">لا توجد بيانات متاحة في هذا التقرير</td></tr>`;

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(params.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <style>
    @page { size: ${orientation}; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Cairo', 'Tahoma', 'Arial', sans-serif;
      color: #0f172a;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .doc-header {
      border-bottom: 3px solid #0F2C59;
      padding-bottom: 10px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
    }
    .office-title { font-size: 16px; font-weight: 800; color: #0F2C59; margin: 0; }
    .deputy-name { font-size: 12px; font-weight: 700; color: #C5A253; margin: 2px 0 0 0; }
    .report-title-wrap { text-align: left; }
    .report-title { font-size: 15px; font-weight: 800; color: #0F2C59; margin: 0; }
    .report-meta { font-size: 10px; color: #475569; margin: 3px 0 0 0; }
    .subtitle { font-size: 11px; color: #475569; margin: 0 0 12px 0; }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 8px;
      margin-bottom: 14px;
    }
    .summary-card {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 8px 10px;
      background: #f8fafc;
    }
    .summary-label { font-size: 10px; color: #64748b; font-weight: 600; }
    .summary-value { font-size: 14px; color: #0F2C59; font-weight: 800; margin-top: 2px; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    thead { display: table-header-group; }
    th {
      background: #0F2C59;
      color: #ffffff;
      font-weight: 700;
      text-align: right;
      padding: 7px 6px;
      border: 1px solid #0F2C59;
      white-space: nowrap;
    }
    td {
      padding: 6px;
      border: 1px solid #cbd5e1;
      vertical-align: top;
      word-break: break-word;
    }
    tr:nth-child(even) td { background: #f8fafc; }
    .doc-footer {
      margin-top: 14px;
      padding-top: 8px;
      border-top: 1px solid #cbd5e1;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="doc-header">
    <div>
      <p class="office-title">${escapeHtml(params.officeName || 'مكتب النائب محمد كليب – POMS V3')}</p>
      <p class="deputy-name">${escapeHtml(params.deputyName || 'السيد النائب محمد كليب · الأمانة الفنية ومكتب خدمة المواطنين')}</p>
    </div>
    <div class="report-title-wrap">
      <p class="report-title">${escapeHtml(params.title)}</p>
      <p class="report-meta">تاريخ الإصدار: ${escapeHtml(printedAt)} · إجمالي السجلات: ${params.rows.length}</p>
    </div>
  </div>
  ${params.subtitle ? `<p class="subtitle">${escapeHtml(params.subtitle)}</p>` : ''}
  ${summaryHtml}
  <table>
    <thead>${theadHtml}</thead>
    <tbody>${tbodyHtml}</tbody>
  </table>
  <div class="doc-footer">
    <span>مكتب النائب محمد كليب (POMS V3) · تقرير رسمي بصيغة PDF</span>
    <span>تاريخ التصدير: ${escapeHtml(dateOnly)}</span>
  </div>
</body>
</html>`;

  triggerHiddenIframePrint(html);
}

export function exportDocumentToArabicPdf(params: {
  officeTitle: string;
  deputyName: string;
  referenceNumber: string;
  dateLabel: string;
  title: string;
  bodyText: string;
  signatureTitle: string;
  footerText: string;
  metaRows?: Array<{ label: string; value: string }>;
}): void {
  const bodyHtml = params.bodyText
    .split('\n')
    .map((line) => `<p class="body-line">${line.trim() ? escapeHtml(line) : '&nbsp;'}</p>`)
    .join('');

  const metaHtml =
    params.metaRows && params.metaRows.length > 0
      ? `<div class="meta-grid">
          ${params.metaRows
            .map(
              (m) =>
                `<div class="meta-box"><span>${escapeHtml(m.label)}:</span> <strong>${escapeHtml(m.value)}</strong></div>`
            )
            .join('')}
        </div>`
      : '';

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(params.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <style>
    @page { size: A4 portrait; margin: 16mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Cairo', 'Tahoma', 'Arial', sans-serif;
      color: #0f172a;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header {
      text-align: center;
      border-bottom: 3px solid #0F2C59;
      padding-bottom: 12px;
      margin-bottom: 18px;
    }
    .header h1 { font-size: 20px; font-weight: 800; color: #0F2C59; margin: 0; }
    .header h2 { font-size: 14px; font-weight: 700; color: #C5A253; margin: 4px 0 0 0; }
    .ref-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #475569;
      margin-bottom: 16px;
      background: #f8fafc;
      padding: 8px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      margin-bottom: 16px;
    }
    .meta-box {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 7px 10px;
      font-size: 11px;
      background: #ffffff;
    }
    .doc-title {
      text-align: center;
      font-size: 16px;
      font-weight: 800;
      color: #0F2C59;
      text-decoration: underline;
      margin: 12px 0 18px 0;
    }
    .body-line {
      margin: 0 0 8px 0;
      font-size: 13px;
      line-height: 1.9;
    }
    .signature {
      margin-top: 38px;
      text-align: left;
      padding-left: 24px;
    }
    .signature p { font-size: 14px; font-weight: 800; color: #0F2C59; margin: 0; }
    .footer {
      margin-top: 40px;
      padding-top: 10px;
      border-top: 1px solid #cbd5e1;
      text-align: center;
      font-size: 10px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(params.officeTitle)}</h1>
    <h2>${escapeHtml(params.deputyName)}</h2>
  </div>
  <div class="ref-row">
    <span>الرقم المرجعي: <strong>${escapeHtml(params.referenceNumber)}</strong></span>
    <span>التاريخ: <strong>${escapeHtml(params.dateLabel)}</strong></span>
  </div>
  ${metaHtml}
  <div class="doc-title">${escapeHtml(params.title)}</div>
  <div>${bodyHtml}</div>
  <div class="signature">
    <p>${escapeHtml(params.signatureTitle)}</p>
  </div>
  <div class="footer">${escapeHtml(params.footerText)}</div>
</body>
</html>`;

  triggerHiddenIframePrint(html);
}
