import { importAccountsFromCsv } from "./accountsCsvImport";

describe("importAccountsFromCsv", () => {
  it("imports accounts from valid CSV", () => {
    const csv = "name,offBudget,closed\nChecking,false,false\nSavings,true,false";
    const result = importAccountsFromCsv(csv);

    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.accounts).toHaveLength(2);
    expect(result.accounts[0]).toMatchObject({ name: "Checking", offBudget: false, closed: false });
    expect(result.accounts[1]).toMatchObject({ name: "Savings", offBudget: true, closed: false });
    expect(result.skipped).toBe(0);
  });

  it("is case-insensitive for column headers", () => {
    const csv = "NAME,OFFBUDGET,CLOSED\nChecking,false,false";
    const result = importAccountsFromCsv(csv);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.accounts).toHaveLength(1);
  });

  it("defaults offBudget and closed to false when columns are absent", () => {
    const csv = "name\nChecking";
    const result = importAccountsFromCsv(csv);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.accounts[0]).toMatchObject({ offBudget: false, closed: false });
  });

  it("skips rows with empty names and increments skipped count", () => {
    const csv = "name\nChecking\n\nSavings";
    const result = importAccountsFromCsv(csv);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.accounts).toHaveLength(2);
    expect(result.skipped).toBe(1);
  });

  it("returns an error when CSV has no data rows", () => {
    const result = importAccountsFromCsv("name");
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error).toMatch(/no data rows/i);
  });

  it('returns an error when the "name" column is missing', () => {
    const csv = "id,offBudget\n1,false";
    const result = importAccountsFromCsv(csv);
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error).toMatch(/name/i);
  });

  it("parses boolean values case-insensitively", () => {
    const csv = "name,offBudget,closed\nChecking,TRUE,YES";
    const result = importAccountsFromCsv(csv);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.accounts[0]).toMatchObject({ offBudget: true, closed: true });
  });

  it("handles CRLF line endings", () => {
    const csv = "name\r\nChecking\r\nSavings";
    const result = importAccountsFromCsv(csv);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.accounts).toHaveLength(2);
  });

  it("handles quoted names with commas", () => {
    const csv = 'name\n"Smith, John"\nChecking';
    const result = importAccountsFromCsv(csv);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.accounts[0].name).toBe("Smith, John");
  });
});
