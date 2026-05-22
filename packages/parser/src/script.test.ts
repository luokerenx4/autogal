import { describe, expect, test } from "bun:test";
import { parseScript, ScriptParseError } from "./script";

// Helper: build a script source string with frontmatter + body without
// having to fight indentation in template literals.
function source(
  frontmatter: string,
  body: string,
): string {
  return `---\n${frontmatter}\n---\n\n${body}`;
}

describe("parseScript — frontmatter", () => {
  test("parses id + title", () => {
    const s = parseScript(source("id: 001_intro\ntitle: 樱花树下", ""));
    expect(s.id).toBe("001_intro");
    expect(s.title).toBe("樱花树下");
    expect(s.beats).toEqual([]);
  });

  test("throws on missing id", () => {
    expect(() =>
      parseScript(source("title: x", "")),
    ).toThrow(ScriptParseError);
  });

  test("throws on missing title", () => {
    expect(() =>
      parseScript(source("id: x", "")),
    ).toThrow(ScriptParseError);
  });

  test("parses characters list", () => {
    const s = parseScript(
      source("id: x\ntitle: t\ncharacters: [alice, bea]", ""),
    );
    expect(s.characters).toEqual(["alice", "bea"]);
  });

  test("characters must be array of strings", () => {
    expect(() =>
      parseScript(
        source("id: x\ntitle: t\ncharacters: [1, 2]", ""),
      ),
    ).toThrow(/characters/);
  });

  test("parses requires", () => {
    const s = parseScript(
      source(
        "id: x\ntitle: t\nrequires:\n  scriptCompleted: \"000_intro\"",
        "",
      ),
    );
    expect(s.requires).toEqual({ scriptCompleted: "000_intro" });
  });
});

describe("parseScript — beat splitting", () => {
  test("paragraphs separated by blank lines become individual beats", () => {
    const s = parseScript(
      source(
        "id: x\ntitle: t",
        "第一段narration。\n\n第二段narration。",
      ),
    );
    expect(s.beats).toHaveLength(2);
    expect(s.beats[0]).toEqual({ type: "narration", text: "第一段narration。" });
    expect(s.beats[1]).toEqual({
      type: "narration",
      text: "第二段narration。",
    });
  });

  test("multi-line narration in a single block", () => {
    const s = parseScript(
      source("id: x\ntitle: t", "第一行\n第二行"),
    );
    expect(s.beats).toHaveLength(1);
    expect(s.beats[0]).toEqual({
      type: "narration",
      text: "第一行\n第二行",
    });
  });

  test("@speaker prefix → dialogue beat", () => {
    const s = parseScript(
      source("id: x\ntitle: t", "@alice 嗨。你好吗？"),
    );
    expect(s.beats[0]).toEqual({
      type: "dialogue",
      speaker: "alice",
      text: "嗨。你好吗？",
    });
  });

  test("@speaker with continuation lines", () => {
    const s = parseScript(
      source("id: x\ntitle: t", "@alice 嗨。\n你好吗？"),
    );
    expect(s.beats[0]).toEqual({
      type: "dialogue",
      speaker: "alice",
      text: "嗨。\n你好吗？",
    });
  });

  test("[end] → endScript beat", () => {
    const s = parseScript(
      source("id: x\ntitle: t", "narration\n\n[end]\n\nafter"),
    );
    const types = s.beats.map((b) => b.type);
    expect(types).toEqual(["narration", "endScript", "narration"]);
  });

  test("# label → label beat", () => {
    const s = parseScript(
      source("id: x\ntitle: t", "# leave\n\n你转身离开。"),
    );
    expect(s.beats[0]).toEqual({ type: "label", name: "leave" });
    expect(s.beats[1]?.type).toBe("narration");
  });
});

