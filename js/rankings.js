/* ============================================================
   rankings.js · 往期搭配赛页逻辑（一期一页）
   - 读取 data/contests.json，按时间倒序排列
   - 一次只展示一期：自绘下拉菜单选择期数 + 上一期 / 下一期按钮切换
   - 每期的链接形如 rankings.html?id=3，可直接分享给他人
   - 图片加载失败显示占位图
   - 灯箱：ESC 关闭 / 遮罩关闭 / 左右切换
   ============================================================ */

(function () {
  "use strict";

  var listMount = document.getElementById("rankings-list");
  var lightbox = document.getElementById("lightbox");
  var lightboxImage = document.getElementById("lightbox-image");
  var lightboxCaption = document.getElementById("lightbox-caption");
  var archiveCount = document.getElementById("archive-count");

  /* 自绘下拉菜单 */
  var dropdownMount = document.getElementById("archive-dropdown");
  var toggleBtn = document.getElementById("archive-toggle");
  var toggleValue = toggleBtn ? toggleBtn.querySelector(".dropdown-value") : null;
  var menuEl = document.getElementById("archive-menu");

  var prevBtn = document.getElementById("prev-contest");
  var nextBtn = document.getElementById("next-contest");

  /** 全部期数（已按时间倒序，索引 0 为最新一期） */
  var allContests = [];

  /** 当前展示的期数在 allContests 中的索引 */
  var currentIndex = 0;

  /** 下拉菜单是否展开 */
  var menuOpen = false;

  /** 灯箱状态 */
  var lightboxList = [];
  var lightboxIndex = 0;
  var lightboxTitle = "";

  /** HTML 转义 */
  function escapeHTML(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** 期数显示文案：第X期 · 主题 */
  function contestLabel(contest) {
    return (contest.title || "第" + contest.id + "期") +
      (contest.theme ? " · " + contest.theme : "");
  }

  /** 图片占位（挂到 window 供 onerror 调用） */
  window.SiteSharedPlaceholderHTML = function () {
    return '<div class="img-placeholder"><i data-lucide="image" aria-hidden="true"></i>' +
      "<span>图片暂时不在哦</span></div>";
  };

  /** 单个 img 标签，加载失败时替换为占位 */
  function imageTag(src, alt) {
    return '<img src="' + escapeHTML(src) + '" alt="' + escapeHTML(alt) + '" loading="lazy" ' +
      'onerror="this.parentElement.innerHTML = SiteSharedPlaceholderHTML(\'' +
      escapeHTML(alt).replace(/'/g, "\\'") + '\')" />';
  }

  /** 取某期的前三名：优先 top3 字段，否则用 images 前 3 张兜底 */
  function getTop3(contest) {
    if (Array.isArray(contest.top3) && contest.top3.length > 0) return contest.top3.slice(0, 3);
    var images = Array.isArray(contest.images) ? contest.images : [];
    return images.slice(0, 3).map(function (image, index) {
      return { rank: index + 1, name: "", image: image };
    });
  }

  /** 按时间倒序（最新在前），无日期时按 id 倒序 */
  function sortDesc(contests) {
    return contests.slice().sort(function (a, b) {
      if (a.date && b.date && a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.id || 0) - (a.id || 0);
    });
  }

  /** 前三名作品台：第一名大图，二、三名并列 */
  function podiumHTML(contest, top3) {
    var rankLabels = { 1: "First", 2: "Second", 3: "Third" };
    var items = top3.map(function (item, index) {
      var isFirst = index === 0;
      return (
        '<figure class="podium-item' + (isFirst ? " first" : "") + '" ' +
        'data-start-index="' + item.startIndex + '">' +
        '  ' + imageTag(item.image, "第" + item.rank + "名作品") +
        '  <span class="podium-tag">' + (rankLabels[item.rank] || item.rank) + "</span>" +
        (item.name ? '<figcaption class="podium-name">' + escapeHTML(item.name) + "</figcaption>" : "") +
        "</figure>"
      );
    }).join("");
    return '<div class="podium">' + items + "</div>";
  }

  /** 渲染一期搭配赛的杂志式条目（每期仅前三名三张作品） */
  function contestEntryHTML(contest) {
    var images = Array.isArray(contest.images) ? contest.images : [];

    // 前三名带 startIndex：点击后从对应图片进入灯箱
    var top3 = getTop3(contest).map(function (item) {
      var startIndex = images.indexOf(item.image);
      return Object.assign({}, item, { startIndex: startIndex >= 0 ? startIndex : 0 });
    });

    var podium = top3.length > 0
      ? podiumHTML(contest, top3)
      : '<div class="img-placeholder"><i data-lucide="image" aria-hidden="true"></i><span>暂无作品图片</span></div>';

    return (
      '<article class="contest-entry single">' +
      '  <div class="entry-head">' +
      '    <span class="entry-index">No.' + escapeHTML(contest.id) + "</span>" +
      '    <h3 class="entry-title">' + escapeHTML(contest.title || "第" + contest.id + "期") + "</h3>" +
      '    <span class="entry-theme">' + escapeHTML(contest.theme || "") + "</span>" +
      '    <span class="entry-date">' + escapeHTML(contest.date || "日期待定") + "</span>" +
      "  </div>" +
      '  <p class="entry-desc">' + escapeHTML(contest.description || "") + "</p>" +
      '  <div class="entry-sub"><span class="eyebrow">Top 3</span><hr class="rule" /></div>' +
      podium +
      "</article>"
    );
  }

  /** 绑定作品图片的灯箱点击 */
  function bindImageClicks(contest) {
    listMount.querySelectorAll("[data-start-index]").forEach(function (el) {
      el.addEventListener("click", function () {
        openLightbox(contest, Number(el.getAttribute("data-start-index")) || 0);
      });
    });
  }

  /* ---------------- 自绘下拉菜单 ---------------- */

  /** 生成菜单选项（最新一期在最前） */
  function fillMenu() {
    if (!menuEl) return;
    if (allContests.length === 0) {
      menuEl.innerHTML = '<li class="dropdown-empty" role="option" aria-disabled="true">暂无期数</li>';
      return;
    }
    menuEl.innerHTML = allContests.map(function (contest, index) {
      return (
        '<li role="option" data-index="' + index + '"' +
        (index === currentIndex ? ' aria-selected="true" class="active"' : "") + ">" +
        '<span class="option-label">' + escapeHTML(contestLabel(contest)) + "</span>" +
        '<i data-lucide="check" class="option-check" aria-hidden="true"></i>' +
        "</li>"
      );
    }).join("");
    if (window.lucide) window.lucide.createIcons();
  }

  /** 打开 / 关闭下拉菜单 */
  function setMenuOpen(open) {
    menuOpen = open;
    if (menuEl) menuEl.hidden = !open;
    if (toggleBtn) toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (dropdownMount) dropdownMount.classList.toggle("open", open);
    if (open && menuEl) {
      // 让当前选中的选项滚进可视范围
      var active = menuEl.querySelector(".active");
      if (active) active.scrollIntoView({ block: "nearest" });
    }
  }

  /** 切换下拉菜单开合 */
  function toggleMenu() {
    setMenuOpen(!menuOpen);
  }

  /** 绑定下拉菜单交互 */
  function bindDropdown() {
    if (!toggleBtn || !menuEl) return;

    toggleBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      toggleMenu();
    });

    menuEl.addEventListener("click", function (event) {
      var option = event.target.closest("[data-index]");
      if (!option) return;
      setMenuOpen(false);
      goTo(Number(option.getAttribute("data-index")));
    });

    // 点击页面其他位置关闭菜单
    document.addEventListener("click", function (event) {
      if (menuOpen && dropdownMount && !dropdownMount.contains(event.target)) setMenuOpen(false);
    });

    // 键盘：Enter / 空格开合，上下移动，ESC 关闭（灯箱打开时让位给灯箱）
    toggleBtn.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleMenu();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!menuOpen) setMenuOpen(true);
        stepMenuOption(event.key === "ArrowDown" ? 1 : -1);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && menuOpen && lightbox && lightbox.hidden) {
        setMenuOpen(false);
      } else if (menuOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        stepMenuOption(event.key === "ArrowDown" ? 1 : -1);
      } else if (menuOpen && event.key === "Enter") {
        var active = menuEl.querySelector(".active");
        if (active) {
          setMenuOpen(false);
          goTo(Number(active.getAttribute("data-index")));
        }
      }
    });
  }

  /** 键盘在菜单选项间移动高亮（不立即跳转，Enter 确认） */
  function stepMenuOption(delta) {
    if (!menuEl || allContests.length === 0) return;
    var options = Array.prototype.slice.call(menuEl.querySelectorAll("[data-index]"));
    if (options.length === 0) return;
    var activeIndex = options.findIndex(function (el) { return el.classList.contains("active"); });
    var next = activeIndex < 0 ? 0 : (activeIndex + delta + options.length) % options.length;
    options.forEach(function (el, i) {
      el.classList.toggle("active", i === next);
      el.setAttribute("aria-selected", i === next ? "true" : "false");
    });
    options[next].scrollIntoView({ block: "nearest" });
  }

  /** 更新上一期 / 下一期的可用状态（上一期=更早，下一期=更新） */
  function updateStepButtons() {
    if (prevBtn) prevBtn.disabled = currentIndex >= allContests.length - 1;
    if (nextBtn) nextBtn.disabled = currentIndex <= 0;
  }

  /** 同步地址栏为当前期数的独立链接（不新增历史记录时用 replace 参数控制） */
  function syncURL(push) {
    if (!window.history || !window.history.pushState) return;
    var contest = allContests[currentIndex];
    if (!contest) return;
    var url = "rankings.html?id=" + encodeURIComponent(contest.id);
    if (push) window.history.pushState({ id: contest.id }, "", url);
    else window.history.replaceState({ id: contest.id }, "", url);
    document.title = "皇帝的新搭配赛 · " + (contest.title || "第" + contest.id + "期");
  }

  /** 展示指定索引的那一期 */
  function renderContest(index, pushState) {
    if (allContests.length === 0) {
      listMount.innerHTML = '<p class="empty-hint">还没有任何期数记录，快去添加第一期吧。</p>';
      if (archiveCount) archiveCount.textContent = "";
      if (toggleValue) toggleValue.textContent = "暂无期数";
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    currentIndex = Math.min(Math.max(index, 0), allContests.length - 1);
    var contest = allContests[currentIndex];

    listMount.innerHTML = contestEntryHTML(contest);

    if (archiveCount) {
      archiveCount.textContent =
        "第 " + contest.id + " 期 · 共 " + allContests.length + " 期（" +
        (currentIndex + 1) + " / " + allContests.length + "）";
    }

    // 同步下拉菜单：按钮文案 + 选中高亮
    if (toggleValue) toggleValue.textContent = contestLabel(contest);
    if (menuEl) {
      menuEl.querySelectorAll("[data-index]").forEach(function (option) {
        var isActive = Number(option.getAttribute("data-index")) === currentIndex;
        option.classList.toggle("active", isActive);
        option.setAttribute("aria-selected", isActive ? "true" : "false");
      });
    }

    updateStepButtons();
    syncURL(pushState);

    if (window.lucide) window.lucide.createIcons();
    bindImageClicks(contest);
  }

  /** 从地址栏读取 ?id=，找不到则返回 0（最新一期） */
  function indexFromURL() {
    var match = window.location.search.match(/[?&]id=([^&]+)/);
    if (!match) return 0;
    var id = decodeURIComponent(match[1]);
    for (var i = 0; i < allContests.length; i++) {
      if (String(allContests[i].id) === String(id)) return i;
    }
    return 0;
  }

  /** 切换期数（供按钮 / 下拉框调用），并把页面滚回切换栏 */
  function goTo(index) {
    if (index < 0 || index >= allContests.length || index === currentIndex) return;
    renderContest(index, true);
    var anchor = document.querySelector(".archive-switcher");
    if (anchor) anchor.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------------- 灯箱 ---------------- */

  function openLightbox(contest, startIndex) {
    var images = Array.isArray(contest.images) ? contest.images : [];
    if (images.length === 0) return;
    lightboxList = images;
    lightboxTitle = contest.title || "第" + contest.id + "期";
    lightboxIndex = Math.min(Math.max(startIndex || 0, 0), images.length - 1);
    showLightboxImage();
    lightbox.hidden = false;
    document.body.style.overflow = "hidden"; // 背景滚动锁定
  }

  function showLightboxImage() {
    resetLightboxZoom();
    lightboxImage.src = lightboxList[lightboxIndex];
    lightboxCaption.textContent = lightboxTitle + " · " + (lightboxIndex + 1) + " / " + lightboxList.length;
  }

  function closeLightbox() {
    resetLightboxZoom();
    lightbox.hidden = true;
    lightboxImage.src = "";
    lightboxList = [];
    document.body.style.overflow = "";
  }

  /* ---------------- 灯箱缩放与平移 ---------------- */

  var panning = false;
  var panningMoved = false;
  var panPointerId = null;
  var panStartX = 0;
  var panStartY = 0;
  var panScrollX = 0;
  var panScrollY = 0;

  function isZoomed() {
    return lightbox.classList.contains("zoomed");
  }

  function toggleLightboxZoom() {
    if (isZoomed()) {
      resetLightboxZoom();
    } else {
      lightbox.classList.add("zoomed");
      lightbox.scrollLeft = 0;
      lightbox.scrollTop = 0;
    }
  }

  function resetLightboxZoom() {
    lightbox.classList.remove("zoomed");
    lightboxImage.classList.remove("is-panning");
    panning = false;
    panPointerId = null;
    lightbox.scrollLeft = 0;
    lightbox.scrollTop = 0;
  }

  function bindLightboxZoom() {
    if (!lightbox || !lightboxImage) return;

    // 点击图片：放大 / 还原（拖拽后不算点击）
    lightboxImage.addEventListener("click", function () {
      if (panningMoved) { panningMoved = false; return; }
      toggleLightboxZoom();
    });

    // 放大后按住拖动平移（鼠标）
    lightboxImage.addEventListener("mousedown", function (event) {
      if (!isZoomed()) return;
      event.preventDefault();
      panning = true;
      panningMoved = false;
      panStartX = event.clientX;
      panStartY = event.clientY;
      panScrollX = lightbox.scrollLeft;
      panScrollY = lightbox.scrollTop;
      lightboxImage.classList.add("is-panning");
    });

    document.addEventListener("mousemove", function (event) {
      if (!panning) return;
      var dx = event.clientX - panStartX;
      var dy = event.clientY - panStartY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) panningMoved = true;
      lightbox.scrollLeft = panScrollX - dx;
      lightbox.scrollTop = panScrollY - dy;
    });

    document.addEventListener("mouseup", function () {
      if (!panning) return;
      panning = false;
      lightboxImage.classList.remove("is-panning");
    });

    // 触屏：缩放状态下禁用图片自身的拖拽行为，交给浏览器原生滚动
    lightboxImage.addEventListener("dragstart", function (event) {
      event.preventDefault();
    });
  }

  function stepLightbox(delta) {
    if (lightboxList.length === 0) return;
    lightboxIndex = (lightboxIndex + delta + lightboxList.length) % lightboxList.length;
    showLightboxImage();
  }

  function bindLightbox() {
    if (!lightbox) return;

    lightbox.querySelectorAll("[data-lightbox-close]").forEach(function (el) {
      el.addEventListener("click", closeLightbox);
    });

    var prevArrow = lightbox.querySelector("[data-lightbox-prev]");
    var nextArrow = lightbox.querySelector("[data-lightbox-next]");
    if (prevArrow) prevArrow.addEventListener("click", function () { stepLightbox(-1); });
    if (nextArrow) nextArrow.addEventListener("click", function () { stepLightbox(1); });

    document.addEventListener("keydown", function (event) {
      if (lightbox.hidden) return;
      if (event.key === "Escape") closeLightbox();
      else if (event.key === "ArrowLeft") stepLightbox(-1);
      else if (event.key === "ArrowRight") stepLightbox(1);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!listMount) return;
    bindLightbox();
    bindLightboxZoom();
    bindDropdown();

    fetch("data/contests.json")
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        allContests = Array.isArray(data.contests) ? sortDesc(data.contests) : [];
        fillMenu();
        // 首次渲染：带 ?id= 就直达那一期，否则显示最新一期
        renderContest(indexFromURL(), false);
      })
      .catch(function () {
        listMount.innerHTML = '<p class="empty-hint">档案暂时无法读取，请稍后再来看看。</p>';
      });
  });
})();
