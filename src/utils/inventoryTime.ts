/**
 * Inventory Time & Date Utility
 * Provides automatic real-time updates and hourly timestamp formatting
 * compatible with '미니빵집 판매현황.xlsx' and '서산나래 판매지.xlsx'
 */

export interface TimePreset {
  label: string;
  hour: number;
  minute: number;
  round: number;
}

export const INVENTORY_TIME_PRESETS: TimePreset[] = [
  { label: '오전 1차 (09:00)', hour: 9, minute: 0, round: 1 },
  { label: '점심 1차 (12:00)', hour: 12, minute: 0, round: 1 },
  { label: '오후 2차 (15:00)', hour: 15, minute: 0, round: 2 },
  { label: '마감 2차 (18:00)', hour: 18, minute: 0, round: 2 },
];

/**
 * Format Date to YYYY-MM-DD
 */
export function formatDateYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Format Time to HH:mm
 */
export function formatTimeHM(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Format to 'YYYY/M/D(HH:mm)~' as seen in 미니빵집 판매현황 Row 928/972
 */
export function formatExcelDateTimeString(dateStr: string, timeStr?: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;

  const y = parts[0];
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);

  if (!timeStr) {
    return `${y}/${m}/${d}`;
  }

  // Format e.g., "2026/8/11(15:00)~"
  return `${y}/${m}/${d}(${timeStr})~`;
}

/**
 * Format for 서산나래 판매지 Header (G2: '날짜: YYYY-MM-DD HH:mm')
 */
export function formatSalePaperHeaderDate(dateStr: string, timeStr?: string): string {
  if (!timeStr) return `날짜: ${dateStr}`;
  return `날짜: ${dateStr} ${timeStr}`;
}

/**
 * Determine default round based on hour
 */
export function getDefaultRound(hour: number): number {
  return hour >= 14 ? 2 : 1;
}
