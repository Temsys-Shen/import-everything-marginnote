import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseMindManagerFile } from "./mindManagerParser";

async function createZipFile(name, entries) {
  const zip = new JSZip();
  Object.entries(entries).forEach(([entryName, content]) => {
    zip.file(entryName, content);
  });
  const blob = await zip.generateAsync({ type: "blob" });
  return new File([blob], name);
}

function createTextFile(name, content) {
  return {
    name,
    async text() {
      return content;
    },
  };
}

describe("parseMindManagerFile", () => {
  it("parses xmmap xml files", async () => {
    const file = createTextFile("map.xmmap", `<?xml version="1.0"?>
      <ap:Map xmlns:ap="urn:mindjet:schemas-mindmanager-com:ap:map:core:xmlns:2008">
        <ap:OneTopic>
          <ap:Topic OId="root-1">
            <ap:Text PlainText="Root Topic" />
            <ap:NotesGroup>
              <ap:NotesXhtmlData PreviewPlainText="Root note" />
            </ap:NotesGroup>
            <ap:SubTopics>
              <ap:Topic OId="child-1">
                <ap:Text PlainText="Child Topic" />
              </ap:Topic>
            </ap:SubTopics>
          </ap:Topic>
        </ap:OneTopic>
      </ap:Map>`);

    const result = await parseMindManagerFile(file);

    expect(result.sourceType).toBe("mindmanager");
    expect(result.sheets[0].root.text).toBe("Root Topic");
    expect(result.sheets[0].root.comment).toBe("Root note");
    expect(result.sheets[0].root.children[0].text).toBe("Child Topic");
  });

  it("parses mmap zip files with document.xml", async () => {
    const file = await createZipFile("map.mmap", {
      "Document.xml": `<?xml version="1.0"?>
        <ap:Map xmlns:ap="urn:mindjet:schemas-mindmanager-com:ap:map:core:xmlns:2008">
          <ap:OneTopic>
            <ap:Topic>
              <ap:Text PlainText="Zip Root" />
            </ap:Topic>
          </ap:OneTopic>
        </ap:Map>`,
    });

    const result = await parseMindManagerFile(file);

    expect(result.sourceMeta.container).toBe("zip");
    expect(result.sheets[0].root.text).toBe("Zip Root");
  });

  it("rejects mmap files without document xml", async () => {
    const file = await createZipFile("broken.mmap", {
      "Other.xml": "<root />",
    });

    await expect(parseMindManagerFile(file)).rejects.toThrow("MindManager文件中未找到Document.xml");
  });

  it("rejects invalid xmmap xml", async () => {
    const file = createTextFile("broken.xmmap", "<ap:Map><ap:OneTopic></ap:Map>");

    await expect(parseMindManagerFile(file)).rejects.toThrow("MindManager解析失败: XML格式无效");
  });
});
