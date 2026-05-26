import { describe, it, expect } from "vitest";
import { describeToDictionary, mapFieldType } from "../dictionary.js";

describe("mapFieldType", () => {
  it.each([
    ["string", "string"],
    ["email", "string"],
    ["url", "string"],
    ["double", "decimal"],
    ["currency", "decimal"],
    ["int", "integer"],
    ["boolean", "boolean"],
    ["date", "date"],
    ["datetime", "datetime"],
    ["picklist", "codelist"],
    ["multipicklist", "codelist"],
    ["unknown_thing", "unknown_thing"],
  ])("maps %s → %s", (sf, expected) => {
    expect(mapFieldType(sf)).toBe(expected);
  });
});

describe("describeToDictionary", () => {
  it("converts every field in a describe payload", () => {
    const dict = describeToDictionary("Contact", {
      name: "Contact",
      fields: [
        { name: "Id", type: "id", nillable: false, label: "Contact ID" },
        { name: "FirstName", type: "string", nillable: true, label: "First Name" },
        { name: "AccountId", type: "reference", nillable: true, referenceTo: ["Account"] },
      ],
    });
    expect(dict).toHaveLength(3);
    expect(dict[0]?.entityCode).toBe("Contact");
    expect(dict[0]?.fieldCode).toBe("Id");
    expect(dict[0]?.businessName).toBe("Contact ID");
    expect(dict[0]?.isMandatory).toBe(true);
    expect(dict[2]?.linkedEntity).toBe("Account");
  });
});
