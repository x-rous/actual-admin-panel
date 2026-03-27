import { importCategoriesFromCsv } from "./categoriesCsvImport";

const noExistingGroups: { name: string; id: string }[] = [];

describe("importCategoriesFromCsv", () => {
  it("imports groups and categories from valid CSV", () => {
    const csv = [
      "type,name,group,is_income,hidden",
      "group,Food,,false,false",
      "category,Groceries,Food,false,false",
      "category,Restaurants,Food,false,false",
    ].join("\n");

    const result = importCategoriesFromCsv(csv, noExistingGroups);

    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({ name: "Food", isIncome: false, hidden: false });

    expect(result.categories).toHaveLength(2);
    expect(result.categories[0]).toMatchObject({ name: "Groceries", groupId: result.groups[0].id });
    expect(result.categories[1]).toMatchObject({ name: "Restaurants", groupId: result.groups[0].id });

    expect(result.skipped).toBe(0);
  });

  it("skips categories whose group is not present in the CSV or existing groups", () => {
    const csv = [
      "type,name,group",
      "category,Groceries,Food",  // Food group not created
    ].join("\n");

    const result = importCategoriesFromCsv(csv, noExistingGroups);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.categories).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it("resolves group references to existing groups by name (case-insensitive)", () => {
    const csv = [
      "type,name,group",
      "category,Groceries,food",  // lowercase — matches existing "Food"
    ].join("\n");

    const result = importCategoriesFromCsv(csv, [{ name: "Food", id: "existing-group-id" }]);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].groupId).toBe("existing-group-id");
  });

  it("skips duplicate groups (already exist in provided list) and records them", () => {
    const csv = [
      "type,name,group",
      "group,Food,,false,false",
    ].join("\n");

    const result = importCategoriesFromCsv(csv, [{ name: "Food", id: "existing-id" }]);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.groups).toHaveLength(0);
    expect(result.existingGroupNames).toContain("Food");
    expect(result.skipped).toBe(1);
  });

  it("returns an error when required columns are missing", () => {
    const result = importCategoriesFromCsv("name\nFood", noExistingGroups);
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error).toMatch(/type.*name|name.*type/i);
  });

  it("returns an error when CSV has no data rows", () => {
    const result = importCategoriesFromCsv("type,name", noExistingGroups);
    expect("error" in result).toBe(true);
  });

  it("skips group rows with empty names", () => {
    const csv = "type,name\ngroup,";
    const result = importCategoriesFromCsv(csv, noExistingGroups);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.groups).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it("new groups in same CSV are usable by category rows", () => {
    // This verifies that the two-pass approach correctly makes newly-created
    // groups available for category references in the same file.
    const csv = [
      "type,name,group",
      "group,NewGroup,,false,false",
      "category,Item,NewGroup,false,false",
    ].join("\n");

    const result = importCategoriesFromCsv(csv, noExistingGroups);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.groups).toHaveLength(1);
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].groupId).toBe(result.groups[0].id);
  });
});
