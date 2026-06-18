# 项目路径与最近项目

Proof Atlas 的事实源是每篇论文自己的 `ProofAtlas/` 目录。工具仓库只放程序，不保存所有论文对象。

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

不传路径时，命令使用当前目录。当前目录可以是 `ProofAtlas/`，也可以是包含 `ProofAtlas/` 的论文目录。

## 打开 Overleaf 实验项目

当前实验论文目录是：

```text
/Users/wangyu/code/overleaf/semidiscrete-fourth-order-stochastic-parabolic-spectral-controllability
```

这个路径是 `workspace_root`。Proof Atlas 项目目录应当是：

```text
/Users/wangyu/code/overleaf/semidiscrete-fourth-order-stochastic-parabolic-spectral-controllability/ProofAtlas
```

当前这台机器上，这个实验路径已经初始化了 `ProofAtlas/atlas.yml`，可以直接在工具仓库里运行：

```bash
cd /Users/wangyu/code/proofAtlas

npm run atlas -- dev \
  /Users/wangyu/code/overleaf/semidiscrete-fourth-order-stochastic-parabolic-spectral-controllability \
  --port 3217
```

等价写法是直接传 `ProofAtlas/`：

```bash
npm run atlas -- dev \
  /Users/wangyu/code/overleaf/semidiscrete-fourth-order-stochastic-parabolic-spectral-controllability/ProofAtlas \
  --port 3217
```

对其他尚未初始化的论文路径，才需要先初始化一次：

```bash
cd /Users/wangyu/code/proofAtlas

npm run atlas -- init \
  /Users/wangyu/code/overleaf/semidiscrete-fourth-order-stochastic-parabolic-spectral-controllability
```

然后把新生成的 `ProofAtlas/atlas.yml` 中 workspace 部分改成：

```yaml
workspace:
  root: ..
  tex_main: ../main.tex
  bib:
    - ../bibitems.bib
```

`npm run atlas -- init` 同时会在论文工程根目录 `.gitignore` 中加入：

```gitignore
# Proof Atlas local files.
ProofAtlas/.atlas/local.yml
ProofAtlas/.atlas/cache/
ProofAtlas/.atlas/suggestions/
```

如果项目是旧项目或手工创建过，可以运行：

```bash
npm run atlas -- doctor \
  /Users/wangyu/code/overleaf/semidiscrete-fourth-order-stochastic-parabolic-spectral-controllability
```

`npm run atlas -- doctor` 会刷新 `ProofAtlas/AGENTS.md` 指针，并补齐 `.gitignore` 里的本机文件规则。

之后就可以校验和打开：

```bash
npm run atlas -- check --strict \
  /Users/wangyu/code/overleaf/semidiscrete-fourth-order-stochastic-parabolic-spectral-controllability

npm run atlas -- dev \
  /Users/wangyu/code/overleaf/semidiscrete-fourth-order-stochastic-parabolic-spectral-controllability \
  --port 3217
```

## 已打开项目后的切换

有三种切换方式。

第一种，在网页里切换：

```text
顶部 Open 按钮
-> 输入 paper root、ProofAtlas/ 路径或 registry project-id
-> Open
```

网页会让后端关闭旧项目 watcher，清空旧 graph 和 problems，重新解析新路径并加载新项目。它仍然一次只打开一个项目。

第二种，点最近项目：

```text
顶部 Open 按钮
-> Recent projects
-> 点击项目
```

最近项目来自本机 `~/.proof-atlas/projects.yml`。先注册一次：

```bash
npm run atlas -- register \
  /Users/wangyu/code/overleaf/semidiscrete-fourth-order-stochastic-parabolic-spectral-controllability
```

之后可以用 project id 打开：

```bash
npm run atlas -- dev semidiscrete-fourth-order-stochastic-parabolic-spectral-controllability
```

第三种，重启 CLI：

```text
Ctrl+C 停掉当前 npm run atlas -- dev
npm run atlas -- dev <另一个 paper-root 或 ProofAtlas/>
```

如果不停止旧 server，又启动新的 `npm run atlas -- dev`，Vite 可能自动换到下一个端口。此时浏览器要打开终端里显示的新 URL。

## 外部项目里的 AGENTS.md

外部论文项目不要复制一整份 Proof Atlas 规则。规则只维护在工具仓库：

```text
/Users/wangyu/code/proofAtlas
```

外部项目里的 `AGENTS.md` 只做连接，写清楚：

```text
tool repository: /Users/wangyu/code/proofAtlas
canonical wiki: /Users/wangyu/code/proofAtlas/wiki/README.md
workspace root: <paper-root>
atlas root: <paper-root>/ProofAtlas
```

推荐放两层指针：

```text
<paper-root>/AGENTS.md
<paper-root>/ProofAtlas/AGENTS.md
```

根目录 `AGENTS.md` 让 AI 从论文工程启动时也能找到 Proof Atlas 工具仓库；`ProofAtlas/AGENTS.md` 让 AI 进入对象目录时也能找到同一套规则。两者都不应复制对象协议、边语义、Markdown 链接规则等正文，只引用工具仓库 wiki。

当前实验项目已经这样配置：

```text
/Users/wangyu/code/overleaf/semidiscrete-fourth-order-stochastic-parabolic-spectral-controllability/AGENTS.md
/Users/wangyu/code/overleaf/semidiscrete-fourth-order-stochastic-parabolic-spectral-controllability/ProofAtlas/AGENTS.md
```

## atlas.yml 与 local.yml

`atlas.yml` 保存可提交到 git 的共享配置，路径优先写相对路径：

```yaml
schema_version: "0.1"
project: semi-discrete-stochastic-control
title: Semi-discrete stochastic controllability
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
  root: /Users/wangyu/Overleaf/some-paper
  tex_main: main.tex
  bib:
    - references.bib
```

`local.yml` 只能覆盖 workspace 路径字段，不能覆盖 `project`、`title`、对象、edges、aliases 或正文。

## 最近项目 registry

本机最近项目文件位于：

```text
~/.proof-atlas/projects.yml
```

它只是启动器，不是数据库。删除这个文件不会删除任何 `ProofAtlas/` 项目数据。

常用命令：

```bash
npm run atlas -- register /path/to/paper
npm run atlas -- projects
npm run atlas -- unregister semi-discrete-stochastic-control
npm run atlas -- dev semi-discrete-stochastic-control
```

`npm run atlas -- projects` 会标记路径已经不存在的项目为 `missing`，但不会自动删除条目。
