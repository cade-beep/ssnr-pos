import { Product } from '../types';

const CHOSUNG_LIST = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
];

/**
 * 문자열에서 한글 음절을 초성으로 변환하여 반환합니다.
 * 예: "단팥빵" -> "ㄷㅍㅃ", "소보로 1호" -> "ㅅㅂㄹ 1호"
 */
export function getChosung(str: string): string {
  return str
    .split('')
    .map(char => {
      const code = char.charCodeAt(0);
      if (code >= 0xac00 && code <= 0xd7a3) {
        const chosungIndex = Math.floor((code - 0xac00) / (21 * 28));
        return CHOSUNG_LIST[chosungIndex] || char;
      }
      return char;
    })
    .join('');
}

/**
 * 검색어가 대상 텍스트에 포함되거나 초성이 매칭되는지 확인
 */
export function matchChosungOrText(target: string, query: string): boolean {
  if (!query) return true;
  const cleanQuery = query.toLowerCase().trim();
  if (!cleanQuery) return true;
  const cleanTarget = target.toLowerCase();

  // 1. 일반 텍스트 포함 검색 (대소문자 무시)
  if (cleanTarget.includes(cleanQuery)) {
    return true;
  }

  // 2. 초성 검색 매칭
  const targetChosung = getChosung(cleanTarget);
  if (targetChosung.includes(cleanQuery)) {
    return true;
  }

  return false;
}

/**
 * 상품 검색: 상품명, 바코드, 초성을 통합 매칭
 */
export function matchProductSearch(product: Product, query: string): boolean {
  if (!query || !query.trim()) return true;
  const terms = query.trim().split(/\s+/);

  return terms.every(term => {
    // 상품명 매칭 (일반 텍스트 or 초성)
    if (matchChosungOrText(product.name, term)) {
      return true;
    }

    // 바코드 매칭
    if (product.barcode && product.barcode.toLowerCase().includes(term.toLowerCase())) {
      return true;
    }

    // 카테고리 매칭
    if (product.category && product.category.toLowerCase().includes(term.toLowerCase())) {
      return true;
    }

    return false;
  });
}
