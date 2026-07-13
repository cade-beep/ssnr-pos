import React, { useState } from 'react';
import { Product } from '../types';
import { supabase } from '../supabase';
import { Plus, Edit2, Trash2, Search, ArrowUpDown, Upload, Check, AlertTriangle } from 'lucide-react';
import { auditLog } from '../utils/auditLogger';
import { withTimeout } from '../utils/asyncHelper';

interface ProductsViewProps {
  products: Product[];
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

const CATEGORIES = [
  { value: 'all', label: '전체' },
  { value: 'bakery', label: '베이커리' },
  { value: 'coffee', label: '커피' },
  { value: 'beverage', label: '음료' },
  { value: 'food', label: '선물세트' },
  { value: 'etc', label: '기타' }
];

const ProductsView: React.FC<ProductsViewProps> = ({ products, onRefresh, showToast }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortField, setSortField] = useState<'name' | 'price' | 'stock'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // CRUD Modals States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  // Form State
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState(0);
  const [category, setCategory] = useState<'coffee' | 'beverage' | 'bakery' | 'food' | 'etc'>('bakery');
  const [emoji, setEmoji] = useState('🍞');
  const [imageUrl, setImageUrl] = useState('');
  const [stock, setStock] = useState(50);
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [barcode, setBarcode] = useState('');
  const [isActive, setIsActive] = useState(true);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);

  // Sorting and Filtering products
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (p.barcode && p.barcode.includes(searchTerm));
    const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    let valA: any = a[sortField] || '';
    let valB: any = b[sortField] || '';
    
    if (sortField === 'price' || sortField === 'stock') {
      valA = Number(valA);
      valB = Number(valB);
    }
    
    if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const toggleSort = (field: 'name' | 'price' | 'stock') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const resetForm = () => {
    setId('');
    setName('');
    setPrice(0);
    setCategory('bakery');
    setEmoji('🍞');
    setImageUrl('');
    setStock(50);
    setLowStockThreshold(5);
    setBarcode('');
    setIsActive(true);
    setImageFile(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImageFile(e.target.files[0]);
    }
  };

  // Convert image file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  // Upload image logic (tries Supabase Storage first, falls back to Base64)
  const processImageUpload = async (file: File): Promise<string> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
      const filePath = `${fileName}`;

      // Try uploading to 'product-images' bucket
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, file);

      if (uploadError) {
        console.warn('Supabase storage upload failed, falling back to base64 encoding:', uploadError);
        return await fileToBase64(file);
      }

      const { data } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (err) {
      console.warn('Storage process error, using base64 fallback:', err);
      return await fileToBase64(file);
    }
  };

  // Create Product
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim()) {
      alert('상품코드를 입력해 주세요.');
      return;
    }
    if (!name.trim()) {
      alert('상품명을 입력해 주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      let finalImgUrl = imageUrl;
      if (imageFile) {
        finalImgUrl = await processImageUpload(imageFile);
      }

      const { error } = await supabase
        .from('products')
        .insert({
          id: id.trim(),
          name: name.trim(),
          price,
          category,
          emoji,
          image_url: finalImgUrl,
          stock,
          low_stock_threshold: lowStockThreshold,
          is_active: isActive,
          barcode: barcode.trim() || null
        });

      if (error) throw error;

      showToast(`📦 새 상품 '${name}' 등록 완료!`);
      setIsAddModalOpen(false);
      resetForm();
      onRefresh();
    } catch (err: any) {
      console.error(err);
      alert(`⚠️ 상품 추가 실패: ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Modal and fill form
  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setId(product.id);
    setName(product.name);
    setPrice(product.price);
    setCategory(product.category);
    setEmoji(product.emoji || '🍞');
    setImageUrl(product.imageUrl || '');
    setStock(product.stock || 0);
    setLowStockThreshold(product.lowStockThreshold || 5);
    setBarcode(product.barcode || '');
    setIsActive(product.isActive !== false);
    setImageFile(null);
    setIsEditModalOpen(true);
  };

  // Save Edit
  const handleEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    setIsSubmitting(true);
    try {
      let finalImgUrl = imageUrl;
      if (imageFile) {
        finalImgUrl = await processImageUpload(imageFile);
      }

      const { error } = await supabase
        .from('products')
        .update({
          name: name.trim(),
          price,
          category,
          emoji,
          image_url: finalImgUrl,
          stock,
          low_stock_threshold: lowStockThreshold,
          is_active: isActive,
          barcode: barcode.trim() || null
        })
        .eq('id', editingProduct.id);

      if (error) throw error;

      showToast(`✏️ 상품 '${name}' 정보 수정 완료!`);
      setIsEditModalOpen(false);
      setEditingProduct(null);
      resetForm();
      onRefresh();
    } catch (err: any) {
      console.error(err);
      alert(`⚠️ 상품 수정 실패: ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Product
  const handleDeleteProduct = async (productId: string, productName: string) => {
    if (!window.confirm(`⚠️ 상품 '${productName}'을(를) 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);

      if (error) throw error;

      showToast(`🗑️ 상품 '${productName}' 삭제 완료`);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      alert(`⚠️ 상품 삭제 실패 (주문 내역에 참조되어 있을 수 있습니다): ${err.message || err}`);
    }
  };

  // Quick Stock Adjustment
  // Quick Stock Adjustment (via secure RPC with audit logging)
  const adjustStock = async (product: Product, amount: number) => {
    const reason = window.prompt(`[${product.name}] 재고를 ${amount > 0 ? '+' : ''}${amount}개 조정하는 사유를 입력해 주세요 (필수):`);
    if (reason === null) return;
    if (!reason.trim()) {
      alert('재고 수동 조정 시에는 조치 사유를 반드시 기입해 주셔야 적용됩니다.');
      return;
    }

    try {
      const { error } = (await withTimeout(
        supabase.rpc('adjust_product_stock', {
          p_product_id: product.id,
          p_amount: amount,
          p_reason: reason.trim()
        }),
        8000
      )) as any;

      if (error) throw error;
      
      auditLog({
        action: 'INVENTORY_ADJUSTMENT',
        result: 'SUCCESS',
        context: { productId: product.id, productName: product.name, amount, reason: reason.trim() }
      });

      showToast(`📦 ${product.name} 재고 변경 완료: ${amount > 0 ? '+' : ''}${amount}개`);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      
      auditLog({
        action: 'API_FAILURE',
        result: 'FAIL',
        context: { actionType: 'INVENTORY_ADJUSTMENT', productId: product.id, error: err.message || String(err) }
      });

      showToast(`⚠️ 재고 변경 실패: ${err.message || err}`);
    }
  };

  return (
    <div className="bo-page">
      
      {/* Toolbar */}
      <div className="bo-toolbar">
        <div className="search-container">
          <div className="search-icon-wrapper">
            <Search size={18} />
          </div>
          <input
            type="text"
            className="search-input"
            placeholder="상품명, 상품코드, 바코드 검색"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button 
          type="button" 
          className="btn btn-primary" 
          style={{ width: 'auto', padding: '0 20px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '10px', height: '44px' }}
          onClick={() => { resetForm(); setIsAddModalOpen(true); }}
        >
          <Plus size={16} />
          <span>상품 등록</span>
        </button>
      </div>

      {/* Category Tabs */}
      <div className="category-chips" style={{ flexShrink: 0 }}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            type="button"
            className={`category-chip ${selectedCategory === cat.value ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat.value)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Products Table */}
      <div className="bo-table-wrap">
        <table className="bo-table">
          <thead>
            <tr>
              <th>이미지</th>
              <th className="sortable" onClick={() => toggleSort('name')}>
                상품명/코드 <ArrowUpDown size={11} style={{ marginLeft: '3px', display: 'inline', opacity: 0.5 }} />
              </th>
              <th className="sortable text-right" onClick={() => toggleSort('price')}>
                가격 <ArrowUpDown size={11} style={{ marginLeft: '3px', display: 'inline', opacity: 0.5 }} />
              </th>
              <th>카테고리</th>
              <th className="sortable text-center" onClick={() => toggleSort('stock')}>
                재고 현황 <ArrowUpDown size={11} style={{ marginLeft: '3px', display: 'inline', opacity: 0.5 }} />
              </th>
              <th>바코드</th>
              <th className="text-center">상태</th>
              <th className="text-center">관리</th>
            </tr>
          </thead>
          <tbody>
            {sortedProducts.length === 0 ? (
              <tr>
                <td colSpan={8} className="cell-empty">
                  검색 결과에 맞는 상품이 존재하지 않습니다.
                </td>
              </tr>
            ) : (
              sortedProducts.map((p) => {
                const isLowStock = (p.stock || 0) <= (p.lowStockThreshold || 5);
                const isSoldOut = (p.stock || 0) === 0;

                return (
                  <tr key={p.id} className={p.isActive === false ? 'inactive' : ''}>
                    {/* Image / Emoji */}
                    <td>
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="bo-product-thumb" />
                      ) : (
                        <div className="bo-product-emoji">{p.emoji || '🍞'}</div>
                      )}
                    </td>

                    {/* Name & ID */}
                    <td>
                      <div className="cell-bold">{p.name}</div>
                      <div className="cell-muted">ID: {p.id}</div>
                    </td>

                    {/* Price */}
                    <td className="text-right cell-bold">{p.price.toLocaleString()}원</td>

                    {/* Category */}
                    <td>
                      <span className="bo-badge bo-badge--neutral">
                        {CATEGORIES.find(c => c.value === p.category)?.label || p.category}
                      </span>
                    </td>

                    {/* Stock controls */}
                    <td>
                      <div className="bo-stock-group">
                        <button type="button" className="bo-stock-btn" onClick={() => adjustStock(p, -1)}>−</button>
                        <span className={`bo-stock-value ${isSoldOut ? 'sold-out' : isLowStock ? 'low-stock' : ''}`}>
                          {p.stock}개
                          {isLowStock && <AlertTriangle size={12} />}
                        </span>
                        <button type="button" className="bo-stock-btn" onClick={() => adjustStock(p, 1)}>+</button>
                        <button type="button" className="bo-stock-btn bo-stock-btn--accent" onClick={() => adjustStock(p, 10)}>+10</button>
                      </div>
                    </td>

                    {/* Barcode */}
                    <td style={{ color: 'var(--text-muted)' }}>{p.barcode || '—'}</td>

                    {/* Active/Inactive */}
                    <td className="text-center">
                      {p.isActive !== false ? (
                        <span className="bo-badge bo-badge--success bo-badge--pill">판매중</span>
                      ) : (
                        <span className="bo-badge bo-badge--neutral bo-badge--pill">숨김</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="text-center">
                      <div className="bo-action-group">
                        <button type="button" className="bo-action-btn" onClick={() => openEditModal(p)} title="수정">
                          <Edit2 size={14} />
                        </button>
                        <button type="button" className="bo-action-btn bo-action-btn--danger" onClick={() => handleDeleteProduct(p.id, p.name)} title="삭제">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ADD MODAL */}
      {isAddModalOpen && (
        <div className="bo-modal-overlay">
          <form className="bo-modal" onSubmit={handleAddProduct}>
            <div className="bo-modal-header">
              <div className="bo-modal-title">신규 상품 등록</div>
              <div className="bo-modal-desc">새로운 상품의 기본 정보를 입력해 주세요.</div>
            </div>

            <div className="bo-modal-body">
              <div className="bo-form-grid bo-form-grid--2">
                <div className="bo-field">
                  <label className="bo-label">상품코드 (필수, 고유값)</label>
                  <input type="text" className="bo-input" value={id} onChange={e => setId(e.target.value)} placeholder="예: P-0041" required />
                </div>
                <div className="bo-field">
                  <label className="bo-label">상품명 (필수)</label>
                  <input type="text" className="bo-input" value={name} onChange={e => setName(e.target.value)} placeholder="예: 생크림 소보로" required />
                </div>
              </div>

              <div className="bo-form-grid bo-form-grid--2-wide">
                <div className="bo-field">
                  <label className="bo-label">카테고리</label>
                  <select className="bo-select" value={category} onChange={e => setCategory(e.target.value as any)}>
                    <option value="bakery">베이커리</option>
                    <option value="coffee">커피</option>
                    <option value="beverage">음료</option>
                    <option value="food">선물세트</option>
                    <option value="etc">기타</option>
                  </select>
                </div>
                <div className="bo-field">
                  <label className="bo-label">가격 (원 단위)</label>
                  <input type="number" className="bo-input" value={price} onChange={e => setPrice(Math.max(0, Number(e.target.value)))} min="0" required />
                </div>
              </div>

              <div className="bo-form-grid bo-form-grid--2">
                <div className="bo-field">
                  <label className="bo-label">초기 재고 (개)</label>
                  <input type="number" className="bo-input" value={stock} onChange={e => setStock(Math.max(0, Number(e.target.value)))} min="0" required />
                </div>
                <div className="bo-field">
                  <label className="bo-label">재고 경고 임계값 (개)</label>
                  <input type="number" className="bo-input" value={lowStockThreshold} onChange={e => setLowStockThreshold(Math.max(0, Number(e.target.value)))} min="0" required />
                </div>
              </div>

              <div className="bo-form-grid bo-form-grid--3-wide">
                <div className="bo-field">
                  <label className="bo-label">기본 이모지</label>
                  <input type="text" className="bo-input bo-input--center" value={emoji} onChange={e => setEmoji(e.target.value)} placeholder="🍞" />
                </div>
                <div className="bo-field">
                  <label className="bo-label">바코드 번호 (스캐너 연동)</label>
                  <input type="text" className="bo-input" value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="선택 사항" />
                </div>
              </div>

              <div className="bo-field" style={{ marginBottom: '16px' }}>
                <label className="bo-label">상품 이미지 등록 (파일 업로드 또는 직접 URL 기입)</label>
                <div className="bo-form-row">
                  <input type="text" className="bo-input" style={{ flex: 1 }} value={imageUrl} onChange={e => { setImageUrl(e.target.value); setImageFile(null); }} placeholder="https://..." />
                  <label className="bo-file-btn">
                    <Upload size={14} />
                    파일 선택
                    <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
                  </label>
                </div>
                {imageFile && (
                  <div className="bo-file-hint">
                    <Check size={12} /> 업로드 대기 중: {imageFile.name}
                  </div>
                )}
              </div>

              <div className="bo-checkbox-row">
                <input type="checkbox" id="isActive" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                <label htmlFor="isActive">포스기 화면에 노출 (판매 가능 상태)</label>
              </div>
            </div>

            <div className="bo-modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setIsAddModalOpen(false)} disabled={isSubmitting}>취소</button>
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? '상품 등록 중...' : '등록 완료'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* EDIT MODAL */}
      {isEditModalOpen && editingProduct && (
        <div className="bo-modal-overlay">
          <form className="bo-modal" onSubmit={handleEditProduct}>
            <div className="bo-modal-header">
              <div className="bo-modal-title">상품 정보 수정</div>
              <div className="bo-modal-desc">{editingProduct.name}의 정보를 수정합니다.</div>
            </div>

            <div className="bo-modal-body">
              <div className="bo-form-grid bo-form-grid--2">
                <div className="bo-field">
                  <label className="bo-label">상품코드 (수정 불가)</label>
                  <input type="text" className="bo-input" value={id} disabled />
                </div>
                <div className="bo-field">
                  <label className="bo-label">상품명</label>
                  <input type="text" className="bo-input" value={name} onChange={e => setName(e.target.value)} placeholder="예: 생크림 소보로" required />
                </div>
              </div>

              <div className="bo-form-grid bo-form-grid--2-wide">
                <div className="bo-field">
                  <label className="bo-label">카테고리</label>
                  <select className="bo-select" value={category} onChange={e => setCategory(e.target.value as any)}>
                    <option value="bakery">베이커리</option>
                    <option value="coffee">커피</option>
                    <option value="beverage">음료</option>
                    <option value="food">선물세트</option>
                    <option value="etc">기타</option>
                  </select>
                </div>
                <div className="bo-field">
                  <label className="bo-label">가격 (원 단위)</label>
                  <input type="number" className="bo-input" value={price} onChange={e => setPrice(Math.max(0, Number(e.target.value)))} min="0" required />
                </div>
              </div>

              <div className="bo-form-grid bo-form-grid--2">
                <div className="bo-field">
                  <label className="bo-label">현재 재고 (개)</label>
                  <input type="number" className="bo-input" value={stock} onChange={e => setStock(Math.max(0, Number(e.target.value)))} min="0" required />
                </div>
                <div className="bo-field">
                  <label className="bo-label">재고 경고 임계값 (개)</label>
                  <input type="number" className="bo-input" value={lowStockThreshold} onChange={e => setLowStockThreshold(Math.max(0, Number(e.target.value)))} min="0" required />
                </div>
              </div>

              <div className="bo-form-grid bo-form-grid--3-wide">
                <div className="bo-field">
                  <label className="bo-label">기본 이모지</label>
                  <input type="text" className="bo-input bo-input--center" value={emoji} onChange={e => setEmoji(e.target.value)} placeholder="🍞" />
                </div>
                <div className="bo-field">
                  <label className="bo-label">바코드 번호</label>
                  <input type="text" className="bo-input" value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="바코드 입력" />
                </div>
              </div>

              <div className="bo-field" style={{ marginBottom: '16px' }}>
                <label className="bo-label">상품 이미지 수정 (파일 업로드 또는 직접 URL 기입)</label>
                <div className="bo-form-row">
                  <input type="text" className="bo-input" style={{ flex: 1 }} value={imageUrl} onChange={e => { setImageUrl(e.target.value); setImageFile(null); }} placeholder="https://..." />
                  <label className="bo-file-btn">
                    <Upload size={14} />
                    파일 선택
                    <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
                  </label>
                </div>
                {imageFile && (
                  <div className="bo-file-hint">
                    <Check size={12} /> 업로드 대기 중: {imageFile.name}
                  </div>
                )}
              </div>

              <div className="bo-checkbox-row">
                <input type="checkbox" id="editIsActive" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                <label htmlFor="editIsActive">포스기 화면에 노출 (판매 가능 상태)</label>
              </div>
            </div>

            <div className="bo-modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => { setIsEditModalOpen(false); setEditingProduct(null); }} disabled={isSubmitting}>취소</button>
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? '저장 중...' : '저장 완료'}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};

export default ProductsView;

