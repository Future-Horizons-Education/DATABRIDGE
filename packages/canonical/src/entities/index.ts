/**
 * Canonical entity registry — DATABRIDGE's source-agnostic data model.
 * Derived from UCISA HERM and harmonised with HESA Data Futures.
 *
 * Adapters map FROM source shapes INTO these entities; profile packs map
 * FROM these entities INTO target shapes.
 */
export * from './student.js';
export * from './engagement.js';
export * from './student-course-session.js';
export * from './module.js';
export * from './leaver.js';
export * from './entry-profile.js';

import { StudentZ } from './student.js';
import { EngagementZ } from './engagement.js';
import { StudentCourseSessionZ } from './student-course-session.js';
import { ModuleZ, ModuleInstanceZ } from './module.js';
import { LeaverZ } from './leaver.js';
import { EntryProfileZ } from './entry-profile.js';

/** Names of all canonical entities. */
export const CANONICAL_ENTITY_NAMES = [
  'Student',
  'Engagement',
  'StudentCourseSession',
  'Module',
  'ModuleInstance',
  'Leaver',
  'EntryProfile',
] as const;

export type CanonicalEntityName = (typeof CANONICAL_ENTITY_NAMES)[number];

/** Registry mapping canonical entity name → zod schema. */
export const CANONICAL_SCHEMAS = {
  Student: StudentZ,
  Engagement: EngagementZ,
  StudentCourseSession: StudentCourseSessionZ,
  Module: ModuleZ,
  ModuleInstance: ModuleInstanceZ,
  Leaver: LeaverZ,
  EntryProfile: EntryProfileZ,
} as const;
