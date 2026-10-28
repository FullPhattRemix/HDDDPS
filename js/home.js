/* ============================================================
   home.js · 首页逻辑
   - 读取 data/contests.json
   - 渲染 Hero 元信息（期数统计 / 最新主题）
   - 渲染最新一期：文案 + 前三名作品台
   ============================================================ */

(function () {
  "use strict";

  var mount = document.getElementById("latest-contest");
  var heroCount = document.getElementById("hero-contest-count");
  var heroLatestTheme = document.getElementById("hero-latest-theme");

  /** HTML 转义，防止数据中特殊字符破坏结构 */
  function escapeHTML(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** 取某期的前三名：优先 top3 字段，否则用 images 前 3 张兜底 */
  function getTop3(contest) {
    if (Array.isArray(contest.top3) && contest.top3.length > 0) return contest.top3.slice(0, 3);
    var images = Array.isArray(contest.images) ? contest.images : [];
    return images.slice(0, 3).map(function (image, index) {
      return { rank: index + 1, name: "", image: image };
    });
  }

  /** 前三名作品台 HTML（与排名页共用样式） */
  function podiumHTML(contest, top3) {
    var items = top3.map(function (item, index) {
      var isFirst = index === 0;
      var rankLabels = { 1: "First", 2: "Second", 3: "Third" };
      return (
        '<a class="podium-item' + (isFirst ? " first" : "") + '" href="rankings.html?id=' +
        encodeURIComponent(contest.id) + '" aria-label="查看本期完整排名">' +
        '  <img class="podium-img" src="' + escapeHTML(item.image) + '" alt="第' + item.rank + '名作品" loading="lazy" ' +
        'onerror="this.parentElement.innerHTML = SiteSharedPlaceholderHTML(\'第' + item.rank + '名作品\')" />' +
        '  <span class="podium-tag">' + (rankLabels[item.rank] || item.rank) + "</span>" +
        (item.name ? '<span class="podium-name">' + escapeHTML(item.name) + "</span>" : "") +
        "</a>"
      );
    }).join("");
    return '<div class="podium">' + items + "</div>";
  }

  /** 找到最新一期：优先按日期，其次按 id */
  function pickLatest(contests) {
    if (!Array.isArray(contests) || contests.length === 0) return null;
    return contests.slice().sort(function (a, b) {
      if (a.date && b.date && a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.id || 0) - (a.id || 0);
    })[0];
  }

  /** 渲染最新一期区块 */
  function renderLatest(contest) {
    if (!contest) {
      mount.innerHTML = '<p class="empty-hint">还没有搭配赛记录，敬请期待第一期开启。</p>';
      return;
    }
    var top3 = getTop3(contest);
    var podium = top3.length > 0
      ? podiumHTML(contest, top3)
      : '<div class="img-placeholder"><i data-lucide="image" aria-hidden="true"></i><span>暂无作品图片</span></div>';

    mount.innerHTML =
      '<div class="latest-copy">' +
      '  <span class="eyebrow">Issue No.' + escapeHTML(contest.id) + "</span>" +
      "  <h3>" + escapeHTML(contest.theme || contest.title || "") + "</h3>" +
      '  <div class="article-meta">' +
      '    <span><i data-lucide="calendar" aria-hidden="true"></i>' + escapeHTML(contest.date || "日期待定") + "</span>" +
      '    <span><i data-lucide="image" aria-hidden="true"></i>' +
      ((contest.images && contest.images.length) || 0) + " 张排名图</span>" +
      "  </div>" +
      '  <p class="card-desc">' + escapeHTML(contest.description || "") + "</p>" +
      '  <div class="hero-actions">' +
      '    <a href="rankings.html?id=' + encodeURIComponent(contest.id) + '" class="btn btn-solid">' +
      '      <i data-lucide="book-open" aria-hidden="true"></i>' +
      "      <span>查看本期作品</span>" +
      "    </a>" +
      "  </div>" +
      "</div>" +
      '<div class="latest-podium">' + podium + "</div>";

    if (window.lucide) window.lucide.createIcons();
  }

  /** 更新 Hero 元信息 */
  function renderHeroMeta(contests) {
    if (heroCount) heroCount.textContent = contests.length + " 期";
    var latest = pickLatest(contests);
    if (heroLatestTheme) heroLatestTheme.textContent = latest ? (latest.theme || latest.title || "—") : "—";
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!mount) return;
    fetch("data/contests.json")
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        var contests = Array.isArray(data.contests) ? data.contests : [];
        renderHeroMeta(contests);
        renderLatest(pickLatest(contests));
      })
      .catch(function () {
        if (mount) {
          mount.innerHTML = '<p class="empty-hint">档案暂时无法读取，请稍后再来看看。</p>';
        }
      });
  });
})();
