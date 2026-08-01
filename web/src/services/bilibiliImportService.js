import MNBridge from "../lib/mnBridge";

export async function importVideos(videos) {
  const first = videos && videos[0] ? videos[0] : null;
  const command = first && first.platform === "youtube"
    ? "importYouTubeVideos"
    : "importBilibiliVideos";
  const res = await MNBridge.send(command, { videos });
  if (!res || !res.ok) {
    throw new Error(res?.message || "导入失败");
  }
  return res.data;
}
