import { describe, expect, it } from "vitest";
import { evaluate, expressionFromText } from "./calculator";

describe("expressionFromText", () => {
  it("reads the keyboard's operators", () => {
    expect(expressionFromText("120+45")).toBe("120+45");
    expect(expressionFromText("500 - 120")).toBe("500−120");
    expect(expressionFromText("3*45")).toBe("3×45");
    expect(expressionFromText("3x45")).toBe("3×45");
    expect(expressionFromText("900/3")).toBe("900÷3");
  });

  it("drops peso signs, commas and spaces", () => {
    expect(expressionFromText("₱1,200 + 300")).toBe("1200+300");
  });

  it("reads numbers missing a digit around the point", () => {
    expect(expressionFromText(".5+12.")).toBe("0.5+12");
  });

  it("rejects text that isn't a sum", () => {
    expect(expressionFromText("abc")).toBeNull();
    expect(expressionFromText("-50")).toBeNull();
    expect(expressionFromText("1++2")).toBeNull();
    expect(expressionFromText("")).toBeNull();
  });

  it("works out with evaluate", () => {
    expect(evaluate(expressionFromText("120 + 45 + 20")!)).toBe(185);
    expect(evaluate(expressionFromText("2*35.50 - 1")!)).toBe(70);
  });
});
