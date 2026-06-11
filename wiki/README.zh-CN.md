# Proof Atlas 维基

[English Wiki](README.md)

Proof Atlas 是一个本地、文件驱动的证明对象图工作台。它用 Markdown 保存数学正文，用 YAML 保存对象元数据和依赖关系，负责校验对象图，并渲染本地网页用于浏览、审阅和本地 AI 协作。

## 推荐阅读

1. [快速开始](getting-started.zh-CN.md)
2. [对象模型](object-model.zh-CN.md)
3. [Markdown 链接和 view](markdown-links.zh-CN.md)
4. [本地 AI 工作流](local-ai.zh-CN.md)
5. [半离散示例](example-semidiscrete.zh-CN.md)

## 什么是 Proof Atlas 项目？

一个 Proof Atlas 项目就是一个 `ProofAtlas/` 文件夹。这个文件夹本身就是数据库：

```text
ProofAtlas/
  atlas.yml
  objects/
  views/
  .atlas/
  AGENTS.md
```

对象包含稳定的 `uid`、可读的 `name`、角色、状态、Markdown 正文文件，以及 `uses`、`proves`、`blocks`、`cites` 等有向图边。

View 是 Markdown 阅读入口，可以把对象嵌入为 dashboard、论文路线、证明地图或审计列表。

## 核心工作流

- 提交项目前运行 `atlas check --strict`。
- 重命名对象时使用 `atlas rename`，不要只手改对象名。
- 正文内部引用使用对象链接。
- `![[...]]` view 嵌入只放在 `views/` 里。
- 需要本地 AI 精确修改对象时，在网页里复制 local AI reference。

## 内置示例

仓库自带完整示例：

```text
examples/semidiscrete/ProofAtlas
```

它把一个半离散随机可控性证明拆成 problem、setting、claim、proof、equation、audit issue 和 literature note 等对象。
