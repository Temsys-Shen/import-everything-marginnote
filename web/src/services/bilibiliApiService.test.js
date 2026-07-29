import { beforeEach, describe, expect, it, vi } from "vitest";
import MNBridge from "../lib/mnBridge";
import {
  expandPages,
  fetchCollectedFoldersAll,
  fetchFavoriteFolderVideosAll,
  fetchUserCollections,
  parseInput,
  resolveBilibiliInput,
} from "./bilibiliApiService";

vi.mock("../lib/mnBridge", () => ({
  default: {
    send: vi.fn(),
  },
}));

describe("parseInput", () => {
  it("parses standalone video ids", () => {
    expect(parseInput("BV1et411b73Z")).toEqual({ type: "bvid", value: "BV1et411b73Z", page: 1 });
    expect(parseInput("av80433022")).toEqual({ type: "avid", value: "80433022", page: 1 });
  });

  it("parses desktop and mobile video urls with page params", () => {
    expect(parseInput("https://www.bilibili.com/video/BV1et411b73Z/?p=12&vd_source=abc")).toEqual({
      type: "bvid",
      value: "BV1et411b73Z",
      page: 12,
    });
    expect(parseInput("https://m.bilibili.com/video/BV1GJ411x7h7?p=2&share_source=copy_web")).toEqual({
      type: "bvid",
      value: "BV1GJ411x7h7",
      page: 2,
    });
    expect(parseInput("www.bilibili.com/video/av80433022?spm_id_from=333.337.search-card.all.click")).toEqual({
      type: "avid",
      value: "80433022",
      page: 1,
    });
  });

  it("extracts ids and urls from share text", () => {
    expect(parseInput("复制这条链接打开哔哩哔哩 https://www.bilibili.com/video/BV1GJ411x7h7/?p=3")).toEqual({
      type: "bvid",
      value: "BV1GJ411x7h7",
      page: 3,
    });
    expect(parseInput("这个视频BV1GJ411x7h7很好看")).toEqual({ type: "bvid", value: "BV1GJ411x7h7", page: 1 });
  });

  it("parses b23 direct bvid links and marks random short links for async resolve", () => {
    expect(parseInput("https://b23.tv/BV1GJ411x7h7")).toEqual({
      type: "bvid",
      value: "BV1GJ411x7h7",
      page: 1,
    });
    expect(parseInput("复制这条链接 https://b23.tv/abc123，打开看看")).toEqual({
      type: "shortlink",
      value: "https://b23.tv/abc123",
    });
  });

  it("parses user, collection, series, and favorite urls", () => {
    expect(parseInput("123456")).toEqual({ type: "mid", value: "123456" });
    expect(parseInput("https://space.bilibili.com/123456/favlist?fid=987654")).toEqual({
      type: "favorite",
      value: "987654",
    });
    expect(parseInput("https://space.bilibili.com/123456/lists/456?type=series")).toEqual({
      type: "series",
      value: "456",
      mid: "123456",
    });
    expect(parseInput("https://space.bilibili.com/123456/lists/456?type=season")).toEqual({
      type: "season",
      value: "456",
      mid: "123456",
    });
    expect(parseInput("https://space.bilibili.com/123456/channel/collectiondetail?sid=456")).toEqual({
      type: "season",
      value: "456",
      mid: "123456",
    });
    expect(parseInput("https://space.bilibili.com/53714816/favlist?fid=7526324&ftype=collect&ctype=21")).toEqual({
      type: "collected-season",
      value: "7526324",
      mid: "53714816",
    });
    expect(parseInput("https://www.bilibili.com/medialist/play/ml123456")).toEqual({
      type: "favorite",
      value: "123456",
    });
    expect(parseInput("https://www.bilibili.com/list/ml123456")).toEqual({
      type: "favorite",
      value: "123456",
    });
  });

  it("reports unsupported bilibili content types explicitly", () => {
    expect(parseInput("https://www.bilibili.com/bangumi/play/ep123456")).toMatchObject({ type: "unsupported" });
    expect(parseInput("https://live.bilibili.com/123456")).toMatchObject({ type: "unsupported" });
    expect(parseInput("https://www.bilibili.com/read/cv123456")).toMatchObject({ type: "unsupported" });
    expect(parseInput("https://www.bilibili.com/cheese/play/ep123456")).toMatchObject({ type: "unsupported" });
  });
});

