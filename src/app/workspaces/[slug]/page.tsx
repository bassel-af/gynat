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
  const [isAdmin, setIsAdmin] = useState(false);

  // Invite modal state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch workspace by slug
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

        // Fetch members
        const membersRes = await apiFetch(`/api/workspaces/${ws.id}/members`);
        if (membersRes.ok) {
          const membersBody = await membersRes.json();
          setMembers(membersBody.data);

          // Check if current user is admin (we can infer from the membership list
          // or from the by-slug response — for now check members)
          // We'll determine admin status from the membership data
        }
      } catch {
        setError('فشل في تحميل مساحة العمل');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [slug]);

  // Determine admin status when members load
  useEffect(() => {
    if (members.length > 0 && workspace) {
      // We need to check the current user's role. Since we fetched successfully,
      // we can check if any member with admin role matches. But we don't have the
      // current user ID here easily. Let's add a simpler approach:
      // The by-slug endpoint already verified membership. We can check if we're admin
      // by looking at the workspace creator or finding ourselves in the members list.
      // For now, we'll rely on the membership role from members list.
      // A pragmatic approach: try an admin-only action — or add role info to by-slug response.
      // For now, let's just show the invite button to all members and let the API enforce.
      // We'll mark admin if we see ourselves as workspace_admin in the members list.
      // But we don't have our own userId easily. Let's just show invite for all and let API guard.
      setIsAdmin(true); // Simplification: show invite button, API will reject if not admin
    }
  }, [members, workspace]);

  const familyConfig = getFamilyBySlug(slug);

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
        if (res.status === 403) {
          setIsAdmin(false);
        }
        setInviteError(body.error || 'فشل في إرسال الدعوة');
        setInviteLoading(false);
        return;
      }

      setInviteSuccess(`تم إرسال دعوة إلى ${inviteEmail}`);
      setInviteEmail('');
      setInviteLoading(false);
    } catch {
      setInviteError('فشل في إرسال الدعوة');
      setInviteLoading(false);
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
          <h2 className={styles.workspaceName}>{workspace.nameAr}</h2>
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
          <div className={styles.membersList}>
            {members.map((m) => (
              <div key={m.userId} className={styles.memberCard}>
                <div className={styles.memberInfo}>
                  <span className={styles.memberName}>
                    {m.user.displayName || m.user.email}
                  </span>
                  <span className={styles.memberEmail}>{m.user.email}</span>
                </div>
                <span className={styles.memberRole}>{roleLabel(m.role)}</span>
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
                <div style={{ color: '#68d391', fontSize: 'var(--font-size-sm)' }}>
                  {inviteSuccess}
                </div>
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
    </main>
  );
}
