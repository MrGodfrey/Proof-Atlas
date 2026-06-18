# 文件结构

每个 Proof Atlas 项目是一个 `ProofAtlas/` 文件夹，通常放在论文工程根目录下。论文目录是 `workspace_root`，`ProofAtlas/` 是 `atlas_root` 和事实源。

推荐结构：

```text
<workspace-root>/
  main.tex
  references.bib
  figures/
  .gitignore
  AGENTS.md

  ProofAtlas/
    atlas.yml

    objects/
      main.claim.null_controllability/
        object.yml
        statement.md

      main.proof.lr_iteration/
        object.yml
        proof.md

    views/
      dashboard.md
      paper.md
      proof_map.md
      null_controllability.route.yml

    .atlas/
      aliases.yml
      local.yml
      cache/
      suggestions/

    AGENTS.md
```

## `<workspace-root>/.gitignore`

`npm run atlas -- init <workspace-root>` 和 `npm run atlas -- doctor <workspace-root>`
会确保论文工程根目录的 `.gitignore` 包含 Proof Atlas 本机文件规则：

```gitignore
# Proof Atlas local files.
ProofAtlas/.atlas/local.yml
ProofAtlas/.atlas/cache/
ProofAtlas/.atlas/suggestions/
```

`local.yml` 可以包含本机绝对路径，不应提交。`cache/` 是运行时缓存，不是项目事实源。
`suggestions/` 用于保存待确认 LLM / local AI 建议，也默认不提交。

## `atlas.yml`

项目级配置：

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

## `objects/`

每个对象一个文件夹：

```text
objects/main.claim.null_controllability/
  object.yml
  statement.md
```

`object.yml` 是元数据和依赖关系。Markdown 文件是正文。

## `views/`

Markdown View 是人类手工阅读入口，用 `![[...]]` 嵌入对象。

```markdown
# Dashboard

![[main.problem.control_question]]{expanded}
![[main.claim.null_controllability]]{expanded}
```

Generated View 使用 `*.route.yml` 保存解析配方，而不是数学对象：

```yaml
schema_version: "0.1"
uid: view_20260618_null_controllability
type: route
title: Why null controllability holds
target: main.claim.null_controllability
profile: proof
proof_choices:
  main.claim.null_controllability: main.proof.lr_iteration
boundaries:
  - main.claim.partial_discrete_lr
representation:
  main.claim.partial_discrete_lr: statement
render:
  order: prerequisites_first
  show_graph: true
  show_status: true
  order_hints:
    - main.setting.probability_and_spaces
    - main.claim.null_controllability
```

route 文件 schema、profile 行为和导出规则详见 [`routes-and-export.md`](routes-and-export.md)。

常用命令：

```bash
npm run atlas -- route main.claim.null_controllability examples/semidiscrete/ProofAtlas --profile proof --save views/null_controllability.route.yml
npm run atlas -- export views/null_controllability.route.yml examples/semidiscrete/ProofAtlas --format markdown
```

## `.atlas/suggestions/`

LLM 或 local AI 的输出先保存为 pending suggestion set，不直接成为对象图事实。

```bash
npm run atlas -- suggest examples/semidiscrete/ProofAtlas --route views/null_controllability.route.yml --output .atlas/suggestions/null_control.yml
npm run atlas -- apply-suggestions .atlas/suggestions/null_control.yml examples/semidiscrete/ProofAtlas --accept <suggestion-id>
```

`apply-suggestions` 必须显式传入 `--accept`。详见
[`llm-suggestions.md`](llm-suggestions.md)。

## `.atlas/aliases.yml`

对象重命名后保留旧名字到 `uid` 的映射。日常不要手改，应使用 `npm run atlas -- rename`。

## `.atlas/local.yml`

本机路径覆盖文件，可选，不应提交到 git。它只能覆盖 workspace 路径字段：

```yaml
workspace:
  root: /Users/wangyu/Overleaf/some-paper
  tex_main: main.tex
  bib:
    - references.bib
```

不要把对象、edges、aliases、正文或项目标题放进 `local.yml`。

## `AGENTS.md`

外部论文项目里的 `AGENTS.md` 不应复制 Proof Atlas 全套规则，只应指向工具仓库的绝对路径和 wiki：

```text
Tool repository: /Users/wangyu/code/proofAtlas
Wiki: /Users/wangyu/code/proofAtlas/wiki/README.md
Atlas root: <workspace-root>/ProofAtlas
Workspace root: <workspace-root>
```

推荐同时放：

```text
<workspace-root>/AGENTS.md
<workspace-root>/ProofAtlas/AGENTS.md
```

这样 AI 无论从论文根目录还是 `ProofAtlas/` 内启动，都能找到同一份 canonical rules，而不是在多个项目里散播规则副本。
