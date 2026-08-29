import { describe, it, expect } from "vitest";
import { toCsv } from "../csv";

describe("toCsv", () => {
  it("renders the header row from column labels, not keys", () => {
    const csv = toCsv([{ id: "1", name: "Rice" }], [{ key: "id", header: "ID" }, { key: "name", header: "Name" }]);
    expect(csv).toBe("ID,Name\r\n1,Rice\r\n");
  });

  it("orders each row's cells by the columns array, not object key order", () => {
    const csv = toCsv(
      [{ name: "Rice", id: "1" }],
      [{ key: "id", header: "ID" }, { key: "name", header: "Name" }],
    );
    expect(csv).toBe("ID,Name\r\n1,Rice\r\n");
  });

  it("quotes and escapes a cell containing a comma, quote, or newline", () => {
    const csv = toCsv(
      [{ note: 'Says "hi", then\nleaves' }],
      [{ key: "note", header: "Note" }],
    );
    expect(csv).toBe('Note\r\n"Says ""hi"", then\nleaves"\r\n');
  });

  it("leaves an ordinary cell unquoted", () => {
    const csv = toCsv([{ note: "plain text" }], [{ key: "note", header: "Note" }]);
    expect(csv).toBe("Note\r\nplain text\r\n");
  });

  it("renders null/undefined cells as empty", () => {
    const csv = toCsv([{ a: null, b: undefined }], [{ key: "a", header: "A" }, { key: "b", header: "B" }]);
    expect(csv).toBe("A,B\r\n,\r\n");
  });

  it("renders just the header row for an empty result set", () => {
    const csv = toCsv([], [{ key: "id", header: "ID" }]);
    expect(csv).toBe("ID\r\n");
  });
});
