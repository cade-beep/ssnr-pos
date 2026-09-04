import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { InventoryCheckSession, ExcelSyncResult } from '../src/types/inventory';

// Normalize product name for resilient matching across sheets
function normalizeName(name: string): string {
  return name.replace(/[\s\(\)개입단품]/g, '').trim();
}

export function getExcelFilePaths(root: string = process.cwd()) {
  const bakeryPath = path.join(root, '미니빵집 판매현황.xlsx');
  const salePaperPath = path.join(root, '서산나래 판매지.xlsx');
  return { bakeryPath, salePaperPath };
}

// Sheet names in these workbooks carry stray trailing spaces (e.g. '복지관_판매지 '),
// so an exact getWorksheet() lookup silently falls through to the wrong sheet.
function findSheet(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  return workbook.worksheets.find((w) => w.name.trim() === name) || workbook.worksheets[0];
}

/**
 * 재고조사(2026-09-04 09-33). Excel forbids : \ / ? * [ ] in a sheet name and caps
 * it at 31 characters, so the time is dashed. A second stocktake in the same
 * minute gets -2, -3, … rather than colliding.
 */
function stocktakeSheetName(workbook: ExcelJS.Workbook, session: InventoryCheckSession): string {
  const stamp = `${session.dateStr}${session.timeStr ? ' ' + session.timeStr.replace(/:/g, '-') : ''}`;
  const base = `재고조사(${stamp})`.slice(0, 31);
  let name = base;
  let n = 2;
  while (workbook.worksheets.some((w) => w.name === name)) {
    const suffix = `-${n++}`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  return name;
}

/**
 * Duplicate a sheet so the original stays a clean template.
 * Copied cell by cell on purpose: assigning worksheet.model wholesale throws
 * inside exceljs, and this way the widths, styles and merges are all explicit.
 */
function copySheet(workbook: ExcelJS.Workbook, template: ExcelJS.Worksheet, name: string): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(name);

  template.columns?.forEach((col, i) => {
    if (col?.width) sheet.getColumn(i + 1).width = col.width;
  });

  template.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const target = sheet.getRow(rowNumber);
    if (row.height) target.height = row.height;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const t = target.getCell(colNumber);
      t.value = cell.value;
      t.style = cell.style;
    });
  });

  for (const range of ((template.model as any).merges as string[] | undefined) ?? []) {
    sheet.mergeCells(range);
  }

  return sheet;
}

/**
 * 한셀(Cell)로 저장한 xlsx 는 모든 요소에 접두사를 붙인다 (<x:sst>, <ep:Properties>).
 * exceljs 의 파서는 접두사 없는 이름만 알아보고 그대로 죽는다. 그래서 읽기 직전에
 * 각 XML 조각의 루트 접두사를 벗겨 엑셀이 쓰는 형태로 맞춘다. 메모리에서만 바꾸고
 * 원본 파일은 건드리지 않는다.
 * core.xml 은 엑셀도 <cp:coreProperties> 로 쓰므로 손대지 않는다.
 * ponytail: exceljs 가 접두사를 지원하면 이 정규화는 통째로 지운다.
 */
function unprefixXml(xml: string): string {
  const root = xml.match(/<([A-Za-z_][\w.-]*):[A-Za-z_][\w.-]*[\s>]/);
  if (!root) return xml;
  const prefix = root[1];
  const out = xml
    .split('<' + prefix + ':').join('<')
    .split('</' + prefix + ':').join('</');
  // The elements now sit in the default namespace. If the root already declares
  // one, drop the prefix declaration; otherwise promote it to the default.
  return /\sxmlns="/.test(out)
    ? out.replace(new RegExp('\\s?xmlns:' + prefix + '="[^"]*"'), '')
    : out.replace('xmlns:' + prefix + '=', 'xmlns=');
}

/**
 * Only the parts exceljs parses expecting Excel's unprefixed form. Drawings,
 * themes and core.xml legitimately use prefixes (`xdr:`, `cp:`) even straight
 * out of Excel, so touching those breaks a perfectly good file.
 */
