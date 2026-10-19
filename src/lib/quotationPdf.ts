import jsPDF from 'jspdf';

// Client-side quotation PDF. Why not the backend one? The server PDF
// (/quotations/:id/download) is a fixed template we cannot restyle from here —
// generating with jsPDF (same approach as ProfileCard) gives full control over a
// branded, information-dense proposal: header band, client block, system config,
// itemised pricing, estimated benefits and terms. No DOM screenshot involved
// (html2canvas), so it is fast and pixel-consistent.

type RGB = [number, number, number];

const NAVY: RGB = [27, 42, 74];
const NAVY_SOFT: RGB = [238, 242, 249];
const ORANGE: RGB = [234, 88, 12];
const GREEN: RGB = [16, 185, 129];
const GREEN_SOFT: RGB = [236, 253, 245];
const INK: RGB = [41, 37, 36];
const MUTED: RGB = [120, 113, 108];
const LINE: RGB = [229, 227, 224];
const SOFT: RGB = [250, 249, 248];
const WHITE: RGB = [255, 255, 255];

const COMPANY = {
  name: 'EuroSol Prime',
  tagline: 'Solar Energy Solutions',
  website: 'www.eurosolservice.com',
  phone: '+91-79-12345678',
  email: 'support@eurosolservice.com',
};

const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v: any) => (v === null || v === undefined ? '' : String(v).trim());
const money = (v: any) => `Rs. ${nf.format(Math.round(num(v)))}`;
const fmtDate = (v: any) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '-';
};

const statusMeta = (status: any): { label: string; color: RGB } => {
  const s = str(status).toUpperCase();
  const palette: Record<string, RGB> = {
    APPROVED: GREEN, SENT: [37, 99, 235], DRAFT: MUTED, REJECTED: [220, 38, 38], EXPIRED: [217, 119, 6],
  };
  const label = s ? s.charAt(0) + s.slice(1).toLowerCase() : 'Draft';
  return { label, color: palette[s] || NAVY };
};

export const quotationFileName = (q: any): string => {
  const short = str(q?.id).slice(0, 8).toUpperCase() || 'QUOTE';
  const name = str(q?.lead?.name || q?.leadName)
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Client';
  return `Quotation-${name}-${short}.pdf`;
};

