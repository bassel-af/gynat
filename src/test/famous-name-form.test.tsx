import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IndividualForm, type IndividualFormData } from '@/components/tree/IndividualForm/IndividualForm';
import { buildEditInitialData, serializeIndividualForm } from '@/lib/person-detail-helpers';
import { hashimData } from './helpers/hashim-fixture';

const CHOICE_LABEL = 'يُذكر في النسب باسم:';

const baseProps = {
  mode: 'create' as const,
  onClose: vi.fn(),
};

function renderCreate(extra: Partial<React.ComponentProps<typeof IndividualForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <IndividualForm
      {...baseProps}
      onSubmit={onSubmit}
      enableFamousName
      initialData={{ sex: 'M' }}
      {...extra}
    />,
  );
  return onSubmit;
}

function renderEditAbuTalib() {
  const data = hashimData();
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <IndividualForm
      mode="edit"
      onClose={vi.fn()}
      onSubmit={onSubmit}
      enableFamousName
      initialData={buildEditInitialData(data.individuals.I2) as Partial<IndividualFormData>}
      previewTree={{ data, personId: 'I2' }}
    />,
  );
  return onSubmit;
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function submittedPayload(onSubmit: ReturnType<typeof vi.fn>) {
  fireEvent.submit(document.getElementById('individual-form')!);
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  return serializeIndividualForm(onSubmit.mock.calls[0][0] as IndividualFormData);
}

const preview = () => screen.getByTestId('famous-name-preview');

describe('IndividualForm — «اسم الشهرة» field', () => {
  it('is hidden when the workspace toggle is off', () => {
    render(<IndividualForm {...baseProps} onSubmit={vi.fn()} />);
    expect(screen.queryByLabelText('اسم الشهرة')).toBeNull();
  });

  it('uses «مثال: عبدالمطلب» as the placeholder', () => {
    renderCreate();
    expect(screen.getByLabelText('اسم الشهرة')).toHaveAttribute('placeholder', 'مثال: عبدالمطلب');
  });

  it('is shown when the workspace toggle is on', () => {
    renderCreate();
    expect(screen.getByLabelText('اسم الشهرة')).toHaveAttribute('maxLength', '200');
  });

  it('has no helper text under it', () => {
    renderCreate();
    const wrapper = screen.getByLabelText('اسم الشهرة').parentElement!;
    expect(wrapper.children).toHaveLength(2);
  });

  it('the kunya field has no helper text under it', () => {
    renderCreate({ enableKunya: true });
    const wrapper = screen.getByLabelText('الكنية').parentElement!;
    expect(wrapper.children).toHaveLength(2);
  });
});

