'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/client';
import { roleLabel } from '@/lib/workspace/labels';
import { Spinner } from '@/components/ui/Spinner';
import { UserNav } from '@/components/ui/UserNav';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import {
  segmentFromFlags,
  flagsFromSegment,
  type ExportVisibilitySegment,
} from '@/lib/workspace/tree-export-visibility';
import { ShareBranchModal } from '@/components/workspace/ShareBranchModal/ShareBranchModal';
import { ShareTokenList } from '@/components/workspace/ShareTokenList/ShareTokenList';
import { IncomingPointerList } from '@/components/workspace/IncomingPointerList/IncomingPointerList';
import type { GedcomData } from '@/lib/gedcom/types';
import styles from './workspace.module.css';

const TREE_EXPORT_SEGMENTS: readonly { value: ExportVisibilitySegment; label: string }[] = [
  { value: 'off', label: 'معطّل' },
  { value: 'admins-only', label: 'المديرون فقط' },
  { value: 'all-members', label: 'جميع الأعضاء' },
];

interface Workspace {
  id: string;
  slug: string;
  nameAr: string;
  description: string | null;
  memberCount: number;
  currentUserRole: string;
  currentUserId: string;
  enableUmmWalad?: boolean;
  enableRadaa?: boolean;
  enableKunya?: boolean;
  enableAuditLog?: boolean;
  enableVersionControl?: boolean;
  enableTreeExport?: boolean;
  allowMemberExport?: boolean;
  hideBirthDateForFemale?: boolean;
  hideBirthDateForMale?: boolean;
  defaultNewPersonDeceased?: boolean;
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

  // Feature toggle loading state
  const [togglingFeature, setTogglingFeature] = useState<string | null>(null);

