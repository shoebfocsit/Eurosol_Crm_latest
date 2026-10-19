import { describe, it, expect } from 'vitest';
import { buildQuotationPdf, quotationPdfBlob, quotationFileName } from '@/lib/quotationPdf';

const sample = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  createdAt: '2026-01-15T10:00:00.000Z',
  validUntil: '2026-02-15T00:00:00.000Z',
  status: 'SENT',
  systemSize: 5,
  panelBrand: 'Waaree 540W',
  panelCount: 10,
  inverterBrand: 'Growatt 5kW',
  inverterCount: 1,
  totalCost: 350000,
  discount: 10000,
  subsidyAmount: 78000,
  gstPercent: 0,
  netAmount: 262000,
  notes: 'Client wants installation before monsoon. Includes net-metering support.',
  lead: { name: 'Ramesh Sharma', phone: '9876543210', email: 'ramesh@example.com', city: 'Nagpur' },
};

describe('quotationPdf', () => {
  it('produces a valid multi-section PDF', () => {
    const pdf = buildQuotationPdf(sample);
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    const out = pdf.output('arraybuffer') as ArrayBuffer;
    const bytes = new Uint8Array(out);
    // %PDF magic header
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('%PDF');
    expect(bytes.length).toBeGreaterThan(2000);
  });

  it('handles missing fields without throwing and still emits a blob', () => {
    const minimal = { id: 'x', lead: {} };
    const blob = quotationPdfBlob(minimal);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(1500);
    expect(quotationFileName(minimal)).toBe('Quotation-Client-X.pdf');
  });

  it('builds a readable file name', () => {
    expect(quotationFileName(sample)).toBe('Quotation-Ramesh_Sharma-A1B2C3D4.pdf');
  });
});
