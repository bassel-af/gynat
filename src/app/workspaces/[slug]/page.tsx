'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/client';
import { getFamilyBySlug } from '@/config/families';
import styles from './workspace.module.css';

interface Workspace {
  id: string;
  slug: string;
  nameAr: string;
  description: string | null;
  memberCount: number;
  currentUserRole: string;
  currentUserId: string;
}

interface Member {
  userId: string;
  workspaceId: string;
  role: string;
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
}

function roleLabel(role: string): string {
  switch (role) {
    case 'workspace_admin':
      return 'مدير';
    case 'workspace_member':
      return 'عضو';
    default:
      return role;
  }
}

export default function WorkspaceDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Invite modal state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  // Edit workspace modal state
  const [showEdit, setShowEdit] = useState(false);
  const [editNameAr, setEditNameAr] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  // Member management state
  const [confirmRemove, setConfirmRemove] = useState<Member | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [togglingRoleId, setTogglingRoleId] = useState<string | null>(null);
  const [memberActionError, setMemberActionError] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        const wsRes = await apiFetch(`/api/workspaces/by-slug/${slug}`);
        if (!wsRes.ok) {
          const body = await wsRes.json();
          setError(body.error || 'فشل في تحميل مساحة العمل');
          setLoading(false);
          return;
        }
        const wsBody = await wsRes.json();
        const ws = wsBody.data as Workspace;
        setWorkspace(ws);

        const membersRes = await apiFetch(`/api/workspaces/${ws.id}/members`);
        if (membersRes.ok) {
          const membersBody = await membersRes.json();
          setMembers(membersBody.data);
        }
      } catch {
        setError('فشل في تحميل مساحة العمل');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [slug]);

  const isAdmin = workspace?.currentUserRole === 'workspace_admin';
  const familyConfig = getFamilyBySlug(slug);

  function openEdit() {
    if (!workspace) return;
    setEditNameAr(workspace.nameAr);
    setEditDescription(workspace.description ?? '');
    setEditError('');
    setShowEdit(true);
  }

  async function handleEditWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    setEditError('');
    setEditLoading(true);

    try {
      const res = await apiFetch(`/api/workspaces/${workspace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nameAr: editNameAr,
          description: editDescription || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        setEditError(body.error || 'فشل في حفظ التغييرات');
        setEditLoading(false);
        return;
      }

      const body = await res.json();
      setWorkspace((prev) =>
        prev
          ? {
              ...prev,
              nameAr: body.data.nameAr,
              description: body.data.description,
            }
          : prev,
      );
      setShowEdit(false);
    } catch {
      setEditError('فشل في حفظ التغييرات');
    } finally {
      setEditLoading(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    setInviteError('');
    setInviteSuccess('');
    setInviteLoading(true);

    try {
      const res = await apiFetch(`/api/workspaces/${workspace.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail }),
      });

      if (!res.ok) {
        const body = await res.json();
        setInviteError(body.error || 'فشل في إرسال الدعوة');
        setInviteLoading(false);
        return;
      }

      setInviteSuccess(`تم إرسال دعوة إلى ${inviteEmail}`);
      setInviteEmail('');
    } catch {
      setInviteError('فشل في إرسال الدعوة');
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleRemoveMember() {
    if (!workspace || !confirmRemove) return;
    setRemovingId(confirmRemove.userId);
    setMemberActionError('');

    try {
      const res = await apiFetch(
        `/api/workspaces/${workspace.id}/members/${confirmRemove.userId}`,
        { method: 'DELETE' },
      );

      if (!res.ok) {
        const body = await res.json();
        setMemberActionError(body.error || 'فشل في إزالة العضو');
        setRemovingId(null);
        setConfirmRemove(null);
        return;
      }

      setMembers((prev) => prev.filter((m) => m.userId !== confirmRemove.userId));
      setWorkspace((prev) =>
        prev ? { ...prev, memberCount: prev.memberCount - 1 } : prev,
      );
    } catch {
      setMemberActionError('فشل في إزالة العضو');
    } finally {
      setRemovingId(null);
      setConfirmRemove(null);
    }
  }

  async function handleToggleRole(member: Member) {
    if (!workspace) return;
    setTogglingRoleId(member.userId);
    setMemberActionError('');

    const newRole =
      member.role === 'workspace_admin' ? 'workspace_member' : 'workspace_admin';

    try {
      const res = await apiFetch(
        `/api/workspaces/${workspace.id}/members/${member.userId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: newRole }),
        },
      );

      if (!res.ok) {
        const body = await res.json();
        setMemberActionError(body.error || 'فشل في تغيير الدور');
        setTogglingRoleId(null);
        return;
      }

      setMembers((prev) =>
        prev.map((m) => (m.userId === member.userId ? { ...m, role: newRole } : m)),
      );
    } catch {
      setMemberActionError('فشل في تغيير الدور');
    } finally {
      setTogglingRoleId(null);
    }
  }

  if (loading) {
    return (
      <main className={styles.container}>
        <div className={styles.loading}>جاري التحميل...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className={styles.container}>
        <header className={styles.header}>
          <Link href="/dashboard" className={styles.backLink}>
            &larr; العودة للوحة التحكم
          </Link>
        </header>
        <div className={styles.content}>
          <div className={styles.error}>{error}</div>
        </div>
      </main>
    );
  }

  if (!workspace) return null;

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>{workspace.nameAr}</h1>
        <div className={styles.headerRight}>
          <Link href="/dashboard" className={styles.backLink}>
            &larr; لوحة التحكم
          </Link>
        </div>
      </header>

      <div className={styles.content}>
        {/* Workspace Info */}
        <div className={styles.infoCard}>
          <div className={styles.infoCardHeader}>
            <h2 className={styles.workspaceName}>{workspace.nameAr}</h2>
            {isAdmin && (
              <button onClick={openEdit} className={styles.editButton}>
                تعديل
              </button>
            )}
          </div>
          {workspace.description && (
            <p className={styles.workspaceDescription}>{workspace.description}</p>
          )}
          <div className={styles.workspaceStats}>
            <span className={styles.stat}>
              الأعضاء: <span className={styles.statValue}>{workspace.memberCount}</span>
            </span>
            <span className={styles.stat}>
              المعرف: <span className={styles.statValue} dir="ltr">{workspace.slug}</span>
            </span>
          </div>
        </div>

        {/* Tree link */}
        {familyConfig ? (
          <Link href={`/${familyConfig.slug}`} className={styles.treeLink}>
            <span className={styles.treeLinkIcon}>🌳</span>
            عرض شجرة العائلة
          </Link>
        ) : (
          <div className={styles.placeholder}>
            شجرة العائلة غير متوفرة بعد لهذه المساحة
          </div>
        )}

        {/* Members section */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>الأعضاء</h3>
            {isAdmin && (
              <button
                onClick={() => setShowInvite(true)}
                className={styles.inviteButton}
              >
                دعوة عضو
              </button>
            )}
          </div>

          {memberActionError && (
            <div className={styles.error} style={{ marginBottom: 'var(--space-3)' }}>
              {memberActionError}
            </div>
          )}

          <div className={styles.membersList}>
            {members.map((m) => (
              <div key={m.userId} className={styles.memberCard}>
                <div className={styles.memberInfo}>
                  <span className={styles.memberName}>
                    {m.user.displayName || m.user.email}
                  </span>
                  <span className={styles.memberEmail}>{m.user.email}</span>
                </div>
                <div className={styles.memberRight}>
                  <span className={styles.memberRole}>{roleLabel(m.role)}</span>
                  {isAdmin && (
                    <div className={styles.memberActions}>
                      <button
                        className={styles.roleToggleButton}
                        onClick={() => handleToggleRole(m)}
                        disabled={togglingRoleId === m.userId}
                        title={
                          m.role === 'workspace_admin'
                            ? 'تخفيض إلى عضو'
                            : 'ترقية إلى مدير'
                        }
                      >
                        {togglingRoleId === m.userId
                          ? '...'
                          : m.role === 'workspace_admin'
                          ? 'تخفيض'
                          : 'ترقية'}
                      </button>
                      <button
                        className={styles.removeButton}
                        onClick={() => setConfirmRemove(m)}
                        disabled={removingId === m.userId}
                        title="إزالة من المساحة"
                      >
                        إزالة
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className={styles.modalOverlay} onClick={() => setShowInvite(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>دعوة عضو جديد</h3>
            <form onSubmit={handleInvite} className={styles.modalForm}>
              {inviteError && <div className={styles.error}>{inviteError}</div>}
              {inviteSuccess && (
                <div className={styles.successMessage}>{inviteSuccess}</div>
              )}
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className={styles.modalInput}
                placeholder="البريد الإلكتروني"
                dir="ltr"
                required
              />
              <div className={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className={styles.modalCancel}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className={styles.modalSubmit}
                  disabled={inviteLoading}
                >
                  {inviteLoading ? 'جاري الإرسال...' : 'إرسال الدعوة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Workspace Modal */}
      {showEdit && (
        <div className={styles.modalOverlay} onClick={() => setShowEdit(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>تعديل المساحة</h3>
            <form onSubmit={handleEditWorkspace} className={styles.modalForm}>
              {editError && <div className={styles.error}>{editError}</div>}
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>اسم العائلة</label>
                <input
                  type="text"
                  value={editNameAr}
                  onChange={(e) => setEditNameAr(e.target.value)}
                  className={styles.modalInput}
                  required
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>الوصف (اختياري)</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className={styles.modalTextarea}
                  rows={3}
                  placeholder="وصف مختصر للمساحة"
                />
              </div>
              <div className={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setShowEdit(false)}
                  className={styles.modalCancel}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className={styles.modalSubmit}
                  disabled={editLoading}
                >
                  {editLoading ? 'جاري الحفظ...' : 'حفظ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Remove Modal */}
      {confirmRemove && (
        <div
          className={styles.modalOverlay}
          onClick={() => setConfirmRemove(null)}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>تأكيد الإزالة</h3>
            <p className={styles.confirmText}>
              هل أنت متأكد من إزالة{' '}
              <strong>
                {confirmRemove.user.displayName || confirmRemove.user.email}
              </strong>{' '}
              من المساحة؟
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={() => setConfirmRemove(null)}
                className={styles.modalCancel}
              >
                إلغاء
              </button>
              <button
                onClick={handleRemoveMember}
                className={styles.modalDanger}
                disabled={removingId !== null}
              >
                {removingId !== null ? 'جاري الإزالة...' : 'إزالة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
