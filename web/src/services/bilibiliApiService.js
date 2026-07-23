import MNBridge from "../lib/mnBridge";

const API_BASE = "https://api.bilibili.com";

async function apiGet(endpoint, params = {}) {
  const qs = Object.entries(params)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const url = `${API_BASE}${endpoint}${qs ? "?" + qs : ""}`;

  const res = await MNBridge.send("bilibiliApiProxy", { url });
  if (!res || !res.ok) {
    const code = res?.code ? ` ${res.code}` : "";
    throw new Error(`B站API请求失败${code}: ${res?.message || "未知错误"} (${endpoint})`);
  }
  if (res.data.statusCode !== 200 && res.data.statusCode !== 0) {
    throw new Error(`B站API返回状态码${res.data.statusCode}: ${endpoint}`);
  }
  if (!res.data.bodyB64) {
    throw new Error(`B站API返回空响应: ${endpoint}`);
  }

  let body;
  try {
    const binary = atob(res.data.bodyB64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    body = new TextDecoder().decode(bytes);
  } catch {
    throw new Error("B站 API 响应解码失败");
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`B站API响应解析失败: ${endpoint}`);
  }
  if (parsed.code !== 0) {
    throw new Error(`B站API错误 code=${parsed.code}: ${parsed.message || "未知错误"} (${endpoint})`);
  }
  return parsed.data;
}

export async function fetchVideoInfo(input) {
  const parsed = parseInput(input);
  if (parsed.type === "bvid") {
    return apiGet("/x/web-interface/view", { bvid: parsed.value });
  }
  if (parsed.type === "avid") {
    return apiGet("/x/web-interface/view", { aid: parsed.value });
  }
  throw new Error("无法识别的 BVID/AV");
}

export function expandPages(videoData, bvid, page) {
  if (!videoData || !videoData.pages || videoData.pages.length <= 1) {
    return [{
      bvid: bvid || videoData.bvid,
      title: videoData.title,
      page: page || 1,
      cid: videoData.pages && videoData.pages[0] ? videoData.pages[0].cid : null,
      duration: videoData.duration,
      pic: videoData.pic,
      owner: videoData.owner,
      stat: videoData.stat,
    }];
  }

  return videoData.pages.map((pg) => ({
    bvid: bvid || videoData.bvid,
    title: videoData.title,
    part: pg.part || "",
    page: pg.page,
    cid: pg.cid,
    duration: pg.duration,
    pic: videoData.pic,
    owner: videoData.owner,
    stat: videoData.stat,
  }));
}

async function fetchAllPages(fetchFn, ...args) {
  const allItems = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const data = await fetchFn(...args, page);
    const archives = data?.archives || [];
    if (archives.length === 0) {
      hasMore = false;
    } else {
      for (const item of archives) {
        allItems.push(item);
      }
      page += 1;
      if (data.has_more === false) {
        hasMore = false;
      }
    }
  }

  return allItems;
}

export async function fetchUserCollections(mid, page = 1) {
  const data = await apiGet("/x/polymer/web-space/seasons_series_list", {
    mid,
    page_num: page,
    page_size: 30,
  });
  return data;
}

export async function fetchCollectionVideos(seasonId, mid, page = 1) {
  return apiGet("/x/polymer/web-space/seasons_archives_list", {
    season_id: seasonId,
    mid,
    page_num: page,
    page_size: 30,
  });
}

export async function fetchCollectionVideosAll(seasonId, mid) {
  return fetchAllPages(fetchCollectionVideos, seasonId, mid);
}

export async function fetchSeriesVideos(seriesId, mid) {
  return apiGet("/x/series/archives", { series_id: seriesId, mid });
}

export async function fetchFavoriteFolders(upMid) {
  return apiGet("/x/v3/fav/folder/created/list-all", { up_mid: upMid });
}

export async function fetchFavoriteFolderVideos(mediaId, page = 1) {
  return apiGet("/x/v3/fav/resource/list", {
    media_id: mediaId,
    pn: page,
    ps: 20,
  });
}

export async function fetchFavoriteFolderVideosAll(mediaId) {
  return fetchAllPages(fetchFavoriteFolderVideos, mediaId);
}

