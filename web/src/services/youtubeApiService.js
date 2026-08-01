import MNBridge from "../lib/mnBridge";

const YT_API_BASE = "https://www.youtube.com/youtubei/v1";
const CLIENT_CONTEXT = {
  client: {
    clientName: "WEB",
    clientVersion: "2.20250101.00.00",
    hl: "en",
  },
};

const YT_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_BARE_ID_PATTERN = /^(?=.*[A-Za-z])[A-Za-z0-9_-]{11}$/;
const YT_URL_PATTERN = /(?:https?:\/\/)?(?:[A-Za-z0-9-]+\.)?(?:youtube\.com|youtu\.be)\/[^\s，。；、"'<>]+/i;

function stripTrailingUrlPunctuation(value) {
  return String(value || "").replace(/[),.;!?，。；、）】》]+$/g, "");
}

function extractYouTubeInputCandidate(input) {
  const s = String(input || "").trim();
  if (!s) return "";

  const urlMatch = s.match(YT_URL_PATTERN);
  if (urlMatch) return stripTrailingUrlPunctuation(urlMatch[0]);

  const idMatch = s.match(/\b[A-Za-z0-9_-]{11}\b/);
  if (idMatch) return idMatch[0];

  return s;
}

function tryYouTubeURL(str) {
  try {
    return new URL(str);
  } catch {
    try {
      return new URL("https://" + str);
    } catch {
      return null;
    }
  }
}

export function parseYouTubeInput(input) {
  const s = extractYouTubeInputCandidate(input);
  if (!s) return { type: "empty" };

  if (YT_BARE_ID_PATTERN.test(s)) {
    return { type: "video", videoId: s };
  }

  const url = tryYouTubeURL(s);
  if (!url) return { type: "unknown" };

  const host = url.hostname.toLowerCase();
  const isYouTubeHost =
    host === "youtu.be" ||
    host.endsWith("youtube.com") ||
    host.endsWith("youtube-nocookie.com");
  if (!isYouTubeHost) return { type: "unknown" };

  const path = url.pathname.replace(/\/+$/, "");
  const list = url.searchParams.get("list");
  const v = url.searchParams.get("v");

  if (host === "youtu.be") {
    const id = path.split("/").filter(Boolean)[0] || "";
    if (YT_VIDEO_ID.test(id)) return { type: "video", videoId: id };
    return { type: "unknown" };
  }

  if (path === "/playlist" || path.startsWith("/playlist/")) {
    if (list) return { type: "playlist", playlistId: list };
    return { type: "unknown" };
  }

  const shortsMatch = path.match(/^\/shorts\/([A-Za-z0-9_-]{11})/);
  if (shortsMatch) return { type: "video", videoId: shortsMatch[1] };

  const liveMatch = path.match(/^\/live\/([A-Za-z0-9_-]{11})/);
  if (liveMatch) return { type: "video", videoId: liveMatch[1] };

  const embedMatch = path.match(/^\/embed\/([A-Za-z0-9_-]{11})/);
  if (embedMatch) return { type: "video", videoId: embedMatch[1] };

  const vSeg = path.match(/^\/v\/([A-Za-z0-9_-]{11})/);
  if (vSeg) return { type: "video", videoId: vSeg[1] };

  if (v && YT_VIDEO_ID.test(v)) {
    return { type: "video", videoId: v };
  }

  if (path === "/watch" && list) {
    return { type: "playlist", playlistId: list };
  }

  return { type: "unknown" };
}

export function isYouTubeInput(input) {
  const s = String(input || "").trim();
  if (!s) return false;
  return /(?:youtube\.com|youtu\.be)(?:\/|$)/i.test(s) || YT_BARE_ID_PATTERN.test(extractYouTubeInputCandidate(s));
}

async function youtubeApi(endpoint, body) {
  const res = await MNBridge.send("youtubeApiProxy", {
    url: `${YT_API_BASE}/${endpoint}`,
    body: JSON.stringify({
      context: CLIENT_CONTEXT,
      ...body,
    }),
  });
  if (!res || !res.ok) {
    const code = res?.code ? ` ${res.code}` : "";
    throw new Error(`YouTube接口请求失败${code}: ${res?.message || "未知错误"}`);
  }
  if (res.data.statusCode !== 200) {
    throw new Error(`YouTube接口返回状态码${res.data.statusCode}: ${endpoint}`);
  }
  if (!res.data.bodyB64) {
    throw new Error(`YouTube接口返回空响应: ${endpoint}`);
  }

  let bodyText;
  try {
    const binary = atob(res.data.bodyB64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    bodyText = new TextDecoder().decode(bytes);
  } catch {
    throw new Error("YouTube 接口响应解码失败");
  }

  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new Error(`YouTube接口响应解析失败: ${endpoint}`);
  }
  return parsed;
}

