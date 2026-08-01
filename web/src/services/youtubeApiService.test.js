import { beforeEach, describe, expect, it, vi } from "vitest";
import MNBridge from "../lib/mnBridge";
import {
  fetchYouTubePlaylistVideos,
  fetchYouTubeVideoInfo,
  isYouTubeInput,
  parseYouTubeInput,
} from "./youtubeApiService";

vi.mock("../lib/mnBridge", () => ({
  default: {
    send: vi.fn(),
  },
}));

function bridgeOk(data) {
  return { ok: true, data };
}

function base64Of(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function bridgeBody(body) {
  return bridgeOk({ statusCode: 200, bodyB64: base64Of(JSON.stringify(body)) });
}

describe("parseYouTubeInput", () => {
  it("parses watch urls", () => {
    expect(parseYouTubeInput("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      type: "video",
      videoId: "dQw4w9WgXcQ",
    });
    expect(parseYouTubeInput("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=123")).toEqual({
      type: "video",
      videoId: "dQw4w9WgXcQ",
    });
  });

  it("parses youtu.be short urls", () => {
    expect(parseYouTubeInput("https://youtu.be/dQw4w9WgXcQ")).toEqual({
      type: "video",
      videoId: "dQw4w9WgXcQ",
    });
  });

  it("parses shorts and live urls", () => {
    expect(parseYouTubeInput("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toEqual({
      type: "video",
      videoId: "dQw4w9WgXcQ",
    });
    expect(parseYouTubeInput("https://www.youtube.com/live/dQw4w9WgXcQ")).toEqual({
      type: "video",
      videoId: "dQw4w9WgXcQ",
    });
  });

  it("parses embed urls", () => {
    expect(parseYouTubeInput("https://www.youtube.com/embed/dQw4w9WgXcQ")).toEqual({
      type: "video",
      videoId: "dQw4w9WgXcQ",
    });
  });

  it("parses playlist urls", () => {
    expect(parseYouTubeInput("https://www.youtube.com/playlist?list=PLabcDEF123")).toEqual({
      type: "playlist",
      playlistId: "PLabcDEF123",
    });
  });

  it("extracts youtube urls from share text", () => {
    expect(parseYouTubeInput("【好歌】https://www.youtube.com/watch?v=dQw4w9WgXcQ 看看吧")).toEqual({
      type: "video",
      videoId: "dQw4w9WgXcQ",
    });
  });

  it("returns unknown for non-youtube input", () => {
    expect(parseYouTubeInput("BV1et411b73Z")).toEqual({ type: "unknown" });
    expect(parseYouTubeInput("https://www.bilibili.com/video/BV1et411b73Z")).toEqual({ type: "unknown" });
    expect(parseYouTubeInput("")).toEqual({ type: "empty" });
  });

  it("parses bare 11-char video ids but not bilibili mids/bvids", () => {
    expect(parseYouTubeInput("dQw4w9WgXcQ")).toEqual({ type: "video", videoId: "dQw4w9WgXcQ" });
    expect(parseYouTubeInput("486906719")).toEqual({ type: "unknown" });
    expect(parseYouTubeInput("BV1et411b73Z")).toEqual({ type: "unknown" });
  });
});

describe("isYouTubeInput", () => {
  it("detects youtube hosts and bare ids", () => {
    expect(isYouTubeInput("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
    expect(isYouTubeInput("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(isYouTubeInput("dQw4w9WgXcQ")).toBe(true);
    expect(isYouTubeInput("BV1et411b73Z")).toBe(false);
    expect(isYouTubeInput("https://www.bilibili.com/video/BV1et411b73Z")).toBe(false);
    expect(isYouTubeInput("")).toBe(false);
  });
});

describe("fetchYouTubeVideoInfo", () => {
  beforeEach(() => {
    MNBridge.send.mockReset();
  });

  it("normalizes player details", async () => {
    MNBridge.send.mockResolvedValueOnce(bridgeBody({
      videoDetails: {
        videoId: "dQw4w9WgXcQ",
        title: "Rick Astley - Never Gonna Give You Up",
        lengthSeconds: "213",
        author: "Rick Astley",
        thumbnail: { thumbnails: [{ url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg" }] },
      },
    }));

    const info = await fetchYouTubeVideoInfo("dQw4w9WgXcQ");
    expect(info).toEqual({
      videoId: "dQw4w9WgXcQ",
      title: "Rick Astley - Never Gonna Give You Up",
      duration: 213,
      author: "Rick Astley",
      thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    });
    expect(MNBridge.send).toHaveBeenCalledTimes(1);
    const [command, payload] = MNBridge.send.mock.calls[0];
    expect(command).toBe("youtubeApiProxy");
    expect(payload.url).toContain("/youtubei/v1/player");
    expect(JSON.parse(payload.body)).toMatchObject({ videoId: "dQw4w9WgXcQ" });
  });

  it("throws when video details are missing", async () => {
    MNBridge.send.mockResolvedValueOnce(bridgeBody({ videoDetails: null }));
    await expect(fetchYouTubeVideoInfo("dQw4w9WgXcQ")).rejects.toThrow(/未找到该YouTube视频/);
  });
});

describe("fetchYouTubePlaylistVideos", () => {
  beforeEach(() => {
    MNBridge.send.mockReset();
  });

  function lockup(videoId, title, durationText) {
    return {
      lockupViewModel: {
        contentId: videoId,
        metadata: {
          lockupMetadataViewModel: {
            title: { content: title },
            metadata: {
              contentMetadataViewModel: {
                metadataRows: [{ metadataParts: [{ text: { content: "Some Channel" } }] }],
              },
            },
          },
        },
        contentImage: {
          thumbnailViewModel: {
            image: { sources: [{ url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }] },
            overlays: [{
              thumbnailBottomOverlayViewModel: {
                badges: [{ thumbnailBadgeViewModel: { text: durationText } }],
              },
            }],
          },
        },
      },
    };
  }

  it("enumerates a single-page playlist with duration parsing", async () => {
    const firstPage = {
      metadata: { playlistMetadataRenderer: { title: "Top 50 Pop Music Videos United States" } },
      contents: {
        twoColumnBrowseResultsRenderer: {
          tabs: [{
            tabRenderer: {
              content: {
                sectionListRenderer: {
                  contents: [
                    { itemSectionRenderer: { contents: [lockup("zRVjZ2DJ9Cg", "Dai Dai (Official Video)", "3:51")] } },
                  ],
                },
              },
            },
          }],
        },
      },
    };
    MNBridge.send.mockResolvedValueOnce(bridgeBody(firstPage));

    const result = await fetchYouTubePlaylistVideos("PLabc");
    expect(result.title).toBe("Top 50 Pop Music Videos United States");
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0]).toMatchObject({
      videoId: "zRVjZ2DJ9Cg",
      title: "Dai Dai (Official Video)",
      duration: 231,
      owner: "Some Channel",
    });
  });

  it("follows continuation tokens across pages and dedupes", async () => {
    const page1 = {
      metadata: { playlistMetadataRenderer: { title: "Big Playlist" } },
      contents: {
        twoColumnBrowseResultsRenderer: {
          tabs: [{
            tabRenderer: {
              content: {
                sectionListRenderer: {
                  contents: [
                    { itemSectionRenderer: { contents: [lockup("aaa11111111", "A", "1:00")] } },
                    {
                      continuationItemRenderer: {
                        continuationEndpoint: {
                          continuationCommand: { token: "TOKEN_1" },
                        },
                      },
                    },
                  ],
                },
              },
            },
          }],
        },
      },
    };
    const page2 = {
      contents: {
        twoColumnBrowseResultsRenderer: {
          tabs: [{
            tabRenderer: {
              content: {
                sectionListRenderer: {
                  contents: [
                    { itemSectionRenderer: { contents: [lockup("bbb22222222", "B", "2:30")] } },
                    { itemSectionRenderer: { contents: [lockup("aaa11111111", "A duplicate", "1:00")] } },
                  ],
                },
              },
            },
          }],
        },
      },
    };
    MNBridge.send.mockResolvedValueOnce(bridgeBody(page1));
    MNBridge.send.mockResolvedValueOnce(bridgeBody(page2));

    const result = await fetchYouTubePlaylistVideos("PLbig");
    expect(result.videos.map((v) => v.videoId)).toEqual(["aaa11111111", "bbb22222222"]);
    const browseCalls = MNBridge.send.mock.calls.filter(([command]) => command === "youtubeApiProxy");
    expect(browseCalls).toHaveLength(2);
    expect(JSON.parse(browseCalls[1][1].body)).toMatchObject({ continuation: "TOKEN_1" });
  });

  it("throws when the playlist has no videos", async () => {
    MNBridge.send.mockResolvedValueOnce(bridgeBody({ metadata: { playlistMetadataRenderer: { title: "Empty" } } }));
    await expect(fetchYouTubePlaylistVideos("PLempty")).rejects.toThrow(/未找到该YouTube播放列表/);
  });
});
