import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerObjectURLForFile,
  revokeAllObjectURLs,
  revokeObjectURLsForFile,
  revokeObjectURLsForFiles,
} from "./objectUrlRegistry";

describe("objectUrlRegistry", () => {
  const originalRevoke = URL.revokeObjectURL;

  afterEach(() => {
    revokeAllObjectURLs();
    URL.revokeObjectURL = originalRevoke;
    vi.restoreAllMocks();
  });

  it("registers and revokes urls for a file owner", () => {
    const revokeSpy = vi.fn();
    URL.revokeObjectURL = revokeSpy;

    const file = {
      name: "demo.png",
      size: 1024,
      lastModified: 1700000000000,
      webkitRelativePath: "",
    };

    registerObjectURLForFile(file, "blob:one");
    registerObjectURLForFile(file, "blob:two");

    revokeObjectURLsForFile(file);

    expect(revokeSpy).toHaveBeenCalledTimes(2);
    expect(revokeSpy).toHaveBeenCalledWith("blob:one");
    expect(revokeSpy).toHaveBeenCalledWith("blob:two");
  });

  it("revokes urls for multiple files", () => {
    const revokeSpy = vi.fn();
    URL.revokeObjectURL = revokeSpy;

    const fileA = {
      name: "a.png",
      size: 1,
      lastModified: 1,
      webkitRelativePath: "",
    };
    const fileB = {
      name: "b.png",
      size: 2,
      lastModified: 2,
      webkitRelativePath: "",
    };

    registerObjectURLForFile(fileA, "blob:a");
    registerObjectURLForFile(fileB, "blob:b");

    revokeObjectURLsForFiles([fileA, fileB]);

    expect(revokeSpy).toHaveBeenCalledWith("blob:a");
    expect(revokeSpy).toHaveBeenCalledWith("blob:b");
    expect(revokeSpy).toHaveBeenCalledTimes(2);
  });
});

