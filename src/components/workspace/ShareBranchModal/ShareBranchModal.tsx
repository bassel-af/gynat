'use client';

import { useState, useCallback, useMemo, type FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { apiFetch } from '@/lib/api/client';
import type { GedcomData, Individual } from '@/lib/gedcom/types';
import { getDisplayName, getDisplayNameWithNasab } from '@/lib/gedcom';
import { matchesSearch, searchRelevance } from '@/lib/utils/search';
import styles from './ShareBranchModal.module.css';

interface ShareBranchModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  treeData: GedcomData | null;
  onTokenCreated?: () => void;
}

export function ShareBranchModal({
  isOpen,
  onClose,
  workspaceId,
  treeData,
  onTokenCreated,
}: ShareBranchModalProps) {
  // Person search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  // Token config
  const [depthLimit, setDepthLimit] = useState<string>('');
  const [includeGrafts, setIncludeGrafts] = useState(false);
  const [targetWorkspaceSlug, setTargetWorkspaceSlug] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedToken, setGeneratedToken] = useState('');
  const [copied, setCopied] = useState(false);

  // Filter people by search
  const searchResults = useMemo(() => {
    if (!treeData || !searchQuery.trim()) return [];
    const results: Individual[] = [];
    for (const person of Object.values(treeData.individuals)) {
      if (person.isPrivate) continue;
      if (matchesSearch(getDisplayName(person), searchQuery)) {
        results.push(person);
      }
    }
    results.sort((a, b) =>
      searchRelevance(getDisplayName(a), searchQuery) -
      searchRelevance(getDisplayName(b), searchQuery),
    );
    return results.slice(0, 20);
  }, [treeData, searchQuery]);

  const selectedPerson = selectedPersonId && treeData
    ? treeData.individuals[selectedPersonId]
    : null;

  const handleGenerate = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPersonId) return;

    setLoading(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        rootIndividualId: selectedPersonId,
        includeGrafts,
      };

      const parsed = parseInt(depthLimit);
      if (!isNaN(parsed) && parsed > 0) {
        body.depthLimit = parsed;
      }

      if (!isPublic && targetWorkspaceSlug.trim()) {
        body.targetWorkspaceSlug = targetWorkspaceSlug.trim();
      }

      const res = await apiFetch(`/api/workspaces/${workspaceId}/share-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const resBody = await res.json();
        throw new Error(resBody.error || 'فشل في إنشاء رمز المشاركة');
      }

      const resBody = await res.json();
      setGeneratedToken(resBody.data.token);
      onTokenCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [selectedPersonId, depthLimit, includeGrafts, isPublic, targetWorkspaceSlug, workspaceId, onTokenCreated]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generatedToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  }, [generatedToken]);

  const handleClose = useCallback(() => {
    setSearchQuery('');
    setSelectedPersonId(null);
    setDepthLimit('');
    setIncludeGrafts(false);
    setTargetWorkspaceSlug('');
    setIsPublic(true);
    setError('');
    setGeneratedToken('');
    setCopied(false);
    onClose();
  }, [onClose]);

  // If token was generated, show it
  if (generatedToken) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title="رمز المشاركة"
        className={styles.modal}
        actions={
          <Button variant="primary" size="md" onClick={handleClose}>
            تم
          </Button>
        }
      >
        <div className={styles.form}>
          <div className={styles.tokenDisplay}>
            <span className={styles.tokenLabel}>رمز المشاركة (يظهر مرة واحدة فقط)</span>
            <div className={styles.tokenValue}>
              <span className={styles.tokenText}>{generatedToken}</span>
              <button className={styles.tokenCopyButton} onClick={handleCopy} type="button">
                {copied ? 'تم النسخ' : 'نسخ'}
              </button>
            </div>
            <span className={styles.tokenWarning}>
              احفظ هذا الرمز الآن — لا يمكن عرضه مرة أخرى
            </span>
          </div>
        </div>
      </Modal>
    );
  }

  const actions = (
    <>
      <Button variant="ghost" size="md" onClick={handleClose} disabled={loading}>
        إلغاء
      </Button>
      <Button
        variant="primary"
        size="md"
        type="submit"
        form="share-branch-form"
        loading={loading}
        disabled={loading || !selectedPersonId}
      >
        إنشاء الرمز
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="إنشاء رمز مشاركة"
      actions={actions}
      className={styles.modal}
    >
      <form id="share-branch-form" className={styles.form} onSubmit={handleGenerate}>
        {error && <div className={styles.error}>{error}</div>}

        {/* Person search */}
        <div className={styles.fieldGroup}>
          <span className={styles.label}>اختر الشخص الجذر</span>
          {selectedPerson ? (
            <div className={styles.selectedPerson}>
              <span>{getDisplayNameWithNasab(treeData!, selectedPerson, 2)}</span>
              <button
                type="button"
                className={styles.selectedPersonClear}
                onClick={() => { setSelectedPersonId(null); setSearchQuery(''); }}
              >
                تغيير
              </button>
            </div>
          ) : (
            <>
              <Input
                id="personSearch"
                label=""
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث بالاسم..."
                autoFocus
              />
              {searchResults.length > 0 && (
                <div className={styles.searchResults}>
                  {searchResults.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      className={styles.searchResultItem}
                      onClick={() => {
                        setSelectedPersonId(person.id);
                        setSearchQuery('');
                      }}
                    >
                      {getDisplayNameWithNasab(treeData!, person, 2)}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Depth limit */}
        <div className={styles.fieldGroup}>
          <label htmlFor="depthLimit" className={styles.label}>
            حد العمق (اتركه فارغا للامحدود)
          </label>
          <input
            id="depthLimit"
            type="number"
            min="1"
            max="50"
            className={styles.numberInput}
            value={depthLimit}
            onChange={(e) => setDepthLimit(e.target.value)}
            placeholder="بدون حد"
          />
        </div>

        {/* Include grafts */}
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={includeGrafts}
            onChange={(e) => setIncludeGrafts(e.target.checked)}
            className={styles.checkbox}
          />
          تضمين عائلات الأزواج
        </label>

        {/* Target workspace */}
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className={styles.checkbox}
          />
          عام (أي مساحة يمكنها استخدام الرمز)
        </label>

        {!isPublic && (
          <div className={styles.fieldGroup}>
            <label htmlFor="targetSlug" className={styles.label}>
              معرف المساحة المستهدفة
            </label>
            <input
              id="targetSlug"
              type="text"
              className={styles.textInput}
              value={targetWorkspaceSlug}
              onChange={(e) => setTargetWorkspaceSlug(e.target.value)}
              placeholder="مثال: sharbek"
              dir="ltr"
            />
          </div>
        )}
      </form>
    </Modal>
  );
}
