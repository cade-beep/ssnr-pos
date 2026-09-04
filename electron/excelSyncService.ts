import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
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
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

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
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const targetSheetName = session.storeName === '복지관' ? '복지관_판매지' : '서산나래_판매지';
  const worksheet = findSheet(workbook, targetSheetName);

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
      if (match && (match.soldQty ?? 0) > 0) {
        row.getCell(5).value = match.soldQty; // Col E (판매량)
      }
    }

    const rightName = row.getCell(7).value ? String(row.getCell(7).value).trim() : '';
    if (rightName && rightName !== '기타' && rightName !== '동전쿠키' && rightName !== '제과류') {
      const match = itemMap.get(normalizeName(rightName));
      if (match && (match.soldQty ?? 0) > 0) {
        row.getCell(10).value = match.soldQty; // Col J (판매량)
      }
    }
  }

  await workbook.xlsx.writeFile(filePath);
  return worksheet.name;
}
