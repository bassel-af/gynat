'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api/client';
import styles from './ShareTokenList.module.css';

interface ShareToken {
  id: string;
  rootPersonName: string;
  depthLimit: number | null;
  activePointerCount: number;
  isPublic: boolean;
  targetWorkspaceName: string | null;
  isRevoked: boolean;
  expiresAt: string;
  createdAt: string;
}

interface ShareTokenListProps {
  workspaceId: string;
  refreshTrigger?: number;
}

type TokenState = 'active' | 'disabled' | 'revoked';

function getTokenState(token: ShareToken): TokenState {
  if (!token.isRevoked) return 'active';
  if (token.activePointerCount > 0) return 'disabled';
  return 'revoked';
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

function formatDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

function formatDepth(depthLimit: number | null): string {
  if (depthLimit === null) return 'بدون حد';
  return `${depthLimit} أجيال`;
}

function formatPointerCount(count: number): string {
  if (count === 0) return 'لا توجد فروع مرتبطة';
  return `${count} فرع مرتبط`;
}

export function ShareTokenList({ workspaceId, refreshTrigger }: ShareTokenListProps) {
  const [tokens, setTokens] = useState<ShareToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmingRevokeId, setConfirmingRevokeId] = useState<string | null>(null);
  const [confirmingDisableId, setConfirmingDisableId] = useState<string | null>(null);

  const fetchTokens = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/share-tokens`);
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'فشل في تحميل رموز المشاركة');
      }
      const body = await res.json();
      setTokens(body.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens, refreshTrigger]);

  const handleDisable = useCallback(async (tokenId: string) => {
    setActionId(tokenId);
    setError('');
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/share-tokens/${tokenId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRevoked: true }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'فشل في تعطيل الرمز');
      }
      await fetchTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setActionId(null);
    }
  }, [workspaceId, fetchTokens]);

  const handleReEnable = useCallback(async (tokenId: string) => {
    setActionId(tokenId);
    setError('');
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/share-tokens/${tokenId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRevoked: false }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'فشل في إعادة تفعيل الرمز');
      }
      await fetchTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setActionId(null);
    }
  }, [workspaceId, fetchTokens]);

  const handleRevoke = useCallback(async (tokenId: string) => {
    setActionId(tokenId);
    setConfirmingRevokeId(null);
    setError('');
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/share-tokens/${tokenId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'فشل في إلغاء الرمز');
      }
      await fetchTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setActionId(null);
    }
  }, [workspaceId, fetchTokens]);

  if (loading) {
    return <div className={styles.empty}>جاري التحميل...</div>;
  }

  if (tokens.length === 0 && !error) {
    return <div className={styles.empty}>لا توجد رموز مشاركة</div>;
  }

  return (
    <div className={styles.container}>
      {error && <div className={styles.error}>{error}</div>}
      {tokens.map((token) => {
        const state = getTokenState(token);
        const expired = isExpired(token.expiresAt);
        const isActing = actionId === token.id;

        const cardClass = [
          styles.tokenCard,
          state === 'disabled' ? styles.tokenDisabled : '',
          state === 'revoked' ? styles.tokenRevoked : '',
        ].filter(Boolean).join(' ');

        return (
          <div key={token.id} className={cardClass}>
            <div className={styles.tokenInfo}>
              <div className={styles.tokenRow1}>
                <span className={styles.tokenRootName}>
                  {token.rootPersonName}
                </span>
                <div className={styles.tokenRow1End}>
                  {state === 'revoked' ? (
                    <span className={styles.revokedBadge}>ملغى</span>
                  ) : state === 'disabled' ? (
                    <span className={styles.disabledBadge}>معطّل</span>
                  ) : expired ? (
                    <span className={styles.expiredBadge}>منتهي الصلاحية</span>
                  ) : null}
                </div>
              </div>
              <div className={styles.tokenMeta}>
                <span>العمق: {formatDepth(token.depthLimit)}</span>
                <span>{formatPointerCount(token.activePointerCount)}</span>
                <span>
                  {token.isPublic
                    ? 'عام'
                    : token.targetWorkspaceName
                      ? `مساحة: ${token.targetWorkspaceName}`
                      : 'عام'}
                </span>
              </div>
              <div className={styles.tokenDates}>
                <span>
                  {expired
                    ? `توقف قبول مساحات جديدة منذ: ${formatDate(token.expiresAt)}`
                    : `آخر موعد للربط: ${formatDate(token.expiresAt)}`}
                </span>
                <span>أُنشئ: {formatDate(token.createdAt)}</span>
              </div>

              {/* Action buttons */}
              {state === 'active' && (
                confirmingDisableId === token.id ? (
                  <div className={styles.disableConfirm}>
                    <span className={styles.disableConfirmText}>
                      تعطيل رمز المشاركة؟ لن تتمكن أي مساحة بعد الآن من استخدام هذا الرمز للربط. الفروع المرتبطة حالياً لن تتأثر وستبقى متزامنة.
                    </span>
                    <div className={styles.confirmButtons}>
                      <button
                        className={styles.disableConfirmButton}
                        onClick={async () => {
                          await handleDisable(token.id);
                          setConfirmingDisableId(null);
                        }}
                        disabled={isActing}
                      >
                        {isActing ? '...' : 'نعم، عطّل الرمز'}
                      </button>
                      <button
                        className={styles.cancelButton}
                        onClick={() => setConfirmingDisableId(null)}
                        disabled={isActing}
                      >
                        تراجع
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.tokenActions}>
                    <button
                      className={styles.disableButton}
                      onClick={() => setConfirmingDisableId(token.id)}
                      disabled={isActing}
                    >
                      تعطيل رمز المشاركة
                    </button>
                    <button
                      className={styles.revokeButtonText}
                      onClick={() => setConfirmingRevokeId(token.id)}
                      disabled={isActing}
                    >
                      إلغاء الربط
                    </button>
                  </div>
                )
              )}

              {state === 'disabled' && (
                <div className={styles.tokenActions}>
                  <button
                    className={styles.reEnableButton}
                    onClick={() => handleReEnable(token.id)}
                    disabled={isActing}
                  >
                    {isActing ? '...' : 'إعادة تفعيل'}
                  </button>
                  <button
                    className={styles.revokeButtonText}
                    onClick={() => setConfirmingRevokeId(token.id)}
                    disabled={isActing}
                  >
                    إلغاء الربط
                  </button>
                </div>
              )}

              {/* Revoke confirmation */}
              {confirmingRevokeId === token.id && (
                <div className={styles.revokeConfirm}>
                  <span className={styles.confirmText}>
                    {token.activePointerCount > 0
                      ? `تحذير: هذا الإجراء لا يمكن التراجع عنه. سيتم نسخ جميع الفروع المرتبطة (${token.activePointerCount} فرع) إلى المساحات المستهدفة وفصلها نهائياً عن شجرتك.`
                      : 'لا توجد فروع مرتبطة حالياً. سيتم إلغاء الرمز فقط.'}
                  </span>
                  <div className={styles.confirmButtons}>
                    <button
                      className={styles.confirmYes}
                      onClick={() => handleRevoke(token.id)}
                      disabled={isActing}
                    >
                      {isActing ? '...' : 'نعم، ألغِ الربط نهائياً'}
                    </button>
                    <button
                      className={styles.confirmNo}
                      onClick={() => setConfirmingRevokeId(null)}
                    >
                      تراجع
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
