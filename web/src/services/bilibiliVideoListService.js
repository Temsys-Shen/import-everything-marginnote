import { expandPages, fetchVideoInfo } from "./bilibiliApiService";

export function getVideoTitle(video) {
  if (!video) {
    return "";
  }
  const candidates = [
    video.title,
    video.name,
    video.archive_title,
    video.page_title,
    video.show_title,
  ];
  for (const candidate of candidates) {
    const title = String(candidate || "").trim();
    if (title && title.toLowerCase() !== "bilibili") {
      return title;
    }
  }
  return "";
}

export function requireVideoTitle(video) {
  const title = getVideoTitle(video);
  if (!title) {
    throw new Error(`视频缺少标题: ${video && video.bvid ? video.bvid : "unknown"}`);
  }
  return title;
}

export function videoItemKey(video) {
  if (video && video.page && video.page > 1) return video.bvid + "-p" + video.page;
  return video ? video.bvid : "";
}

export function buildSelectedVideoKeys(videos) {
  return new Set(videos.map((v) => videoItemKey(v)));
}

export function buildVideoImportItem(video) {
  const title = video.part ? `${requireVideoTitle(video)} - ${video.part}` : requireVideoTitle(video);
  return {
    bvid: video.bvid,
    title,
    duration: String(video.duration || ""),
    thumbnail: video.pic || video.thumbnail || "",
    page: video.page || 1,
    cid: video.cid || null,
  };
}

export function normalizeFavoriteVideo(media) {
  return {
    aid: media.id,
    bvid: media.bvid,
    title: media.title,
    pic: media.cover,
    duration: media.duration,
    owner: media.upper ? { name: media.upper.name, mid: media.upper.mid } : null,
  };
}

export async function expandVideoListWithPages(list) {
  const expanded = [];
  for (const item of list) {
    const bvid = String(item && item.bvid || "").trim();
    const aid = item && item.aid ? item.aid : item && item.id;
    if (!bvid && !aid) {
      throw new Error(`视频缺少BVID/AV: ${getVideoTitle(item) || "unknown"}`);
    }
    const data = await fetchVideoInfo(bvid ? { bvid } : { avid: String(aid) });
    const pages = expandPages(data, bvid || data.bvid, item.page || 1);
    for (const page of pages) {
      expanded.push(page);
    }
  }
  return expanded;
}
