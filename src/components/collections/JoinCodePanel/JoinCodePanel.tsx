'use client';

import { useState } from 'react';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { apiFetch } from '@/lib/api/client';
import styles from './JoinCodePanel.module.css';

interface JoinCodePanelProps {
  workspaceId: string;
  isAdmin: boolean;
}

/**
 * Screen 8 — surface the workspace join-code (§6, §2.8). Members-as-viewers is
 * how private collections are shared, so onboarding a class needs a code an
 * admin generates and a place a user enters one.
 *
 * Deliberately distinct from the existing "share a tree branch" code: this code
 * brings a PERSON into the whole workspace as a member/viewer, not a tree
 * fragment into another tree.
 *
 * Wired to the existing endpoints: POST /api/workspaces/[id]/invitations/code
 * to generate, POST /api/workspaces/join to redeem.
 */
export function JoinCodePanel({ workspaceId, isAdmin }: JoinCodePanelProps) {
  // Admin side — generated on demand (each generate issues a fresh code).
  const [code, setCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [copied, setCopied] = useState(false);

  // Join side
  const [entered, setEntered] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [joinState, setJoinState] = useState<'idle' | 'joined'>('idle');

  async function generate() {
    setGenerating(true);
    setGenError('');
    setCopied(false);
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/invitations/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGenError(body?.error || 'تعذّر إنشاء الرمز');
        return;
      }
      setCode(body.data?.code ?? null);
    } catch {
      setGenError('تعذّر إنشاء الرمز');
    } finally {
      setGenerating(false);
    }
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!entered.trim()) return;
    setJoining(true);
    setJoinError('');
    try {
      const res = await apiFetch(`/api/workspaces/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: entered.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setJoinError(body?.error || 'تعذّر الانضمام بهذا الرمز');
        return;
      }
      setJoinState('joined');
    } catch {
      setJoinError('تعذّر الانضمام بهذا الرمز');
    } finally {
      setJoining(false);
    }
  }

  return (
    <CollapsibleSection title="رمز الانضمام">
      <div className={styles.wrap}>
        <p className={styles.intro}>
          يمنح هذا الرمز صاحبه عضويةً في المساحة فيستطيع مشاهدة المجموعات الخاصة.
          مناسبٌ لإضافة صفٍّ من الطلاب دفعةً واحدة.
        </p>
        <p className={styles.distinct}>
          <iconify-icon
            icon="material-symbols:info-outline"
            width="15"
            height="15"
            aria-hidden="true"
          />
          هذا غير «رمز مشاركة الفرع» الذي يُدرج فرعاً من الشجرة في عائلةٍ أخرى.
        </p>

        {/* Admin: the code to share */}
        {isAdmin && (
          <div className={styles.block}>
            <span className={styles.blockLabel}>رمز المساحة</span>
            {code ? (
              <div className={styles.codeRow}>
                <code className={styles.code} dir="ltr">
                  {code}
                </code>
                <div className={styles.codeActions}>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    onClick={copyCode}
                  >
                    {copied ? 'تم النسخ ✓' : 'نسخ'}
                  </button>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    onClick={generate}
                    disabled={generating}
                    title="إنشاء رمزٍ جديد يُبطل القديم"
                  >
                    {generating ? '...' : 'تجديد'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={generate}
                disabled={generating}
              >
                {generating ? '...' : 'إنشاء رمز انضمام'}
              </button>
            )}
            {genError && <p className={styles.errorText}>{genError}</p>}
            <p className={styles.hint}>
              عند التجديد يتوقف الرمز القديم عن العمل.
            </p>
          </div>
        )}

        {/* Everyone: enter a code to join another workspace */}
        <div className={styles.block}>
          <span className={styles.blockLabel}>الانضمام برمز</span>
          {joinState === 'joined' ? (
            <div className={styles.joined} role="status">
              <iconify-icon
                icon="material-symbols:check-circle-rounded"
                width="20"
                height="20"
                aria-hidden="true"
              />
              تمّ الانضمام إلى المساحة. أصبحت تستطيع مشاهدة مجموعاتها.
            </div>
          ) : (
            <form className={styles.joinForm} onSubmit={join}>
              <input
                type="text"
                className={styles.joinInput}
                placeholder="مثال: TARITH-7K4XA3B2"
                value={entered}
                onChange={(e) => setEntered(e.target.value)}
                dir="ltr"
              />
              <button
                type="submit"
                className={styles.primaryBtn}
                disabled={!entered.trim() || joining}
              >
                {joining ? '...' : 'انضمام'}
              </button>
            </form>
          )}
          {joinError && <p className={styles.errorText}>{joinError}</p>}
        </div>
      </div>
    </CollapsibleSection>
  );
}
