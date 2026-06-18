# Proof Atlas

**Proof Atlas 是一个本地优先的数学研究工作台：用 Markdown 写证明正文，用 YAML 描述证明对象图，再用本地网页把整篇研究变成可点击的 atlas。**

[English README](README.md) · [中文维基](wiki/README.md) · [示例项目](examples/semidiscrete/ProofAtlas)

数学论文最终是线性的，但研究过程往往不是线性的。一个定理依赖若干引理，一个证明可能被某个 gap 阻塞，一条失败路线会被新路线替换，某篇文献可能只支撑一个关键估计。Proof Atlas 把这些关系显式保存下来，同时让事实源保持为普通文件，方便 Git、编辑器和本地 AI 直接读写。

## 它能做什么

- 用文件协议组织数学对象：claim、proof、equation、model、construction、calculation、issue、literature note 等。
- 提供图感知的本地网页界面：view、对象卡片、依赖边、反向边、状态和 KaTeX 渲染。
- 提供 CLI：初始化项目、校验对象图、按稳定 ID 定位对象、创建对象、解析生成式 proof route、导出云端上下文、安全重命名对象引用。
- Generated View 会把证明主线、词汇上下文、boundary 假设和 open obligation 分开显示。
- 支持类似 Obsidian 的对象链接：`[[main.claim.observability]]`，以及 view 嵌入：`![[main.proof.lr_iteration]]{expanded}`。
- 复制稳定的本地 AI 引用，不需要把整段证明正文塞进剪贴板。
- 自带一个半离散随机可控性证明的真实示例 atlas。

## 快速开始

环境要求：

- Node.js 20.19+ 或 22.12+
- npm 10+

克隆并安装：

```bash
git clone git@github.com:MrGodfrey/Proof-Atlas.git
cd Proof-Atlas
npm ci
```

校验内置示例：

```bash
npm run atlas -- check examples/semidiscrete/ProofAtlas
npm run atlas -- check --strict examples/semidiscrete/ProofAtlas
```

启动本地工作台：

```bash
npm run atlas -- dev examples/semidiscrete/ProofAtlas --port 3217
```

打开：

```text
http://localhost:3217
```

## 常用命令

创建新 atlas 项目：

```bash
npm run atlas -- init my-paper
```

创建一个 claim 对象：

```bash
npm run atlas -- new math claim main.claim.some_result "Some result" --project my-paper/ProofAtlas
```

按对象名或稳定 `uid` 定位对象：

```bash
npm run atlas -- locate main.claim.null_controllability examples/semidiscrete/ProofAtlas
```

重命名对象，并自动重写 YAML 边和 Markdown 链接：

```bash
npm run atlas -- rename old.name new.name examples/semidiscrete/ProofAtlas
```

解析一条生成式 proof route，并导出云端可读上下文：

```bash
npm run atlas -- route views/null_controllability.route.yml examples/semidiscrete/ProofAtlas
npm run atlas -- export views/null_controllability.route.yml examples/semidiscrete/ProofAtlas --format markdown
```

## 项目结构

```text
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
  .atlas/
    aliases.yml
  AGENTS.md
```

`uid` 是永久身份，`name` 是 Markdown 链接里使用的人类可读引用名。路径可以变化；`atlas locate <uid>` 可以恢复当前位置。

## 文档

- [维基首页](wiki/README.md)
- [快速开始](wiki/guides/quick-start.md)
- [核心概念与操作流程](wiki/guides/concepts-and-workflows.md)
- [页面和跳转](wiki/guides/navigation.md)
- [Route 与导出](wiki/reference/routes-and-export.md)
- [本地 AI 工作流](wiki/guides/local-ai.md)
- [半离散示例](wiki/examples/semidiscrete-paper.md)

## 开发

```bash
npm ci
npm test
npm run build
```

开发时运行示例界面：

```bash
npm run atlas -- dev examples/semidiscrete/ProofAtlas --port 3217
```

## 状态

Proof Atlas 仍处于早期阶段。文件协议刻意保持小而可读，但在 1.0 稳定版前，schema 细节仍可能演进。

## 贡献

欢迎提交 issue、示例、文档修正和聚焦的 pull request。参见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

MIT。参见 [LICENSE](LICENSE)。
