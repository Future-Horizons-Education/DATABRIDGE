import { describe, it, expect } from "vitest";
import { describeToDictionary, mapAttributeType } from "../dictionary.js";

describe("mapAttributeType", () => {
  it.each([
    ["String", "string"],
    ["Memo", "string"],
    ["Uniqueidentifier", "string"],
    ["Lookup", "reference"],
    ["Integer", "integer"],
    ["Decimal", "decimal"],
    ["Money", "decimal"],
    ["Boolean", "boolean"],
    ["DateTime", "datetime"],
    ["Picklist", "codelist"],
    ["Status", "codelist"],
    ["Anything_else", "Anything_else"],
  ])("maps %s → %s", (a, expected) => {
    expect(mapAttributeType(a)).toBe(expected);
  });

  it("treats undefined as string", () => {
    expect(mapAttributeType(undefined)).toBe("string");
  });
});

describe("describeToDictionary", () => {
  it("converts attributes into DictionaryEntry shape", () => {
    const dict = describeToDictionary("Contact", {
      LogicalName: "contact",
      Attributes: [
        {
          LogicalName: "contactid",
          AttributeType: "Uniqueidentifier",
          RequiredLevel: { Value: "SystemRequired" },
        },
        { LogicalName: "firstname", AttributeType: "String", RequiredLevel: { Value: "None" } },
        {
          LogicalName: "parentcustomerid",
          AttributeType: "Customer",
          Targets: ["account", "contact"],
        },
      ],
    });
    expect(dict).toHaveLength(3);
    expect(dict[0]?.fieldCode).toBe("contactid");
    expect(dict[0]?.isMandatory).toBe(true);
    expect(dict[1]?.isMandatory).toBe(false);
    expect(dict[2]?.linkedEntity).toBe("account,contact");
  });
});
