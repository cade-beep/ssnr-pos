import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// Rasterizes `node` and wraps it in a PDF sized exactly to its content at
// `widthMm` wide. Bypasses the OS print pipeline entirely (no window.print,
// no printer driver in the loop), so the output width is exact regardless
// of what's installed as the default printer/PDF driver on the machine.
export async function downloadElementAsPdf(
  node: HTMLElement,
  filename: string,
  widthMm: number = 58
): Promise<void> {
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff' });
  const imgData = canvas.toDataURL('image/png');
  const heightMm = (canvas.height / canvas.width) * widthMm;

  const doc = new jsPDF({
    unit: 'mm',
    format: [widthMm, heightMm]
  });
  doc.addImage(imgData, 'PNG', 0, 0, widthMm, heightMm);
  doc.save(filename);
}
