const PDFDocument = require('pdfkit');

function safeText(value) {
  return String(value || 'N/A');
}

function formatIssuedDate(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toUTCString();
}

function buildCertificatePdf(certificate) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 54 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.save();
    doc.rect(doc.page.margins.left, doc.page.margins.top, width, 730).lineWidth(1.2).strokeColor('#CDA76C').stroke();
    doc.restore();

    doc.font('Times-Bold').fontSize(28).fillColor('#1B1A18').text('HAT Certificate', { align: 'center' });
    doc.moveDown(0.25);
    doc.font('Times-Roman').fontSize(11).fillColor('#5A5A5A').text('Human Authentication Token', { align: 'center' });

    doc.moveDown(1.1);
    doc.fillColor('#1B1A18');
    doc.font('Times-Italic').fontSize(13).text('Certificate Number', { align: 'center' });
    doc.font('Courier-Bold').fontSize(16).text(safeText(certificate.certificate_number), { align: 'center' });

    doc.moveDown(1.2);
    doc.font('Times-Bold').fontSize(21).text('Certificate of Human-Origin Attestation', { align: 'center' });
    doc.moveDown(0.8);

    doc.font('Times-Roman').fontSize(12).fillColor('#2B2B2B').text(
      `This certifies that token ${safeText(certificate.token)} has been issued in the Human Authentication Token registry with a private, unique user identifier.`,
      { align: 'center', lineGap: 4 }
    );

    doc.moveDown(1.5);
    doc.font('Times-Bold').fontSize(12).fillColor('#1B1A18').text('Certificate Details');
    doc.moveDown(0.4);

    const details = [
      ['HAT Token', safeText(certificate.token)],
      ['Private User Identifier', safeText(certificate.user_identifier)],
      ['Display Name', safeText(certificate.name || 'Private')],
      ['Issued At (UTC)', formatIssuedDate(certificate.created_at)]
    ];

    details.forEach(([label, value]) => {
      doc.font('Times-Bold').fontSize(11).fillColor('#1F1F1F').text(`${label}: `, { continued: true });
      doc.font('Courier').fontSize(11).fillColor('#2E2E2E').text(value);
      doc.moveDown(0.3);
    });

    doc.moveDown(1.4);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + 220, doc.y).lineWidth(0.7).strokeColor('#B7B7B7').stroke();
    doc.moveDown(0.3);
    doc.font('Times-Roman').fontSize(10).fillColor('#585858').text('HAT Issuance Registry');

    doc.moveDown(0.2);
    doc.font('Times-Roman').fontSize(9).fillColor('#6A6A6A').text(
      'Private issuance log. Public token verification. Identity remains private unless disclosed by holder.'
    );

    doc.end();
  });
}

module.exports = {
  buildCertificatePdf
};