function needsUnprefix(name: string): boolean {
  return (
    name === '[Content_Types].xml' ||
    name === 'docProps/app.xml' ||
    name === 'xl/workbook.xml' ||
    name === 'xl/styles.xml' ||
    name === 'xl/sharedStrings.xml' ||
    name.endsWith('.rels') ||
    /^xl\/(worksheets\/sheet\d+|comments\d*)\.xml$/.test(name)
  );
}

export async function readWorkbook(filePath: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  let changed = false;

  for (const name of Object.keys(zip.files)) {
    if (!needsUnprefix(name)) continue;
    const xml = await zip.files[name].async('string');
    const fixed = unprefixXml(xml);
    if (fixed !== xml) {
      zip.file(name, fixed);
      changed = true;
    }
  }

  const buffer = changed
    ? await zip.generateAsync({ type: 'nodebuffer' })
    : fs.readFileSync(filePath);
  await workbook.xlsx.load(buffer as any);
  return workbook;
}

function backupFile(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      fs.copyFileSync(filePath, `${filePath}.${stamp}.bak`);
    }
  } catch (err) {
    console.warn(`[ExcelSync] Backup warning for ${filePath}:`, err);
  }
}

export async function syncInventoryToExcel(session: InventoryCheckSession, root?: string): Promise<ExcelSyncResult> {
  const { bakeryPath, salePaperPath } = getExcelFilePaths(root);

  if (!fs.existsSync(bakeryPath)) {
    throw new Error(`'미니빵집 판매현황.xlsx' 파일을 찾을 수 없습니다: ${bakeryPath}`);
  }
  if (!fs.existsSync(salePaperPath)) {
    throw new Error(`'서산나래 판매지.xlsx' 파일을 찾을 수 없습니다: ${salePaperPath}`);
  }

  // Backup files prior to sync
  backupFile(bakeryPath);
  backupFile(salePaperPath);

  // 1. Sync '미니빵집 판매현황.xlsx'
  const blockIndex = await syncBakerySalesStatus(bakeryPath, session);

  // 2. Sync '서산나래 판매지.xlsx'
  const sheetName = await syncSalePaper(salePaperPath, session);

  return {
    success: true,
    message: '성공적으로 엑셀 파일 2종에 동기화되었습니다.',
    timestamp: new Date().toISOString(),
    updatedFiles: {
      bakerySalesStatus: bakeryPath,
      salePaper: salePaperPath,
    },
    details: {
      blockIndex,
      sheetName,
    },
  };
}

/**
 * 1. Sync '미니빵집 판매현황.xlsx'
 * Each block has 44 rows.
 */