export async function fetchYouTubeVideoInfo(videoId) {
  const data = await youtubeApi("player", { videoId });
  const vd = data && data.videoDetails;
  if (!vd || !vd.videoId) {
    throw new Error("未找到该YouTube视频，可能已删除或设为私密");
  }

  return {
    videoId: vd.videoId,
    title: vd.title || "",
    duration: Number(vd.lengthSeconds) || 0,
    author: vd.author || "",
    thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  };
}

function collectLockups(node, out) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) collectLockups(item, out);
    return out;
  }
  if (node.lockupViewModel) {
    out.push(node.lockupViewModel);
  }
  for (const key of Object.keys(node)) {
    collectLockups(node[key], out);
  }
  return out;
}

function findContinuationToken(node) {
  if (!node || typeof node !== "object") return "";
  if (Array.isArray(node)) {
    for (const item of node) {
      const token = findContinuationToken(item);
      if (token) return token;
    }
    return "";
  }
  const cont = node.continuationItemRenderer;
  if (cont) {
    const token = cont.continuationEndpoint?.continuationCommand?.token;
    if (token) return token;
  }
  for (const key of Object.keys(node)) {
    const token = findContinuationToken(node[key]);
    if (token) return token;
  }
  return "";
}

function parseDurationText(text) {
  const m = String(text || "").match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  const hours = m[1] ? Number(m[1]) : 0;
  return hours * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function extractLockupOwner(lockup) {
  try {
    const rows = lockup.metadata.lockupMetadataViewModel.metadata.contentMetadataViewModel.metadataRows || [];
    const parts = rows[0] && rows[0].metadataParts ? rows[0].metadataParts : [];
    const first = parts[0] && parts[0].text && parts[0].text.content;
    return typeof first === "string" ? first : "";
  } catch {
    return "";
  }
}

function normalizePlaylistItem(lockup) {
  if (!lockup || typeof lockup !== "object") return null;

  const videoId = String(lockup.contentId || "");
  if (!YT_VIDEO_ID.test(videoId)) return null;

  let title = "";
  try {
    title = lockup.metadata.lockupMetadataViewModel.title.content || "";
  } catch {
    title = "";
  }

  let duration = 0;
  try {
    const badges = lockup.contentImage.thumbnailViewModel.overlays[0].thumbnailBottomOverlayViewModel.badges || [];
    const badgeText = badges[0] && badges[0].thumbnailBadgeViewModel ? badges[0].thumbnailBadgeViewModel.text : "";
    duration = parseDurationText(badgeText);
  } catch {
    duration = 0;
  }

  return {
    videoId,
    title,
    duration,
    thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    owner: extractLockupOwner(lockup),
  };
}

function extractPlaylistTitle(data) {
  try {
    const title = data.metadata.playlistMetadataRenderer.title;
    if (typeof title === "string" && title.trim()) return title.trim();
  } catch {
    // ignore
  }
  try {
    const title = data.microformat.microformatDataRenderer.title;
    if (typeof title === "string" && title.trim()) return title.trim();
  } catch {
    // ignore
  }
  return "";
}

export async function fetchYouTubePlaylistVideos(playlistId) {
  let data = await youtubeApi("browse", { browseId: `VL${playlistId}` });
  const title = extractPlaylistTitle(data);
  const videos = [];
  const seen = new Set();

  let guard = 0;
  while (data && guard < 50) {
    guard += 1;
    for (const lockup of collectLockups(data, [])) {
      const item = normalizePlaylistItem(lockup);
      if (item && item.videoId && !seen.has(item.videoId)) {
        seen.add(item.videoId);
        videos.push(item);
      }
    }

    const token = findContinuationToken(data);
    if (!token) break;
    data = await youtubeApi("browse", { continuation: token });
  }

  if (videos.length === 0) {
    throw new Error(`未找到该YouTube播放列表的视频，播放列表可能为空或已删除: ${playlistId}`);
  }

  return {
    title,
    videos,
  };
}
