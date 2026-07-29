import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchVideoInfo } from "./bilibiliApiService";
import {
  buildSelectedVideoKeys,
  buildVideoImportItem,
  expandVideoListWithPages,
  normalizeFavoriteVideo,
  videoItemKey,
} from "./bilibiliVideoListService";

vi.mock("./bilibiliApiService", () => ({
  fetchVideoInfo: vi.fn(),
  expandPages: vi.fn((data, bvid, page) => {
    if (!data.pages || data.pages.length <= 1) {
      return [{
        bvid: bvid || data.bvid,
        title: data.title,
        page: page || 1,
        cid: data.pages && data.pages[0] ? data.pages[0].cid : null,
        duration: data.duration,
        pic: data.pic,
      }];
    }
    return data.pages.map((pg) => ({
      bvid: bvid || data.bvid,
      title: data.title,
      part: pg.part,
      page: pg.page,
      cid: pg.cid,
      duration: pg.duration,
      pic: data.pic,
    }));
  }),
}));

describe("bilibili video list helpers", () => {
  beforeEach(() => {
    fetchVideoInfo.mockReset();
  });

  it("uses page-aware keys for multi-p videos", () => {
    const videos = [
      { bvid: "BV1GJ411x7h7", page: 1 },
      { bvid: "BV1GJ411x7h7", page: 2 },
      { bvid: "BV1GJ411x7h7", page: 3 },
    ];

    expect(videos.map((video) => videoItemKey(video))).toEqual([
      "BV1GJ411x7h7",
      "BV1GJ411x7h7-p2",
      "BV1GJ411x7h7-p3",
    ]);
    expect([...buildSelectedVideoKeys(videos)]).toEqual([
      "BV1GJ411x7h7",
      "BV1GJ411x7h7-p2",
      "BV1GJ411x7h7-p3",
    ]);
  });

  it("keeps page and cid in import payloads", () => {
    expect(buildVideoImportItem({
      bvid: "BV1GJ411x7h7",
      title: "课程",
      part: "第二节",
      page: 2,
      cid: 102,
      duration: 22,
      pic: "cover.jpg",
    })).toEqual({
      bvid: "BV1GJ411x7h7",
      title: "课程 - 第二节",
      duration: "22",
      thumbnail: "cover.jpg",
      page: 2,
      cid: 102,
    });
  });

  it("normalizes favorite media list items", () => {
    expect(normalizeFavoriteVideo({
      id: 80433022,
      bvid: "BV1GJ411x7h7",
      title: "收藏视频",
      cover: "cover.jpg",
      duration: 213,
      upper: { name: "UP", mid: 486906719 },
    })).toEqual({
      aid: 80433022,
      bvid: "BV1GJ411x7h7",
      title: "收藏视频",
      pic: "cover.jpg",
      duration: 213,
      owner: { name: "UP", mid: 486906719 },
    });
  });

  it("expands batch videos in original order", async () => {
    fetchVideoInfo
      .mockResolvedValueOnce({
        bvid: "BV1first000",
        title: "第一组",
        pic: "first.jpg",
        pages: [
          { page: 1, cid: 101, part: "P1", duration: 11 },
          { page: 2, cid: 102, part: "P2", duration: 22 },
        ],
      })
      .mockResolvedValueOnce({
        bvid: "BV1second00",
        title: "第二组",
        pic: "second.jpg",
        duration: 33,
        pages: [{ page: 1, cid: 201, duration: 33 }],
      });

    const expanded = await expandVideoListWithPages([
      { bvid: "BV1first000" },
      { bvid: "BV1second00" },
    ]);

    expect(expanded).toEqual([
      expect.objectContaining({ bvid: "BV1first000", page: 1, cid: 101 }),
      expect.objectContaining({ bvid: "BV1first000", page: 2, cid: 102 }),
      expect.objectContaining({ bvid: "BV1second00", page: 1, cid: 201 }),
    ]);
    expect(fetchVideoInfo).toHaveBeenNthCalledWith(1, { bvid: "BV1first000" });
    expect(fetchVideoInfo).toHaveBeenNthCalledWith(2, { bvid: "BV1second00" });
  });
});
