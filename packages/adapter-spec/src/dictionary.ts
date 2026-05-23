import { z } from "zod";

export const DictionaryEntryZ = z.object({
  entityCode: z.string(),
  fieldCode: z.string(),
  businessName: z.string(),
  description: z.string().optional(),
  dataType: z.string().optional(),
  isMandatory: z.boolean().optional(),
  isInDatabase: z.boolean().optional(),
  isIndexed: z.boolean().optional(),
  codeListRef: z.string().optional(),
  linkedEntity: z.string().optional(),
  linkedField: z.string().optional(),
  udfDecoded: z.string().optional(),
});

export type DictionaryEntry = z.infer<typeof DictionaryEntryZ>;