export function buildQuotationPdf(q: any): jsPDF {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const M = 14;
  const CW = pageW - M * 2;
  let y = 0;

  const ink = (c: RGB) => pdf.setTextColor(c[0], c[1], c[2]);
  const fill = (c: RGB) => pdf.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: RGB) => pdf.setDrawColor(c[0], c[1], c[2]);
  const font = (weight: 'bold' | 'normal', size: number) => { pdf.setFont('helvetica', weight); pdf.setFontSize(size); };
  const oneLine = (text: string, maxW: number) => pdf.splitTextToSize(text, maxW)[0] || '';

  const newPageHeader = () => {
    pdf.addPage();
    fill(NAVY); pdf.rect(0, 0, pageW, 12, 'F');
    fill(ORANGE); pdf.rect(0, 12, pageW, 1.4, 'F');
    font('bold', 9.5); ink(WHITE); pdf.text(COMPANY.name, M, 7.8);
    font('normal', 8); pdf.text('Quotation (continued)', pageW - M, 7.8, { align: 'right' });
    y = 20;
  };
  const ensure = (need: number) => { if (y + need > pageH - 16) newPageHeader(); };

  const section = (title: string) => {
    ensure(16);
    fill(ORANGE); pdf.roundedRect(M, y, 2.6, 6.2, 1.3, 1.3, 'F');
    font('bold', 10.5); ink(INK);
    const label = title.toUpperCase();
    pdf.text(label, M + 6, y + 4.8);
    stroke(LINE); pdf.setLineWidth(0.3);
    pdf.line(M + 8 + pdf.getTextWidth(label), y + 3.1, pageW - M, y + 3.1);
    y += 8;
  };

  const statCards = (items: { label: string; value: string; sub?: string }[], accent: RGB, bg: RGB) => {
    const gap = 4;
    const cardW = (CW - gap * (items.length - 1)) / items.length;
    const cardH = 18;
    ensure(cardH + 2);
    items.forEach((c, i) => {
      const cx = M + i * (cardW + gap);
      fill(bg); stroke(LINE); pdf.setLineWidth(0.3);
      pdf.roundedRect(cx, y, cardW, cardH, 2, 2, 'FD');
      fill(accent); pdf.roundedRect(cx, y, cardW, 1.5, 0.75, 0.75, 'F');
      font('normal', 6.8); ink(MUTED);
      pdf.text(c.label.toUpperCase(), cx + 3.5, y + 6.6);
      font('bold', 11); ink(INK);
      pdf.text(oneLine(c.value, cardW - 7), cx + 3.5, y + 12.6);
      if (c.sub) { font('normal', 7.2); ink(MUTED); pdf.text(oneLine(c.sub, cardW - 7), cx + 3.5, y + 16.6); }
    });
    y += cardH + 4;
  };

  // ---------- Header band ----------
  fill(NAVY); pdf.rect(0, 0, pageW, 38, 'F');
  fill(ORANGE); pdf.rect(0, 38, pageW, 2.4, 'F');
  fill(ORANGE); pdf.roundedRect(M, 9.5, 11, 11, 2.2, 2.2, 'F');
  font('bold', 13); ink(WHITE); pdf.text('E', M + 5.5, 17.3, { align: 'center' });
  font('bold', 19); pdf.text(COMPANY.name, M + 15, 16.5);
  font('normal', 8.6); pdf.setTextColor(178, 196, 224); pdf.text(COMPANY.tagline, M + 15, 22);
  font('normal', 7.8); pdf.setTextColor(150, 170, 200);
  pdf.text(`${COMPANY.phone}  |  ${COMPANY.email}  |  ${COMPANY.website}`, M + 15, 30.5);

  font('bold', 20); ink(WHITE); pdf.text('QUOTATION', pageW - M, 17, { align: 'right' });
  font('normal', 8.4); pdf.setTextColor(200, 214, 235);
  const shortId = str(q?.id).slice(0, 8).toUpperCase() || '-';
  pdf.text(`Ref No.  #${shortId}`, pageW - M, 23.6, { align: 'right' });
  pdf.text(`Date  ${fmtDate(q?.createdAt)}`, pageW - M, 29.4, { align: 'right' });
  if (q?.validUntil) pdf.text(`Valid till  ${fmtDate(q.validUntil)}`, pageW - M, 35.2, { align: 'right' });

  // ---------- Client + details ----------
  y = 44;
  const boxH = 29;
  const boxW1 = 105;
  fill(SOFT); stroke(LINE); pdf.setLineWidth(0.3);
  pdf.roundedRect(M, y, boxW1, boxH, 2, 2, 'FD');
  font('bold', 7.4); ink(ORANGE); pdf.text('BILL TO / PREPARED FOR', M + 5, y + 6.4);
  const clientName = str(q?.lead?.name || q?.leadName) || 'Client';
  font('bold', 12); ink(INK); pdf.text(oneLine(clientName, boxW1 - 12), M + 5, y + 13.6);
  const contact: string[] = [];
  const phone = str(q?.lead?.phone);
  const email = str(q?.lead?.email);
  const addr = str(q?.lead?.address || q?.lead?.city);
  if (phone) contact.push(`Phone: ${phone}`);
  if (email) contact.push(`Email: ${email}`);
  if (addr) contact.push(`Address: ${addr}`);
  font('normal', 8.4); ink(MUTED);
  let ly = y + 18.8;
  contact.slice(0, 3).forEach((t) => { pdf.text(oneLine(t, boxW1 - 12), M + 5, ly); ly += 4.1; });

  const dx = M + boxW1 + 6;
  const boxW2 = CW - boxW1 - 6;
  fill(NAVY_SOFT); stroke(LINE);
  pdf.roundedRect(dx, y, boxW2, boxH, 2, 2, 'FD');
  font('bold', 7.4); ink(NAVY); pdf.text('QUOTATION DETAILS', dx + 5, y + 6.4);
  const sm = statusMeta(q?.status);
  const detailRows: [string, string][] = [
    ['Quotation No.', `#${shortId}`],
    ['Date', fmtDate(q?.createdAt)],
    ['Valid Until', q?.validUntil ? fmtDate(q.validUntil) : '-'],
    ['Status', sm.label],
  ];
  let ry = y + 12;
  detailRows.forEach(([k, v]) => {
    font('normal', 8); ink(MUTED); pdf.text(k, dx + 5, ry);
    font('bold', 8); ink(k === 'Status' ? sm.color : INK);
    pdf.text(oneLine(v, boxW2 - 30), dx + boxW2 - 5, ry, { align: 'right' });
    ry += 4.5;
  });
  y += boxH + 6;

  // ---------- System configuration ----------
  const size = num(q?.systemSize ?? q?.systemSizeKW);
  const panelBrand = str(q?.panelBrand);
  const panelCount = num(q?.panelCount);
  const invBrand = str(q?.inverterBrand);
  const invCount = num(q?.inverterCount);
  const batteryBrand = str(q?.batteryBrand);
  const batteryCount = num(q?.batteryCount);
  const hasBattery = !!q?.batteryRequired || !!batteryBrand || batteryCount > 0;

  section('System Configuration');
  statCards([
    { label: 'System Size', value: size ? `${size} KW` : '-', sub: 'Grid-tied rooftop' },
    { label: 'Solar Panels', value: panelCount ? `${panelCount} Nos` : (panelBrand || '-'), sub: panelBrand || undefined },
    { label: 'Inverter', value: invCount ? `${invCount} Nos` : (invBrand || '-'), sub: invBrand || undefined },
    { label: 'Battery', value: hasBattery ? `${batteryCount || 1} Nos` : 'Not included', sub: batteryBrand || undefined },
  ], ORANGE, SOFT);

  // ---------- Pricing ----------
  section('Pricing Summary');
  const totalCost = num(q?.totalCost ?? q?.totalAmount);
  const discount = num(q?.discount);
  const subsidy = num(q?.subsidyAmount);
  const gstPercent = num(q?.gstPercent);
  const gstAmount = q?.gstAmount != null ? num(q.gstAmount) : (gstPercent ? ((totalCost - discount) * gstPercent) / 100 : 0);
  const computedNet = Math.max(0, totalCost - discount + gstAmount - subsidy);
  const netAmount = num(q?.netAmount) || computedNet;
  const systemDesc = `Solar Power System${size ? ` - ${size} KW` : ''}${panelBrand ? ` - ${panelBrand}` : ''}`;

  type PriceRow = { label: string; value: number; minus?: boolean; strong?: boolean };
  const priceRows: PriceRow[] = [{ label: systemDesc, value: totalCost }];
  if (discount > 0) priceRows.push({ label: 'Discount', value: discount, minus: true });
  if (gstAmount > 0) priceRows.push({ label: `GST ${gstPercent ? `(${gstPercent}%)` : ''}`.trim(), value: gstAmount });
  if (subsidy > 0) priceRows.push({ label: 'Government Subsidy (MNRE)', value: subsidy, minus: true });

  const rowH = 8.5;
  fill(NAVY); pdf.roundedRect(M, y, CW, 8.5, 1.6, 1.6, 'F');
  font('bold', 8); ink(WHITE);
  pdf.text('DESCRIPTION', M + 4, y + 5.5);
  pdf.text('AMOUNT', M + CW - 4, y + 5.5, { align: 'right' });
  y += 10;

  priceRows.forEach((r, i) => {
    ensure(rowH);
    if (i % 2 === 1) { fill(SOFT); pdf.rect(M, y - 1.6, CW, rowH, 'F'); }
    font('normal', 9); ink(INK);
    pdf.text(oneLine(r.label, CW - 52), M + 4, y + 4.2);
    font('bold', 9);
    ink(r.minus ? GREEN : INK);
    pdf.text(`${r.minus ? '- ' : ''}${money(r.value)}`, M + CW - 4, y + 4.2, { align: 'right' });
    y += rowH;
  });

  ensure(14);
  y += 1.5;
  fill(ORANGE); pdf.roundedRect(M, y, CW, 12, 2, 2, 'F');
  font('bold', 10); ink(WHITE);
  pdf.text('NET PAYABLE AMOUNT', M + 5, y + 7.6);
  font('bold', 14);
  pdf.text(money(netAmount), M + CW - 5, y + 7.9, { align: 'right' });
  y += 13.8;
  font('normal', 7.2); ink(MUTED);
  pdf.text('All amounts in Indian Rupees (INR). Subsidy is released by the Government directly to the customer.', M, y);
  y += 7;

  // ---------- Estimated benefits ----------
  if (size > 0) {
    section('Estimated Benefits');
    const unitsPerYear = size * 4 * 365;
    const savingsPerYear = unitsPerYear * 7;
    const co2PerYear = unitsPerYear * 0.82;
    statCards([
      { label: 'Annual Generation', value: `${(unitsPerYear / 1000).toFixed(1)} MWh`, sub: 'approx units/year' },
      { label: 'Annual Savings', value: money(savingsPerYear), sub: 'approx @ Rs.7/unit' },
      { label: 'CO2 Offset', value: `${(co2PerYear / 1000).toFixed(1)} t`, sub: 'per year, approx' },
      { label: 'System Life', value: '25 Years', sub: 'module performance' },
    ], GREEN, GREEN_SOFT);
  }

  // ---------- Notes & terms ----------
  section('Notes & Terms');
  const notes = str(q?.notes);
  if (notes) {
    y += 1.2;
    font('bold', 8.4); ink(INK); pdf.text('Customer Notes', M, y); y += 4.5;
    font('normal', 8.4); ink(MUTED);
    pdf.splitTextToSize(notes, CW).forEach((ln: string) => { ensure(5); pdf.text(ln, M, y); y += 4; });
    y += 2;
  }
  const terms = [
    `Quotation valid till ${q?.validUntil ? fmtDate(q.validUntil) : 'the date mentioned above'}. Prices may revise thereafter.`,
    'Price includes supply, installation and commissioning on a standard RCC / tin roof, unless stated otherwise.',
    'Warranty: Solar modules 25-year performance, Inverter 5 years, Workmanship 5 years.',
    'Government subsidy (if applicable) is released by MNRE / Discom directly to the customer bank account.',
    'GST and other statutory levies as applicable. Payment schedule as per mutually agreed terms.',
  ];
  font('normal', 7.8); ink(MUTED);
  terms.forEach((t) => {
    ensure(4.5);
    fill(ORANGE); pdf.circle(M + 1.3, y - 1, 0.75, 'F');
    pdf.splitTextToSize(t, CW - 6).forEach((ln: string, idx: number) => {
      if (idx > 0) ensure(4.5);
      pdf.text(ln, M + 5, y);
      y += 3.9;
    });
    y += 0.6;
  });

  // ---------- Signature ----------
  ensure(30);
  y += 2;
  stroke(LINE); pdf.setLineWidth(0.3); pdf.line(M, y, pageW - M, y);
  y += 7;
  font('bold', 9); ink(INK);
  pdf.text('Customer Acceptance', M, y);
  pdf.text(`For ${COMPANY.name}`, pageW - M, y, { align: 'right' });
  stroke(MUTED); pdf.setLineWidth(0.3);
  pdf.line(M, y + 12, M + 72, y + 12);
  pdf.line(pageW - M - 72, y + 12, pageW - M, y + 12);
  font('normal', 7.6); ink(MUTED);
  pdf.text('Signature / Date', M, y + 15.4);
  pdf.text('Authorised Signatory', pageW - M, y + 15.4, { align: 'right' });

  // ---------- Footer on every page ----------
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    fill(NAVY); pdf.rect(0, pageH - 9, pageW, 9, 'F');
    fill(ORANGE); pdf.rect(0, pageH - 9.9, pageW, 0.9, 'F');
    font('normal', 7.4); ink(WHITE);
    pdf.text(`${COMPANY.name}  |  ${COMPANY.website}  |  ${COMPANY.phone}`, M, pageH - 3.4);
    pdf.text(`Page ${i} of ${totalPages}`, pageW - M, pageH - 3.4, { align: 'right' });
  }

  return pdf;
}

export function quotationPdfBlob(q: any): Blob {
  return buildQuotationPdf(q).output('blob');
}

export function downloadQuotationPdf(q: any): void {
  buildQuotationPdf(q).save(quotationFileName(q));
}