async function syncBakerySalesStatus(filePath: string, session: InventoryCheckSession): Promise<number> {
  const workbook = await readWorkbook(filePath);

  const worksheet = findSheet(workbook, '서산나래 미니빵집 판매 현황');

  const BLOCK_SIZE = 44;
  let targetStartRow = -1;
  let blockNo = 1;

  for (let r = 4; r <= 3000; r += BLOCK_SIZE) {
    const row = worksheet.getRow(r);
    const noCell = row.getCell(1).value;
    const dateCell = row.getCell(2).value;
    const roundCell = row.getCell(3).value;

    if (noCell !== null && noCell !== undefined && noCell !== '') {
      blockNo = Number(noCell) || blockNo;
    }

    const dateValStr = dateCell ? String(dateCell).trim() : '';
    const roundValStr = roundCell ? String(roundCell).trim() : '';

    // Match exact date/round or find first open block
    if (dateValStr === session.displayDateStr && roundValStr === String(session.round)) {
      targetStartRow = r;
      break;
    }
    if (!dateCell || dateValStr === '') {
      targetStartRow = r;
      break;
    }
  }

  if (targetStartRow === -1) {
    const lastRow = worksheet.rowCount;
    targetStartRow = Math.ceil(lastRow / BLOCK_SIZE) * BLOCK_SIZE + 4;
  }

  const R = targetStartRow;

  // Header row of block (R)
  const headerRow = worksheet.getRow(R);
  headerRow.getCell(1).value = blockNo; // 연번
  headerRow.getCell(2).value = session.displayDateStr; // 판매일 (e.g. 2026/9/3(15:00)~)
  headerRow.getCell(3).value = session.round; // 차수
  headerRow.getCell(8).value = session.cardPayment || 0; // 카드결제 (Col H)
  headerRow.getCell(9).value = session.cashPayment || 0; // 현금결제 (Col I)
  headerRow.getCell(10).value = session.discount30Payment || 0; // 30%할인 (Col J)
  headerRow.getCell(11).value = { formula: `H${R}+I${R}+J${R}` }; // 총판매액(B) (Col K)
  headerRow.getCell(12).value = session.notes || ''; // 비고 (Col L)

  // Fast map
  const itemMap = new Map<string, typeof session.items[0]>();
  for (const it of session.items) {
    itemMap.set(normalizeName(it.name), it);
  }

  // Rows R to R+42 (43 items)
  for (let offset = 0; offset < 43; offset++) {
    const currentRowNum = R + offset;
    const row = worksheet.getRow(currentRowNum);
    const existingName = row.getCell(4).value ? String(row.getCell(4).value).trim() : '';

    let matchedItem = existingName ? itemMap.get(normalizeName(existingName)) : undefined;
    // Positional fallback only for blank rows: never stamp one item’s numbers onto a row labelled with another
    if (!matchedItem && !existingName && offset < session.items.length) {
      matchedItem = session.items[offset];
    }

    if (matchedItem) {
      if (!existingName) {
        row.getCell(4).value = matchedItem.name;
      }
      // Only stamp a cell we actually have a number for. Writing a 0 for a quantity
      // the app is not collecting would wipe whatever the sheet already holds.
      if ((matchedItem.dispatchQty ?? 0) > 0) {
        row.getCell(5).value = matchedItem.dispatchQty;
      }
      if ((matchedItem.soldQty ?? 0) > 0) {
        row.getCell(6).value = matchedItem.soldQty;
      }

      // Preserve or set selling formula
      const currentFormula = row.getCell(7).formula;
      if (!currentFormula) {
        row.getCell(7).value = {
          formula: `IFERROR(F${currentRowNum}*VLOOKUP(D${currentRowNum},'제과제빵 판매품목'!$B:$D,3,FALSE),0)`
        };
      }
    }
  }

  // Row R+43: 일별 판매 합계(A)
  const sumRow = worksheet.getRow(R + 43);
  sumRow.getCell(4).value = '일별 판매 합계(A)';
  sumRow.getCell(7).value = { formula: `SUM(F${R}:F${R + 42})` };

  await workbook.xlsx.writeFile(filePath);
  return blockNo;
}

/**
 * 2. Sync '서산나래 판매지.xlsx'
 */
async function syncSalePaper(filePath: string, session: InventoryCheckSession): Promise<string> {
  const workbook = await readWorkbook(filePath);

  // The store sheet is the blank template; every stocktake gets its own copy so
  // earlier ones are never overwritten.
  const templateName = session.storeName === '복지관' ? '복지관_판매지' : '서산나래_판매지';
  const worksheet = copySheet(workbook, findSheet(workbook, templateName), stocktakeSheetName(workbook, session));

  // G2 date header
  const dateHeader = `날짜: ${session.dateStr}${session.timeStr ? ` ${session.timeStr}` : ''}`;
  worksheet.getCell('G2').value = dateHeader;

  const itemMap = new Map<string, typeof session.items[0]>();
  for (const it of session.items) {
    itemMap.set(normalizeName(it.name), it);
  }

  // Match items in columns B and G
  for (let r = 6; r <= 33; r++) {
    const row = worksheet.getRow(r);

    const leftName = row.getCell(2).value ? String(row.getCell(2).value).trim() : '';
    if (leftName && leftName !== '제빵류' && leftName !== '제과류' && leftName !== '기타') {
      const match = itemMap.get(normalizeName(leftName));
      if (match) {
        row.getCell(5).value = match.soldQty ?? 0; // Col E (판매량)
      }
    }

    const rightName = row.getCell(7).value ? String(row.getCell(7).value).trim() : '';
    if (rightName && rightName !== '기타' && rightName !== '동전쿠키' && rightName !== '제과류') {
      const match = itemMap.get(normalizeName(rightName));
      if (match) {
        row.getCell(10).value = match.soldQty ?? 0; // Col J (판매량)
      }
    }
  }

  await workbook.xlsx.writeFile(filePath);
  return worksheet.name;
}
