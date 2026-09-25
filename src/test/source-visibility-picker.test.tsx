import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SourceVisibilityPicker } from '@/components/sources/SourceVisibilityPicker';

const LEVEL1 = 'المشرفون فقط';
const LEVEL2 = 'أعضاء مساحة العائلة';
const LEVEL3 = /أعضاء مساحة العائلة وزوار الشجرة المنشورة/;
const FILES_WARNING = 'تأكد أن الملفات لا تحوي بيانات شخصية لأحياء (رقم هوية، صورة، عنوان)';

function renderPicker(props: Partial<React.ComponentProps<typeof SourceVisibilityPicker>> = {}) {
  const onChange = vi.fn();
  render(
    <SourceVisibilityPicker
      value="admins"
      onChange={onChange}
      isAdmin
      treeVisibility={null}
      hasFiles={false}
      {...props}
    />,
  );
  return { onChange };
}

describe('SourceVisibilityPicker', () => {
  it('lets an admin pick any of the three levels', () => {
    const { onChange } = renderPicker();
    fireEvent.click(screen.getByRole('radio', { name: LEVEL3 }));
    expect(onChange).toHaveBeenCalledWith('public');
    fireEvent.click(screen.getByRole('radio', { name: LEVEL2 }));
    expect(onChange).toHaveBeenCalledWith('members');
  });

  it('disables levels 2 and 3 for a non-admin, keeping «المشرفون فقط»', () => {
    renderPicker({ isAdmin: false });
    expect(screen.getByRole('radio', { name: LEVEL1 })).toBeEnabled();
    expect(screen.getByRole('radio', { name: LEVEL2 })).toBeDisabled();
    expect(screen.getByRole('radio', { name: LEVEL3 })).toBeDisabled();
    expect(screen.getByText('تغيير من يرى المصدر متاح للمشرفين فقط')).toBeInTheDocument();
  });

  it.each([
    ['private', 'الشجرة حاليًا غير منشورة، فلن يراه أحد من خارج مساحة العائلة ما لم تنشرها بنفسك.'],
    ['public_link', 'الشجرة حاليًا منشورة برابط: يراه كل من لديه الرابط.'],
    ['public_listed', 'الشجرة حاليًا منشورة للعامة وتظهر في محركات البحث: يراه كل من يزورها.'],
  ] as const)('shows the live status line for a %s tree', (treeVisibility, line) => {
    renderPicker({ treeVisibility });
    expect(screen.getByText(line)).toBeInTheDocument();
  });

  it('shows no status line while the tree level is unknown', () => {
    renderPicker({ treeVisibility: null });
    expect(screen.queryByText(/الشجرة حاليًا/)).toBeNull();
  });

  it('warns about files only at level 3 with files', () => {
    const { rerender } = render(
      <SourceVisibilityPicker value="public" onChange={vi.fn()} isAdmin treeVisibility={null} hasFiles />,
    );
    expect(screen.getByText(FILES_WARNING)).toBeInTheDocument();

    rerender(<SourceVisibilityPicker value="members" onChange={vi.fn()} isAdmin treeVisibility={null} hasFiles />);
    expect(screen.queryByText(FILES_WARNING)).toBeNull();

    rerender(<SourceVisibilityPicker value="public" onChange={vi.fn()} isAdmin treeVisibility={null} hasFiles={false} />);
    expect(screen.queryByText(FILES_WARNING)).toBeNull();
  });
});
