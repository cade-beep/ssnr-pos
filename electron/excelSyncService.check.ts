/**
 * Runnable check for the Excel sync. Copies the two real workbooks into a temp
 * dir and syncs against the copies, so the originals are never touched.
 *   npm run check:excel
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import assert from 'assert';
import ExcelJS from 'exceljs';
import { syncInventoryToExcel, getExcelFilePaths, readWorkbook } from './excelSyncService';
import { InventoryCheckSession, InventoryItem } from '../src/types/inventory';
import { BAKERY_PRODUCTS } from '../src/data/bakeryInventoryData';

const norm = (n: string) => n.replace(/[\s()개입단품]/g, '').trim();
const BLOCK = 44;

function cell(ws: ExcelJS.Worksheet, row: number, col: number): any {
  const v = ws.getRow(row).getCell(col).value as any;
  if (v && typeof v === 'object' && v.formula) return '=' + v.formula;
  if (v && typeof v === 'object' && v.result !== undefined) return v.result;
  return v;
}

/** Build a session; `sold` maps product name -> [dispatch, remaining]. */
function makeSession(o: {
  storeName: '서산나래' | '복지관';
  dateStr: string;
  timeStr: string;
  round: number;
  sold: Record<string, [number, number]>;
  card: number; cash: number; d30: number; notes: string;
}): InventoryCheckSession {
  const items: InventoryItem[] = BAKERY_PRODUCTS.map((p) => {
    const [dispatchQty, remainingQty] = o.sold[p.name] ?? [0, 0];
    const soldQty = dispatchQty - remainingQty;
    return {
      id: p.id, name: p.name, category: p.category, unitPrice: p.unitPrice,
      discount10Price: p.discount10Price, discount30Price: p.discount30Price,
      dispatchQty, remainingQty, soldQty, subtotal: soldQty * p.unitPrice,
    };
  });
  const [y, m, d] = o.dateStr.split('-');
  return {
    storeName: o.storeName, dateStr: o.dateStr, timeStr: o.timeStr,
    displayDateStr: `${y}/${Number(m)}/${Number(d)}(${o.timeStr})~`,
    round: o.round, items,
    cardPayment: o.card, cashPayment: o.cash, discount30Payment: o.d30,
    totalPayment: o.card + o.cash + o.d30,
    totalInventoryAmount: items.reduce((a, i) => a + i.remainingQty * i.unitPrice, 0),
    notes: o.notes,
  };
}

/** Locate the block whose header row carries this date + round. */
function findBlock(ws: ExcelJS.Worksheet, s: InventoryCheckSession): number {
  for (let r = 4; r <= ws.rowCount + BLOCK; r += BLOCK) {
    if (String(cell(ws, r, 2) ?? '').trim() === s.displayDateStr &&
        String(cell(ws, r, 3) ?? '').trim() === String(s.round)) return r;
  }
  return -1;
}

