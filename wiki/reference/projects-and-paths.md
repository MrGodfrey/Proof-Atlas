# 项目路径与最近项目

Proof Atlas 的事实源是每篇论文自己的 `ProofAtlas/` 目录。工具仓库只放程序和示例，不保存用户的全部论文对象。

推荐结构：

```text
<workspace-root>/
  main.tex
  references.bib
  figures/
  ProofAtlas/
    atlas.yml
    objects/
    views/
    .atlas/
      aliases.yml
      local.yml
      suggestions/
```

## 路径解析

所有项目命令都接受两种路径：

```bash
npm run atlas -- dev /path/to/paper/ProofAtlas
npm run atlas -- dev /path/to/paper
npm run atlas -- check --strict /path/to/paper/ProofAtlas
npm run atlas -- check --strict /path/to/paper
```

解析规则固定为：

```text
1. 展开 ~。
2. 相对路径转绝对路径。
3. 如果 <path>/atlas.yml 存在，<path> 是 atlas_root。
4. 否则如果 <path>/ProofAtlas/atlas.yml 存在，<path> 是 workspace_root。
5. 否则报错，并列出尝试过的两个 atlas.yml 路径。
```

不传路径时，命令使用当前目录。当前目录可以是 `ProofAtlas/`，也可以是包含 `ProofAtlas/` 的论文目录。若当前目录不是项目，`dev` 会打开最近项目首页。

## 初始化论文项目

对尚未初始化的论文目录运行：

```bash
npm run atlas -- init /path/to/paper
```

生成的 `ProofAtlas/atlas.yml` 可以写成：

```yaml
schema_version: "0.1"
project: my-paper
title: My Paper
default_view: views/dashboard.md
math_renderer: katex
workspace:
  root: ..
  tex_main: ../main.tex
  bib:
    - ../references.bib
```

`npm run atlas -- init` 同时会在论文工程根目录 `.gitignore` 中加入：

```text
# Proof Atlas local files.
ProofAtlas/.atlas/local.yml
ProofAtlas/.atlas/cache/
ProofAtlas/.atlas/suggestions/
```

如果项目是旧项目或手工创建过，可以运行：

```bash
npm run atlas -- doctor /path/to/paper
```

`doctor` 会刷新 `ProofAtlas/AGENTS.md` 指针，并补齐 `.gitignore` 里的本机文件规则。

之后就可以校验和打开：

```bash
npm run atlas -- check --strict /path/to/paper
npm run atlas -- dev /path/to/paper --port 3217
```

## 已打开项目后的切换

有三种切换方式。

第一种，在网页里切换：

```text
顶部 Open 按钮
-> 输入 paper root、ProofAtlas/ 路径或 registry project-id
-> Open
```

网页会让后端关闭旧项目 watcher，清空旧 graph 和 problems，重新解析新路径并加载新项目。它仍然一次只打开一个项目。网页 Open 只切换当前 server 的活动项目，不会写入或更新 `~/.proof-atlas/projects.yml`。

第二种，点最近项目：

```text
顶部 Open 按钮
-> Recent projects
-> 点击项目
```

最近项目只来自本机 `~/.proof-atlas/projects.yml` 中显式注册的项目。先注册一次：

```bash
npm run atlas -- register /path/to/paper
```

之后可以用 project id 打开：

```bash
npm run atlas -- dev my-paper
```

第三种，重启 CLI：

```text
Ctrl+C 停掉当前 npm run atlas -- dev
npm run atlas -- dev <另一个 paper-root 或 ProofAtlas/>
```

## atlas.yml 与 local.yml

`atlas.yml` 保存可提交到 git 的共享配置，路径优先写相对路径：

```yaml
schema_version: "0.1"
project: my-paper
title: My Paper
default_view: views/dashboard.md
math_renderer: katex
workspace:
  root: ..
  tex_main: ../main.tex
  bib:
    - ../references.bib
```

本机绝对路径写入 `ProofAtlas/.atlas/local.yml`，不要写进共享配置：

```yaml
workspace:
  root: /path/to/local/paper-copy
  tex_main: main.tex
  bib:
    - references.bib
```

`local.yml` 只能覆盖 workspace 路径字段，以及 `reference_atlases` 本机路径映射。不能覆盖 `project`、`title`、对象、edges、aliases 或正文。

## Reference Atlas 路径

普通项目可以在 `atlas.yml` 里声明挂载：

```yaml
references:
  mounts:
    - id: shared-reference-atlas
      mode: readonly
```

挂载 id 是可提交的结构事实；挂载路径是本机事实。路径可以写在项目本地配置：

```yaml
reference_atlases:
  shared-reference-atlas:
    root: ../reference-atlas/ProofAtlas
```

也可以写在用户级 registry：

```text
~/.proof-atlas/reference-atlases.yml
```

```yaml
reference_atlases:
  shared-reference-atlas:
    root: /path/to/reference-atlas/ProofAtlas
```

如果附近存在 `reference-atlas/ProofAtlas`，并且其中 `atlas.yml` 的 `project` 与挂载 id 相同，解析器会自动使用它。详见 [Reference Atlas 与引用来源](reference-atlases.md)。

## 外部项目里的 AGENTS.md

外部论文项目不要复制一整份 Proof Atlas 规则。规则只维护在工具仓库。外部项目里的 `AGENTS.md` 只做连接，写清楚：

```text
tool repository: /path/to/Proof-Atlas
canonical wiki: /path/to/Proof-Atlas/wiki/README.md
workspace root: <paper-root>
atlas root: <paper-root>/ProofAtlas
```

推荐放两层指针：

```text
<paper-root>/AGENTS.md
<paper-root>/ProofAtlas/AGENTS.md
```

根目录 `AGENTS.md` 让 AI 从论文工程启动时也能找到 Proof Atlas 工具仓库；`ProofAtlas/AGENTS.md` 让 AI 进入对象目录时也能找到同一套规则。两者都不应复制对象协议、边语义、Markdown 链接规则等正文，只引用工具仓库 wiki。

## 最近项目 registry

本机最近项目文件位于：

```text
~/.proof-atlas/projects.yml
```

它只是启动器，不是数据库。删除这个文件不会删除任何 `ProofAtlas/` 项目数据。
