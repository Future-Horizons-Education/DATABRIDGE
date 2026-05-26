/**
 * Banner field catalogue.
 *
 * Selected fields across the entities described in `entities/index.ts`.
 * Not exhaustive — covers the surface needed for the bidirectional Banner↔SITS
 * mapping, the pre-flight checks, and the parallel-run verifier.
 */
export interface FieldCatalogueEntry {
  entityKey: string;
  fieldName: string;
  bannerColumn: string;
  bannerTable: string;
  /** Equivalent SITS column where a direct counterpart exists. */
  sitsColumn?: string;
  /** Equivalent HESA C24051 field reference if applicable. */
  hesaFieldRef?: string;
  dataType: "string" | "date" | "integer" | "decimal" | "boolean" | "codelist";
  isMandatory: boolean;
  codelistId?: string;
  description: string;
}

export const BANNER_FIELD_CATALOGUE: FieldCatalogueEntry[] = [
  // ── SPRIDEN ─────────────────────────────────────────────────────────────
  {
    entityKey: "Spriden",
    fieldName: "pidm",
    bannerColumn: "SPRIDEN_PIDM",
    bannerTable: "SPRIDEN",
    sitsColumn: "STU_INTID",
    dataType: "integer",
    isMandatory: true,
    description: "Internal surrogate PK — Banner's universal person key.",
  },
  {
    entityKey: "Spriden",
    fieldName: "id",
    bannerColumn: "SPRIDEN_ID",
    bannerTable: "SPRIDEN",
    sitsColumn: "STU_CODE",
    dataType: "string",
    isMandatory: true,
    description:
      "Institutional id printed on cards / shown in self-service. Becomes the canonical STU_CODE on SITS-side.",
  },
  {
    entityKey: "Spriden",
    fieldName: "lastName",
    bannerColumn: "SPRIDEN_LAST_NAME",
    bannerTable: "SPRIDEN",
    sitsColumn: "STU_SURN",
    hesaFieldRef: "SURNAME",
    dataType: "string",
    isMandatory: true,
    description: "Surname / family name.",
  },
  {
    entityKey: "Spriden",
    fieldName: "firstName",
    bannerColumn: "SPRIDEN_FIRST_NAME",
    bannerTable: "SPRIDEN",
    sitsColumn: "STU_FORE",
    hesaFieldRef: "FNAMES",
    dataType: "string",
    isMandatory: true,
    description: "Given / first name.",
  },
  {
    entityKey: "Spriden",
    fieldName: "birthDate",
    bannerColumn: "SPRIDEN_BIRTH_DATE",
    bannerTable: "SPRIDEN",
    sitsColumn: "STU_DOB",
    hesaFieldRef: "BIRTHDTE",
    dataType: "date",
    isMandatory: true,
    description: "Date of birth.",
  },
  {
    entityKey: "Spriden",
    fieldName: "changeIndicator",
    bannerColumn: "SPRIDEN_CHANGE_IND",
    bannerTable: "SPRIDEN",
    dataType: "codelist",
    codelistId: "BANNER.SPRIDEN_CHANGE_IND",
    isMandatory: false,
    description:
      "Name-change indicator. NULL = current name; I = id-change row; N = name-change row.",
  },

  // ── STVMAJR ─────────────────────────────────────────────────────────────
  {
    entityKey: "StvMajr",
    fieldName: "code",
    bannerColumn: "STVMAJR_CODE",
    bannerTable: "STVMAJR",
    sitsColumn: "POS_CODE",
    dataType: "string",
    isMandatory: true,
    description: "Major / programme code.",
  },
  {
    entityKey: "StvMajr",
    fieldName: "description",
    bannerColumn: "STVMAJR_DESC",
    bannerTable: "STVMAJR",
    sitsColumn: "POS_NAME",
    dataType: "string",
    isMandatory: true,
    description: "Programme title.",
  },

  // ── STVCAMP ─────────────────────────────────────────────────────────────
  {
    entityKey: "StvCamp",
    fieldName: "code",
    bannerColumn: "STVCAMP_CODE",
    bannerTable: "STVCAMP",
    sitsColumn: "CAM_CODE",
    hesaFieldRef: "CAMPID",
    dataType: "string",
    isMandatory: true,
    description: "Campus code.",
  },
  {
    entityKey: "StvCamp",
    fieldName: "description",
    bannerColumn: "STVCAMP_DESC",
    bannerTable: "STVCAMP",
    sitsColumn: "CAM_NAME",
    dataType: "string",
    isMandatory: true,
    description: "Campus name.",
  },

  // ── SHRTGPA ─────────────────────────────────────────────────────────────
  {
    entityKey: "Shrtgpa",
    fieldName: "pidm",
    bannerColumn: "SHRTGPA_PIDM",
    bannerTable: "SHRTGPA",
    dataType: "integer",
    isMandatory: true,
    description: "FK to SPRIDEN.",
  },
  {
    entityKey: "Shrtgpa",
    fieldName: "termCode",
    bannerColumn: "SHRTGPA_TERM_CODE",
    bannerTable: "SHRTGPA",
    sitsColumn: "STA_AYR",
    dataType: "string",
    isMandatory: true,
    description: "Term / AYR.",
  },
  {
    entityKey: "Shrtgpa",
    fieldName: "gpa",
    bannerColumn: "SHRTGPA_GPA",
    bannerTable: "SHRTGPA",
    dataType: "decimal",
    isMandatory: true,
    description: "Term GPA on 4.0 scale.",
  },
  {
    entityKey: "Shrtgpa",
    fieldName: "creditsEarned",
    bannerColumn: "SHRTGPA_HOURS_EARNED",
    bannerTable: "SHRTGPA",
    dataType: "decimal",
    isMandatory: false,
    description: "Credit hours earned this term.",
  },

  // ── SGBSTDN (student record) ────────────────────────────────────────────
  {
    entityKey: "Sgbstdn",
    fieldName: "pidm",
    bannerColumn: "SGBSTDN_PIDM",
    bannerTable: "SGBSTDN",
    dataType: "integer",
    isMandatory: true,
    description: "FK to SPRIDEN.",
  },
  {
    entityKey: "Sgbstdn",
    fieldName: "termCodeEff",
    bannerColumn: "SGBSTDN_TERM_CODE_EFF",
    bannerTable: "SGBSTDN",
    dataType: "string",
    isMandatory: true,
    description: "Effective-from term for this row.",
  },
  {
    entityKey: "Sgbstdn",
    fieldName: "stypCode",
    bannerColumn: "SGBSTDN_STYP_CODE",
    bannerTable: "SGBSTDN",
    sitsColumn: "SCE_STYP",
    dataType: "codelist",
    codelistId: "BANNER.STVSTYP",
    isMandatory: true,
    description: "Student type — first-time, continuing, returning, etc.",
  },
  {
    entityKey: "Sgbstdn",
    fieldName: "majrCode1",
    bannerColumn: "SGBSTDN_MAJR_CODE_1",
    bannerTable: "SGBSTDN",
    sitsColumn: "SCE_POS",
    dataType: "string",
    isMandatory: false,
    description: "Primary major code (FK to STVMAJR).",
  },
  {
    entityKey: "Sgbstdn",
    fieldName: "campCode",
    bannerColumn: "SGBSTDN_CAMP_CODE",
    bannerTable: "SGBSTDN",
    sitsColumn: "SCE_CAM",
    hesaFieldRef: "CAMPID",
    dataType: "codelist",
    codelistId: "BANNER.STVCAMP",
    isMandatory: false,
    description: "Campus FK.",
  },
  {
    entityKey: "Sgbstdn",
    fieldName: "residencyCode",
    bannerColumn: "SGBSTDN_RESD_CODE",
    bannerTable: "SGBSTDN",
    sitsColumn: "STU_FESC",
    hesaFieldRef: "FEESTATUS",
    dataType: "codelist",
    codelistId: "BANNER.STVRESD",
    isMandatory: false,
    description: "Residency / fee-status code.",
  },
];
