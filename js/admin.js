/* ============================================================
   admin.js · 添加期数页逻辑（管理员）
   - 密码门：SHA-256 哈希校验（防普通访客，非绝对安全）
   - GitHub 授权：仓库固定为 FullPhattRemix/HDDDPS，仅填 Token，可保存到 localStorage
   - 新增期数：前三名各一个独立名次位，GitHub Contents API 直传
   - 往期管理：编辑（改信息 / 替换名次图）、删除（清数据 + 删图）
   - 降级：仅生成 JSON（不上传，手动操作）
   ============================================================ */

(function () {
  "use strict";

  /* ---------------- 配置 ---------------- */

  // 管理密码的 SHA-256 哈希（密码本身不写入仓库；修改方式见 README）
  var ADMIN_PASSWORD_HASH = "43d6f9b00fcbd78b802eb6e1c47254370bfc1279dd95d8b5c4053c5e42a24637";

  // GitHub API 基础地址与单张图片大小上限
  var GITHUB_API = "https://api.github.com";
  var MAX_IMAGE_SIZE = 8 * 1024 * 1024; // 8MB

  /** 允许的图片扩展名 */
  var IMAGE_EXT_WHITELIST = ["jpg", "jpeg", "png", "webp", "gif"];

  /* ---------------- 元素引用 ---------------- */

  var authGate = document.getElementById("auth-gate");
  var adminContent = document.getElementById("admin-content");
  var authForm = document.getElementById("auth-form");
  var authError = document.getElementById("auth-error");

  var ghToken = document.getElementById("gh-token");
  var ghRemember = document.getElementById("gh-remember");
  var testConnBtn = document.getElementById("test-conn");

  var form = document.getElementById("contest-form");
  var formMessage = document.getElementById("form-message");
  var publishBtn = document.getElementById("publish-btn");
  var previewBtn = document.getElementById("preview-btn");

  var editBanner = document.getElementById("edit-banner");
  var editBannerText = document.getElementById("edit-banner-text");
  var cancelEditBtn = document.getElementById("cancel-edit");

  var manageList = document.getElementById("manage-list");
  var refreshManageBtn = document.getElementById("refresh-manage");

  var outputSection = document.getElementById("output-section");
  var outputTitle = document.getElementById("output-title");
  var outputHint = document.getElementById("output-hint");
  var outputJSON = document.getElementById("output-json");
  var copyJSONBtn = document.getElementById("copy-json");

  /** 前三名独立名次位（新建时存放待上传文件；编辑时存放替换用新文件；null 表示该位无新文件） */
  var rankFiles = [null, null, null];

  /** 编辑模式下各名次位的原图路径（来自仓库现有数据） */
  var rankOriginalPaths = [null, null, null];

  /** 当前编辑的期数 id 与原始数据快照（非编辑状态为 null） */
  var editingId = null;
  var editingOriginal = null;

  /** 已生成的期数数据（用于复制留档） */
  var lastGenerated = null;

  /* ---------------- 工具函数 ---------------- */

  /** HTML 转义 */
  function escapeHTML(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** SHA-256 十六进制摘要（需要 https 或 localhost 环境） */
  function sha256Hex(text) {
    if (!window.crypto || !crypto.subtle) {
      return Promise.reject(new Error("当前环境不支持安全哈希，请通过 http(s) 访问本页"));
    }
    var bytes = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-256", bytes).then(function (buffer) {
      return Array.prototype.map.call(new Uint8Array(buffer), function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("");
    });
  }

  /** 文件转 base64（不含 data: 前缀） */
  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result);
        resolve(result.slice(result.indexOf(",") + 1));
      };
      reader.onerror = function () { reject(new Error("读取文件失败：" + file.name)); };
      reader.readAsDataURL(file);
    });
  }

  /** base64 → UTF-8 字符串（GitHub 返回的内容含中文时必须这样解，不能直接用 atob） */
  function decodeBase64Utf8(b64) {
    var binary = atob(String(b64).replace(/\s/g, ""));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }

  /** UTF-8 字符串 → base64 */
  function encodeBase64Utf8(text) {
    var bytes = new TextEncoder().encode(text);
    var binary = "";
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  /** 清理 Token：去掉空格、换行、零宽字符等粘贴残留 */
  function sanitizeToken(raw) {
    return String(raw || "")
      .replace(/[\s\u200b\u200c\u200d\ufeff]/g, "")
      .trim();
  }

  /** 校验单个图片文件：格式与大小；返回错误信息或 null */
  function validateImageFile(file) {
    var ext = (file.name.split(".").pop() || "").toLowerCase();
    if (IMAGE_EXT_WHITELIST.indexOf(ext) === -1) return "不支持的文件格式：" + file.name;
    if (file.size > MAX_IMAGE_SIZE) return "文件超过 8MB：" + file.name;
    return null;
  }

  /** 把路径中的扩展名替换为新扩展名 */
  function swapExt(path, newExt) {
    return String(path).replace(/\.[^.\/]+$/, "." + newExt);
  }

  /** 显示柔和提示条（提示条粘在视口底部，无需滚动即可看到） */
  function showMessage(text, isError) {
    formMessage.textContent = text;
    formMessage.classList.toggle("form-message-error", !!isError);
    formMessage.hidden = false;
  }

  function hideMessage() {
    formMessage.hidden = true;
    formMessage.classList.remove("form-message-error");
  }

  /** 显示某字段的错误 */
  function showError(inputId, message) {
    var errorEl = document.querySelector('[data-error-for="' + inputId + '"]');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    }
  }

  function clearErrors() {
    form.querySelectorAll(".form-error").forEach(function (el) {
      el.hidden = true;
      el.textContent = "";
    });
  }

  /** 设置按钮为加载中状态 */
  function setLoading(btn, loading) {
    btn.disabled = loading;
    btn.style.opacity = loading ? "0.6" : "";
    btn.style.pointerEvents = loading ? "none" : "";
  }

  /* ---------------- 测试连接 ---------------- */

  /** 检查 Token 与网络：先鉴权自身账号，再确认仓库写入权限 */
  function testConnection() {
    var config = getGhConfig();
    if (!config) return;

    setLoading(testConnBtn, true);
    showMessage("正在检查 Token 与网络连通性……", false);

    apiFetch(GITHUB_API + "/user", { headers: ghHeaders(config.token) })
      .then(function (res) {
        if (res.status === 401) throw new Error("Token 无效或已过期（401），请重新生成一个勾选了 repo 权限的 Token。");
        if (!res.ok) throw new Error("检查账号失败（HTTP " + res.status + "）");
        return res.json();
      })
      .then(function (user) {
        return apiFetch(GITHUB_API + "/repos/" + config.owner + "/" + config.repo,
          { headers: ghHeaders(config.token) })
          .then(function (res) {
            if (res.status === 404) throw new Error("找不到仓库 " + config.owner + "/" + config.repo + "，或 Token 无权访问该仓库。");
            if (!res.ok) throw new Error("读取仓库信息失败（HTTP " + res.status + "）");
            return res.json();
          })
          .then(function (repo) {
            var canWrite = repo.permissions && repo.permissions.push;
            showMessage(
              "连接正常：已登录 " + user.login + "，" + config.owner + "/" + config.repo +
              (canWrite ? " 具备写入权限，可以发布。" : " 没有写入权限——Token 需要勾选 repo（或 Contents 读写）。"),
              !canWrite
            );
          });
      })
      .catch(function (err) {
        showMessage("连接检查未通过：" + err.message, true);
      })
      .finally(function () {
        setLoading(testConnBtn, false);
      });
  }

  if (testConnBtn) testConnBtn.addEventListener("click", testConnection);

  /* ---------------- 密码门 ---------------- */

  function unlockAdmin() {
    sessionStorage.setItem("adminAuthed", "1");
    authGate.hidden = true;
    adminContent.hidden = false;
    if (window.lucide) window.lucide.createIcons();
    loadGhConfig();
  }

  authForm.addEventListener("submit", function (event) {
    event.preventDefault();
    authError.hidden = true;
    var password = document.getElementById("auth-password").value;
    if (!password) {
      authError.textContent = "请输入管理密码哦。";
      authError.hidden = false;
      return;
    }
    sha256Hex(password).then(function (hex) {
      if (hex === ADMIN_PASSWORD_HASH) {
        unlockAdmin();
      } else {
        authError.textContent = "密码不太对呢，再想一想吧。";
        authError.hidden = false;
      }
    }).catch(function (err) {
      authError.textContent = err.message;
      authError.hidden = false;
    });
  });

  /* ---------------- GitHub 配置存取 ---------------- */

  var GH_CONFIG_KEY = "emperorGhConfig";

  /** 站点对应的仓库（固定值，无需用户填写） */
  var GH_REPOSITORY = { owner: "FullPhattRemix", repo: "HDDDPS", branch: "main" };

  /** 读取本地保存的 Token */
  function loadGhConfig() {
    try {
      var saved = JSON.parse(localStorage.getItem(GH_CONFIG_KEY) || "{}");
      ghToken.value = saved.token || "";
      ghRemember.checked = !!saved.token;
    } catch (err) { /* 忽略损坏的本地数据 */ }
  }

  /** 只在勾选「记住」时把 Token 存入本地 */
  function saveGhConfig() {
    if (ghRemember.checked) {
      localStorage.setItem(GH_CONFIG_KEY, JSON.stringify({ token: sanitizeToken(ghToken.value) }));
    } else {
      localStorage.removeItem(GH_CONFIG_KEY);
    }
  }

  /** 读取并校验 GitHub 配置，失败返回 null */
  function getGhConfig() {
    var token = sanitizeToken(ghToken.value);
    if (!token) {
      showMessage("请先填写 GitHub Personal Access Token。", true);
      return null;
    }
    if (!/^(ghp_|github_pat_|gho_|ghu_|ghs_)/.test(token)) {
      showMessage("Token 看起来不完整：应是以 ghp_ 或 github_pat_ 开头的一长串字符，请重新复制一次（注意不要带多余空格）。", true);
      return null;
    }
    if (/[^\x21-\x7e]/.test(token)) {
      showMessage("Token 里混入了中文或全角字符，请只粘贴令牌本身。", true);
      return null;
    }
    return {
      owner: GH_REPOSITORY.owner,
      repo: GH_REPOSITORY.repo,
      branch: GH_REPOSITORY.branch,
      token: token
    };
  }

  /* ---------------- 前三名独立名次位 ---------------- */

  /** 设置某个名次位的新文件（null 表示清除新文件、回到原图状态） */
  function setRankFile(rank, file) {
    if (file) {
      var error = validateImageFile(file);
      if (error) {
        showMessage(error, true);
        return;
      }
      rankFiles[rank - 1] = file;
      hideMessage();
    } else {
      rankFiles[rank - 1] = null;
    }
    renderRankSlot(rank);
  }

  /** 渲染某个名次位：新文件 > 编辑模式原图 > 空上传框 */
  function renderRankSlot(rank) {
    var previewMount = document.getElementById("preview-rank-" + rank);
    var area = document.getElementById("upload-rank-" + rank);
    var file = rankFiles[rank - 1];
    var originalPath = rankOriginalPaths[rank - 1];

    // 情况一：该位有新文件 → 本地预览，标记将替换原图
    if (file) {
      area.hidden = true;
      previewMount.innerHTML =
        '<figure class="preview-item">' +
        '  <span class="preview-rank">No.' + rank + "</span>" +
        '  <img src="' + URL.createObjectURL(file) + '" alt="第' + rank + '名新作品预览" />' +
        '  <figcaption class="preview-name">' + escapeHTML(file.name) +
        (originalPath ? " · 将替换原图" : "") + "</figcaption>" +
        '  <button type="button" class="remove-image" data-rank-remove="' + rank + '" aria-label="移除第' + rank + '名新作品">' +
        '    <i data-lucide="x" aria-hidden="true"></i>' +
        "  </button>" +
        "</figure>";
    }
    // 情况二：编辑模式且该位有原图 → 显示仓库原图，标记保留原图
    else if (originalPath) {
      area.hidden = true;
      previewMount.innerHTML =
        '<figure class="preview-item">' +
        '  <span class="preview-rank">No.' + rank + "</span>" +
        '  <img src="' + escapeHTML(originalPath) + '" alt="第' + rank + '名原图" ' +
        'onerror="this.closest(\'.preview-item\').querySelector(\'img\').style.display=\'none\'" />' +
        '  <figcaption class="preview-name">保留原图</figcaption>' +
        "</figure>";
    }
    // 情况三：空位 → 显示上传框
    else {
      area.hidden = false;
      previewMount.innerHTML = "";
    }

    if (window.lucide) window.lucide.createIcons();

    var removeBtn = previewMount.querySelector("[data-rank-remove]");
    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        setRankFile(rank, null);
      });
    }
  }

  /** 绑定一个名次位：点击选择 + 拖拽 */
  function bindRankSlot(rank) {
    var area = document.getElementById("upload-rank-" + rank);
    var input = document.getElementById("file-rank-" + rank);

    area.addEventListener("click", function () { input.click(); });

    input.addEventListener("change", function () {
      if (input.files && input.files[0]) setRankFile(rank, input.files[0]);
      input.value = ""; // 允许重复选择同一文件
    });

    ["dragover", "dragenter"].forEach(function (eventName) {
      area.addEventListener(eventName, function (event) {
        event.preventDefault();
        area.classList.add("drag-over");
      });
    });
    ["dragleave", "drop"].forEach(function (eventName) {
      area.addEventListener(eventName, function (event) {
        event.preventDefault();
        area.classList.remove("drag-over");
      });
    });
    area.addEventListener("drop", function (event) {
      if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
        setRankFile(rank, event.dataTransfer.files[0]);
      }
    });
  }

  /* ---------------- 表单校验与数据构造 ---------------- */

  /** 校验表单，返回是否通过 */
  function validate() {
    clearErrors();
    var ok = true;

    var idInput = document.getElementById("field-id");
    var themeInput = document.getElementById("field-theme");

    if (!idInput.value.trim()) {
      showError("field-id", "请填写期数编号哦。");
      ok = false;
    } else if (Number(idInput.value) < 1 || !Number.isInteger(Number(idInput.value))) {
      showError("field-id", "期数编号需要是大于 0 的整数。");
      ok = false;
    }

    if (!themeInput.value.trim()) {
      showError("field-theme", "请填写主题名称哦。");
      ok = false;
    }

    return ok;
  }

  /**
   * 从表单构造单期数据
   * 返回 { contest, uploads }：
   * - contest：写入 contests.json 的数据（images / top3 按名次位顺序生成）
   * - uploads：需要上传到仓库的 [{ file, path }]（新建 = 已传名次位；编辑 = 替换的位）
   */
  function buildContest() {
    var id = Number(document.getElementById("field-id").value);
    var winnerNames = [
      document.getElementById("winner-1").value.trim(),
      document.getElementById("winner-2").value.trim(),
      document.getElementById("winner-3").value.trim()
    ];
    var isEditing = editingId !== null;

    // 逐个名次位决定最终路径：新文件生成新路径，否则保留原图路径
    var images = [];
    var top3 = [];
    var uploads = [];

    for (var rank = 1; rank <= 3; rank++) {
      var newFile = rankFiles[rank - 1];
      var originalPath = rankOriginalPaths[rank - 1];
      var path = null;

      if (newFile) {
        var ext = (newFile.name.split(".").pop() || "jpg").toLowerCase();
        // 编辑时优先沿用原图路径（仅换扩展名），保持仓库整洁；新建时按顺序编号
        if (isEditing && originalPath) {
          path = swapExt(originalPath, ext);
        } else {
          path = "images/第" + id + "期/rank" + (images.length + 1) + "." + ext;
        }
        uploads.push({ file: newFile, path: path });
      } else if (originalPath) {
        path = originalPath;
      }

      if (path) {
        images.push(path);
        var entry = { rank: rank, image: path };
        if (winnerNames[rank - 1]) entry.name = winnerNames[rank - 1];
        top3.push(entry);
      }
    }

    var contest = {
      id: id,
      title: "第" + id + "期",   // 期数标题自动按编号生成
      theme: document.getElementById("field-theme").value.trim(),
      date: document.getElementById("field-date").value || "",
      description: document.getElementById("field-description").value.trim(),
      images: images
    };
    if (top3.length > 0) contest.top3 = top3;

    return { contest: contest, uploads: uploads };
  }

  /** 在结果区展示 JSON */
  function showOutput(contest, title, hint) {
    lastGenerated = contest;
    outputTitle.textContent = title;
    outputHint.textContent = hint;
    outputJSON.textContent = JSON.stringify(contest, null, 2);
    outputSection.hidden = false;
    outputSection.scrollIntoView({ behavior: "smooth", block: "start" });
    if (window.lucide) window.lucide.createIcons();
  }

  previewBtn.addEventListener("click", function () {
    if (!validate()) {
      showMessage("有几处信息还没填好，请看看上方的提示，温柔地补全它们吧。", true);
      return;
    }
    hideMessage();
    showOutput(buildContest().contest, "生成结果", "请将下方 JSON 中新增的一条 contest 数据，合并进 data/contests.json 的 contests 数组。");
  });

  copyJSONBtn.addEventListener("click", function () {
    if (!lastGenerated) return;
    window.SiteShared.copyText(JSON.stringify(lastGenerated, null, 2)).then(function (ok) {
      if (ok) {
        window.SiteShared.flashCheckIcon(copyJSONBtn, "copy");
      } else {
        showMessage("复制没有成功，请手动选中下方文本复制。", true);
      }
    });
  });

  /* ---------------- GitHub API 基础操作 ---------------- */

  /** GitHub Contents API 通用请求头 */
  function ghHeaders(token) {
    return {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  function contentsUrl(config, path) {
    return GITHUB_API + "/repos/" + config.owner + "/" + config.repo +
      "/contents/" + encodeURIComponent(path).replace(/%2F/g, "/") +
      "?ref=" + encodeURIComponent(config.branch);
  }

  /**
   * 带自动重试的 fetch
   * 网络被代理拦截、连接被重置时浏览器只会给出「Failed to fetch」，
   * 这里先自动重试 2 次（间隔递增），仍失败时换成可执行的提示。
   */
  function apiFetch(url, options) {
    var maxAttempts = 3;
    function attempt(n) {
      return fetch(url, options).catch(function () {
        if (n < maxAttempts) {
          return new Promise(function (resolve) {
            setTimeout(resolve, 700 * n);
          }).then(function () { return attempt(n + 1); });
        }
        throw new Error(
          "网络连接失败（Failed to fetch）：浏览器没能连上 api.github.com。" +
          "已自动重试 " + maxAttempts + " 次。" +
          "请检查：① 代理/VPN 是否稳定（可先关闭再试）；" +
          "② 浏览器新标签直接打开 https://api.github.com 能否显示内容；" +
          "③ 网络恢复后重新点一次「上传并发布」（同一期重复发布会覆盖，不会产生脏数据）。"
        );
      });
    }
    return attempt(1);
  }

  /** 上传 / 覆盖单个文件到仓库（路径中的目录会自动创建） */
  function uploadFile(config, path, base64Content, message) {
    return apiFetch(contentsUrl(config, path), { headers: ghHeaders(config.token) })
      .then(function (res) {
        if (res.status === 404) return null; // 文件不存在，直接创建
        if (res.status === 401) throw new Error("Token 无效或已过期（401），请重新生成一个勾选了 repo 权限的 Token。");
        if (res.status === 403) throw new Error("Token 权限不足或触发频率限制（403），请确认勾选了 repo 权限。");
        if (!res.ok) throw new Error("检查文件时出错（HTTP " + res.status + "）：" + path);
        return res.json();
      })
      .then(function (existing) {
        var body = {
          message: message,
          content: base64Content,
          branch: config.branch
        };
        if (existing && existing.sha) body.sha = existing.sha; // 覆盖已存在的文件
        return apiFetch(contentsUrl(config, path).split("?")[0], {
          method: "PUT",
          headers: ghHeaders(config.token),
          body: JSON.stringify(body)
        }).then(function (res) {
          if (res.status === 401) throw new Error("Token 无效或已过期（401），请重新生成 Token。");
          if (!res.ok) throw new Error("上传失败（HTTP " + res.status + "）：" + path);
          return res.json();
        });
      });
  }

  /** 删除仓库中的单个文件（文件不存在时静默跳过） */
  function deleteFile(config, path, message) {
    return apiFetch(contentsUrl(config, path), { headers: ghHeaders(config.token) })
      .then(function (res) {
        if (res.status === 404) return null; // 文件本就不存在
        if (!res.ok) throw new Error("读取文件信息失败（HTTP " + res.status + "）：" + path);
        return res.json();
      })
      .then(function (existing) {
        if (!existing || !existing.sha) return null;
        return apiFetch(contentsUrl(config, path).split("?")[0], {
          method: "DELETE",
          headers: ghHeaders(config.token),
          body: JSON.stringify({
            message: message,
            sha: existing.sha,
            branch: config.branch
          })
        }).then(function (res) {
          if (!res.ok) throw new Error("删除文件失败（HTTP " + res.status + "）：" + path);
        });
      });
  }

  /** 读取 data/contests.json 当前内容与 sha */
  function fetchContestsJson(config) {
    return apiFetch(contentsUrl(config, "data/contests.json"), { headers: ghHeaders(config.token) })
      .then(function (res) {
        if (res.status === 404) return { sha: null, contests: [] };
        if (res.status === 401) throw new Error("Token 无效或已过期（401），请重新生成一个勾选了 repo 权限的 Token。");
        if (!res.ok) throw new Error("读取 contests.json 失败（HTTP " + res.status + "）");
        return res.json().then(function (data) {
          var contests = [];
          try {
            var parsed = JSON.parse(decodeBase64Utf8(data.content));
            contests = Array.isArray(parsed.contests) ? parsed.contests : [];
          } catch (err) {
            throw new Error("contests.json 内容不是合法 JSON，请先在仓库中修复。");
          }
          return { sha: data.sha, contests: contests };
        });
      });
  }

  /** 提交更新后的 contests.json */
  function commitContestsJson(config, sha, contests, message) {
    var content = encodeBase64Utf8(JSON.stringify({ contests: contests }, null, 2) + "\n");
    return apiFetch(GITHUB_API + "/repos/" + config.owner + "/" + config.repo +
      "/contents/data/contests.json", {
      method: "PUT",
      headers: ghHeaders(config.token),
      body: JSON.stringify({
        message: message,
        content: content,
        branch: config.branch,
        sha: sha
      })
    }).then(function (res) {
      if (res.status === 401) throw new Error("Token 无效或已过期（401），请重新生成 Token。");
      if (res.status === 409) throw new Error("云端数据刚刚被别处修改（409），请点「刷新列表」后再试一次。");
      if (!res.ok) throw new Error("提交 contests.json 失败（HTTP " + res.status + "）");
      return res.json();
    });
  }

  /**
   * 提交 JSON，并在网络中断时回读校验
   * 代理抖动时常见：请求其实已经提交成功，但响应半路被切断 → 浏览器报 Failed to fetch。
   * 这里在失败后等 1.5 秒重新读取仓库，若能读到本次写入的内容，就当作成功。
   */
  function commitWithVerify(config, sha, contests, message, contest) {
    return commitContestsJson(config, sha, contests, message).catch(function (err) {
      return new Promise(function (resolve) { setTimeout(resolve, 1500); })
        .then(function () { return fetchContestsJson(config); })
        .then(function (after) {
          var landed = after.contests.some(function (c) {
            return String(c.id) === String(contest.id) && c.theme === contest.theme;
          });
          if (landed) return { commit: null, verified: true };
          throw err;
        }, function () {
          throw err;
        });
    });
  }

  /* ---------------- 编辑模式状态 ---------------- */

  /** 进入编辑模式：填充表单，名次位显示原图 */
  function startEdit(entry) {
    exitEditMode(); // 先清理可能存在的编辑状态

    editingId = entry.id;
    editingOriginal = JSON.parse(JSON.stringify(entry));

    document.getElementById("field-id").value = entry.id;
    document.getElementById("field-theme").value = entry.theme || "";
    document.getElementById("field-date").value = entry.date || "";
    document.getElementById("field-description").value = entry.description || "";

    // 前三名昵称回填
    var top3 = Array.isArray(entry.top3) ? entry.top3 : [];
    [1, 2, 3].forEach(function (rank) {
      var item = top3.find(function (t) { return t.rank === rank; });
      document.getElementById("winner-" + rank).value = item && item.name ? item.name : "";
    });

    // 名次位原图路径：优先 top3，缺省用 images 前 3 张
    rankOriginalPaths = [null, null, null];
    [1, 2, 3].forEach(function (rank) {
      var item = top3.find(function (t) { return t.rank === rank; });
      if (item && item.image) {
        rankOriginalPaths[rank - 1] = item.image;
      } else if (entry.images && entry.images[rank - 1]) {
        rankOriginalPaths[rank - 1] = entry.images[rank - 1];
      }
    });

    rankFiles = [null, null, null];
    renderRankSlot(1); renderRankSlot(2); renderRankSlot(3);

    // 切换界面到编辑状态
    editBannerText.textContent = "正在编辑：" + (entry.title || "第" + entry.id + "期") + "（改动将提交到仓库）";
    editBanner.hidden = false;
    publishBtn.querySelector("span").textContent = "保存修改";
    previewBtn.hidden = true;

    hideMessage();
    document.getElementById("contest-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** 退出编辑模式：清空编辑状态与表单 */
  function exitEditMode() {
    editingId = null;
    editingOriginal = null;
    rankOriginalPaths = [null, null, null];
    editBanner.hidden = true;
    publishBtn.querySelector("span").textContent = "上传并发布";
    previewBtn.hidden = false;
  }

  cancelEditBtn.addEventListener("click", function () {
    exitEditMode();
    form.reset();
    rankFiles = [null, null, null];
    renderRankSlot(1); renderRankSlot(2); renderRankSlot(3);
    clearErrors();
    hideMessage();
  });

  /* ---------------- 往期管理列表 ---------------- */

  /** 按时间倒序渲染往期列表 */
  function renderManageRows(contests) {
    var sorted = contests.slice().sort(function (a, b) {
      if (a.date && b.date && a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.id || 0) - (a.id || 0);
    });

    if (sorted.length === 0) {
      manageList.innerHTML = '<p class="empty-hint">仓库里还没有任何期数，先用上方表单发布第一期吧。</p>';
      return;
    }

    manageList.innerHTML = sorted.map(function (entry) {
      return (
        '<div class="manage-row">' +
        '  <span class="manage-index">No.' + escapeHTML(entry.id) + "</span>" +
        '  <div class="manage-info">' +
        '    <span class="manage-title">' + escapeHTML(entry.title) + "</span>" +
        '    <span class="manage-meta">' + escapeHTML(entry.theme || "") + " · " + escapeHTML(entry.date || "日期待定") + "</span>" +
        "  </div>" +
        '  <div class="manage-btns">' +
        '    <button type="button" class="btn btn-small btn-quiet" data-edit-id="' + escapeHTML(entry.id) + '">' +
        '      <i data-lucide="pen-line" aria-hidden="true"></i><span>编辑</span>' +
        "    </button>" +
        '    <button type="button" class="btn btn-small btn-quiet manage-delete" data-delete-id="' + escapeHTML(entry.id) + '" data-delete-title="' + escapeHTML(entry.title) + '">' +
        '      <i data-lucide="trash-2" aria-hidden="true"></i><span>删除</span>' +
        "    </button>" +
        "  </div>" +
        "</div>"
      );
    }).join("");
    if (window.lucide) window.lucide.createIcons();

    // 编辑：加载该期数据进入编辑模式
    manageList.querySelectorAll("[data-edit-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-edit-id");
        var entry = sorted.find(function (c) { return String(c.id) === String(id); });
        if (entry) startEdit(entry);
      });
    });

    // 删除：两步确认（第一次点击进入待确认，4 秒内再点才执行）
    manageList.querySelectorAll("[data-delete-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!btn.classList.contains("armed")) {
          btn.classList.add("armed");
          btn.querySelector("span").textContent = "确认删除";
          setTimeout(function () {
            btn.classList.remove("armed");
            btn.querySelector("span").textContent = "删除";
          }, 4000);
          return;
        }
        deleteContest(btn.getAttribute("data-delete-id"), btn.getAttribute("data-delete-title"));
      });
    });
  }

  /** 从仓库加载往期列表 */
  function loadManage() {
    var config = getGhConfig();
    if (!config) {
      manageList.innerHTML = '<p class="empty-hint">请先在上方填写 GitHub Token。</p>';
      return;
    }
    manageList.innerHTML = '<p class="empty-hint">正在从仓库读取往期数据……</p>';
    setLoading(refreshManageBtn, true);
    fetchContestsJson(config)
      .then(function (result) {
        renderManageRows(result.contests);
      })
      .catch(function (err) {
        manageList.innerHTML = '<p class="empty-hint">读取失败：' + escapeHTML(err.message) + "</p>";
      })
      .finally(function () {
        setLoading(refreshManageBtn, false);
      });
  }

  refreshManageBtn.addEventListener("click", loadManage);

  /** 删除一期：从 contests.json 移除数据，并删除其作品图 */
  function deleteContest(id, title) {
    var config = getGhConfig();
    if (!config) return;

    setLoading(publishBtn, true);
    hideMessage();
    showMessage("正在删除" + title + "……", false);

    fetchContestsJson(config)
      .then(function (result) {
        var entry = result.contests.find(function (c) { return String(c.id) === String(id); });
        if (!entry) throw new Error("在仓库中找不到第 " + id + " 期，请先刷新列表。");

        var remaining = result.contests.filter(function (c) { return String(c.id) !== String(id); });
        return commitContestsJson(config, result.sha, remaining,
          "chore: 删除" + (entry.title || "第" + id + "期") + "期数数据").then(function () {
          // 数据删除成功后，顺带清理该期作品图（失败不阻塞流程）
          var images = Array.isArray(entry.images) ? entry.images : [];
          var cleanChain = Promise.resolve();
          images.forEach(function (path) {
            cleanChain = cleanChain.then(function () {
              return deleteFile(config, path, "chore: 删除" + (entry.title || "第" + id + "期") + "作品图")
                .catch(function () { /* 单张图删除失败不影响整体 */ });
            });
          });
          return cleanChain;
        });
      })
      .then(function () {
        showMessage("已删除" + title + "（数据与作品图均已从仓库移除）。", false);
        // 若删除的正是正在编辑的期数，退出编辑模式
        if (editingId !== null && String(editingId) === String(id)) {
          exitEditMode();
          form.reset();
          rankFiles = [null, null, null];
          renderRankSlot(1); renderRankSlot(2); renderRankSlot(3);
        }
        loadManage();
      })
      .catch(function (err) {
        showMessage("删除没有成功：" + err.message, true);
      })
      .finally(function () {
        setLoading(publishBtn, false);
      });
  }

  /* ---------------- 发布 / 保存 ---------------- */

  /** 主流程：新建发布或保存编辑 */
  function publish() {
    if (!validate()) {
      showMessage("有几处信息还没填好，请看看上方的提示，温柔地补全它们吧。", true);
      return;
    }
    var config = getGhConfig();
    if (!config) return;

    var built = buildContest();
    var contest = built.contest;
    var uploads = built.uploads;

    // 至少要有一张作品图，否则这一期在页面上会是空的
    if (contest.images.length === 0) {
      showMessage("还没有选择作品图片。请至少给「第一名」上传一张作品图再发布。", true);
      return;
    }

    saveGhConfig();

    setLoading(publishBtn, true);
    hideMessage();

    // 1. 上传图片（新建 = 全部名次位；编辑 = 被替换的位）
    //    GitHub Contents API 会自动创建路径中的文件夹（如 images/第3期/）
    showMessage(uploads.length > 0
      ? "① 正在上传作品图（0 / " + uploads.length + "）…"
      : "① 无需上传新图，沿用原有作品图。", false);

    var uploadChain = Promise.resolve();
    uploads.forEach(function (item, index) {
      uploadChain = uploadChain.then(function () {
        showMessage("① 正在上传作品图（" + (index + 1) + " / " + uploads.length + "）：" +
          item.file.name + " → " + item.path, false);
        return fileToBase64(item.file).then(function (base64) {
          return uploadFile(config, item.path, base64,
            "feat: 更新" + contest.title + "图片 " + item.path.split("/").pop());
        });
      });
    });

    // 2. 合并并提交 contests.json
    uploadChain
      .then(function () {
        showMessage("② 作品图就绪，正在写入期数数据（data/contests.json）…", false);
        return fetchContestsJson(config).then(function (result) {
          var contests = result.contests;

          if (editingId !== null) {
            // 编辑：按原 id 定位替换；id 被修改时先移除旧条目
            contests = contests.filter(function (c) { return String(c.id) !== String(editingId); });
            contests.push(contest);
          } else {
            // 新建：同 id 覆盖，否则新增
            var exists = contests.some(function (c) { return String(c.id) === String(contest.id); });
            if (exists) {
              contests = contests.map(function (c) {
                return String(c.id) === String(contest.id) ? contest : c;
              });
            } else {
              contests.push(contest);
            }
          }

          var verb = editingId !== null ? "更新" : "添加";
          return commitWithVerify(config, result.sha, contests,
            "feat: " + verb + contest.title + "「" + contest.theme + "」期数数据", contest)
            .then(function (commitResult) {
              // 编辑时清理被替换后不再引用的旧图（失败不阻塞）
              if (editingId !== null && editingOriginal) {
                var oldImages = Array.isArray(editingOriginal.images) ? editingOriginal.images : [];
                var removedPaths = oldImages.filter(function (p) {
                  return contest.images.indexOf(p) === -1;
                });
                var cleanChain = Promise.resolve();
                removedPaths.forEach(function (path) {
                  cleanChain = cleanChain.then(function () {
                    return deleteFile(config, path, "chore: 清理" + contest.title + "旧作品图")
                      .catch(function () { /* 单张清理失败不影响整体 */ });
                  });
                });
                return cleanChain.then(function () { return commitResult; });
              }
              return commitResult;
            });
        });
      })
      .then(function (commitResult) {
        var commitUrl = commitResult && commitResult.commit ? commitResult.commit.html_url : "";
        var verified = commitResult && commitResult.verified;
        var verb = editingId !== null ? "已保存" : "已发布";
        var folder = "images/第" + contest.id + "期/";

        showMessage(
          "③ " + verb + "：" + contest.title + "已写入仓库，作品图 " + contest.images.length +
          " 张位于 " + folder + "。" +
          (verified ? "（网络响应中断，但已回读仓库确认写入成功）" : "") +
          " GitHub Pages 更新后即可在「往期搭配赛」看到。" +
          (commitUrl ? " 提交记录：" + commitUrl : ""),
          false
        );
        showOutput(contest, "已提交的数据", "这期数据已自动提交到仓库，下方是本次写入的内容，仅作留档。");

        // 清空表单与编辑状态
        exitEditMode();
        form.reset();
        rankFiles = [null, null, null];
        renderRankSlot(1); renderRankSlot(2); renderRankSlot(3);
        loadManage();
      })
      .catch(function (err) {
        showMessage((editingId !== null ? "保存" : "发布") + "没有成功：" + err.message, true);
      })
      .finally(function () {
        setLoading(publishBtn, false);
      });
  }

  publishBtn.addEventListener("click", publish);

  /* ---------------- 重置 ---------------- */

  form.addEventListener("reset", function () {
    clearErrors();
    hideMessage();
    outputSection.hidden = true;
    lastGenerated = null;
    exitEditMode();
    rankFiles = [null, null, null];
    renderRankSlot(1); renderRankSlot(2); renderRankSlot(3);
  });

  /* ---------------- 初始化 ---------------- */

  document.addEventListener("DOMContentLoaded", function () {
    // 已通过密码则直接进入，否则显示密码门
    if (sessionStorage.getItem("adminAuthed") === "1") {
      authGate.hidden = true;
      adminContent.hidden = false;
      loadGhConfig();
    } else {
      authGate.hidden = false;
      adminContent.hidden = true;
    }
    bindRankSlot(1);
    bindRankSlot(2);
    bindRankSlot(3);
    if (window.lucide) window.lucide.createIcons();
  });

  // 控制台生成新密码哈希用：await SiteShared.sha256Hex("新密码")
  window.SiteShared = window.SiteShared || {};
  window.SiteShared.sha256Hex = sha256Hex;
})();
