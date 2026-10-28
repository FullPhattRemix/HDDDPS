# 皇帝的新搭配赛 · 官网

奇迹暖暖玩家组织「皇帝的新搭配赛」的官方网站。纯前端静态站点，托管于 GitHub Pages，无后端、无数据库，所有数据以静态 JSON 存储。

## 功能一览

- **首页（index.html）**：组织介绍、审核群群号一键复制与一键跳转加群、最新一期简介与前三名作品
- **往期搭配赛（rankings.html）**：**一次只展示一期**（一期一页），顶部下拉框选择期数、左右按钮翻上一期 / 下一期；每期含**前三名作品台**（第一名大图 + 二三名并列，点击可放大并左右切换）。每期有独立链接 `rankings.html?id=3`，可直接分享给他人
- **添加期数（admin.html，管理员专用）**：密码门保护，支持页面上传图片（GitHub API 直传 `images/` 目录）并自动提交 `data/contests.json`，也可降级为仅生成 JSON 手动合并
- **审核群**：QQ 群 1127110890，首页有专属区块，支持一键复制群号与一键跳转加群（链接在 `index.html` 的审核群区块，更换链接时改 `group-join` 处的 `href`）

## 项目结构

```
emperor-contest/
├── index.html          # 首页
├── rankings.html       # 往期搭配赛页
├── admin.html          # 添加期数页（管理员）
├── css/
│   └── style.css       # 全站样式（少女漫画风）
├── js/
│   ├── main.js         # 共享逻辑：导航栏/页脚注入、复制、Lucide 初始化
│   ├── home.js         # 首页：渲染最新一期卡片
│   ├── rankings.js     # 排名页：渲染卡片 + 灯箱
│   └── admin.js        # 管理页：密码门、GitHub API 上传、发布
├── data/
│   └── contests.json   # 所有期数数据
├── images/             # 图片资源，按期数分文件夹
│   └── 第X期/
└── README.md
```

## 管理员使用指南

### 1. 申请 Personal Access Token（一次性）

1. 打开 GitHub → 右上角头像 → **Settings → Developer settings → Personal access tokens → Tokens (classic)**。
2. 点 **Generate new token (classic)**，勾选 `repo` 权限（需要仓库写入）。
3. 生成后复制 Token（`ghp_` 开头），填入管理页的「GitHub 授权」（仓库已固定，只需填 Token）。

Token 仅在你的浏览器中使用：勾选「记住配置」会存入本机 localStorage（仅建议在私人电脑勾选），不勾选则只在本页面会话内有效，刷新后需重新填写。**不要把 Token 提交到仓库或发给任何人。**

### 2. 进入管理页

访问 `admin.html`，输入管理密码即可。密码由站点维护者自行设定，**不写在文档里**；如果你忘了，用下面的方法重设一个新的。

**设置 / 修改管理密码**：在任意能访问本站的页面上打开浏览器控制台（F12），执行：

```js
await SiteShared.sha256Hex("你的新密码")
```

把输出的哈希值替换 `js/admin.js` 顶部的 `ADMIN_PASSWORD_HASH`，提交即可。之后用这个新密码进入管理页。

> 注意：仓库是公开的，所以**不要把密码写进 README、提交信息或任何文件**。源码里只有密码的 SHA-256 哈希，无法反推出原文。

> 说明：密码门为前端哈希校验，防得住普通访客，但懂技术的人查看源码理论上可绕过。由于纯静态站点无法做真正的服务端鉴权，这是无后端方案下的合理权衡；Token 只存在你自己浏览器里，访客拿不到。

### 3. 发布新一期

1. 填写期数编号、标题、主题、日期、描述。
2. 点击上传区（或拖拽）选择排名图片，可多选，可单张移除。
3. 点击「**上传并发布**」：页面会依次把图片上传到 `images/第X期/rankN.扩展名`，再自动合并提交 `data/contests.json`，全程无需本地 git 操作。
4. 等 GitHub Pages 自动部署（通常 1 分钟内），排名页即可看到新一期。

「**仅生成 JSON**」按钮为降级模式：不上传任何内容，只生成数据供复制，适合网络受限或想人工检查的场景。

### 4. 数据结构说明

```json
{
  "contests": [
    {
      "id": 1,                     // 期数编号（数字，同 id 重复发布会覆盖）
      "title": "第1期",            // 期数标题（自动按编号生成「第X期」，无需填写）
      "theme": "主题名称",          // 本期主题
      "date": "2024-01-01",        // 日期（YYYY-MM-DD，用于倒序排列）
      "description": "本期主题描述",
      "top3": [                    // 前三名作品（可选；缺省时自动取 images 前 3 张）
        { "rank": 1, "name": "冠军作品昵称", "image": "images/第1期/rank1.jpg" },
        { "rank": 2, "name": "亚军作品昵称", "image": "images/第1期/rank2.jpg" },
        { "rank": 3, "name": "季军作品昵称", "image": "images/第1期/rank3.jpg" }
      ],
      "images": [                  // 本期作品图（即前三名三张）
        "images/第1期/rank1.jpg",
        "images/第1期/rank2.jpg",
        "images/第1期/rank3.jpg"
      ]
    }
  ]
}
```

排名页按 `date` 倒序展示（最新在前），无日期时按 `id` 倒序。每期只展示前三名三张作品：`images` 即这三张图，`top3` 提供名次与可选昵称（`name` 可省略）。管理页发布时在三个名次位分别上传冠军/亚军/季军作品并填写昵称即可。

## 本地预览

由于使用了 `fetch()` 读取 JSON，直接双击 HTML 文件可能因浏览器安全限制无法加载数据。请用任意静态服务器预览：

```bash
# Python
python -m http.server 8080

# 或 Node
npx serve .
```

然后访问 `http://localhost:8080`。（管理页的密码哈希校验依赖 `crypto.subtle`，在 `localhost` 或 `https` 下均可用。）

## 部署到 GitHub Pages

1. 在 GitHub 创建仓库（例如 `emperor-contest`），把本项目推送上去。
2. 进入仓库 **Settings → Pages**。
3. 在 **Build and deployment → Source** 选择 `Deploy from a branch`。
4. 选择 `main` 分支、`/ (root)` 目录，保存。
5. 一两分钟后即可通过 `https://<用户名>.github.io/emperor-contest/` 访问。

## 维护说明

- 群号等常量集中写在 `js/main.js` 顶部的 `GROUP_QQ`，修改一处全站生效。
- 管理密码哈希与图片大小上限等配置在 `js/admin.js` 顶部。
- 图标统一使用 Lucide Icons（CDN 引入），新增图标时在 HTML/模板字符串中写 `<i data-lucide="icon-name">`，并确保渲染后调用了 `lucide.createIcons()`。
- 视觉风格为编辑杂志风（Editorial）：衬线标题（Noto Serif SC）+ 无衬线正文、暖米色 #F9F8F6 背景、柔和黑 #1C1C1C 文字、透明度构建灰度、细线分隔与优雅留白、纯单色体系（无彩色强调、无阴影、无粗边框），样式集中在 `css/style.css`。
- 站点不使用任何 emoji，所有图形均为 Lucide 图标。
