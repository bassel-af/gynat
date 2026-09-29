import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PersonListName } from '@/components/ui/PersonListName/PersonListName';

describe('PersonListName', () => {
  test('a search for the real name highlights it in the grey line', () => {
    const { container } = render(
      <PersonListName main="عبدالمطلب بن هاشم" alternate="واسمه شيبة" query="شيبة" />,
    );
    const marks = container.querySelectorAll('mark');
    expect(Array.from(marks, (m) => m.textContent)).toEqual(['شيبة']);
  });

  test('the grey line is strengthened when only it matches the search', () => {
    render(<PersonListName main="عبدالمطلب بن هاشم" alternate="واسمه شيبة" query="شيبة" />);
    expect(screen.getByText('شيبة').closest('[data-hit]')?.getAttribute('data-hit')).toBe('true');
  });

  test('the grey line is not strengthened when the main line matches too', () => {
    const { container } = render(
      <PersonListName main="عبدالمطلب بن هاشم" alternate="واسمه شيبة" query="هاشم" />,
    );
    expect(container.querySelector('[data-hit="true"]')).toBeNull();
  });

  test('a script-like query is rendered as plain text', () => {
    const query = '<script>alert(1)</script>';
    const { container } = render(<PersonListName main={`x ${query}`} query={query} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('mark')?.textContent).toBe(query);
  });

  test('no grey line is rendered without an alternate name', () => {
    const { container } = render(<PersonListName main="علي بن أبي طالب" />);
    expect(container.querySelector('[data-hit]')).toBeNull();
  });
});
