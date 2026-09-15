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
    expect(parseInput("https://b23.tv/av80433022")).toEqual({
      type: "avid",
      value: "80433022",
      page: 1,
    });
    expect(parseInput("复制这条链接 https://b23.tv/abc123，打开看看")).toEqual({
      type: "shortlink",
      value: "https://b23.tv/abc123",
    });
  });

  it("strips invisible characters pasted together with share text", () => {
    expect(parseInput("https://b23.tv/W8CN0JV\u200B")).toEqual({
      type: "shortlink",
      value: "https://b23.tv/W8CN0JV",
    });
    expect(parseInput("\uFEFF这个视频BV1GJ411x7h7很好看")).toEqual({
      type: "bvid",
      value: "BV1GJ411x7h7",
      page: 1,
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

  it("parses collection and series links whose path segment is the uploader mid", () => {
    expect(parseInput("https://www.bilibili.com/list/1958703906?sid=547718")).toEqual({
      type: "season",
      value: "547718",
      mid: "1958703906",
      fallbackSeries: true,
    });
    expect(parseInput("https://www.bilibili.com/list/1958703906?sid=547718&oid=687146339&bvid=BV1DU4y1r7tz")).toEqual({
      type: "season",
      value: "547718",
      mid: "1958703906",
      fallbackSeries: true,
    });
    expect(
      parseInput("https://www.bilibili.com/medialist/play/1958703906?business=space_series&business_id=547718&desc=1"),
    ).toEqual({ type: "series", value: "547718", mid: "1958703906" });
    expect(
      parseInput("https://www.bilibili.com/medialist/play/1958703906?business=space_season&business_id=547718"),
    ).toEqual({ type: "season", value: "547718", mid: "1958703906" });
    expect(parseInput("https://space.bilibili.com/1958703906/channel/seriesdetail?sid=547718")).toEqual({
      type: "series",
      value: "547718",
      mid: "1958703906",
    });
  });

  it("keeps uploader space links reachable when only a mid is present", () => {
    expect(parseInput("https://www.bilibili.com/list/1958703906")).toEqual({ type: "mid", value: "1958703906" });
    expect(parseInput("https://space.bilibili.com/1958703906/video")).toEqual({ type: "mid", value: "1958703906" });
  });

  it("treats watchlater links as unsupported instead of unrecognized", () => {
    expect(parseInput("https://www.bilibili.com/list/watchlater?bvid=BV1GJ411x7h7")).toMatchObject({ type: "unsupported" });
    expect(parseInput("https://www.bilibili.com/medialist/play/watchlater")).toMatchObject({ type: "unsupported" });
    expect(parseInput("https://www.bilibili.com/watchlater/#/av80433022")).toMatchObject({ type: "unsupported" });
  });

  it("reads video ids from query params on festival and player pages", () => {
    expect(parseInput("https://www.bilibili.com/festival/2023honkaiimpact3gala?bvid=BV1ay4y1d77f")).toEqual({
      type: "bvid",
      value: "BV1ay4y1d77f",
      page: 1,
    });
    expect(parseInput("https://player.bilibili.com/player.html?aid=92494333&cid=157926707&page=1")).toEqual({
      type: "avid",
      value: "92494333",
      page: 1,
    });
  });

  it("parses legacy av urls", () => {
    expect(parseInput("https://m.bilibili.com/video/av123.html")).toEqual({ type: "avid", value: "123", page: 1 });
    expect(parseInput("https://www.bilibili.com/video/av170001/index_2.html")).toEqual({
      type: "avid",
      value: "170001",
      page: 2,
    });
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

  it("resolves the reported share short link to its real video id", async () => {
    MNBridge.send.mockResolvedValue({
      ok: true,
      data: {
        statusCode: 200,
        finalUrl:
          "https://www.bilibili.com/video/BV13iDvBVENd/?buvid=XU01A7C0DC09C340710EA76A34BA63952F56A&p=1&share_source=COPY&unique_k=W8CN0JV",
      },
    });

    await expect(resolveBilibiliInput("https://b23.tv/W8CN0JV")).resolves.toEqual({
      type: "bvid",
      value: "BV13iDvBVENd",
      page: 1,
    });
  });

  it("falls back to the Location header when redirects were not followed", async () => {
    MNBridge.send.mockResolvedValue({
      ok: true,
      data: {
        statusCode: 302,
        finalUrl: "https://b23.tv/abc123",
        location: "https://www.bilibili.com/video/BV1GJ411x7h7",
      },
    });

    await expect(resolveBilibiliInput("https://b23.tv/abc123")).resolves.toEqual({
      type: "bvid",
      value: "BV1GJ411x7h7",
      page: 1,
    });
  });

  it("passes through unsupported targets instead of failing the resolve", async () => {
    MNBridge.send.mockResolvedValue({
      ok: true,
      data: { statusCode: 200, finalUrl: "https://www.bilibili.com/bangumi/play/ep123456" },
    });

    await expect(resolveBilibiliInput("https://b23.tv/abc123")).resolves.toMatchObject({ type: "unsupported" });
  });

  it("reports the resolved target when the short link lands on an unsupported page", async () => {
    MNBridge.send.mockResolvedValue({
      ok: true,
      data: { statusCode: 200, finalUrl: "https://www.bilibili.com/blackboard/activity-abc.html" },
    });

    await expect(resolveBilibiliInput("https://b23.tv/abc123")).rejects.toThrow(
      "B站短链跳转到暂不支持的页面: https://www.bilibili.com/blackboard/activity-abc.html",
    );
  });

  it("reports the http status when the short link request is blocked", async () => {
    MNBridge.send.mockResolvedValue({
      ok: true,
      data: { statusCode: 412, finalUrl: "https://b23.tv/abc123", location: "https://b23.tv/abc123" },
    });

    await expect(resolveBilibiliInput("https://b23.tv/abc123")).rejects.toThrow("B站短链解析被拦截 (HTTP 412)");
  });

  it("keeps placeholder bridge values out of the resolved url and the error message", async () => {
    MNBridge.send.mockResolvedValue({
      ok: true,
      data: { statusCode: 200, finalUrl: "[object NSURL]", location: "[object NSURL]" },
    });

    await expect(resolveBilibiliInput("https://b23.tv/abc123")).rejects.toThrow(
      "B站短链解析失败: 未获得最终地址 (https://b23.tv/abc123)",
    );
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
