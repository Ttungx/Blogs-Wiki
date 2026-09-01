# DESIGN.md — Blogs Wiki

从现有 UI（`src/styles/global.css`）提取的设计系统契约。改 UI 前先读；新 token 先加这里再用。

## 1. 气质

编辑部/馆藏气质：暖纸底 `#faf9f5` 上的近黑墨色，克制的编辑排版（中文无衬线标题），几乎无装饰——分隔线、细边框、一处星形符号。内容是主角，界面是书架。

## 2. 色彩

| Token | 值 | 用途 |
|---|---|---|
| `--background` / `--paper` | `#faf9f5` | 页面底 |
| `--paper-soft` | `#f2f0e9` | 次级面 |
| `--text-primary` / `--ink` | `#1b1a18` | 主文字 |
| `--text-secondary` / `--muted` | `#777672` | 次级文字 |
| `--text-tertiary` / `--faint` | `rgb(162 162 161)` | 三级文字 |
| `--text-muted` | `#b8b7b2` | 弱化 |
| `--line` | `#e9e6df` | 分隔线 |
| `--line-strong` | `#dfdcd4` | 强分隔/边框 |
| `--accent` | `#4759d8` | 焦点环（唯一彩色） |

## 3. 字体与排版

- `--editorial`（标题）：PingFang SC / Microsoft YaHei / Noto Sans SC（中文统一无衬线）
- `--sans`（正文）：Inter + Noto Sans SC 栈
- `--mono`：SFMono-Regular / Consolas
- 字号 token：`--hero-size`（clamp 44-58px）、`--page-title-size`、`--article-title-size`、`--section-title-size`、`--subtitle-size: 16px`、`--source-name-size: 15px`、`--source-meta-size: 11px`、`--source-count-size: 12px`

## 4. 布局

- `--shell: min(1370px, calc(100vw - 80px))`（≤900px 收窄为 `min(100% - 40px, 1370px)`）
- `--reader: min(760px, calc(100vw - 40px))`
- `trailingSlash: 'always'`

## 5. 组件原语与状态

- **BlogShelfCard**（`.shelf-card`）：58px 图标格 + 名称/类型/计数三行；hover = `opacity 0.66` + `translateY(-2px)`，`transition 160ms ease`
- **ArticleRow**（`.article-row`）：双行标题（中文主行 + 英文原题次行），`min-height: 102px`，`padding-block 14px`
- **展开更多**（`.article-list-more`）：胶囊按钮，`1px solid var(--line-strong)`，radius 999px

## 6. 动效（Motion & Interaction）

- 只动 GPU 合成属性：`transform`、`opacity`、`filter`；禁动画布局属性
- 时长/缓动 token：微交互 `160ms ease`；入场动画 `700ms cubic-bezier(0.22, 1, 0.36, 1)`（ease-out，可中断感）
- **入场波（`shelf-in`）**：雾化凝聚——`blur(9px)→0` + `translateY(9px) scale(0.98)→无`，opacity 在 55% 提前完成、blur 继续锐化；交错延迟每卡 `30ms`（重叠成波，不逐个蹦）；`animation-fill-mode: backwards`（结束释放合成层）
- `prefers-reduced-motion: reduce`：全局 `animation/transition-duration: 0.01ms` 兜底（global.css 尾部）
- 反 slop：动效只映射状态变化与入场，无装饰性循环动画

## 7. 无障碍约束

- `:focus-visible` = `2px solid var(--accent)` + offset 4px
- `.visually-hidden`、`.skip-link`、`aria-label` 齐备；图标 SVG `aria-hidden`
- 动效不依赖颜色单独传达信息

## 8. 已接受债务

- 部分遗留硬编码色值（如 `.shelf-card-count` 的 `#858b93`）待收敛进 token
- 无暗色模式（`color-scheme: light`）
