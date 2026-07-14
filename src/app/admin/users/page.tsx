import styles from '../AdminDashboard.module.css';
import AdminUsersClient from './AdminUsersClient';

/**
 * /admin/users — platform owner drill-down: all user accounts.
 *
 * Reached from the "إجمالي المستخدمين" card on /admin. The admin layout
 * (src/app/admin/layout.tsx) has already verified the visitor is a
 * platform owner; middleware gates the route as well.
 */
export default function AdminUsersPage() {
  return (
    <main className={styles.surface}>
      <div className={styles.main}>
        <AdminUsersClient />
      </div>
    </main>
  );
}
