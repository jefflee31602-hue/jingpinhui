import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

export async function exportElementToA4Pdf(
  element: HTMLElement,
  filename: string
): Promise<void> {
  const dataUrl = await toPng(element, {
    quality: 1.0,
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    cacheBust: true,
  });

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (err) => reject(err);
    img.src = dataUrl;
  });

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
  const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm

  const imgWidthMm = pageWidth;
  const imgHeightMm = (img.height * imgWidthMm) / img.width;

  let heightLeft = imgHeightMm;
  let position = 0;

  pdf.addImage(dataUrl, 'PNG', 0, position, imgWidthMm, imgHeightMm, undefined, 'FAST');
  heightLeft -= pageHeight;

  while (heightLeft > 1) {
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(dataUrl, 'PNG', 0, position, imgWidthMm, imgHeightMm, undefined, 'FAST');
    heightLeft -= pageHeight;
  }

  pdf.save(filename);
}

/**
 * Captures an array of pre-sized A4 print blocks sequentially so large 100+ row
 * catalogs never exceed browser canvas height limits when generating multi-page PDFs.
 */
export async function exportBlocksToA4Pdf(
  blocks: HTMLElement[],
  filename: string
): Promise<void> {
  const validBlocks = blocks.filter((b) => b && b.offsetHeight > 0);
  if (validBlocks.length === 0) return;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
  const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm
  const marginMm = 8;
  const contentWidthMm = pageWidth - marginMm * 2;
  const maxPageContentHeightMm = pageHeight - marginMm * 2;

  let cursorY = marginMm;
  let isFirstPage = true;

  for (const block of validBlocks) {
    const imgs = Array.from(block.querySelectorAll('img'));
    await Promise.all(
      imgs.map(
        (el) =>
          el.complete ||
          new Promise<void>((resolve) => {
            el.addEventListener('load', () => resolve(), { once: true });
            el.addEventListener('error', () => resolve(), { once: true });
          })
      )
    );

    const dataUrl = await toPng(block, {
      quality: 0.96,
      pixelRatio: 1.5,
      backgroundColor: '#ffffff',
      cacheBust: true,
    });

    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (err) => reject(err);
      img.src = dataUrl;
    });

    const imgHeightMm = (img.height * contentWidthMm) / img.width;

    if (!isFirstPage && cursorY + imgHeightMm > pageHeight - marginMm) {
      pdf.addPage();
      cursorY = marginMm;
    }

    if (imgHeightMm <= maxPageContentHeightMm) {
      pdf.addImage(
        dataUrl,
        'PNG',
        marginMm,
        cursorY,
        contentWidthMm,
        imgHeightMm,
        undefined,
        'FAST'
      );
      cursorY += imgHeightMm + 3;
      isFirstPage = false;
    } else {
      // Slice tall block cleanly across pages if needed
      let remaining = imgHeightMm;
      let offset = cursorY;
      while (remaining > 1) {
        if (!isFirstPage && offset === marginMm) {
          pdf.addPage();
        }
        pdf.addImage(
          dataUrl,
          'PNG',
          marginMm,
          offset,
          contentWidthMm,
          imgHeightMm,
          undefined,
          'FAST'
        );
        remaining -= maxPageContentHeightMm;
        offset -= maxPageContentHeightMm;
        isFirstPage = false;
        if (remaining > 1) {
          pdf.addPage();
          offset = marginMm - (imgHeightMm - remaining);
        }
      }
      cursorY = pageHeight; // Force new page for next block
    }
  }

  pdf.save(filename);
}
