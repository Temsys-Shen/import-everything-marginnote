import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseIThoughtsFile } from "./iThoughtsParser";

async function createZipFile(name, entries) {
  const zip = new JSZip();
  Object.entries(entries).forEach(([entryName, content]) => {
    zip.file(entryName, content);
  });
  const blob = await zip.generateAsync({ type: "blob" });
  return new File([blob], name);
}

describe("parseIThoughtsFile", () => {
  it("parses standard itmz files", async () => {
    const file = await createZipFile("map.itmz", {
      "MapData.xml": `<?xml version="1.0"?>
        <iThoughts>
          <topics>
            <topic uuid="root-1" text="Root Topic" note="Root note">
              <topic uuid="child-1" text="Child Topic" note="Child note" />
            </topic>
          </topics>
        </iThoughts>`,
    });

    const result = await parseIThoughtsFile(file);

    expect(result.sourceType).toBe("ithoughts");
    expect(result.sheets[0].root.text).toBe("Root Topic");
    expect(result.sheets[0].root.comment).toBe("Root note");
    expect(result.sheets[0].root.children[0].comment).toBe("Child note");
  });

  it("creates a virtual root for multiple top-level topics", async () => {
    const file = await createZipFile("workspace.itmz", {
      "MapData.xml": `<?xml version="1.0"?>
        <iThoughts>
          <topics>
            <topic text="Alpha" />
            <topic text="Beta" />
          </topics>
        </iThoughts>`,
    });

    const result = await parseIThoughtsFile(file);

    expect(result.sheets[0].root.text).toBe("workspace");
    expect(result.sheets[0].root.children).toHaveLength(2);
  });

  it("rejects itmz files without mapdata", async () => {
    const file = await createZipFile("broken.itmz", {
      "Other.xml": "<root />",
    });

    await expect(parseIThoughtsFile(file)).rejects.toThrow("iThoughts文件中未找到MapData.xml");
  });

  it("rejects invalid itmz xml", async () => {
    const file = await createZipFile("invalid.itmz", {
      "MapData.xml": "<iThoughts><topics><topic text=\"Broken\"></topics>",
    });

    await expect(parseIThoughtsFile(file)).rejects.toThrow("iThoughts解析失败: XML格式无效");
  });
});