describe("resolveBilibiliInput", () => {
  beforeEach(() => {
    MNBridge.send.mockReset();
  });

  it("resolves random b23 short links through the bridge", async () => {
    MNBridge.send.mockResolvedValue({
      ok: true,
      data: {
        finalUrl: "https://www.bilibili.com/video/BV1GJ411x7h7/?p=4",
        statusCode: 200,
      },
    });

    await expect(resolveBilibiliInput("https://b23.tv/abc123")).resolves.toEqual({
      type: "bvid",
      value: "BV1GJ411x7h7",
      page: 4,
    });
    expect(MNBridge.send).toHaveBeenCalledWith("bilibiliResolveUrl", { url: "https://b23.tv/abc123" });
  });

  it("throws bridge errors for unresolved short links", async () => {
    MNBridge.send.mockResolvedValue({ ok: false, code: "BILI_RESOLVE_ERROR", message: "network error" });
    await expect(resolveBilibiliInput("https://b23.tv/abc123")).rejects.toThrow("B站短链解析失败 BILI_RESOLVE_ERROR: network error");
  });
});

describe("fetch paged bilibili lists", () => {
  beforeEach(() => {
    MNBridge.send.mockReset();
  });

  function apiBody(data) {
    return Buffer.from(JSON.stringify({ code: 0, message: "OK", data }), "utf8").toString("base64");
  }

  it("reads favorite videos from medias pages", async () => {
    MNBridge.send
      .mockResolvedValueOnce({
        ok: true,
        data: { statusCode: 200, bodyB64: apiBody({ medias: [{ bvid: "BV1GJ411x7h7" }], has_more: true }) },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { statusCode: 200, bodyB64: apiBody({ medias: [{ bvid: "BV1et411b73Z" }], has_more: false }) },
      });

    await expect(fetchFavoriteFolderVideosAll("123456")).resolves.toEqual([
      { bvid: "BV1GJ411x7h7" },
      { bvid: "BV1et411b73Z" },
    ]);
    expect(MNBridge.send).toHaveBeenCalledTimes(2);
  });

  it("uses space referer for user collection endpoints", async () => {
    MNBridge.send.mockResolvedValue({
      ok: true,
      data: {
        statusCode: 200,
        bodyB64: apiBody({ items_lists: { seasons_list: [], series_list: [] } }),
      },
    });

    await expect(fetchUserCollections("546195")).resolves.toEqual({
      items_lists: { seasons_list: [], series_list: [] },
    });
    expect(MNBridge.send).toHaveBeenCalledWith("bilibiliApiProxy", expect.objectContaining({
      referer: "https://space.bilibili.com",
    }));
  });

  it("reads collected video collection folders from list pages", async () => {
    MNBridge.send
      .mockResolvedValueOnce({
        ok: true,
        data: {
          statusCode: 200,
          bodyB64: apiBody({ list: [{ id: 7526324, type: 21, mid: 99037555, title: "可爱放松BGM合集" }], has_more: true }),
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          statusCode: 200,
          bodyB64: apiBody({ list: [{ id: 7526325, type: 21, mid: 99037555, title: "第二个合集" }], has_more: false }),
        },
      });

    await expect(fetchCollectedFoldersAll("53714816")).resolves.toEqual([
      { id: 7526324, type: 21, mid: 99037555, title: "可爱放松BGM合集" },
      { id: 7526325, type: 21, mid: 99037555, title: "第二个合集" },
    ]);
    expect(MNBridge.send).toHaveBeenNthCalledWith(1, "bilibiliApiProxy", expect.objectContaining({
      url: expect.stringContaining("/x/v3/fav/folder/collected/list"),
      referer: "https://space.bilibili.com",
    }));
    expect(MNBridge.send).toHaveBeenNthCalledWith(2, "bilibiliApiProxy", expect.objectContaining({
      url: expect.stringContaining("pn=2"),
    }));
  });
});

describe("expandPages", () => {
  it("expands every page from view api data", () => {
    const result = expandPages({
      bvid: "BV1multi0000",
      title: "多P视频",
      pic: "cover.jpg",
      owner: { name: "UP" },
      pages: [
        { page: 1, cid: 101, part: "第一P", duration: 11 },
        { page: 2, cid: 102, part: "第二P", duration: 22 },
      ],
    });

    expect(result).toEqual([
      expect.objectContaining({ bvid: "BV1multi0000", title: "多P视频", page: 1, cid: 101, part: "第一P", duration: 11 }),
      expect.objectContaining({ bvid: "BV1multi0000", title: "多P视频", page: 2, cid: 102, part: "第二P", duration: 22 }),
    ]);
  });

  it("keeps requested page for single-page data", () => {
    const result = expandPages({
      bvid: "BV1single00",
      title: "单P视频",
      duration: 33,
      pages: [{ page: 1, cid: 201, duration: 33 }],
    }, "BV1single00", 3);

    expect(result).toEqual([expect.objectContaining({ bvid: "BV1single00", page: 3, cid: 201, duration: 33 })]);
  });
});
