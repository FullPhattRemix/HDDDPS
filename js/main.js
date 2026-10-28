/* ============================================================
   main.js · 共享逻辑
   - 注入统一导航栏与页脚
   - 移动端菜单折叠
   - 一键复制（群号 / JSON）
   - Lucide 图标初始化
   ============================================================ */

(function () {
  "use strict";

  /** 审核群 QQ 群号（全站唯一配置处） */
  var GROUP_QQ = "1127110890";

  /** 当前页面文件名，用于高亮导航 */
  var currentPage = (location.pathname.split("/").pop() || "index.html").toLowerCase();

  /** 导航项配置 */
  var NAV_ITEMS = [
    { href: "index.html", label: "首页", icon: "home" },
    { href: "rankings.html", label: "往期搭配赛", icon: "crown" },
    { href: "admin.html", label: "添加期数", icon: "pen-line" },
    { href: "index.html#review-group", label: "审核群", icon: "message-circle-heart", hash: "#review-group" }
  ];

  /** 生成导航链接 HTML */
  function navLinkHTML(item) {
    var isActive = item.hash
      ? currentPage === "index.html" && location.hash === item.hash
      : currentPage === item.href.toLowerCase();
    var activeClass = isActive ? ' class="active"' : "";
    return '<li><a href="' + item.href + '"' + activeClass + ">" +
      '<i data-lucide="' + item.icon + '" aria-hidden="true"></i>' +
      "<span>" + item.label + "</span></a></li>";
  }

  /** 注入顶部导航栏 */
  function renderHeader() {
    var mount = document.getElementById("site-header");
    if (!mount) return;
    mount.innerHTML =
      '<nav class="site-nav">' +
      '  <a class="site-nav-brand" href="index.html">' +
      '    <i data-lucide="crown" aria-hidden="true"></i>' +
      "    <span>皇帝的新搭配赛</span>" +
      "  </a>" +
      '  <button type="button" class="nav-toggle" id="nav-toggle" aria-label="打开菜单" aria-expanded="false">' +
      '    <i data-lucide="menu" aria-hidden="true"></i>' +
      "  </button>" +
      '  <ul class="site-nav-links" id="nav-links">' +
      NAV_ITEMS.map(navLinkHTML).join("") +
      "  </ul>" +
      "</nav>";
  }

  /** 注入页脚（杂志式双栏结构） */
  function renderFooter() {
    var mount = document.getElementById("site-footer");
    if (!mount) return;
    mount.innerHTML =
      '<footer class="site-footer">' +
      '  <div class="footer-col">' +
      '    <p class="footer-name"><i data-lucide="book-open" aria-hidden="true"></i>皇帝的新搭配赛</p>' +
      "    <p>奇迹暖暖玩家组织的搭配赛活动</p>" +
      "  </div>" +
      '  <div class="footer-col">' +
      '    <span class="eyebrow">Review Group</span>' +
      "    <p>审核群：" + GROUP_QQ + "（审核通过后进入主群参赛）</p>" +
      "  </div>" +
      "</footer>";
  }

  /** 绑定移动端菜单折叠 */
  function bindNavToggle() {
    var toggle = document.getElementById("nav-toggle");
    var links = document.getElementById("nav-links");
    if (!toggle || !links) return;

    toggle.addEventListener("click", function () {
      var isOpen = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      // 切换 Menu / X 图标
      toggle.innerHTML = '<i data-lucide="' + (isOpen ? "x" : "menu") +
        '" aria-hidden="true"></i>';
      if (window.lucide) window.lucide.createIcons();
    });

    // 点击链接后自动收起菜单
    links.addEventListener("click", function (event) {
      if (event.target.closest("a") && links.classList.contains("open")) {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.innerHTML = '<i data-lucide="menu" aria-hidden="true"></i>';
        if (window.lucide) window.lucide.createIcons();
      }
    });
  }

  /**
   * 通用复制函数，带旧浏览器降级方案
   * @param {string} text - 要复制的文本
   * @returns {Promise<boolean>} 是否复制成功
   */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return fallbackCopy(text); }
      );
    }
    return Promise.resolve(fallbackCopy(text));
  }

  /** 旧浏览器降级：借助隐藏 textarea + execCommand */
  function fallbackCopy(text) {
    try {
      var textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch (err) {
      return false;
    }
  }

  /**
   * 把按钮图标切换为 Check，短暂展示后恢复
   * @param {HTMLElement} btn - 按钮元素
   * @param {string} originalIcon - 原图标名
   */
  function flashCheckIcon(btn, originalIcon) {
    btn.classList.add("copied");
    btn.innerHTML = '<i data-lucide="check" aria-hidden="true"></i>';
    if (window.lucide) window.lucide.createIcons();
    setTimeout(function () {
      btn.classList.remove("copied");
      btn.innerHTML = '<i data-lucide="' + originalIcon + '" aria-hidden="true"></i>';
      if (window.lucide) window.lucide.createIcons();
    }, 1600);
  }

  /** 绑定所有 [data-copy-target] 按钮：复制对应元素文本 */
  function bindCopyButtons() {
    document.querySelectorAll("[data-copy-target]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var target = document.getElementById(btn.getAttribute("data-copy-target"));
        if (!target) return;
        copyText(target.textContent.trim()).then(function (ok) {
          if (ok) flashCheckIcon(btn, "copy");
        });
      });
    });
  }

  /** 对外暴露共享工具 */
  window.SiteShared = {
    GROUP_QQ: GROUP_QQ,
    copyText: copyText,
    flashCheckIcon: flashCheckIcon
  };

  /** 初始化流程 */
  document.addEventListener("DOMContentLoaded", function () {
    renderHeader();
    renderFooter();
    bindNavToggle();
    bindCopyButtons();
    if (window.lucide) window.lucide.createIcons();
  });
})();
