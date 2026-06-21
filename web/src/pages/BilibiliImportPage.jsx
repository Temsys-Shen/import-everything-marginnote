import { useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageTopbar from "../components/PageTopbar";
import {
  parseInput,
  fetchVideoInfo,
  fetchUserCollections,
  fetchCollectionVideos,
  fetchSeriesVideos,
  fetchFavoriteFolders,
  fetchFavoriteFolderVideos,
  fetchFavoriteFolderInfo,
  BILI_INPUT_HINT,
} from "../services/bilibiliApiService";
import { importVideos } from "../services/bilibiliImportService";

function fmtDuration(sec) {
  sec = Math.round(Number(sec) || 0);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`;
}

function VideoRow({ video, checked, onToggle }) {
  return (
    <label className="bili-video-row">
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <div className="bili-video-thumb">
        <img
          src={video.pic || video.thumbnail}
          alt=""
          loading="lazy"
          onError={(e) => { e.target.style.display = "none"; }}
        />
        <span className="bili-video-dur">{fmtDuration(video.duration)}</span>
      </div>
      <div className="bili-video-meta">
        <strong>{video.title}</strong>
        {video.owner && <span>{video.owner.name}</span>}
      </div>
    </label>
  );
}

export default function BilibiliImportPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState("input");
  const [input, setInput] = useState("");
  const [inputType, setInputType] = useState(null);
  const [parsedValue, setParsedValue] = useState("");

  const [singleVideo, setSingleVideo] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [series, setSeries] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [activeTab, setActiveTab] = useState("seasons");
  const [containerInfo, setContainerInfo] = useState(null);
  const [videos, setVideos] = useState([]);
  const [selectedBvids, setSelectedBvids] = useState(new Set());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [importProgress, setImportProgress] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [debugLog, setDebugLog] = useState([]);

  const log = useCallback((msg) => {
    setDebugLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const go = useCallback((s) => { setStep(s); setError(""); }, []);

  function handleTopbarBack() {
    if (step === "input") {
      navigate("/");
      return;
    }
    if (step === "videolist") {
      go(userInfo ? "browse" : "input");
      return;
    }
    if (step === "importing") {
      go("videolist");
      return;
    }
    go("input");
  }

  function handleParse() {
    const p = parseInput(input);
    log(`parseInput → type="${p.type}" value="${p.value}"`);
    setInputType(p.type);
    setParsedValue(p.value);

    if (p.type === "unknown" || p.type === "empty") {
      setError("无法识别的输入，请检查格式");
      return;
    }

    if (p.type === "bvid") {
      loadSingleVideo(p.value);
    } else if (p.type === "avid") {
      loadSingleVideo(p.value);
    } else if (p.type === "mid") {
      loadUserBrowse(p.value);
    } else if (p.type === "season") {
      loadCollectionVideos({ season_id: p.value, mid: p.mid, name: "B站合集" });
    } else if (p.type === "series") {
      loadSeriesVideos({ series_id: p.value, mid: p.mid, name: "B站系列" });
    } else if (p.type === "favorite") {
      loadFavoriteVideos(p.value);
    }
  }

  async function loadSingleVideo(input) {
    setLoading(true);
    setError("");
    log("loadSingleVideo: calling fetchVideoInfo");
    try {
      const data = await fetchVideoInfo(input);
      log("fetchVideoInfo ok");
      setSingleVideo(data);
      go("preview");
    } catch (e) {
      log("fetchVideoInfo error: " + (e?.message || JSON.stringify(e)));
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadUserBrowse(mid) {
    setLoading(true);
    setError("");
    log("loadUserBrowse: calling fetchUserCollections");
    try {
      const data = await fetchUserCollections(mid);
      log("fetchUserCollections ok");
      setUserInfo({ mid });
      setSeasons(data?.items_lists?.seasons_list || []);
      setSeries(data?.items_lists?.series_list || []);
      setActiveTab(data?.items_lists?.seasons_list?.length > 0 ? "seasons" : "series");

      let favs = [];
      try {
        log("loadUserBrowse: calling fetchFavoriteFolders");
        const favData = await fetchFavoriteFolders(mid);
        log("fetchFavoriteFolders ok, count=" + (favData?.list?.length || 0));
        favs = favData?.list || [];
      } catch (e) {
        log("fetchFavoriteFolders ignored: " + (e?.message || String(e)));
      }
      setFavorites(favs);

      go("browse");
    } catch (e) {
      log("loadUserBrowse error: " + (e?.message || JSON.stringify(e)));
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadCollectionVideos(season) {
    setLoading(true);
    setError("");
    log("loadCollectionVideos: season_id=" + season.season_id);
    try {
      setContainerInfo({ type: "seasons", label: season.name, id: season.season_id });
      const data = await fetchCollectionVideos(season.season_id, season.mid);
      const list = data?.archives || [];
      log("loadCollectionVideos ok, count=" + list.length);
      setVideos(list);
      setSelectedBvids(new Set(list.map((v) => v.bvid)));
      go("videolist");
    } catch (e) {
      log("loadCollectionVideos error: " + (e?.message || JSON.stringify(e)));
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadSeriesVideos(item) {
    setLoading(true);
    setError("");
    log("loadSeriesVideos: series_id=" + item.series_id);
    try {
      setContainerInfo({ type: "series", label: item.name || item.title, id: item.series_id });
      const data = await fetchSeriesVideos(item.series_id, item.mid);
      const list = data?.archives || [];
      log("loadSeriesVideos ok, count=" + list.length);
      setVideos(list);
      setSelectedBvids(new Set(list.map((v) => v.bvid)));
      go("videolist");
    } catch (e) {
      log("loadSeriesVideos error: " + (e?.message || JSON.stringify(e)));
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadFavoriteVideos(mediaId) {
    setLoading(true);
    setError("");
    log("loadFavoriteVideos: media_id=" + mediaId);
    try {
      let label = "收藏夹";
      try {
        log("loadFavoriteVideos: calling fetchFavoriteFolderInfo");
        const info = await fetchFavoriteFolderInfo(mediaId);
        log("fetchFavoriteFolderInfo ok, title=" + (info?.title || "none"));
        if (info?.title) label = info.title;
      } catch (e) {
        log("fetchFavoriteFolderInfo ignored: " + (e?.message || String(e)));
      }
      setContainerInfo({ type: "favorite", label, id: mediaId });
      log("loadFavoriteVideos: calling fetchFavoriteFolderVideos");
      const data = await fetchFavoriteFolderVideos(mediaId);
      log("fetchFavoriteFolderVideos ok");
      const list = (data?.medias || []).map((m) => ({
        aid: m.id,
        bvid: m.bvid,
        title: m.title,
        pic: m.cover,
        duration: m.duration,
        owner: m.upper ? { name: m.upper.name, mid: m.upper.mid } : null,
      }));
      log("videos parsed, count=" + list.length);
      setVideos(list);
      setSelectedBvids(new Set(list.map((v) => v.bvid)));
      go("videolist");
    } catch (e) {
      log("loadFavoriteVideos error: " + (e?.message || JSON.stringify(e)));
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(bvid) {
    setSelectedBvids((prev) => {
      const next = new Set(prev);
      if (next.has(bvid)) next.delete(bvid);
      else next.add(bvid);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedBvids.size === videos.length) {
      setSelectedBvids(new Set());
    } else {
      setSelectedBvids(new Set(videos.map((v) => v.bvid)));
    }
  }

  async function handleImport(videoList) {
    const videos = videoList.map((v) => ({
      bvid: v.bvid,
      title: v.title,
      duration: String(v.duration || ""),
      thumbnail: v.pic || v.thumbnail || "",
    }));
    setImportProgress({ current: 0, total: videos.length });
    go("importing");
    try {
      const result = await importVideos(videos);
      setImportResult(result);
      go("result");
    } catch (e) {
      setError(e.message);
      go("result");
    }
  }

  // ──────── render: input ────────
  function renderInput() {
    return (
      <div className="shell-content">
        <div className="surface">
          <div className="section-head">
            <div>
              <h2>B站视频导入</h2>
              <p>{BILI_INPUT_HINT}</p>
            </div>
          </div>
          <input
            className="text-input bili-input"
            placeholder="粘贴 BVID / av号 / 链接 / MID …"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleParse()}
          />
          {error && <p className="error-text">{error}</p>}
          <div className="card-actions">
            <button
              className="button button-primary button-grow"
              onClick={handleParse}
              disabled={loading || !input.trim()}
            >
              {loading ? "解析中…" : "解析"}
            </button>
          </div>
          {debugLog.length > 0 && (
            <div className="debug-log">
              <p className="field-hint" style={{marginBottom:4}}>调试日志:</p>
              {debugLog.map((msg, i) => <p key={i} className="debug-line">{msg}</p>)}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ──────── render: preview (single video) ────────
  function renderPreview() {
    const v = singleVideo;
    if (!v) return null;
    return (
      <div className="shell-content">
        <div className="surface">
          <div className="bili-single-preview">
            {v.pic && (
              <img className="bili-single-cover" src={v.pic} alt="" onError={(e) => { e.target.style.display = "none"; }} />
            )}
            <div className="bili-single-info">
              <h2>{v.title}</h2>
              <p className="muted-text">时长: {fmtDuration(v.duration)}</p>
              {v.owner && <p className="muted-text">UP主: {v.owner.name}</p>}
              {v.stat && (
                <p className="muted-text">
                  播放: {v.stat.view?.toLocaleString() || "—"} &nbsp; 弹幕: {v.stat.danmaku?.toLocaleString() || "—"}
                </p>
              )}
            </div>
          </div>
          {error && <p className="error-text">{error}</p>}
          <div className="card-actions">
            <button
              className="button button-primary button-grow"
              onClick={() => handleImport([v])}
            >
              导入视频
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ──────── render: browse user ────────
  function renderBrowse() {
    const tabs = [];
    if (seasons.length > 0) tabs.push({ key: "seasons", label: `合集 (${seasons.length})` });
    if (series.length > 0) tabs.push({ key: "series", label: `系列 (${series.length})` });
    if (favorites.length > 0) tabs.push({ key: "favorites", label: `收藏夹 (${favorites.length})` });

    let list = [];
    if (activeTab === "seasons") list = seasons;
    else if (activeTab === "series") list = series;
    else if (activeTab === "favorites") list = favorites;

    return (
      <div className="shell-content">
        <div className="surface">
          <div className="section-head">
            <div>
              <h2>用户 {userInfo?.mid}</h2>
              <p>选择要导入的视频合集</p>
            </div>
          </div>

          {tabs.length > 1 && (
            <div className="bili-tabs">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  className={`bili-tab ${activeTab === t.key ? "bili-tab-active" : ""}`}
                  onClick={() => setActiveTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          <div className="bili-collection-list">
            {list.map((item) => {
              const id = item.season_id || item.series_id || item.id;
              const name = item.name || item.title || item.cover?.title || "";
              const cover = item.cover?.url || item.cover || item.new_cover_url || "";
              const count = item.total || item.media_count || item.count || 0;
              return (
                <button
                  key={id}
                  className="bili-collection-card"
                  onClick={() => {
                    if (activeTab === "series") loadSeriesVideos(item);
                    else if (activeTab === "favorites") loadFavoriteVideos(item.id || item.media_id);
                    else loadCollectionVideos(item);
                  }}
                >
                  {cover && (
                    <img src={cover} alt="" className="bili-collection-cover" onError={(e) => { e.target.style.display = "none"; }} />
                  )}
                  <div className="bili-collection-meta">
                    <strong>{name}</strong>
                    <span>{count} 个视频</span>
                  </div>
                </button>
              );
            })}
          </div>

          {error && <p className="error-text">{error}</p>}
        </div>
      </div>
    );
  }

  // ──────── render: video list ────────
  function renderVideoList() {
    const selectedCount = selectedBvids.size;
    return (
      <div className="shell-content">
        <div className="surface">
          <div className="section-head">
            <div>
              <h2>{containerInfo?.label || "视频列表"}</h2>
              <p>{videos.length} 个视频</p>
            </div>
          </div>

          {videos.length > 0 && (
            <label className="bili-select-all">
              <input
                type="checkbox"
                checked={selectedCount === videos.length}
                onChange={toggleSelectAll}
              />
              <span>全选 / 取消全选</span>
              <span className="bili-select-count">{selectedCount} 已选</span>
            </label>
          )}

          <div className="bili-video-list">
            {videos.map((v) => (
              <VideoRow
                key={v.bvid}
                video={v}
                checked={selectedBvids.has(v.bvid)}
                onToggle={() => toggleSelect(v.bvid)}
              />
            ))}
            {videos.length === 0 && <p className="muted-text">该合集暂无视频</p>}
          </div>

          {error && <p className="error-text">{error}</p>}
          <div className="card-actions">
            <button
              className="button button-primary button-grow"
              disabled={selectedCount === 0 || loading}
              onClick={() => {
                const selected = videos.filter((v) => selectedBvids.has(v.bvid));
                handleImport(selected);
              }}
            >
              导入 {selectedCount > 0 ? selectedCount : ""} 个视频
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ──────── render: importing ────────
  function renderImporting() {
    return (
      <div className="shell-content">
        <div className="progress-card">
          <div className="progress-card-top">
            <strong>正在导入…</strong>
            <span className="progress-tag">
              {importProgress?.current || 0} / {importProgress?.total || 0}
            </span>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{
                width: importProgress?.total
                  ? `${((importProgress.current || 0) / importProgress.total) * 100}%`
                  : "0%",
              }}
            />
          </div>
          <div className="progress-meta">
            <span>请勿关闭面板</span>
          </div>
        </div>
      </div>
    );
  }

  // ──────── render: result ────────
  function renderResult() {
    const r = importResult;
    const errs = r?.errors || [];
    return (
      <div className="shell-content">
        <div className="surface">
          <div className="section-head">
            <div>
              <h2>导入完成</h2>
            </div>
          </div>
          <div className="result-summary">
            <div className="summary-chip">
              <span>成功</span>
              <strong>{r?.imported || 0}</strong>
            </div>
            <div className="summary-chip">
              <span>总计</span>
              <strong>{r?.total || 0}</strong>
            </div>
            <div className="summary-chip">
              <span>失败</span>
              <strong>{errs.length}</strong>
            </div>
          </div>
          {errs.length > 0 && (
            <div className="warning-block">
              <p className="warning-summary"><span>失败详情</span></p>
              <ul className="warning-list">
                {errs.map((e, i) => (
                  <li key={i}>{e.title || e.bvid}: {e.error}</li>
                ))}
              </ul>
            </div>
          )}
          {error && <p className="error-text">{error}</p>}
          <div className="card-actions">
            <button className="button button-primary button-grow" onClick={() => {
              go("input");
              setImportResult(null);
              setInput("");
            }}>
              继续导入
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ──────── render root ────────
  const pageTitle = {
    input: "B站视频导入",
    preview: "预览视频",
    browse: "用户合集",
    videolist: "选择视频",
    importing: "导入中",
    result: "导入结果",
  }[step];

  return (
    <div className="app-shell">
      <PageTopbar label={pageTitle} onBack={handleTopbarBack} />
      {step === "input" && renderInput()}
      {step === "preview" && renderPreview()}
      {step === "browse" && renderBrowse()}
      {step === "videolist" && renderVideoList()}
      {step === "importing" && renderImporting()}
      {step === "result" && renderResult()}
    </div>
  );
}
