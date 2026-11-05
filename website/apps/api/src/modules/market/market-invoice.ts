import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MARKET_TVA_PERCENT, formatTnd, marketTotals, type MarketBilling } from '@nasj/contracts';
import PDFDocument from 'pdfkit';

const logo = fileURLToPath(new URL('../../../assets/nasj-logo.png', import.meta.url));
// Placeholder company details until NASJ has its registered ones.
const nasjSeller = {
  legalName: 'NASJ Social Enterprise',
  taxId: '0000000/X/A/000',
  address: '1 Weavers Square, Head office',
  email: 'billing@nasj.example',
  phone: '+000 55 010 100',
  bank: 'Sample Bank, account 00 000 0000000000000 00',
};
const paymentLabel = { DHMAD: 'Dhmad secure payment', BANK_TRANSFER: 'Bank transfer' };
const green = '#244C3A';
const ink = '#292D29';
const muted = '#6B6F6A';

export type InvoiceInput = {
  kind: 'PRO FORMA INVOICE' | 'INVOICE';
  number: string;
  date: Date;
  billing: MarketBilling;
  lines: { name: string; quantity: number; unitMillimes: bigint }[];
};

// Every figure comes from the database, so nothing shown in a browser can change an invoice.
export function renderInvoice(input: InvoiceInput) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: input.number } });
    const parts: Buffer[] = [];
    doc.on('data', (part: Buffer) => parts.push(part));
    doc.on('end', () => resolve(Buffer.concat(parts)));
    doc.on('error', reject);
    const right = 545;
    if (existsSync(logo)) doc.image(logo, 50, 45, { width: 120 });
    doc.fillColor(green).font('Helvetica-Bold').fontSize(18);
    doc.text(input.kind, 250, 50, { width: right - 250, align: 'right' });
    doc.fillColor(muted).font('Helvetica').fontSize(10);
    doc.text(`No. ${input.number}`, 250, 75, { width: right - 250, align: 'right' });
    doc.text(`Date: ${input.date.toISOString().slice(0, 10)}`, 250, 89, {
      width: right - 250,
      align: 'right',
    });
    const block = (title: string, lines: string[], x: number) => {
      doc.fillColor(green).font('Helvetica-Bold').fontSize(10).text(title, x, 125, { width: 155 });
      doc.fillColor(ink).font('Helvetica').fontSize(9.5);
      doc.text(lines.join('\n'), x, 141, { width: 155 });
    };
    block(
      'From',
      [
        nasjSeller.legalName,
        `Tax ID: ${nasjSeller.taxId}`,
        nasjSeller.address,
        nasjSeller.email,
        nasjSeller.phone,
      ],
      50,
    );
    block(
      'Billed to',
      [
        input.billing.legalName,
        `Tax ID: ${input.billing.taxId}`,
        input.billing.billingAddress,
        input.billing.contactPhone,
      ],
      220,
    );
    block('Ship to', [input.billing.contactName, input.billing.shippingAddress], 390);
    let y = 240;
    const columns = { name: 50, qty: 320, unit: 380, total: 465 };
    doc.rect(50, y, right - 50, 22).fill(green);
    doc.fillColor('#F5F0E6').font('Helvetica-Bold').fontSize(9);
    doc.text('Item', columns.name + 8, y + 7);
    doc.text('Qty', columns.qty, y + 7, { width: 45, align: 'right' });
    doc.text('Unit price', columns.unit, y + 7, { width: 75, align: 'right' });
    doc.text('Amount', columns.total, y + 7, { width: 72, align: 'right' });
    y += 22;
    let subtotal = 0n;
    doc.font('Helvetica').fillColor(ink).fontSize(10);
    for (const line of input.lines) {
      const amount = line.unitMillimes * BigInt(line.quantity);
      subtotal += amount;
      const height = Math.max(24, doc.heightOfString(line.name, { width: 255 }) + 12);
      if (y + height > 660) {
        doc.addPage();
        y = 50;
      }
      doc.fillColor(ink).text(line.name, columns.name + 8, y + 7, { width: 255 });
      doc.text(String(line.quantity), columns.qty, y + 7, { width: 45, align: 'right' });
      doc.text(formatTnd(line.unitMillimes), columns.unit, y + 7, { width: 75, align: 'right' });
      doc.text(formatTnd(amount), columns.total, y + 7, { width: 72, align: 'right' });
      y += height;
      doc.moveTo(50, y).lineTo(right, y).strokeColor('#D9CFBD').lineWidth(0.5).stroke();
    }
    const totals = marketTotals(subtotal);
    y += 14;
    const row = (label: string, value: string, strong = false) => {
      doc.font(strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(strong ? 12 : 10);
      doc.fillColor(strong ? green : ink);
      doc.text(label, 330, y, { width: 125 });
      doc.text(`${value} TND`, 440, y, { width: right - 440, align: 'right' });
      y += strong ? 22 : 18;
    };
    row('Subtotal excl. tax', formatTnd(totals.subtotal));
    row(`TVA ${MARKET_TVA_PERCENT}%`, formatTnd(totals.tva));
    row('Stamp duty', formatTnd(totals.stamp));
    y += 4;
    row('Total incl. tax', formatTnd(totals.total), true);
    y += 12;
    doc.fillColor(ink).font('Helvetica').fontSize(10);
    doc.text(`Payment method: ${paymentLabel[input.billing.paymentMethod]}`, 50, y);
    if (input.billing.paymentMethod === 'BANK_TRANSFER')
      doc.text(`Bank details: ${nasjSeller.bank}`, 50, y + 15);
    doc.fillColor(muted).fontSize(8);
    doc.text(
      input.kind === 'PRO FORMA INVOICE'
        ? 'This pro forma is an estimate and is not a tax invoice. Prices are confirmed when your request is accepted.'
        : 'Generated by NASJ from the recorded order. No payment has been collected through this document.',
      50,
      770,
      { width: right - 50, align: 'center', lineBreak: false },
    );
    doc.end();
  });
}

export function renderLetter(title: string, body: string) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 60 });
    const parts: Buffer[] = [];
    doc.on('data', (part: Buffer) => parts.push(part));
    doc.on('end', () => resolve(Buffer.concat(parts)));
    doc.on('error', reject);
    doc.fontSize(18).text(title);
    doc.moveDown().fontSize(12).text(body);
    doc.end();
  });
}
