import React, { useState } from 'react';
import { Product } from '../types';
import { supabase } from '../supabase';
import { Plus, Edit2, Trash2, Search, ArrowUpDown, Upload, Check, AlertTriangle } from 'lucide-react';

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
  const adjustStock = async (product: Product, amount: number) => {
    const newStock = Math.max(0, (product.stock || 0) + amount);
    try {
      const { error } = await supabase
        .from('products')
        .update({ stock: newStock })
        .eq('id', product.id);

      if (error) throw error;
      showToast(`📦 ${product.name} 재고 변경 완료: ${newStock}개`);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      showToast(`⚠️ 재고 변경 실패: ${err.message || err}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflow: 'hidden', padding: '10px' }}>
      
      {/* Search and Action Row */}
      <div className="search-row" style={{ flexShrink: 0 }}>
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
          style={{ width: 'auto', padding: '0 16px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '10px', height: '48px' }}
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

      {/* Products Table Area */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13.5px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 10 }}>
              <th style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>이미지</th>
              <th 
                style={{ padding: '14px 16px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                onClick={() => toggleSort('name')}
              >
                상품명/코드 <ArrowUpDown size={12} style={{ marginLeft: '4px', display: 'inline' }} />
              </th>
              <th 
                style={{ padding: '14px 16px', color: 'var(--text-secondary)', cursor: 'pointer', textAlign: 'right' }}
                onClick={() => toggleSort('price')}
              >
                가격 <ArrowUpDown size={12} style={{ marginLeft: '4px', display: 'inline' }} />
              </th>
              <th style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>카테고리</th>
              <th 
                style={{ padding: '14px 16px', color: 'var(--text-secondary)', cursor: 'pointer', textAlign: 'center' }}
                onClick={() => toggleSort('stock')}
              >
                재고 현황 <ArrowUpDown size={12} style={{ marginLeft: '4px', display: 'inline' }} />
              </th>
              <th style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>바코드</th>
              <th style={{ padding: '14px 16px', color: 'var(--text-secondary)', textAlign: 'center' }}>상태</th>
              <th style={{ padding: '14px 16px', color: 'var(--text-secondary)', textAlign: 'center' }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {sortedProducts.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  검색 결과에 맞는 상품이 존재하지 않습니다.
                </td>
              </tr>
            ) : (
              sortedProducts.map((p) => {
                const isLowStock = (p.stock || 0) <= (p.lowStockThreshold || 5);
                const isSoldOut = (p.stock || 0) === 0;

                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)', background: p.isActive === false ? '#f1f5f9' : '#ffffff' }}>
                    {/* Image / Emoji */}
                    <td style={{ padding: '12px 16px' }}>
                      {p.imageUrl ? (
                        <img 
                          src={p.imageUrl} 
                          alt={p.name} 
                          style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-color)' }} 
                        />
                      ) : (
                        <div style={{ width: '40px', height: '40px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', borderRadius: '6px' }}>
                          {p.emoji || '🍞'}
                        </div>
                      )}
                    </td>

                    {/* Name & ID */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: '700', color: p.isActive === false ? 'var(--text-muted)' : 'var(--text-primary)' }}>{p.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ID: {p.id}</div>
                    </td>

                    {/* Price */}
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'bold' }}>
                      {p.price.toLocaleString()}원
                    </td>

                    {/* Category */}
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '4px', background: '#f1f5f9', fontWeight: '600' }}>
                        {CATEGORIES.find(c => c.value === p.category)?.label || p.category}
                      </span>
                    </td>

                    {/* Stock level controller */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <button 
                          type="button" 
                          style={{ border: '1px solid var(--border-color)', background: 'transparent', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                          onClick={() => adjustStock(p, -1)}
                        >-</button>
                        
                        <span style={{ 
                          fontWeight: '800',
                          color: isSoldOut ? '#ef4444' : isLowStock ? '#f59e0b' : 'var(--text-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          {p.stock}개
                          {isLowStock && <AlertTriangle size={12} color={isSoldOut ? '#ef4444' : '#f59e0b'} />}
                        </span>
                        
                        <button 
                          type="button" 
                          style={{ border: '1px solid var(--border-color)', background: 'transparent', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                          onClick={() => adjustStock(p, 1)}
                        >+</button>
                        <button 
                          type="button" 
                          style={{ border: '1px solid var(--border-color)', background: 'var(--border-color)', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', color: 'var(--text-secondary)' }}
                          onClick={() => adjustStock(p, 10)}
                        >+10</button>
                      </div>
                    </td>

                    {/* Barcode */}
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                      {p.barcode || '-'}
                    </td>

                    {/* Active/Inactive */}
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {p.isActive !== false ? (
                        <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '20px', background: 'var(--success-glow)', color: 'var(--success)', fontWeight: '700' }}>판매중</span>
                      ) : (
                        <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '20px', background: '#e2e8f0', color: '#64748b', fontWeight: '700' }}>숨김</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button 
                          type="button" 
                          className="btn btn-secondary" 
                          style={{ padding: '6px', minWidth: 'auto', borderRadius: '6px' }}
                          onClick={() => openEditModal(p)}
                          title="수정"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button 
                          type="button" 
                          className="btn btn-secondary" 
                          style={{ padding: '6px', minWidth: 'auto', borderRadius: '6px', color: '#ef4444' }}
                          onClick={() => handleDeleteProduct(p.id, p.name)}
                          title="삭제"
                        >
                          <Trash2 size={13} />
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
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <form className="modal-content" style={{ maxWidth: '500px' }} onSubmit={handleAddProduct}>
            <div className="modal-body">
              <div className="modal-title">📦 신규 상품 등록</div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>상품코드 (필수, 고유값)</label>
                  <input type="text" value={id} onChange={e => setId(e.target.value)} placeholder="예: P-0041" style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }} required />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>상품명 (필수)</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="예: 생크림 소보로" style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }} required />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '12px', marginBottom: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>카테고리</label>
                  <select 
                    value={category} 
                    onChange={e => setCategory(e.target.value as any)} 
                    style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px', background: '#fff' }}
                  >
                    <option value="bakery">베이커리</option>
                    <option value="coffee">커피</option>
                    <option value="beverage">음료</option>
                    <option value="food">선물세트</option>
                    <option value="etc">기타</option>
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>가격 (원 단위)</label>
                  <input type="number" value={price} onChange={e => setPrice(Math.max(0, Number(e.target.value)))} style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }} min="0" required />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>초기 재고 (개)</label>
                  <input type="number" value={stock} onChange={e => setStock(Math.max(0, Number(e.target.value)))} style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }} min="0" required />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>재고 경고 임계값 (개)</label>
                  <input type="number" value={lowStockThreshold} onChange={e => setLowStockThreshold(Math.max(0, Number(e.target.value)))} style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }} min="0" required />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>기본 이모지</label>
                  <input type="text" value={emoji} onChange={e => setEmoji(e.target.value)} placeholder="🍞" style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px', textAlign: 'center' }} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>바코드 번호 (스캐너 연동)</label>
                  <input type="text" value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="선택 사항" style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                </div>
              </div>

              {/* Image upload selector */}
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label>상품 이미지 등록 (파일 업로드 또는 직접 URL 기입)</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="text" value={imageUrl} onChange={e => { setImageUrl(e.target.value); setImageFile(null); }} placeholder="https://..." style={{ flex: 1, padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                  <label style={{ padding: '11px 14px', border: '1px solid var(--border-color)', borderRadius: '8px', background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 'bold' }}>
                    <Upload size={14} />
                    파일 선택
                    <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
                  </label>
                </div>
                {imageFile && (
                  <div style={{ fontSize: '12px', color: 'var(--primary)', marginTop: '4px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Check size={12} /> 업로드 대기 중: {imageFile.name}
                  </div>
                )}
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <input type="checkbox" id="isActive" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                <label htmlFor="isActive" style={{ margin: 0, fontWeight: '700', cursor: 'pointer' }}>포스기 화면에 노출 (판매 가능 상태)</label>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsAddModalOpen(false)} disabled={isSubmitting}>취소</button>
              <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={isSubmitting}>
                {isSubmitting ? '상품 등록 중...' : '등록 완료'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* EDIT MODAL */}
      {isEditModalOpen && editingProduct && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <form className="modal-content" style={{ maxWidth: '500px' }} onSubmit={handleEditProduct}>
            <div className="modal-body">
              <div className="modal-title">✏️ 상품 정보 수정</div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>상품코드 (수정 불가)</label>
                  <input type="text" value={id} disabled style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px', background: '#f1f5f9', color: '#64748b' }} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>상품명</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="예: 생크림 소보로" style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }} required />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '12px', marginBottom: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>카테고리</label>
                  <select 
                    value={category} 
                    onChange={e => setCategory(e.target.value as any)} 
                    style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px', background: '#fff' }}
                  >
                    <option value="bakery">베이커리</option>
                    <option value="coffee">커피</option>
                    <option value="beverage">음료</option>
                    <option value="food">선물세트</option>
                    <option value="etc">기타</option>
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>가격 (원 단위)</label>
                  <input type="number" value={price} onChange={e => setPrice(Math.max(0, Number(e.target.value)))} style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }} min="0" required />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>현재 재고 (개)</label>
                  <input type="number" value={stock} onChange={e => setStock(Math.max(0, Number(e.target.value)))} style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }} min="0" required />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>재고 경고 임계값 (개)</label>
                  <input type="number" value={lowStockThreshold} onChange={e => setLowStockThreshold(Math.max(0, Number(e.target.value)))} style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }} min="0" required />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>기본 이모지</label>
                  <input type="text" value={emoji} onChange={e => setEmoji(e.target.value)} placeholder="🍞" style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px', textAlign: 'center' }} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>바코드 번호</label>
                  <input type="text" value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="바코드 입력" style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label>상품 이미지 수정 (파일 업로드 또는 직접 URL 기입)</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="text" value={imageUrl} onChange={e => { setImageUrl(e.target.value); setImageFile(null); }} placeholder="https://..." style={{ flex: 1, padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                  <label style={{ padding: '11px 14px', border: '1px solid var(--border-color)', borderRadius: '8px', background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 'bold' }}>
                    <Upload size={14} />
                    파일 선택
                    <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
                  </label>
                </div>
                {imageFile && (
                  <div style={{ fontSize: '12px', color: 'var(--primary)', marginTop: '4px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Check size={12} /> 업로드 대기 중: {imageFile.name}
                  </div>
                )}
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <input type="checkbox" id="editIsActive" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                <label htmlFor="editIsActive" style={{ margin: 0, fontWeight: '700', cursor: 'pointer' }}>포스기 화면에 노출 (판매 가능 상태)</label>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setIsEditModalOpen(false); setEditingProduct(null); }} disabled={isSubmitting}>취소</button>
              <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={isSubmitting}>
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