export async function fetchFavoriteFolderInfo(mediaId) {
  return apiGet("/x/v3/fav/folder/info", { media_id: mediaId });
}

function pageFromParams(params) {
  const p = params ? params.get("p") : null;
  if (p && /^\d+$/.test(p) && Number(p) > 1) return Number(p);
  return 1;
}

export function parseInput(input) {
  const s = String(input).trim();
  if (!s) return { type: "empty" };

  // standalone BVID
  if (/^BV1[A-Za-z0-9]{9}$/.test(s)) return { type: "bvid", value: s, page: 1 };
  // standalone AVID
  let m = s.match(/^av(\d{1,20})$/i);
  if (m) return { type: "avid", value: m[1], page: 1 };
  // standalone MID
  if (/^\d{5,20}$/.test(s)) return { type: "mid", value: s };

  // Try as URL
  const url = tryURL(s);
  if (!url) return { type: "unknown" };

  const host = url.hostname.toLowerCase();
  const path = url.pathname.replace(/\/+$/, "");
  const params = url.searchParams;

  // b23.tv/BV1xxx
  if (host.endsWith("b23.tv")) {
    const bv = path.match(/\/(BV1[A-Za-z0-9]{9})/);
    if (bv) return { type: "bvid", value: bv[1], page: pageFromParams(params) };
    return { type: "unknown" };
  }

  if (!host.endsWith("bilibili.com")) return { type: "unknown" };

  // bilibili.com/video/BV1xxx or /video/av123
  if (path.startsWith("/video/")) {
    const seg = path.slice(7);
    if (seg.startsWith("BV")) return { type: "bvid", value: seg, page: pageFromParams(params) };
    const av = seg.match(/^av(\d{1,20})$/i);
    if (av) return { type: "avid", value: av[1], page: pageFromParams(params) };
    return { type: "unknown" };
  }

  // space.bilibili.com URL patterns
  //   /{mid}              → user space
  //   /{mid}/favlist?fid= → favorite folder
  //   /{mid}/lists/{id}   → collection/series
  if (host.endsWith("space.bilibili.com")) {
    const parts = path.split("/").filter(Boolean);
    const mid = parts[0];
    if (!mid || !/^\d{5,20}$/.test(mid)) return { type: "unknown" };
    const action = parts[1] ? parts[1].toLowerCase() : "";
    // /{mid}/favlist?fid=xxx
    if (action === "favlist") {
      const fid = params.get("fid");
      if (fid && /^\d{1,20}$/.test(fid)) return { type: "favorite", value: fid };
      return { type: "mid", value: mid };
    }
    // /{mid}/lists/{id}?type=season
    if (action === "lists") {
      const listId = parts[2];
      const listType = (params.get("type") || "season").toLowerCase();
      if (listId && /^\d{1,20}$/.test(listId)) {
        if (listType === "series") {
          return { type: "series", value: listId, mid };
        }
        return { type: "season", value: listId, mid };
      }
      return { type: "mid", value: mid };
    }
    return { type: "mid", value: mid };
  }

  // medialist/play/{id} or medialist/detail/{id}
  if (path.startsWith("/medialist/play/") || path.startsWith("/medialist/detail/")) {
    const id = path.split("/").pop();
    if (/^\d{1,20}$/.test(id)) return { type: "favorite", value: id };
    return { type: "unknown" };
  }

  // Fallback: search path for BVID/av
  const bv = path.match(/(BV1[A-Za-z0-9]{9})/);
  if (bv) return { type: "bvid", value: bv[1] };
  const av = path.match(/av(\d{1,20})/i);
  if (av) return { type: "avid", value: av[1] };

  return { type: "unknown" };
}

function tryURL(str) {
  try { return new URL(str); } catch {}
  try { return new URL("https://" + str); } catch {}
  return null;
}

export function extractBVID(input) {
  const parsed = parseInput(input);
  if (parsed.type === "bvid") return parsed.value;
  return null;
}

export const BILI_INPUT_HINT = "支持 BVID / av号 / 视频链接 / b23.tv短链 / 用户MID / 用户空间链接 / 收藏夹链接";
