import MNBridge from "../lib/mnBridge";

export async function importVideos(videos) {
  const res = await MNBridge.send("importBilibiliVideos", { videos });
  if (!res || !res.ok) {
    throw new Error(res?.message || "导入失败");
  }
  return res.data;
}