async function verify(root: string, s: InventoryCheckSession, label: string, sheetName: string) {
  const { bakeryPath, salePaperPath } = getExcelFilePaths(root);

  const wb = await readWorkbook(bakeryPath);
  const ws = wb.getWorksheet('서산나래 미니빵집 판매 현황')!;

  const R = findBlock(ws, s);
  assert.notStrictEqual(R, -1, `${label}: 판매현황에 ${s.displayDateStr} ${s.round}차 블록이 없음`);
  assert.strictEqual(cell(ws, R, 8), s.cardPayment, `${label}: 카드결제(H) 불일치`);
  assert.strictEqual(cell(ws, R, 9), s.cashPayment, `${label}: 현금결제(I) 불일치`);
  assert.strictEqual(cell(ws, R, 10), s.discount30Payment, `${label}: 30%할인(J) 불일치`);
  assert.strictEqual(cell(ws, R, 11), `=H${R}+I${R}+J${R}`, `${label}: 총판매액(K) 수식 불일치`);
  assert.strictEqual(cell(ws, R, 12), s.notes, `${label}: 비고(L) 불일치`);
  assert.strictEqual(cell(ws, R + 43, 7), `=SUM(F${R}:F${R + 42})`, `${label}: 합계행 수식 불일치`);

  const byName = new Map(s.items.map((i) => [norm(i.name), i]));
  let matched = 0;
  const unmatched: string[] = [];
  for (let off = 0; off < 43; off++) {
    const name = String(cell(ws, R + off, 4) ?? '').trim();
    if (!name) continue;
    const item = byName.get(norm(name));
    if (!item) { unmatched.push(name); continue; }
    matched++;
    // A zero is never written, so the sheet keeps whatever it already held
    if (item.dispatchQty > 0) {
      assert.strictEqual(cell(ws, R + off, 5), item.dispatchQty, `${label}: '${name}' 출고 수량 불일치`);
    }
    if (item.soldQty > 0) {
      assert.strictEqual(cell(ws, R + off, 6), item.soldQty, `${label}: '${name}' 판매 수량 불일치`);
    }
    const g = String(cell(ws, R + off, 7) ?? '');
    assert.ok(g.startsWith('=IFERROR('), `${label}: '${name}' 판매액 수식이 사라짐`);
  }

  // The stocktake goes to its own new sheet, named 재고조사(날짜 시각)
  const wb2 = await readWorkbook(salePaperPath);
  const ws2 = wb2.worksheets.find((w) => w.name === sheetName)!;
  assert.ok(ws2, `${label}: '${sheetName}' 시트를 찾지 못함`);
  assert.ok(sheetName.startsWith('재고조사('), `${label}: 시트 이름이 재고조사(...) 형식이 아님: ${sheetName}`);
  assert.ok(sheetName.length <= 31, `${label}: 시트 이름이 31자를 넘음: ${sheetName}`);
  assert.ok(!/[:\\/?*\[\]]/.test(sheetName), `${label}: 시트 이름에 엑셀 금지 문자가 있음: ${sheetName}`);
  assert.strictEqual(String(cell(ws2, 2, 7)), `날짜: ${s.dateStr} ${s.timeStr}`, `${label}: 새 시트 G2 날짜 불일치`);
  assert.strictEqual(String(cell(ws2, 2, 2) ?? '').trim(),
    s.storeName === '복지관' ? '복지관_판매지' : '서산나래_판매지',
    `${label}: 새 시트가 다른 매장 서식에서 복사됨`);

  // 확인용 열이 재고량으로 바뀌고, 판매량 열은 손으로 적도록 비워 둔다
  assert.strictEqual(cell(ws2, 3, 3), '재고량', `${label}: 왼쪽 머리글이 재고량이 아님`);
  assert.strictEqual(cell(ws2, 3, 8), '재고량', `${label}: 오른쪽 머리글이 재고량이 아님`);

  let paperHits = 0;
  for (let r = 6; r <= 33; r++) {
    for (const [nameCol, stockCol, soldCol] of [[2, 3, 5], [7, 8, 10]]) {
      const name = String(cell(ws2, r, nameCol) ?? '').trim();
      const item = name ? byName.get(norm(name)) : undefined;
      if (!item) continue;
      assert.strictEqual(cell(ws2, r, stockCol), item.dispatchQty, `${label}: 새 시트 '${name}' 재고량 불일치`);
      assert.strictEqual(cell(ws2, r, soldCol), null, `${label}: 새 시트 '${name}' 판매량 칸이 비어 있지 않음`);
      paperHits++;
    }
  }

  for (const t of ['서산나래_판매지', '복지관_판매지']) {
    assert.ok(wb2.worksheets.find((w) => w.name.trim() === t), `${label}: 템플릿 '${t}' 가 사라짐`);
  }

  return { R, matched, unmatched, paperHits };
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ssnr-sync-'));
  for (const f of ['미니빵집 판매현황.xlsx', '서산나래 판매지.xlsx']) {
    fs.copyFileSync(path.join(process.cwd(), f), path.join(root, f));
  }
  console.log(`temp dir: ${root}\n`);

  /** Every cell a sync could touch in the two store templates. */
  const snapshotTemplates = async () => {
    const wb = await readWorkbook(getExcelFilePaths(root).salePaperPath);
    const out: Record<string, any> = {};
    for (const t of ['서산나래_판매지', '복지관_판매지']) {
      const ws = wb.worksheets.find((w) => w.name.trim() === t)!;
      out[`${t}!G2`] = cell(ws, 2, 7);
      for (let r = 6; r <= 33; r++) {
        for (const c of [5, 10]) out[`${t}!${r}:${c}`] = cell(ws, r, c);
      }
    }
    return out;
  };
  const templatesBefore = await snapshotTemplates();

  const scenarios: { label: string; session: InventoryCheckSession }[] = [
    {
      label: '1. 서산나래 / 1차 09:00 / 일반 판매',
      session: makeSession({
        storeName: '서산나래', dateStr: '2026-09-03', timeStr: '09:00', round: 1,
        sold: { '소보로빵': [10, 2], '단팥빵': [10, 0], '크림빵': [8, 8], '식빵': [5, 1], '초코쿠키': [12, 3] },
        card: 45000, cash: 12000, d30: 0, notes: '오전 정상 판매',
      }),
    },
    {
      label: '2. 동일 날짜·차수 재동기화 (수량 정정)',
      session: makeSession({
        storeName: '서산나래', dateStr: '2026-09-03', timeStr: '09:00', round: 1,
        sold: { '소보로빵': [10, 5], '단팥빵': [10, 1], '크림빵': [8, 0], '식빵': [5, 5], '초코쿠키': [12, 0] },
        card: 51000, cash: 9000, d30: 3000, notes: '재고 재확인 후 정정',
      }),
    },
    {
      label: '3. 복지관 / 2차 15:00 / 30%할인 포함',
      session: makeSession({
        storeName: '복지관', dateStr: '2026-09-04', timeStr: '15:00', round: 2,
        sold: { '카스텔라': [6, 1], '밤식빵': [4, 0], '모카쿠키': [20, 7], '만쥬세트': [3, 3] },
        card: 28000, cash: 4000, d30: 15400, notes: '복지관 오후 판매',
      }),
    },
    {
      label: '4. 전량 미판매 (0 처리) + 이월 재고',
      session: makeSession({
        storeName: '서산나래', dateStr: '2026-09-05', timeStr: '18:00', round: 2,
        sold: { '소보로빵': [7, 7], '단팥빵': [7, 7] },
        card: 0, cash: 0, d30: 0, notes: '우천 휴점, 전량 이월',
      }),
    },
  ];

  let failed = 0;
  const rows: number[] = [];
  const sheetNames: string[] = [];
  for (const { label, session } of scenarios) {
    try {
      const res = await syncInventoryToExcel(session, root);
      assert.ok(res.success, `${label}: sync 실패 - ${res.message}`);
      const sheetName = res.details?.sheetName ?? '';
      const v = await verify(root, session, label, sheetName);
      rows.push(v.R);
      sheetNames.push(sheetName);
      console.log(`PASS  ${label}`);
      console.log(`      블록 행 R=${v.R} · 품목 ${v.matched}/43 일치 · 새 시트 '${sheetName}' 에 ${v.paperHits}칸 기록` +
        (v.unmatched.length ? ` · 미매칭: ${v.unmatched.join(', ')}` : ''));
    } catch (err: any) {
      failed++;
      console.log(`FAIL  ${label}\n      ${err.message}`);
    }
  }

  if (rows.length >= 2) {
    assert.strictEqual(rows[0], rows[1], `재동기화가 새 블록을 만듦 (${rows[0]} -> ${rows[1]})`);
    console.log(`\n재동기화 멱등성 OK: 두 번 모두 R=${rows[0]} (블록 추가 없음)`);
  }
  // The zero-skip guard: 식빵 sold 4 in scenario 1 and 0 in scenario 2, so the
  // sheet must still hold 4 instead of being wiped by the re-sync.
  if (rows.length >= 2) {
    const wb = await readWorkbook(getExcelFilePaths(root).bakeryPath);
    const ws = wb.getWorksheet('서산나래 미니빵집 판매 현황')!;
    let found = -1;
    for (let off = 0; off < 43; off++) {
      if (String(cell(ws, rows[0] + off, 4) ?? '').trim() === '식빵') { found = rows[0] + off; break; }
    }
    assert.notStrictEqual(found, -1, '식빵 행을 찾지 못함');
    assert.strictEqual(cell(ws, found, 6), 4, '0으로 재동기화하면서 기존 판매 수량을 덮어씀');
    console.log('0 덮어쓰기 방지 OK: 식빵 판매 4개가 재동기화 후에도 남아 있음');
  }

  // Every sync adds one sheet, and two stocktakes in the same minute must not collide
  if (sheetNames.length === 4) {
    assert.strictEqual(new Set(sheetNames).size, 4, `시트 이름이 겹침: ${sheetNames.join(', ')}`);
    assert.ok(sheetNames[1].endsWith('-2'), `같은 시각 재동기화가 -2 를 붙이지 않음: ${sheetNames[1]}`);
    const wb = await readWorkbook(getExcelFilePaths(root).salePaperPath);
    const added = wb.worksheets.filter((w) => w.name.startsWith('재고조사(')).map((w) => w.name);
    assert.strictEqual(added.length, 4, `재고조사 시트 개수가 4가 아님: ${added.length}`);
    console.log('\n새 시트 4장 생성 OK:');
    for (const n of added) console.log('  ' + n);
    const templatesAfter = await snapshotTemplates();
    assert.deepStrictEqual(templatesAfter, templatesBefore, '원본 판매지 템플릿이 변경됨');
    console.log(`원본 판매지 템플릿 2장 무변경 OK (${Object.keys(templatesBefore).length}칸 대조)`);
  }

  const backups = fs.readdirSync(root).filter((f) => f.endsWith('.bak'));
  console.log(`백업 파일 ${backups.length}개 생성 (동기화 횟수만큼 누적)`);

  console.log(failed === 0 ? '\n전체 통과' : `\n${failed}건 실패`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