  // Advanced options disclosure (collapsed by default, no persistence)
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Branch sharing state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTokenRefresh, setShareTokenRefresh] = useState(0);
  const [treeData, setTreeData] = useState<GedcomData | null>(null);

  const handleShareTokenCreated = useCallback(() => {
    setShareTokenRefresh((prev) => prev + 1);
  }, []);

  // Lazy-load tree data when share modal opens (tree context is not available on settings page)
  const handleOpenShareModal = useCallback(async () => {
    setShowShareModal(true);
    if (treeData || !workspace) return;
    try {
      const res = await apiFetch(`/api/workspaces/${workspace.id}/tree`);
      if (res.ok) {
        const body = await res.json();
        setTreeData(body.data);
      }
    } catch {
      // Tree data fetch failed — modal still works but person search will be empty
    }
  }, [treeData, workspace]);

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

  async function handleToggleFeature(
    featureKey: 'enableUmmWalad' | 'enableRadaa' | 'enableKunya' | 'enableAuditLog' | 'enableVersionControl' | 'hideBirthDateForFemale' | 'hideBirthDateForMale' | 'defaultNewPersonDeceased',
    newVal: boolean,
  ) {
    if (!workspace) return;
    setTogglingFeature(featureKey);
    try {
      // Parent → child dependency: disabling audit log also clears version control
      const body: Record<string, boolean> =
        featureKey === 'enableAuditLog' && !newVal
          ? { enableAuditLog: false, enableVersionControl: false }
          : { [featureKey]: newVal };

      const res = await apiFetch(`/api/workspaces/${workspace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        if (featureKey === 'enableAuditLog' && !newVal) {
          setWorkspace((prev) =>
            prev ? { ...prev, enableAuditLog: false, enableVersionControl: false } : prev,
          );
        } else {
          setWorkspace((prev) =>
            prev ? { ...prev, [featureKey]: newVal } : prev,
          );
        }
      }
    } catch {
      // silently fail
    } finally {
      setTogglingFeature(null);
    }
  }

  async function handleTreeExportVisibilityChange(segment: ExportVisibilitySegment) {
    if (!workspace) return;
    const body = flagsFromSegment(segment);
    // Reuse `togglingFeature` spinner slot — the SegmentedControl is keyed off
    // 'enableTreeExport' since both fields move as one UI unit.
    setTogglingFeature('enableTreeExport');
    try {
      const res = await apiFetch(`/api/workspaces/${workspace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setWorkspace((prev) => (prev ? { ...prev, ...body } : prev));
      }
    } catch {
      // silently fail
    } finally {
      setTogglingFeature(null);
    }
  }

  if (loading) {
    return (
      <main className={styles.container}>
        <div className={styles.loading}>
          <Spinner size="lg" label="جاري التحميل..." />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className={styles.container}>
        <header className={styles.header}>
          <Link href="/workspaces" className={styles.backLink}>
            &rarr; العودة للمساحات
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
          <UserNav />
          <Link href="/workspaces" className={styles.backLink}>
            &rarr; مساحات العمل
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
        <Link href={`/workspaces/${slug}/tree`} className={styles.treeLink}>
          <span className={styles.treeLinkIcon}>
            <iconify-icon icon="material-symbols:account-tree" width="24" height="24" />
          </span>
          عرض شجرة العائلة
        </Link>

        {/* Feature Toggles */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>الميزات</h3>
          </div>

          <div className={styles.featureList}>
            {/* Rada'a */}
            <div className={styles.featureCard}>
              <div className={styles.featureContent}>
                <div className={styles.featureNameRow}>
                  <span className={styles.featureName}>الرضاعة</span>
                  {(workspace.enableRadaa ?? false) && (
                    <span className={styles.featureBadge}>مفعّل</span>
                  )}
                </div>
                <p className={styles.featureDescription}>
                  توثيق علاقات الرضاعة بين الأفراد — الأمّ والأب والأخوة
                  من الرضاعة
                </p>
                <a
                  href="/islamic-gedcom#radaa"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.featureLearnMore}
                >
                  تعرّف على المزيد
                </a>
              </div>
              <ToggleSwitch
                checked={workspace.enableRadaa ?? false}
                onChange={(val) => handleToggleFeature('enableRadaa', val)}
                disabled={!isAdmin}
                loading={togglingFeature === 'enableRadaa'}
              />
            </div>

            {/* Kunya */}
            <div className={styles.featureCard}>
              <div className={styles.featureContent}>
                <div className={styles.featureNameRow}>
                  <span className={styles.featureName}>الكنية</span>
                  {(workspace.enableKunya ?? false) && (
                    <span className={styles.featureBadge}>مفعّل</span>
                  )}
                </div>
                <p className={styles.featureDescription}>
                  تسجيل الكنية (مثل أبو أحمد أو أم خالد)
                </p>
              </div>
              <ToggleSwitch
                checked={workspace.enableKunya ?? false}
                onChange={(val) => handleToggleFeature('enableKunya', val)}
                disabled={!isAdmin}
                loading={togglingFeature === 'enableKunya'}
              />
            </div>

            {/* Tree export visibility — three-way segmented control */}
            <div className={styles.featureCard}>
              <div className={styles.featureContent}>
                <div className={styles.featureNameRow}>
                  <span id="toggle-tree-export-label" className={styles.featureName}>
                    تصدير الشجرة
                  </span>
                </div>
                <p id="toggle-tree-export-desc" className={styles.featureDescription}>
                  تحديد من يمكنه تصدير شجرة العائلة كملف GEDCOM.
                </p>
              </div>
              <SegmentedControl
                value={segmentFromFlags({
                  enableTreeExport: workspace.enableTreeExport,
                  allowMemberExport: workspace.allowMemberExport,
                })}
                options={TREE_EXPORT_SEGMENTS}
                onChange={(val) => handleTreeExportVisibilityChange(val)}
                disabled={!isAdmin}
                loading={togglingFeature === 'enableTreeExport'}
                aria-labelledby="toggle-tree-export-label"
                aria-describedby="toggle-tree-export-desc"
              />
            </div>

            {/* Audit Log */}
            <div className={styles.featureCard}>
              <div className={styles.featureContent}>
                <div className={styles.featureNameRow}>
                  <span className={styles.featureName}>سجل التعديلات</span>
                  {(workspace.enableAuditLog ?? false) && (
                    <span className={styles.featureBadge}>مفعّل</span>
                  )}
                </div>
                <p className={styles.featureDescription}>
                  عرض سجل كامل لجميع التعديلات على شجرة العائلة مع تفاصيل
                  التغييرات قبل وبعد
                </p>
              </div>
              <ToggleSwitch
                checked={workspace.enableAuditLog ?? false}
                onChange={(val) => handleToggleFeature('enableAuditLog', val)}
                disabled={!isAdmin}
                loading={togglingFeature === 'enableAuditLog'}
              />
            </div>

            {/* Version Control */}
            <div className={styles.featureCard}>
              <div className={styles.featureContent}>
                <div className={styles.featureNameRow}>
                  <span className={styles.featureName}>التحكم بالإصدارات</span>
                  {(workspace.enableVersionControl ?? false) && (
                    <span className={styles.featureBadge}>مفعّل</span>
                  )}
                </div>
                <p className={styles.featureDescription}>
                  إمكانية استعادة البيانات المحذوفة أو التراجع عن التعديلات
                  (قريبا)
                </p>
              </div>
              <ToggleSwitch
                checked={workspace.enableVersionControl ?? false}
                onChange={(val) => handleToggleFeature('enableVersionControl', val)}
                disabled={!isAdmin || !(workspace.enableAuditLog ?? false)}
                loading={togglingFeature === 'enableVersionControl'}
              />
            </div>

          </div>
        </div>

        {/* Privacy Settings */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>الخصوصية</h3>
          </div>

          <div className={styles.featureList}>
            {/* Hide birth date for women */}
            <div className={styles.featureCard}>
              <div className={styles.featureContent}>
                <div className={styles.featureNameRow}>
                  <span className={styles.featureName}>إخفاء تاريخ الميلاد للنساء</span>
                </div>
                <p className={styles.featureDescription}>
                  إخفاء تاريخ الميلاد للنساء في شجرة العائلة — يبقى التاريخ محفوظاً في قاعدة البيانات
                </p>
              </div>
              <ToggleSwitch
                checked={workspace.hideBirthDateForFemale ?? false}
                onChange={(val) => handleToggleFeature('hideBirthDateForFemale', val)}
                disabled={!isAdmin}
                loading={togglingFeature === 'hideBirthDateForFemale'}
              />
            </div>

            {/* Hide birth date for men */}
            <div className={styles.featureCard}>
              <div className={styles.featureContent}>
                <div className={styles.featureNameRow}>
                  <span className={styles.featureName}>إخفاء تاريخ الميلاد للرجال</span>
                </div>
                <p className={styles.featureDescription}>
                  إخفاء تاريخ الميلاد للرجال في شجرة العائلة — يبقى التاريخ محفوظاً في قاعدة البيانات
                </p>
              </div>
              <ToggleSwitch
                checked={workspace.hideBirthDateForMale ?? false}
                onChange={(val) => handleToggleFeature('hideBirthDateForMale', val)}
                disabled={!isAdmin}
                loading={togglingFeature === 'hideBirthDateForMale'}
              />
            </div>
          </div>
        </div>

        {/* Advanced Options (collapsed by default) */}
        <div className={styles.section}>
          <button
            type="button"
            className={styles.advancedHeader}
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
            aria-controls="advanced-options-content"
          >
            <h3 className={styles.sectionTitle}>خيارات متقدمة</h3>
            <span
              className={`${styles.advancedChevron} ${advancedOpen ? styles.advancedChevronOpen : ''}`}
              aria-hidden="true"
            >
              <iconify-icon icon="material-symbols:expand-more" width="20" height="20" />
            </span>
          </button>

          <div
            id="advanced-options-content"
            className={`${styles.advancedContent} ${advancedOpen ? styles.advancedContentOpen : ''}`}
          >
            <div className={styles.advancedContentInner}>
              <div className={styles.featureList}>
                {/* Umm Walad */}
                <div className={styles.featureCard}>
                  <div className={styles.featureContent}>
                    <div className={styles.featureNameRow}>
                      <span className={styles.featureName}>أم ولد</span>
                      {(workspace.enableUmmWalad ?? false) && (
                        <span className={styles.featureBadge}>مفعّل</span>
                      )}
                    </div>
                    <p className={styles.featureDescription}>
                      تسجيل علاقة أم الولد في سجلّات الأسرة — تصنيف شرعي يُميّز
                      عن الزوجة الحرّة
                    </p>
                    <p className={styles.featureNote}>
                      مخصّص لمن يوثّق العائلات القديمة.
                    </p>
                    <a
                      href="/islamic-gedcom#umm-walad"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.featureLearnMore}
                    >
                      تعرّف على المزيد
                    </a>
                  </div>
                  <ToggleSwitch
                    checked={workspace.enableUmmWalad ?? false}
                    onChange={(val) => handleToggleFeature('enableUmmWalad', val)}
                    disabled={!isAdmin}
                    loading={togglingFeature === 'enableUmmWalad'}
                  />
                </div>

                {/* Default new person deceased */}
                <div className={styles.featureCard}>
                  <div className={styles.featureContent}>
                    <div className={styles.featureNameRow}>
                      <span className={styles.featureName}>
                        تحديد خانة المتوفى تلقائياً{'  '}للأشخاص الجدد
                      </span>
                      {(workspace.defaultNewPersonDeceased ?? false) && (
                        <span className={styles.featureBadge}>مفعّل</span>
                      )}
                    </div>
                    <p className={styles.featureDescription}>
                      مفيد عند إدخال بيانات أجيال تاريخية — يمكن إلغاء التحديد لكل شخص حي.
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={workspace.defaultNewPersonDeceased ?? false}
                    onChange={(val) => handleToggleFeature('defaultNewPersonDeceased', val)}
                    disabled={!isAdmin}
                    loading={togglingFeature === 'defaultNewPersonDeceased'}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

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

        {/* Branch Sharing Section (admin only) */}
        {isAdmin && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>مشاركة الفروع</h3>
              <button
                onClick={handleOpenShareModal}
                className={styles.inviteButton}
                style={{ borderColor: 'var(--heritage-emerald-glow)', color: 'var(--heritage-emerald-glow)' }}
              >
                إنشاء رمز مشاركة
              </button>
            </div>
            <ShareTokenList
              workspaceId={workspace.id}
              refreshTrigger={shareTokenRefresh}
            />
          </div>
        )}

        {/* Incoming Pointers Section */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>الفروع المرتبطة</h3>
          </div>
          <IncomingPointerList
            workspaceId={workspace.id}
          />
        </div>
      </div>

      {/* Share Branch Modal */}
      {showShareModal && workspace && (
        <ShareBranchModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          workspaceId={workspace.id}
          treeData={treeData}
          onTokenCreated={handleShareTokenCreated}
        />
      )}

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
                <label className={styles.fieldLabel}>وصف العائلة (اختياري)</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className={styles.modalTextarea}
                  rows={3}
                  placeholder="وصف العائلة"
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