describe("parseScript — choice (? prompt)", () => {
  test("basic choice with text-only options", () => {
    const s = parseScript(
      source(
        "id: x\ntitle: t",
        "? 你怎么回应？\n- 嗯，很美\n- 只是路过",
      ),
    );
    expect(s.beats[0]).toEqual({
      type: "choice",
      prompt: "你怎么回应？",
      options: [{ text: "嗯，很美" }, { text: "只是路过" }],
    });
  });

  test("inline effect: +alice", () => {
    const s = parseScript(
      source(
        "id: x\ntitle: t",
        "? prompt\n- 答应 -> +alice",
      ),
    );
    expect(s.beats[0]).toEqual({
      type: "choice",
      prompt: "prompt",
      options: [
        {
          text: "答应",
          effects: { characterStats: { alice: { affection: 1 } } },
        },
      ],
    });
  });

  test("inline magnitude: +2alice", () => {
    const s = parseScript(
      source(
        "id: x\ntitle: t",
        "? prompt\n- 强烈赞同 -> +2alice",
      ),
    );
    const beat = s.beats[0];
    expect(beat?.type).toBe("choice");
    if (!beat || beat.type !== "choice") throw new Error();
    expect(beat.options[0]?.effects).toEqual({
      characterStats: { alice: { affection: 2 } },
    });
  });

  test("goto target", () => {
    const s = parseScript(
      source(
        "id: x\ntitle: t",
        "? prompt\n- 离开 -> goto leave",
      ),
    );
    const beat = s.beats[0];
    if (!beat || beat.type !== "choice") throw new Error();
    expect(beat.options[0]).toEqual({
      text: "离开",
      goto: "leave",
    });
  });

  test("non-option line in choice block throws", () => {
    expect(() =>
      parseScript(
        source(
          "id: x\ntitle: t",
          "? prompt\n- 第一项\nthis is not an option",
        ),
      ),
    ).toThrow(/non-option line/);
  });
});

describe("parseScript — fenced YAML choice", () => {
  test("requires + effects + goto", () => {
    const body = [
      "```yaml",
      "type: choice",
      "prompt: 你怎么选？",
      "options:",
      "  - text: 答应碧河",
      "    effects:",
      "      variables: { route: bea }",
      "    goto: pick_bea",
      "  - text: 跟薄樱走",
      "    requires:",
      "      affection: { character: alice, min: 2 }",
      "    effects:",
      "      variables: { route: alice }",
      "    goto: pick_alice",
      "```",
    ].join("\n");
    const s = parseScript(source("id: x\ntitle: t", body));
    expect(s.beats).toHaveLength(1);
    const beat = s.beats[0];
    if (!beat || beat.type !== "choice") throw new Error();
    expect(beat.prompt).toBe("你怎么选？");
    expect(beat.options).toHaveLength(2);
    expect(beat.options[1]?.requires).toEqual({
      affection: { character: "alice", min: 2 },
    });
    expect(beat.options[0]?.effects).toEqual({
      variables: { route: "bea" },
    });
    expect(beat.options[0]?.goto).toBe("pick_bea");
  });

  test("missing type in fence throws", () => {
    const body = "```yaml\noptions: []\n```";
    expect(() =>
      parseScript(source("id: x\ntitle: t", body)),
    ).toThrow(/must have a `type` field/);
  });

  test("unknown fence type throws", () => {
    const body = "```yaml\ntype: bogus\n```";
    expect(() =>
      parseScript(source("id: x\ntitle: t", body)),
    ).toThrow(/Unknown fenced beat type/);
  });

  test("effects fence stands alone", () => {
    const body = [
      "```yaml",
      "type: effects",
      "effects:",
      "  switches: { unlocked: true }",
      "  affection: { alice: 1 }",
      "```",
    ].join("\n");
    const s = parseScript(source("id: x\ntitle: t", body));
    expect(s.beats[0]).toEqual({
      type: "effects",
      effects: {
        switches: { unlocked: true },
        characterStats: { alice: { affection: 1 } },
      },
    });
  });

  test("clear fence", () => {
    const body = "```yaml\ntype: clear\n```";
    const s = parseScript(source("id: x\ntitle: t", body));
    expect(s.beats[0]).toEqual({ type: "clear" });
  });
});
