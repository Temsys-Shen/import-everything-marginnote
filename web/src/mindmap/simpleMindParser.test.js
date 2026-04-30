import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseSimpleMindFile } from "./simpleMindParser";

async function createZipFile(name, entries) {
  const zip = new JSZip();
  Object.entries(entries).forEach(([entryName, content]) => {
    zip.file(entryName, content);
  });
  const blob = await zip.generateAsync({ type: "blob" });
  return new File([blob], name);
}

describe("parseSimpleMindFile", () => {
  it("parses standard smmx files", async () => {
    const file = await createZipFile("map.smmx", {
      "document/mindmap.xml": `<?xml version="1.0"?>
        <simplemind>
          <mindmap>
            <topics>
              <topic id="root-1">
                <text>Root Topic</text>
                <note>Inner note</note>
                <children>
                  <text>
                    <note>Outer note</note>
                  </text>
                  <topics>
                    <topic id="child-1">
                      <text>Child Topic</text>
                      <note>Child note</note>
                    </topic>
                  </topics>
                </children>
              </topic>
            </topics>
          </mindmap>
        </simplemind>`,
    });

    const result = await parseSimpleMindFile(file);

    expect(result.sourceType).toBe("simplemind");
    expect(result.sourceMeta.container).toBe("zip");
    expect(result.sheets[0].root.text).toBe("Root Topic");
    expect(result.sheets[0].root.comment).toBe("Inner note\n\nOuter note");
    expect(result.sheets[0].root.children[0].text).toBe("Child Topic");
    expect(result.sheets[0].root.children[0].comment).toBe("Child note");
  });

  it("creates a virtual root for multiple top-level topics", async () => {
    const file = await createZipFile("workspace.smmx", {
      "document/mindmap.xml": `<?xml version="1.0"?>
        <simplemind>
          <mindmap>
            <topics>
              <topic><text>Alpha</text></topic>
              <topic><text>Beta</text></topic>
            </topics>
          </mindmap>
        </simplemind>`,
    });

    const result = await parseSimpleMindFile(file);

    expect(result.sheets[0].root.text).toBe("workspace");
    expect(result.sheets[0].root.children).toHaveLength(2);
  });

  it("filters topics with empty titles", async () => {
    const file = await createZipFile("filtered.smmx", {
      "document/mindmap.xml": `<?xml version="1.0"?>
        <simplemind>
          <mindmap>
            <topics>
              <topic>
                <text>Root</text>
                <children>
                  <topics>
                    <topic><text>   </text></topic>
                    <topic><text>Valid Child</text></topic>
                  </topics>
                </children>
              </topic>
            </topics>
          </mindmap>
        </simplemind>`,
    });

    const result = await parseSimpleMindFile(file);

    expect(result.sheets[0].root.children).toHaveLength(1);
    expect(result.sheets[0].root.children[0].text).toBe("Valid Child");
  });

  it("rejects smmx files without mindmap xml", async () => {
    const file = await createZipFile("broken.smmx", {
      "document/other.xml": "<root />",
    });

    await expect(parseSimpleMindFile(file)).rejects.toThrow("SimpleMind文件中未找到document/mindmap.xml");
  });

  it("rejects invalid smmx xml", async () => {
    const file = await createZipFile("invalid.smmx", {
      "document/mindmap.xml": "<simplemind><mindmap><topics><topic><text>Broken</text></topics>",
    });

    await expect(parseSimpleMindFile(file)).rejects.toThrow("SimpleMind解析失败: XML格式无效");
  });
});
