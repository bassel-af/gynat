import { CenteredCardLayout } from '@/components/ui/CenteredCardLayout';
import styles from './not-found.module.css';

export default function NotFound() {
  return (
    <CenteredCardLayout>
      <h1 className={styles.code}>404</h1>
      <h2 className={styles.title}>الصفحة غير موجودة</h2>
      <p className={styles.description}>
        الصفحة التي تبحث عنها غير موجودة أو تم نقلها.
      </p>
      <a href="/workspaces" className={styles.link}>
        &rarr; العودة للمساحات
      </a>
    </CenteredCardLayout>
  );
}
