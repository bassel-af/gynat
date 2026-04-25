'use client';

import styles from './AdminDashboard.module.css';
import { PresenceHeatmap } from './PresenceHeatmap';

export interface PresencePayload {
  active1m: number;
  active5m: number;
  activeWorkspaces: number;
  perWorkspace: Array<{
    workspaceId: string;
    name: string;
    activeCount: number;
    dominantCategory: 'viewing' | 'editing';
  }>;
  smallWorkspacesRollup: { workspaceCount: number; activeCount: number } | null;
  heatmap: number[][];
  peak: { count: number; recordedAt: string | null };
}

type SectionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: PresencePayload }
  | { status: 'error'; message: string };

export function PresenceSection({ state }: { state: SectionState }) {
  return (
    <section className={styles.section} aria-labelledby="presence-heading">
      <h2 id="presence-heading" className={styles.sectionTitle}>
        الحضور المباشر
      </h2>
      {state.status === 'loading' || state.status === 'idle' ? (
        <div className={styles.loading}>جارٍ التحميل…</div>
      ) : state.status === 'error' ? (
        <div className={styles.error}>تعذر تحميل المقاييس: {state.message}</div>
      ) : (
        <>
          <div className={styles.presenceHero}>
            <PresenceCard
              label="نشطون الآن (دقيقة)"
              value={state.data.active1m}
              secondary="آخر ٦٠ ثانية"
            />
            <PresenceCard
              label="نشطون (٥ دقائق)"
              value={state.data.active5m}
              secondary="نافذة الـ ٥ دقائق"
            />
            <PresenceCard
              label="مساحات نشطة"
              value={state.data.activeWorkspaces}
              secondary="تتضمن المتجمعة"
            />
          </div>

          <table className={styles.topTable}>
            <caption>توزيع النشاط الحالي حسب المساحة</caption>
            <thead>
              <tr>
                <th>المساحة</th>
                <th>النشطون</th>
                <th>النوع السائد</th>
              </tr>
            </thead>
            <tbody>
              {state.data.perWorkspace.length === 0 ? (
                <tr>
                  <td colSpan={3} className={styles.empty}>
                    لا توجد بيانات كافية
                  </td>
                </tr>
              ) : (
                state.data.perWorkspace.map((w) => (
                  <tr key={w.workspaceId}>
                    <td>{w.name}</td>
                    <td>{w.activeCount}</td>
                    <td>
                      {w.dominantCategory === 'editing' ? 'تعديل' : 'مشاهدة'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {state.data.smallWorkspacesRollup ? (
            <div className={styles.presenceRollup}>
              مساحات صغيرة (أقل من ٥ أعضاء):{' '}
              {state.data.smallWorkspacesRollup.workspaceCount} مساحة،{' '}
              {state.data.smallWorkspacesRollup.activeCount} مستخدم نشط
            </div>
          ) : null}

          <PresenceHeatmap grid={state.data.heatmap} />
          <div className={styles.peakLine}>
            الذروة المسجلة: {state.data.peak.count}
            {state.data.peak.recordedAt
              ? ` — ${new Date(state.data.peak.recordedAt).toLocaleString('ar')}`
              : ''}
          </div>

          <button
            className={styles.maintenanceButton}
            type="button"
            disabled
            title="ميزة قادمة"
          >
            جدولة صيانة (قريبًا)
          </button>
        </>
      )}
    </section>
  );
}

function PresenceCard({
  label,
  value,
  secondary,
}: {
  label: string;
  value: number;
  secondary?: string;
}) {
  return (
    <div className={styles.presenceCard}>
      <span className={styles.presenceLabel}>{label}</span>
      <div className={styles.presenceValue}>{value}</div>
      {secondary ? (
        <div className={styles.presenceValueSubtle}>{secondary}</div>
      ) : null}
    </div>
  );
}
