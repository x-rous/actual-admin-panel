import { parseCsvLine, csvField, parseBoolean } from "./csv";

describe("parseCsvLine", () => {
  it("parses simple fields", () => {
    expect(parseCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("parses quoted fields containing commas", () => {
    expect(parseCsvLine('"a,b",c')).toEqual(["a,b", "c"]);
  });

  it("parses escaped quotes inside quoted fields", () => {
    expect(parseCsvLine('"say ""hello""",world')).toEqual(['say "hello"', "world"]);
  });

  it("handles empty fields", () => {
    expect(parseCsvLine("a,,c")).toEqual(["a", "", "c"]);
    expect(parseCsvLine(",")).toEqual(["", ""]);
  });

  it("returns a single-element array for a line with no commas", () => {
    expect(parseCsvLine("hello")).toEqual(["hello"]);
  });

  it("handles quoted empty field", () => {
    expect(parseCsvLine('"",b')).toEqual(["", "b"]);
  });

  it("preserves whitespace inside quotes", () => {
    expect(parseCsvLine('"  spaced  ",b')).toEqual(["  spaced  ", "b"]);
  });

  it("handles a single empty string", () => {
    expect(parseCsvLine("")).toEqual([""]);
  });
});

describe("csvField", () => {
  it("returns plain value when no special characters", () => {
    expect(csvField("hello")).toBe("hello");
  });

  it("wraps in quotes when value contains a comma", () => {
    expect(csvField("a,b")).toBe('"a,b"');
  });

  it("wraps in quotes and escapes internal quotes", () => {
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
  });

  it("wraps in quotes when value contains a newline", () => {
    expect(csvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("returns empty string for null", () => {
    expect(csvField(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(csvField(undefined)).toBe("");
  });

  it("stringifies non-string values", () => {
    expect(csvField(42)).toBe("42");
    expect(csvField(true)).toBe("true");
  });
});

describe("parseBoolean", () => {
  it.each(["true", "TRUE", "True", "1", "yes", "YES"])(
    "returns true for truthy string %s",
    (v) => expect(parseBoolean(v)).toBe(true)
  );

  it.each(["false", "0", "no", "", "maybe", "null"])(
    "returns false for non-truthy string %s",
    (v) => expect(parseBoolean(v)).toBe(false)
  );

  it("trims whitespace before parsing", () => {
    expect(parseBoolean("  true  ")).toBe(true);
    expect(parseBoolean("  false  ")).toBe(false);
  });
});