describe('IndividualForm — «يُذكر في النسب باسم:» choice', () => {
  it('is hidden while the famous name is empty', () => {
    renderCreate();
    type('الاسم', 'عبدمناف');
    expect(screen.queryByRole('radiogroup', { name: CHOICE_LABEL })).toBeNull();
  });

  it('is hidden when the famous name equals the given name', () => {
    renderCreate();
    type('الاسم', 'عبدمناف');
    type('اسم الشهرة', 'عبدمناف');
    expect(screen.queryByRole('radiogroup', { name: CHOICE_LABEL })).toBeNull();
  });

  it('offers the two names, updating as the user types', () => {
    renderCreate();
    type('الاسم', 'عبدمناف');
    type('اسم الشهرة', 'أبو طالب');
    expect(screen.getByRole('radio', { name: 'أبو طالب' })).toBeInTheDocument();
    type('الاسم', 'عمران');
    expect(screen.getByRole('radio', { name: 'عمران' })).toBeInTheDocument();
  });

  it('defaults to the famous name for an ordinary famous name', () => {
    renderCreate();
    type('الاسم', 'عبدمناف');
    type('اسم الشهرة', 'أبو طالب');
    expect(screen.getByRole('radio', { name: 'أبو طالب' })).toHaveAttribute('aria-checked', 'true');
  });

  it('defaults to the real name for a famous name that is itself «ابن …»', () => {
    renderCreate();
    type('الاسم', 'عبدالله');
    type('اسم الشهرة', 'ابن الزبير');
    expect(screen.getByRole('radio', { name: 'عبدالله' })).toHaveAttribute('aria-checked', 'true');
  });

  it('sends null when the choice was never touched', async () => {
    const onSubmit = renderCreate();
    type('الاسم', 'عبدمناف');
    type('اسم الشهرة', 'أبو طالب');
    expect((await submittedPayload(onSubmit)).famousNameInNasab).toBeNull();
  });

  it('sends an explicit false once the real name is clicked', async () => {
    const onSubmit = renderCreate();
    type('الاسم', 'عبدمناف');
    type('اسم الشهرة', 'أبو طالب');
    fireEvent.click(screen.getByRole('radio', { name: 'عبدمناف' }));
    expect((await submittedPayload(onSubmit)).famousNameInNasab).toBe(false);
  });

  it('sends an explicit true once the famous name is clicked back', async () => {
    const onSubmit = renderCreate();
    type('الاسم', 'عبدمناف');
    type('اسم الشهرة', 'أبو طالب');
    fireEvent.click(screen.getByRole('radio', { name: 'عبدمناف' }));
    fireEvent.click(screen.getByRole('radio', { name: 'أبو طالب' }));
    expect((await submittedPayload(onSubmit)).famousNameInNasab).toBe(true);
  });

  it('moves the selection with the arrow keys', () => {
    renderCreate();
    type('الاسم', 'عبدمناف');
    type('اسم الشهرة', 'أبو طالب');
    fireEvent.keyDown(screen.getByRole('radio', { name: 'أبو طالب' }), { key: 'ArrowLeft' });
    const real = screen.getByRole('radio', { name: 'عبدمناف' });
    expect(real).toHaveAttribute('aria-checked', 'true');
    expect(real).toHaveFocus();
  });

  it('keeps a saved choice while untouched', async () => {
    const data = hashimData();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <IndividualForm
        mode="edit"
        onClose={vi.fn()}
        onSubmit={onSubmit}
        enableFamousName
        initialData={buildEditInitialData({ ...data.individuals.I2, famousNameInNasab: false }) as Partial<IndividualFormData>}
      />,
    );
    expect(screen.getByRole('radio', { name: 'عبدمناف' })).toHaveAttribute('aria-checked', 'true');
    expect((await submittedPayload(onSubmit)).famousNameInNasab).toBe(false);
  });
});

describe('IndividualForm — live preview', () => {
  it('shows the famous name leading the person’s own row', () => {
    renderEditAbuTalib();
    expect(preview()).toHaveTextContent('أبو طالب بن عبدالمطلب');
  });

  it('shows the real name on the grey line', () => {
    renderEditAbuTalib();
    expect(preview()).toHaveTextContent('واسمه عبدمناف');
  });

  it('flips the own row when the real name is chosen', () => {
    renderEditAbuTalib();
    fireEvent.click(screen.getByRole('radio', { name: 'عبدمناف' }));
    expect(preview()).toHaveTextContent('عبدمناف بن عبدالمطلب');
    expect(preview()).toHaveTextContent('ويُعرف بأبي طالب');
  });

  it('has no child line for a father with a son', () => {
    renderEditAbuTalib();
    expect(preview()).not.toHaveTextContent(/ابنه:|ابنته:/);
  });

  it('has no child line when adding a father (create-as-parent)', () => {
    renderCreate({
      relationshipType: 'parent',
      lockedSex: 'M',
      previewTree: { data: hashimData() },
    });
    type('الاسم', 'عبدمناف');
    type('اسم الشهرة', 'أبو طالب');
    expect(preview()).not.toHaveTextContent(/ابنه:|ابنته:/);
  });
});
