import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  X, 
  Calendar, 
  Clock, 
  Save, 
  Printer, 
  FileSpreadsheet, 
  Plus, 
  Minus, 
  RotateCcw, 
  LayoutGrid, 
  Grid3X3, 
  ArrowUpDown, 
  RefreshCw, 
  Trash2 
} from 'lucide-react';
import { Product } from '../types';
import { InventoryItem, InventoryCheckSession, ExcelSyncResult } from '../types/inventory';
import { createInitialInventoryItems } from '../data/bakeryInventoryData';
import { 
  formatDateYMD, 
  formatTimeHM, 
  formatExcelDateTimeString, 
  INVENTORY_TIME_PRESETS, 
  getDefaultRound 
} from '../utils/inventoryTime';
import { matchChosungOrText } from '../utils/hangul';

// DEDICATED ISOLATED LOCAL STORAGE KEY (Never conflicts with POS sales cart/orders!)
const INVENTORY_STORAGE_KEY = 'ssnr_bakery_inventory_isolated_cache_v1';
const DENSITY_STORAGE_KEY = 'ssnr_inventory_grid_density_v1';

interface InventoryViewProps {
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  /** Store products, used only to reuse their photos on the stock cards */
  products?: Product[];
}

type CategoryTab = '전체' | '제빵류' | '제과류' | '동전쿠키' | '기타';
type SortOption = 'default' | 'price_asc' | 'price_desc' | 'sold_desc';
type GridDensity = 'compact' | 'comfortable';

