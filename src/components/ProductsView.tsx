import React, { useState } from 'react';
import { Product } from '../types';
import { supabase } from '../supabase';
import { Plus, Edit2, Trash2, Search, Upload } from 'lucide-react';
import { mapCategoryToDB } from '../types';
import Button from './ui/Button';
import Modal from './ui/Modal';
import { Field, Input, Select } from './ui/Field';
import { showAlert, showConfirm } from './ui/dialogs';

interface ProductsViewProps {
  products: Product[];
  onRefresh: () => void;
  showToast: (msg: string) => void;
  role: 'Owner' | 'Manager' | 'Staff';
}

const CATEGORIES = [
  { value: 'all', label: '전체' },
  { value: 'bakery', label: '베이커리' },
  { value: 'food', label: '선물세트' },
  { value: 'etc', label: '기타' }
];

const ProductsView: React.FC<ProductsViewProps> = ({ products, onRefresh, showToast, role }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortOption, setSortOption] = useState<'code' | 'name' | 'category' | 'price_asc' | 'price_desc'>('code');

  // CRUD Modals States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  // Form State
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState(0);
  const [category, setCategory] = useState<'bakery' | 'food' | 'etc'>('bakery');
  const [emoji, setEmoji] = useState('🍞');
  const [imageUrl, setImageUrl] = useState('');
  const [barcode, setBarcode] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const getSafeImageUrl = (value: string): string => {
    const raw = value.trim();
    if (!raw) return '';

    // Reject characters that can break attribute/HTML context.
    if (/[<>"'`\s\u0000-\u001F\u007F]/.test(raw)) return '';

    // Allow only safe root-relative URLs used by local assets.
    if (raw.startsWith('/')) {
      return /^\/[A-Za-z0-9\-._~:/?#[\]@!$&()*+,;=%]*$/.test(raw) ? raw : '';
    }

    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
      return parsed.toString();
    } catch {
      return '';
    }
  };

  // Sorting and Filtering products
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (p.barcode && p.barcode.includes(searchTerm));
    const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (sortOption === 'code') {
      const getCodeNumber = (code: string) => {
        const matches = code.match(/\d+/);
        return matches ? parseInt(matches[0], 10) : 0;
      };
      const numA = getCodeNumber(a.id);
      const numB = getCodeNumber(b.id);
      if (numA !== numB) {
        return numA - numB;
      }
      return a.id.localeCompare(b.id);
    }

    if (sortOption === 'name') {
      return a.name.localeCompare(b.name, 'ko');
    }

    if (sortOption === 'category') {
      const getCategoryLabel = (cat: string) => {
        return CATEGORIES.find(c => c.value === cat)?.label || cat;
      };
      const labelA = getCategoryLabel(a.category);
      const labelB = getCategoryLabel(b.category);
      return labelA.localeCompare(labelB, 'ko');
    }

    if (sortOption === 'price_asc') {
      return a.price - b.price;
    }

    if (sortOption === 'price_desc') {
      return b.price - a.price;
    }

    return 0;
  });

  const resetForm = () => {
    setId('');
    setName('');
    setPrice(0);
    setCategory('bakery');
    setEmoji('🍞');
    setImageUrl('');
    setBarcode('');
    setIsActive(true);
    setImageFile(null);
    setIsAdvancedOpen(false);
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
      showAlert('상품코드를 입력해 주세요.', { title: '입력 확인' });
      return;
    }
    if (!name.trim()) {
      showAlert('상품명을 입력해 주세요.', { title: '입력 확인' });
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
          category: mapCategoryToDB(category),
          emoji,
          image_url: finalImgUrl,
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
      showAlert(`⚠️ 상품 추가 실패: ${err.message || err}`, { title: '상품 등록 실패' });
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
    setBarcode(product.barcode || '');
    setIsActive(product.isActive !== false);
    setImageFile(null);
    setIsAdvancedOpen(false);
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
          category: mapCategoryToDB(category),
          emoji,
          image_url: finalImgUrl,
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
      showAlert(`⚠️ 상품 수정 실패: ${err.message || err}`, { title: '상품 수정 실패' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Product
  const handleDeleteProduct = async (productId: string, productName: string) => {
    const confirmed = await showConfirm(
      `상품 '${productName}'을(를) 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`,
      { title: '⚠️ 상품 영구 삭제', danger: true, confirmText: '영구 삭제' }
    );
    if (!confirmed) return;

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
      showAlert(`⚠️ 상품 삭제 실패 (주문 내역에 참조되어 있을 수 있습니다): ${err.message || err}`, { title: '상품 삭제 실패' });
    }
  };

  // Shared form body for the Add/Edit modals (identical fields, small per-mode differences)
  const renderProductFormBody = (mode: 'add' | 'edit') => {
    const canUpload = mode === 'add' ? role === 'Owner' : role !== 'Manager';
    const checkboxId = mode === 'add' ? 'isActive' : 'editIsActive';
    const safeImageUrl = getSafeImageUrl(imageUrl);

    return (
      <>
        {/* Primary Section */}
        <div style={{ display: 'flex', gap: '24px', marginBottom: '20px' }}>
          {/* Left Side: Product Image/Emoji Preview */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '120px', gap: '10px', flexShrink: 0 }}>
            <label className="bo-label">상품 이미지</label>
            <div style={{
              width: '120px',
              height: '120px',
              borderRadius: '16px',
              background: 'var(--bg-primary)',
              border: '1.5px dashed var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              position: 'relative'
            }}>
              {imageFile ? (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', padding: '4px' }}>
                  업로드 대기<br/>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{imageFile.name.slice(0, 12)}...</span>
                </div>
              ) : safeImageUrl ? (
                <img src={safeImageUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ fontSize: '48px' }}>{emoji || '🍞'}</div>
              )}
            </div>
            {canUpload && (
              <label className="bo-file-btn" style={{ width: '100%', justifyContent: 'center', cursor: 'pointer', height: '36px', borderRadius: '8px', fontSize: '12.5px' }}>
                <Upload size={13} />
                이미지 업로드
                <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
              </label>
            )}
          </div>

          {/* Right Side: Primary Info Fields */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <Field label="상품명">
              <Input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="예: 생크림 소보로" required style={{ height: '40px' }} />
            </Field>

            <div style={{ display: 'flex', gap: '12px' }}>
              <Field label="카테고리" style={{ flex: 1 }}>
                <Select value={category} onChange={e => setCategory(e.target.value as any)} disabled={role === 'Manager'} style={{ height: '40px' }}>
                  <option value="bakery">베이커리</option>
                  <option value="food">선물세트</option>
                  <option value="etc">기타</option>
                </Select>
              </Field>
              <Field label="가격 (원)" style={{ flex: 1 }}>
                <Input type="number" value={price} onChange={e => setPrice(Math.max(0, Number(e.target.value)))} disabled={role === 'Manager'} min="0" required style={{ height: '40px' }} />
              </Field>
            </div>

            <div className="bo-checkbox-row" style={{ marginTop: '4px' }}>
              <input type="checkbox" id={checkboxId} checked={isActive} onChange={e => setIsActive(e.target.checked)} />
              <label htmlFor={checkboxId} style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>포스기 화면에 노출 (판매 가능 상태)</label>
            </div>
          </div>
        </div>

        {/* Collapsible Advanced Settings */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px', marginTop: '16px' }}>
          <button
            type="button"
            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
            style={{
              width: '100%',
              background: 'none',
              border: 'none',
              padding: '8px 0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)' }}>고급 설정</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {isAdvancedOpen ? '접기 ▲' : '더보기 ▼'}
            </span>
          </button>

          {isAdvancedOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px', padding: '12px', background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              {/* First row: Product ID & Barcode */}
              <div style={{ display: 'flex', gap: '12px' }}>
                {mode === 'add' ? (
                  <Field label="상품코드 (필수, 고유값)" style={{ flex: 1 }}>
                    <Input type="text" value={id} onChange={e => setId(e.target.value)} placeholder="예: P-0041" required style={{ height: '36px', fontSize: '13px' }} />
                  </Field>
                ) : (
                  <Field label={<span style={{ color: 'var(--text-muted)' }}>상품코드 (수정 불가)</span>} style={{ flex: 1 }}>
                    <Input type="text" value={id} disabled style={{ height: '36px', fontSize: '13px' }} />
                  </Field>
                )}
                <Field label="바코드 번호" style={{ flex: 1 }}>
                  <Input type="text" value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="바코드 입력" style={{ height: '36px', fontSize: '13px' }} />
                </Field>
              </div>

              {/* Second row: Emoji & Image URL */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <Field label="이모지" style={{ width: '80px', flexShrink: 0 }}>
                  <Input type="text" className="bo-input--center" value={emoji} onChange={e => setEmoji(e.target.value)} disabled={role === 'Manager'} placeholder="🍞" style={{ height: '36px', fontSize: '13px' }} />
                </Field>
                <Field label="이미지 URL" style={{ flex: 1 }}>
                  <Input type="text" value={imageUrl} onChange={e => { setImageUrl(e.target.value); setImageFile(null); }} disabled={role === 'Manager'} placeholder="https://..." style={{ height: '36px', fontSize: '13px' }} />
                </Field>
              </div>
            </div>
          )}
        </div>
      </>
    );
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
        <div style={{ width: '135px', flexShrink: 0 }}>
          <Select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as any)}
            style={{ height: '46px', fontSize: '13.5px', padding: '0 10px' }}
          >
            <option value="code">코드순</option>
            <option value="name">상품명순</option>
            <option value="category">카테고리순</option>
            <option value="price_asc">가격 낮은순</option>
            <option value="price_desc">가격 높은순</option>
          </Select>
        </div>

        {role !== 'Staff' && (
          <Button
            variant="primary"
            size="md"
            style={{ height: '46px' }}
            onClick={() => { resetForm(); setIsAddModalOpen(true); }}
          >
            <Plus size={16} />
            <span>상품 등록</span>
          </Button>
        )}
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
              <th>상품명/코드</th>
              <th className="text-right">가격</th>
              <th>카테고리</th>
              <th className="text-center">상태</th>
              {role !== 'Staff' && <th className="text-center">관리</th>}
            </tr>
          </thead>
          <tbody>
            {sortedProducts.length === 0 ? (
              <tr>
                <td colSpan={6} className="cell-empty">
                  검색 결과에 맞는 상품이 존재하지 않습니다.
                </td>
              </tr>
            ) : (
              sortedProducts.map((p) => {
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

                    {/* Active/Inactive */}
                    <td className="text-center">
                      {p.isActive !== false ? (
                        <span className="bo-badge bo-badge--success bo-badge--pill">판매중</span>
                      ) : (
                        <span className="bo-badge bo-badge--neutral bo-badge--pill">숨김</span>
                      )}
                    </td>

                    {/* Actions */}
                    {role !== 'Staff' && (
                      <td className="text-center">
                        <div className="bo-action-group">
                          <button type="button" className="bo-action-btn" onClick={() => openEditModal(p)} title="수정">
                            <Edit2 size={14} />
                          </button>
                          {role === 'Owner' && (
                            <button type="button" className="bo-action-btn bo-action-btn--danger" onClick={() => handleDeleteProduct(p.id, p.name)} title="삭제">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ADD MODAL */}
      {isAddModalOpen && (
        <Modal
          as="form"
          maxWidth={560}
          title="신규 상품 등록"
          description="새로운 상품의 기본 정보를 입력해 주세요."
          onClose={() => !isSubmitting && setIsAddModalOpen(false)}
          onSubmit={handleAddProduct}
          footer={
            <>
              <Button variant="secondary" onClick={() => setIsAddModalOpen(false)} disabled={isSubmitting}>취소</Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? '상품 등록 중...' : '등록 완료'}
              </Button>
            </>
          }
        >
          {renderProductFormBody('add')}
        </Modal>
      )}

      {/* EDIT MODAL */}
      {isEditModalOpen && editingProduct && (
        <Modal
          as="form"
          maxWidth={560}
          title="상품 정보 수정"
          description={`${editingProduct.name}의 정보를 수정합니다.`}
          onClose={() => !isSubmitting && (setIsEditModalOpen(false), setEditingProduct(null))}
          onSubmit={handleEditProduct}
          footer={
            <>
              <Button variant="secondary" onClick={() => { setIsEditModalOpen(false); setEditingProduct(null); }} disabled={isSubmitting}>취소</Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? '저장 중...' : '저장 완료'}
              </Button>
            </>
          }
        >
          {renderProductFormBody('edit')}
        </Modal>
      )}

    </div>
  );
};

export default ProductsView;
