/**
 * Phase L1 — schema-mapper types.
 */

export type CrosswalkSystem = "banner" | "sits";

export interface CrosswalkFieldEntry {
  /** Canonical field name (camelCase). */
  canonical: string;
  /** Banner source — column reference or "derived" recipe. Null = no native. */
  banner: string | null;
  /** SITS source — column reference. Null = no native. */
  sits: string | null;
  /** Optional human notes — transformation, gotchas, codeset hints. */
  notes?: string;
}

export interface CrosswalkSection {
  /** Canonical entity name. */
  entity: string;
  /** Crosswalk section (e.g. "§6"). */
  section: string;
  /** Plain English summary of the section. */
  summary: string;
  /** Field-level mapping rows. */
  fields: readonly CrosswalkFieldEntry[];
}

export interface CorpusBundle {
  /** ISO version stamp. */
  version: string;
  sections: readonly CrosswalkSection[];
}

export interface FieldSuggestion {
  /** The native column name the engineer presented. */
  sourceColumn: string;
  /** The system context we used for matching. */
  system: CrosswalkSystem;
  /** Top candidate canonical field. */
  canonical: string;
  /** Entity the canonical field belongs to. */
  entity: string;
  /** 0..1 score — higher = more confident. */
  score: number;
  /** Why this match was suggested. */
  rationale: string;
  /** Other candidate canonicals worth considering (ordered by score desc). */
  alternatives: ReadonlyArray<{
    canonical: string;
    entity: string;
    score: number;
    rationale: string;
  }>;
}

export interface NoSuggestion {
  sourceColumn: string;
  system: CrosswalkSystem;
  reason: string;
}

export type SuggestionResult = FieldSuggestion | NoSuggestion;

export function isFieldSuggestion(r: SuggestionResult): r is FieldSuggestion {
  return "canonical" in r;
}

export interface SuggestRequest {
  /** Source columns to map. */
  columns: readonly string[];
  /** Which corpus side to match against. */
  system: CrosswalkSystem;
  /** Restrict to specific entities. Default: all corpus sections. */
  entityScope?: readonly string[];
  /**
   * Minimum acceptable score (0..1). Suggestions below this surface as
   * "no match" instead. Default 0.35.
   */
  minScore?: number;
}