export const InventoryView: React.FC<InventoryViewProps> = ({ onShowToast, products = [] }) => {
  // Store & Round
  const [storeName, setStoreName] = useState<'서산나래' | '복지관'>('서산나래');
  const [round, setRound] = useState<number>(() => getDefaultRound(new Date().getHours()));

  // Live Date & Time state
  const [dateStr, setDateStr] = useState<string>(() => formatDateYMD(new Date()));
  const [timeStr, setTimeStr] = useState<string>(() => formatTimeHM(new Date()));
  const [isLiveTime, setIsLiveTime] = useState<boolean>(true);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryTab>('전체');
  const [sortOption, setSortOption] = useState<SortOption>('default');
  const [rightPanelTab, setRightPanelTab] = useState<'active_only' | 'all'>('active_only');
  const [density, setDensity] = useState<GridDensity>(() => {
    try {
      return (localStorage.getItem(DENSITY_STORAGE_KEY) as GridDensity) || 'comfortable';
    } catch {
      return 'comfortable';
    }
  });

  // Selected item focus for right panel quick editing

  // Items state (completely isolated from cart)
  const [items, setItems] = useState<InventoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(INVENTORY_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return createInitialInventoryItems();
  });

  // Settlement inputs
  const [cardPayment, setCardPayment] = useState<number>(0);
  const [cashPayment, setCashPayment] = useState<number>(0);
  const [discount30Payment, setDiscount30Payment] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');

  // Sync & Print state
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncResult, setLastSyncResult] = useState<ExcelSyncResult | null>(null);

  // Photos come from the store product list so a stock card looks like its sales card
  const photoByName = useMemo(() => {
    const loose = (n: string) => n.replace(/[s()]/g, '');
    const byLoose = new Map<string, Product>();
    const byExact = new Map<string, Product>();
    for (const p of products) {
      if (!byExact.has(p.name)) byExact.set(p.name, p);
      if (!byLoose.has(loose(p.name))) byLoose.set(loose(p.name), p);
    }
    const out = new Map<string, Product>();
    for (const i of items) {
      const hit = byExact.get(i.name) || byLoose.get(loose(i.name));
      if (hit) out.set(i.name, hit);
    }
    return out;
  }, [products, items]);

  // Save to isolated localStorage whenever items change
  useEffect(() => {
    try {
      localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(items));
    } catch (_) {}
  }, [items]);

  // Auto-advance live clock
  useEffect(() => {
    if (!isLiveTime) return;
    const timer = setInterval(() => {
      const now = new Date();
      setDateStr(formatDateYMD(now));
      setTimeStr(formatTimeHM(now));
    }, 30000);
    return () => clearInterval(timer);
  }, [isLiveTime]);

  const displayDateStr = useMemo(() => {
    return formatExcelDateTimeString(dateStr, timeStr);
  }, [dateStr, timeStr]);

  const handleSelectPreset = (preset: typeof INVENTORY_TIME_PRESETS[0]) => {
    setIsLiveTime(false);
    const h = String(preset.hour).padStart(2, '0');
    const m = String(preset.minute).padStart(2, '0');
    setTimeStr(`${h}:${m}`);
    setRound(preset.round);
  };

  const handleResetToCurrentTime = () => {
    const now = new Date();
    setDateStr(formatDateYMD(now));
    setTimeStr(formatTimeHM(now));
    setRound(getDefaultRound(now.getHours()));
    setIsLiveTime(true);
  };

  const handleToggleDensity = (d: GridDensity) => {
    setDensity(d);
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, d);
    } catch (_) {}
  };

  // Quantity updates
  const handleQtyChange = (
    id: string, 
    field: 'dispatchQty' | 'remainingQty', 
    deltaOrVal: number, 
    isAbsolute = false
  ) => {
    setItems((prevItems) =>
      prevItems.map((item) => {
        if (item.id !== id) return item;

        let nextDispatch = item.dispatchQty;
        let nextRemaining = item.remainingQty;

        if (field === 'dispatchQty') {
          nextDispatch = isAbsolute ? Math.max(0, deltaOrVal) : Math.max(0, item.dispatchQty + deltaOrVal);
        } else {
          nextRemaining = isAbsolute ? Math.max(0, deltaOrVal) : Math.max(0, item.remainingQty + deltaOrVal);
        }

        const nextSold = Math.max(0, nextDispatch - nextRemaining);
        const nextSubtotal = nextSold * item.unitPrice;

        return {
          ...item,
          dispatchQty: nextDispatch,
          remainingQty: nextRemaining,
          soldQty: nextSold,
          subtotal: nextSubtotal,
        };
      })
    );
  };

  // Reset an item
  const handleResetItem = (id: string) => {
    handleQtyChange(id, 'dispatchQty', 0, true);
    handleQtyChange(id, 'remainingQty', 0, true);
  };

  // Reset all
  const handleResetAll = () => {
    if (window.confirm('모든 품목의 조사 수량을 초기화하시겠습니까?')) {
      setItems(createInitialInventoryItems());
      setCardPayment(0);
      setCashPayment(0);
      setDiscount30Payment(0);
      setNotes('');
      try {
        localStorage.removeItem(INVENTORY_STORAGE_KEY);
      } catch (_) {}
      onShowToast?.('재고 조사 데이터가 초기화되었습니다.', 'info');
    }
  };

  // Filtered & Sorted items for POS Grid
  const filteredProducts = useMemo(() => {
    let list = items.filter((p) => {
      if (searchTerm.trim() !== '') {
        if (!matchChosungOrText(p.name, searchTerm)) {
          return false;
        }
      }
      if (selectedCategory === '전체') return true;
      return p.category === selectedCategory;
    });

    if (sortOption === 'price_asc') {
      list.sort((a, b) => a.unitPrice - b.unitPrice);
    } else if (sortOption === 'price_desc') {
      list.sort((a, b) => b.unitPrice - a.unitPrice);
    } else if (sortOption === 'sold_desc') {
      list.sort((a, b) => b.soldQty - a.soldQty);
    }
    return list;
  }, [items, searchTerm, selectedCategory, sortOption]);

  // Active items (items that have been modified or have stock/sold)
  const activeItems = useMemo(() => {
    return items.filter((i) => i.dispatchQty > 0 || i.remainingQty > 0 || i.soldQty > 0);
  }, [items]);

  // Items to show in the right panel
  const rightPanelItems = rightPanelTab === 'active_only' ? activeItems : items;

  // Summary Metrics
  const totalDispatch = useMemo(() => items.reduce((acc, i) => acc + i.dispatchQty, 0), [items]);
  const totalRemaining = useMemo(() => items.reduce((acc, i) => acc + i.remainingQty, 0), [items]);
  const totalSold = useMemo(() => items.reduce((acc, i) => acc + i.soldQty, 0), [items]);
  const totalExpectedAmount = useMemo(() => items.reduce((acc, i) => acc + i.subtotal, 0), [items]);
  const totalInventoryAmount = useMemo(
    () => items.reduce((acc, i) => acc + i.remainingQty * (i.discount10Price || i.unitPrice), 0),
    [items]
  );
  const totalPayment = cardPayment + cashPayment + discount30Payment;
  const difference = totalPayment - totalExpectedAmount;

  // Execute Excel Sync
  const handleSyncToExcel = async () => {
    if (!window.electronAPI?.syncInventoryExcel) {
      const msg = 'Electron 환경에서 실행 중이 아니거나 엑셀 동기화 API가 로드되지 않았습니다.';
      onShowToast?.(msg, 'error');
      return;
    }

    const session: InventoryCheckSession = {
      storeName,
      dateStr,
      timeStr,
      displayDateStr,
      round,
      items,
      cardPayment,
      cashPayment,
      discount30Payment,
      totalPayment,
      totalInventoryAmount,
      notes,
    };

    setIsSyncing(true);
    try {
      const result: ExcelSyncResult = await window.electronAPI.syncInventoryExcel(session);
      setLastSyncResult(result);
      if (result.success) {
        onShowToast?.(`✅ 엑셀 파일 동기화 완료! (${storeName} / ${displayDateStr})`, 'success');
      } else {
        onShowToast?.(`동기화 실패: ${result.message}`, 'error');
      }
    } catch (err: any) {
      console.error('Sync failed:', err);
      onShowToast?.(`동기화 오류: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOpenFile = async (type: 'bakery' | 'salepaper') => {
    if (!window.electronAPI?.openExcelFile) {
      onShowToast?.('Electron 환경에서만 파일 열기를 지원합니다.', 'info');
      return;
    }
    await window.electronAPI.openExcelFile(type);
  };

  // Print Inventory Sheet directly to printer
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="inventory-layout">
      {/* ======================================================================
          LEFT PANEL: 판매 화면(POSGrid)과 같은 클래스를 그대로 사용해 UI를 통일
          ====================================================================== */}
      <div className="sales-workspace">
        <header className="sales-header">
          <div className="sales-title-box">
            <h1 className="sales-title">재고 조사</h1>
            <span className="sales-status-tag">{storeName} · {round}차</span>
          </div>

          <div className="search-bar-wrap">
            <div className="search-bar-icon" aria-hidden="true">
              <Search size={19} />
            </div>
            <input
              type="text"
              className="search-bar-input"
              placeholder="빵 이름 검색 (초성 'ㅅㅂㄹ' 가능)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="빵 이름 또는 초성 검색"
            />
            {searchTerm && (
              <button
                type="button"
                className="search-bar-clear"
                onClick={() => setSearchTerm('')}
                title="검색어 지우기"
                aria-label="검색어 초기화"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <div className="sales-header-tools">
            <div className="density-toggle-group" role="group" aria-label="카드 크기 보기 전환">
              <button
                type="button"
                className={`density-btn ${density === 'comfortable' ? 'active' : ''}`}
                onClick={() => handleToggleDensity('comfortable')}
                title="기본 보기 (3열)"
                aria-label="기본 보기 (3열)"
              >
                <LayoutGrid size={16} />
                <span>기본</span>
              </button>
              <button
                type="button"
                className={`density-btn ${density === 'compact' ? 'active' : ''}`}
                onClick={() => handleToggleDensity('compact')}
                title="작게 보기 (4열)"
                aria-label="작게 보기 (4열)"
              >
                <Grid3X3 size={16} />
                <span>작게</span>
              </button>
            </div>

            <div className="sales-sort-wrap">
              <ArrowUpDown size={15} className="sort-icon" aria-hidden="true" />
              <select
                className="sales-sort-select"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                aria-label="상품 정렬 기준"
              >
                <option value="default">기본순</option>
                <option value="sold_desc">판매량 많은순</option>
                <option value="price_asc">낮은 가격순</option>
                <option value="price_desc">높은 가격순</option>
              </select>
            </div>
          </div>
        </header>

        <nav className="category-bar" aria-label="상품 카테고리">
          <div className="category-group main-cats">
            {(['전체', '제빵류', '제과류', '동전쿠키', '기타'] as CategoryTab[]).map((cat) => {
              const count = cat === '전체' ? items.length : items.filter((i) => i.category === cat).length;
              if (count === 0) return null;
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  className={`cat-btn ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                  aria-pressed={isSelected}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        </nav>

        <main className="product-grid-scroll">
          {filteredProducts.length === 0 ? (
            <div className="product-empty-state">
              <span className="empty-icon">🔍</span>
              <p className="empty-title">일치하는 상품이 없습니다</p>
              <p className="empty-desc">다른 상품명 또는 초성(예: ㄷㅍ)을 입력해 주세요.</p>
            </div>
          ) : (
            <div className={`product-grid ${density}`}>
              {filteredProducts.map((product) => {
                const photo = photoByName.get(product.name);
                const counted = product.dispatchQty > 0 || product.remainingQty > 0;

                return (
                  <div
                    key={product.id}
                    className={`product-card ${density} ${counted ? 'in-cart' : ''}`}
                  >
                    <div className="card-image-wrap">
                      {photo?.imageUrl ? (
                        <img src={photo.imageUrl} alt="" className="card-image" loading="lazy" />
                      ) : (
                        <div className="card-image-emoji">{photo?.emoji || '🍞'}</div>
                      )}
                    </div>

                    <div className="card-body">
                      <div className="card-name-row">
                        <span className="card-name" title={product.name}>
                          {product.name}
                        </span>
                        {product.soldQty > 0 && (
                          <span className="card-qty-badge" aria-label={`판매 ${product.soldQty}개`}>
                            {product.soldQty}
                          </span>
                        )}
                      </div>

                      <div className="card-price-row">
                        <span className="card-price">
                          {product.unitPrice.toLocaleString()}<span className="currency-unit">원</span>
                        </span>
                      </div>

                      <div className="stock-fields">
                        <div className="stock-row">
                          <span className="stock-label">출고</span>
                          <div className="stock-stepper">
                            <button
                              type="button"
                              onClick={() => handleQtyChange(product.id, 'dispatchQty', -1)}
                              aria-label={`${product.name} 출고 1개 줄이기`}
                            >
                              <Minus size={13} />
                            </button>
                            <input
                              type="number"
                              min="0"
                              value={product.dispatchQty}
                              onChange={(e) => handleQtyChange(product.id, 'dispatchQty', parseInt(e.target.value) || 0, true)}
                              aria-label={`${product.name} 출고 수량`}
                            />
                            <button
                              type="button"
                              onClick={() => handleQtyChange(product.id, 'dispatchQty', 1)}
                              aria-label={`${product.name} 출고 1개 늘리기`}
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        </div>

                        <div className="stock-row primary">
                          <span className="stock-label">남은재고</span>
                          <div className="stock-stepper">
                            <button
                              type="button"
                              onClick={() => handleQtyChange(product.id, 'remainingQty', -1)}
                              aria-label={`${product.name} 남은재고 1개 줄이기`}
                            >
                              <Minus size={13} />
                            </button>
                            <input
                              type="number"
                              min="0"
                              value={product.remainingQty}
                              onChange={(e) => handleQtyChange(product.id, 'remainingQty', parseInt(e.target.value) || 0, true)}
                              aria-label={`${product.name} 남은재고 수량`}
                            />
                            <button
                              type="button"
                              onClick={() => handleQtyChange(product.id, 'remainingQty', 1)}
                              aria-label={`${product.name} 남은재고 1개 늘리기`}
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        </div>

                        <div className="stock-sold">
                          <span>판매</span>
                          <strong className={product.soldQty > 0 ? 'on' : ''}>
                            {product.soldQty}개 · {product.subtotal.toLocaleString()}원
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* ======================================================================
          RIGHT PANEL: AUDIT CONSOLE & SETTLEMENT (판매 화면 Cart와 100% 동일한 UX)
          ====================================================================== */}
      <div style={{
        width: '420px',
        minWidth: '380px',
        maxWidth: '480px',
        height: '100%',
        backgroundColor: '#fff',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-2px 0 10px rgba(0,0,0,0.05)',
        zIndex: 10
      }}>
        {/* Right Header: Store, Round, and Live Date */}
        <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
              <button
                type="button"
                onClick={() => setStoreName('서산나래')}
                style={{
                  border: 'none',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer',
                  background: storeName === '서산나래' ? '#2563eb' : 'transparent',
                  color: storeName === '서산나래' ? '#fff' : '#64748b'
                }}
              >
                서산나래 매장
              </button>
              <button
                type="button"
                onClick={() => setStoreName('복지관')}
                style={{
                  border: 'none',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer',
                  background: storeName === '복지관' ? '#2563eb' : 'transparent',
                  color: storeName === '복지관' ? '#fff' : '#64748b'
                }}
              >
                복지관 매장
              </button>
            </div>

            <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
              <button
                type="button"
                onClick={() => setRound(1)}
                style={{
                  border: 'none',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer',
                  background: round === 1 ? '#059669' : 'transparent',
                  color: round === 1 ? '#fff' : '#64748b'
                }}
              >
                1차
              </button>
              <button
                type="button"
                onClick={() => setRound(2)}
                style={{
                  border: 'none',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer',
                  background: round === 2 ? '#059669' : 'transparent',
                  color: round === 2 ? '#fff' : '#64748b'
                }}
              >
                2차
              </button>
            </div>
          </div>

          {/* Time and Date Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={15} color="#64748b" />
              <input 
                type="date" 
                value={dateStr}
                onChange={(e) => {
                  setIsLiveTime(false);
                  setDateStr(e.target.value);
                }}
                style={{ padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}
              />
              <Clock size={15} color="#64748b" />
              <input 
                type="time" 
                value={timeStr}
                onChange={(e) => {
                  setIsLiveTime(false);
                  setTimeStr(e.target.value);
                }}
                style={{ padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}
              />
            </div>

            <button
              type="button"
              onClick={handleResetToCurrentTime}
              title="현재 시각으로 동기화"
              style={{
                border: '1px solid #cbd5e1',
                background: isLiveTime ? '#ecfdf5' : '#fff',
                color: isLiveTime ? '#059669' : '#64748b',
                padding: '4px 6px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px'
              }}
            >
              <RotateCcw size={12} />
              {isLiveTime ? '실시간' : '동기화'}
            </button>
          </div>

          {/* Preset buttons */}
          <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
            {INVENTORY_TIME_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                style={{
                  flex: 1,
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  padding: '4px 0',
                  borderRadius: '4px',
                  fontSize: '11px',
                  color: '#475569',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                {preset.hour}:00
              </button>
            ))}
          </div>

          <div style={{
            marginTop: '8px',
            backgroundColor: '#ecfdf5',
            padding: '4px 8px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 700,
            color: '#065f46',
            display: 'flex',
            justifyContent: 'space-between'
          }}>
            <span>엑셀 표기:</span>
            <code>{displayDateStr}</code>
          </div>
        </div>

        {/* Console List Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 16px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0'
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setRightPanelTab('active_only')}
              style={{
                border: 'none',
                background: rightPanelTab === 'active_only' ? '#2563eb' : 'transparent',
                color: rightPanelTab === 'active_only' ? '#fff' : '#64748b',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              입력 품목 ({activeItems.length})
            </button>
            <button
              type="button"
              onClick={() => setRightPanelTab('all')}
              style={{
                border: 'none',
                background: rightPanelTab === 'all' ? '#2563eb' : 'transparent',
                color: rightPanelTab === 'all' ? '#fff' : '#64748b',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              전체 ({items.length})
            </button>
          </div>

          <button
            type="button"
            onClick={handleResetAll}
            title="전체 초기화"
            style={{
              border: 'none',
              background: 'none',
              color: '#ef4444',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '3px'
            }}
          >
            <Trash2 size={13} />
            <span>비우기</span>
          </button>
        </div>

        {/* Console Items List (Scrollable) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
          {rightPanelItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 10px', color: '#94a3b8', fontSize: '13px' }}>
              왼쪽 빵 타일에서 수량을 입력하면<br />여기에 조사 현황이 차곡차곡 쌓입니다.
            </div>
          ) : (
            rightPanelItems.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: '1px solid #f1f5f9'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b' }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    출고 {item.dispatchQty} · 남은 {item.remainingQty} ➔ <strong style={{ color: '#059669' }}>판매 {item.soldQty}개</strong>
                  </div>
                </div>

                {/* Right side steppers for remaining */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => handleQtyChange(item.id, 'remainingQty', -1)}
                    style={{
                      width: '24px', height: '24px', border: '1px solid #cbd5e1', borderRadius: '4px',
                      background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    <Minus size={12} />
                  </button>
                  <span style={{ minWidth: '24px', textAlign: 'center', fontWeight: 700, fontSize: '13px' }}>
                    {item.remainingQty}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleQtyChange(item.id, 'remainingQty', 1)}
                    style={{
                      width: '24px', height: '24px', border: '1px solid #cbd5e1', borderRadius: '4px',
                      background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    <Plus size={12} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleResetItem(item.id)}
                    title="이 품목 초기화"
                    style={{
                      width: '20px', height: '20px', border: 'none', borderRadius: '4px',
                      background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8'
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Settlement & Totals Summary */}
        <div style={{ padding: '14px 16px', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
          {/* Metrics Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '8px' }}>
            <span style={{ color: '#64748b' }}>총 출고: <strong>{totalDispatch}개</strong></span>
            <span style={{ color: '#2563eb' }}>총 재고: <strong>{totalRemaining}개</strong></span>
            <span style={{ color: '#059669' }}>총 판매: <strong>{totalSold}개</strong></span>
            <span style={{ color: '#0f172a' }}>예상액: <strong>{totalExpectedAmount.toLocaleString()}원</strong></span>
          </div>

          {/* Inputs for Payments (Matches Excel Columns) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '8px' }}>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '2px' }}>카드결제</label>
              <input
                type="number"
                placeholder="0"
                value={cardPayment || ''}
                onChange={(e) => setCardPayment(parseInt(e.target.value) || 0)}
                style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '2px' }}>현금/이체</label>
              <input
                type="number"
                placeholder="0"
                value={cashPayment || ''}
                onChange={(e) => setCashPayment(parseInt(e.target.value) || 0)}
                style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '2px' }}>30%할인</label>
              <input
                type="number"
                placeholder="0"
                value={discount30Payment || ''}
                onChange={(e) => setDiscount30Payment(parseInt(e.target.value) || 0)}
                style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
              />
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: '8px' }}>
            <input
              type="text"
              placeholder="비고 (특이사항 메모)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ width: '100%', padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
            />
          </div>

          {/* Total & Error Bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 8px',
            backgroundColor: '#fff',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            marginBottom: '10px'
          }}>
            <div>
              <span style={{ fontSize: '12px', color: '#64748b' }}>총 판매액: </span>
              <strong style={{ fontSize: '14px', color: '#2563eb' }}>{totalPayment.toLocaleString()}원</strong>
            </div>
            <div>
              <span style={{ fontSize: '12px', color: '#64748b' }}>오차: </span>
              <strong style={{ fontSize: '13px', color: difference === 0 ? '#64748b' : difference > 0 ? '#059669' : '#dc2626' }}>
                {difference > 0 ? `+${difference.toLocaleString()}원` : `${difference.toLocaleString()}원`}
              </strong>
            </div>
          </div>

          {lastSyncResult && (
            <div style={{
              fontSize: '11px',
              color: lastSyncResult.success ? '#059669' : '#dc2626',
              marginBottom: '8px',
              textAlign: 'center',
              fontWeight: 600,
              backgroundColor: lastSyncResult.success ? '#ecfdf5' : '#fef2f2',
              padding: '4px 6px',
              borderRadius: '4px'
            }}>
              최근 동기화: {new Date(lastSyncResult.timestamp).toLocaleTimeString()} ({lastSyncResult.message})
            </div>
          )}

          {/* Action Buttons: Print & Excel Sync */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              onClick={handlePrint}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                border: '1px solid #cbd5e1',
                background: '#fff',
                color: '#1e293b',
                padding: '9px 0',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              <Printer size={15} />
              <span>인쇄</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenFile('bakery')}
              title="판매현황 엑셀 열기"
              style={{
                border: '1px solid #cbd5e1',
                background: '#fff',
                color: '#047857',
                padding: '9px 10px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <FileSpreadsheet size={16} />
            </button>

            <button
              type="button"
              disabled={isSyncing}
              onClick={handleSyncToExcel}
              style={{
                flex: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                border: 'none',
                background: isSyncing ? '#94a3b8' : '#059669',
                color: '#fff',
                padding: '9px 0',
                borderRadius: '8px',
                fontWeight: 800,
                fontSize: '13px',
                cursor: isSyncing ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 4px rgba(5,150,105,0.2)'
              }}
            >
              {isSyncing ? <RefreshCw size={15} className="spin" /> : <Save size={15} />}
              <span>{isSyncing ? '동기화 중...' : '엑셀 동기화'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ======================================================================
          PRINT SHEET: DEDICATED OFFICIAL TALLY SHEET FOR PHYSICAL PRINTING
          Visible ONLY during @media print (Invisible on screen)
          ====================================================================== */}
      <div className="inventory-print-sheet" style={{ display: 'none' }}>
        <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '16px' }}>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 'bold' }}>
            [{storeName}] 미니빵집 판매 및 재고조사표
          </h1>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '13px' }}>
            <span>조사일시: <strong>{dateStr} {timeStr} ({round}차)</strong></span>
            <span>엑셀기록: <strong>{displayDateStr}</strong></span>
            <span>담당자 확인: _______________ (인)</span>
          </div>
        </div>

        {/* Table of active items */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '16px' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #000', borderTop: '1px solid #000' }}>
              <th style={{ padding: '6px', textAlign: 'left' }}>품목명</th>
              <th style={{ padding: '6px', textAlign: 'right' }}>단가</th>
              <th style={{ padding: '6px', textAlign: 'center' }}>출고 수량</th>
              <th style={{ padding: '6px', textAlign: 'center' }}>남은 재고</th>
              <th style={{ padding: '6px', textAlign: 'center' }}>판매 수량</th>
              <th style={{ padding: '6px', textAlign: 'right' }}>판매 금액</th>
            </tr>
          </thead>
          <tbody>
            {(activeItems.length > 0 ? activeItems : items).map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '5px 6px', fontWeight: 600 }}>{item.name}</td>
                <td style={{ padding: '5px 6px', textAlign: 'right' }}>{item.unitPrice.toLocaleString()}원</td>
                <td style={{ padding: '5px 6px', textAlign: 'center' }}>{item.dispatchQty}</td>
                <td style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 'bold' }}>{item.remainingQty}</td>
                <td style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 'bold' }}>{item.soldQty}</td>
                <td style={{ padding: '5px 6px', textAlign: 'right' }}>{item.subtotal.toLocaleString()}원</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Summary totals */}
        <div style={{ borderTop: '2px solid #000', paddingTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '13px' }}>
          <div>
            <div>총 출고 수량: <strong>{totalDispatch}개</strong></div>
            <div>총 남은 재고: <strong>{totalRemaining}개</strong></div>
            <div>총 판매 수량(A): <strong>{totalSold}개</strong></div>
            <div>총 판매 예상액: <strong>{totalExpectedAmount.toLocaleString()}원</strong></div>
          </div>
          <div>
            <div>카드 결제: <strong>{cardPayment.toLocaleString()}원</strong></div>
            <div>현금/이체: <strong>{cashPayment.toLocaleString()}원</strong></div>
            <div>30% 할인 판매: <strong>{discount30Payment.toLocaleString()}원</strong></div>
            <div>총 판매액(B): <strong>{totalPayment.toLocaleString()}원</strong></div>
            <div>오차 금액: <strong>{difference.toLocaleString()}원</strong></div>
            {notes && <div>비고: {notes}</div>}
          </div>
        </div>
      </div>
    </div>
  );
};
