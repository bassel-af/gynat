/**
 * Sources («المصادر») — `SourcePeoplePicker` («اختيار الأشخاص»): quick
 * buttons, the locked starting person, search, and «تم» handing the choice
 * back without saving anything.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SourcePeoplePicker } from '@/components/sources/SourcePeoplePicker';
import { buildPickerFamily } from './helpers/source-people-fixture';

const data = buildPickerFamily();

function renderPicker(props: Partial<React.ComponentProps<typeof SourcePeoplePicker>> = {}) {
  const onDone = vi.fn();
  const onClose = vi.fn();
  render(
    <SourcePeoplePicker data={data} lockedId="M" initialIds={[]} onDone={onDone} onClose={onClose} {...props} />,
  );
  return { onDone, onClose };
}

const box = (name: string | RegExp) => screen.getByRole('checkbox', { name });
const footer = () => screen.getByTestId('picker-count');

describe('SourcePeoplePicker', () => {
  it('shows the starting person checked and locked, with «أضفت المصدر من صفحته»', () => {
    renderPicker();
    const locked = box(/^محمد بن عبد الله العطار/);
    expect(locked).toBeChecked();
    expect(locked).toBeDisabled();
    expect(screen.getByText('أضفت المصدر من صفحته')).toBeInTheDocument();
    expect(footer()).toHaveTextContent('شخص واحد محدد');
  });

  it('«الأسرة كلها» selects the whole family, and pressing it again unselects all but the locked person', () => {
    renderPicker();
    const all = screen.getByRole('button', { name: 'الأسرة كلها (٦)' });
    expect(all).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(all);
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(footer()).toHaveTextContent('٦ أشخاص محددين');
    expect(screen.getByRole('button', { name: 'الأبناء (٣)' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(all);
    expect(footer()).toHaveTextContent('شخص واحد محدد');
    expect(box(/^محمد بن عبد الله العطار/)).toBeChecked();
  });

  it('unticking one member un-presses the group button', () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'الأبناء (٣)' }));
    fireEvent.click(box(/^أحمد بن محمد العطار/));
    expect(screen.getByRole('button', { name: 'الأبناء (٣)' })).toHaveAttribute('aria-pressed', 'false');
    expect(footer()).toHaveTextContent('٣ أشخاص محددين');
  });

  it('«تم» hands back the chosen people (never the locked one)', () => {
    const { onDone } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'الزوجة: فاطمة' }));
    fireEvent.click(screen.getByRole('button', { name: 'تم' }));
    expect(onDone).toHaveBeenCalledWith(['W1']);
  });

  it('opens with the people already on the form ticked', () => {
    renderPicker({ initialIds: ['K2'] });
    expect(box(/^سعاد بنت محمد العطار/)).toBeChecked();
    expect(footer()).toHaveTextContent('شخصان محددان');
  });

  it('search reaches anyone in the tree, with relation · birth under the name', () => {
    renderPicker();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'عبد الرحمن' } });
    const row = box(/^عبد الرحمن بن عبد الله العطار/);
    expect(row).not.toBeDisabled();
    expect(screen.getByText('الأخ')).toBeInTheDocument();
    fireEvent.click(row);
    expect(footer()).toHaveTextContent('شخصان محددان');
  });

  it('a borrowed-branch person is shown but cannot be picked', () => {
    renderPicker();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'يوسف' } });
    expect(box(/^يوسف/)).toBeDisabled();
    expect(screen.getByText('من فرع مربوط من مساحة أخرى · لا يمكن إضافته')).toBeInTheDocument();
  });

  it('never offers a private person', () => {
    renderPicker();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'خاص' } });
    expect(screen.queryAllByRole('checkbox').filter((c) => !(c as HTMLInputElement).disabled)).toHaveLength(0);
  });

  it('a new person is the locked «هذا الشخص (جديد)» row, with no quick buttons', () => {
    renderPicker({ lockedId: null, newPerson: true });
    const list = screen.getByRole('list', { name: 'الأشخاص' });
    expect(within(list).getByRole('checkbox', { name: /هذا الشخص \(جديد\)/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /الأسرة كلها/ })).toBeNull();
  });

  it('without a starting person (the «المصادر» page) there is no locked row and the count starts at zero', () => {
    renderPicker({ lockedId: null });
    expect(screen.queryByText('أضفت المصدر من صفحته')).toBeNull();
    expect(screen.getByRole('button', { name: 'تم' })).toBeInTheDocument();
  });
});
