/**
 * Type-level shape of raw rows returned by SITS_ENTITY_QUERIES, keyed by
 * logical entity name. Values are intentionally loose — downstream profiles
 * (e.g. @databridge/profile-sits) own the strict canonical typing.
 */
export interface SitsRecordMap {
  Student: SitsRawRow;
  CourseInstance: SitsRawRow;
  StudentCourseJoin: SitsRawRow;
  Module: SitsRawRow;
  ModuleInstance: SitsRawRow;
  StudentModuleResult: SitsRawRow;
  Address: SitsRawRow;
  Qualification: SitsRawRow;
}

/**
 * Raw SITS row — an arbitrary JSON-coercible object. Oracle column names are
 * UPPER_CASE_SNAKE_CASE.
 */
export type SitsRawRow = Record<string, string | number | boolean | Date | null>;
