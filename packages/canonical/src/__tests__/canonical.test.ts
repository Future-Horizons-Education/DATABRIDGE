import { describe, it, expect } from 'vitest';
import {
  CANONICAL_ENTITY_NAMES,
  CANONICAL_SCHEMAS,
  StudentZ,
  EngagementZ,
  StudentCourseSessionZ,
} from '../index.js';

describe('canonical registry', () => {
  it('exports 7 canonical entity names', () => {
    expect(CANONICAL_ENTITY_NAMES.length).toBe(7);
  });

  it('every entity name has a matching schema', () => {
    for (const name of CANONICAL_ENTITY_NAMES) {
      expect(
        CANONICAL_SCHEMAS[name],
        `${name} missing from CANONICAL_SCHEMAS`,
      ).toBeTruthy();
    }
  });
});

describe('Student schema', () => {
  it('accepts a minimal valid record', () => {
    const result = StudentZ.safeParse({
      id: '00000000-0000-0000-0000-000000000001',
      sourceId: 'STU001',
      firstName: 'Ada',
      lastName: 'Lovelace',
      dateOfBirth: '1815-12-10',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid HUSID', () => {
    const result = StudentZ.safeParse({
      id: '00000000-0000-0000-0000-000000000001',
      sourceId: 'STU001',
      husid: 'not-a-husid',
      firstName: 'Ada',
      lastName: 'Lovelace',
      dateOfBirth: '1815-12-10',
    });
    expect(result.success).toBe(false);
  });
});

describe('Engagement schema', () => {
  it('requires ukprn', () => {
    const result = EngagementZ.safeParse({
      id: '00000000-0000-0000-0000-000000000002',
      sourceId: 'ENG001',
      studentId: '00000000-0000-0000-0000-000000000001',
      startDate: '2024-09-01',
    });
    expect(result.success).toBe(false);
  });
});

describe('StudentCourseSession schema', () => {
  it('accepts valid academic year format', () => {
    const result = StudentCourseSessionZ.safeParse({
      id: '00000000-0000-0000-0000-000000000003',
      sourceId: 'SCS001',
      engagementId: '00000000-0000-0000-0000-000000000002',
      academicYear: '2024/25',
      commencementDate: '2024-09-23',
      mode: '1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects malformed academic year', () => {
    const result = StudentCourseSessionZ.safeParse({
      id: '00000000-0000-0000-0000-000000000003',
      sourceId: 'SCS001',
      engagementId: '00000000-0000-0000-0000-000000000002',
      academicYear: '2024-2025',
      commencementDate: '2024-09-23',
      mode: '1',
    });
    expect(result.success).toBe(false);
  });
});
