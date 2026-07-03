import { addDays, formatDateOnly, parseDateOnly, startOfWeek } from '../src/common/date-utils';

describe('date utils', () => {
  it('parses and formats date-only values in UTC', () => {
    expect(formatDateOnly(parseDateOnly('2026-08-15'))).toBe('2026-08-15');
  });

  it('adds days without mutating the source date', () => {
    const source = parseDateOnly('2026-08-15');
    expect(formatDateOnly(addDays(source, 7))).toBe('2026-08-22');
    expect(formatDateOnly(source)).toBe('2026-08-15');
  });

  it('returns Monday as the start of a week', () => {
    expect(formatDateOnly(startOfWeek(parseDateOnly('2026-08-16')))).toBe('2026-08-10');
  });
});
