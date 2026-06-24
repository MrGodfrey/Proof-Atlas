# 快速开始

## 安装

```bash
npm install
```

## 校验示例

```bash
npm run atlas -- check examples/semidiscrete
npm run atlas -- check --strict examples/semidiscrete
npm run atlas -- check --strict examples/reference-atlas/ProofAtlas
```

## 启动本地工作台

```bash
npm run atlas -- dev examples/semidiscrete --port 3217
```

然后打开：

```text
http://localhost:3217
```

如果端口被占用，dev server 会自动尝试后续端口。

同一个项目也可以直接传 `ProofAtlas/` 目录：

```bash
npm run atlas -- dev examples/semidiscrete/ProofAtlas --port 3217
```

Proof Atlas 当前是本地可信文件工作台。不要直接用它打开不可信来源的
`ProofAtlas/` 项目；项目中的 Markdown、YAML 和引用文件应先按普通本地文件审查。

## 最近项目

```bash
npm run atlas -- register examples/semidiscrete
npm run atlas -- projects
npm run atlas -- dev semi-discrete-stochastic-control
```

`npm run atlas -- dev` 不传路径且当前目录不是项目时，会打开最近项目首页。

## 打开自己的论文项目

如果论文目录是：

```text
/path/to/my-paper
```

并且它已经包含 `ProofAtlas/atlas.yml`，可以直接打开：

```bash
npm run atlas -- dev /path/to/my-paper --port 3217
```

对还没有 `ProofAtlas/atlas.yml` 的论文路径，先运行一次：

```bash
npm run atlas -- init /path/to/my-paper
```

然后在 `ProofAtlas/atlas.yml` 里配置：

```yaml
workspace:
  root: ..
  tex_main: ../main.tex
  bib:
    - ../bibitems.bib
```

网页已经打开某个项目时，用顶部 `Open` 按钮输入这个 paper root 即可切换；也可以 `Ctrl+C` 停掉当前 server 后重新运行 `npm run atlas -- dev <paper-root>`。网页 Open 不会把项目加入 recent projects；需要出现在 recent list 中时，运行 `npm run atlas -- register <paper-root>`。

如果项目引用共享 Reference Atlas，在 `ProofAtlas/atlas.yml` 中声明挂载：

```yaml
references:
  mounts:
    - id: shared-reference-atlas
      mode: readonly
```

本机路径放入 `ProofAtlas/.atlas/local.yml` 或 `~/.proof-atlas/reference-atlases.yml`，不要提交本机绝对路径。详见 [Reference Atlas 与引用来源](../reference/reference-atlases.md)。

## 常用 CLI

定位对象：

```bash
npm run atlas -- locate main.claim.null_controllability examples/semidiscrete
```

创建对象：

```bash
npm run atlas -- new math claim main.claim.some_result "Some result" examples/semidiscrete
```

重命名对象：

```bash
npm run atlas -- rename old.name new.name examples/semidiscrete
```

## 推荐工作流

1. 用编辑器或本地 AI 修改 `ProofAtlas/objects/...` 和 `ProofAtlas/views/...`。
2. 用 `npm run atlas -- check --strict ...` 确认没有断链和协议错误。
3. 用 `npm run atlas -- dev <paper-root>` 或 `npm run atlas -- dev <project-id>` 打开网页浏览对象图。
4. 在网页中复制 `Copy local AI reference`，交给本地 AI 精确定位对象。

## 下一步

快速开始只说明怎么跑起来。跑起来之后建议继续读：

1. [页面和跳转](navigation.md)：了解三栏布局、顶部工具栏、Generated View、`Local AI` / `Export` 等按钮。
2. [核心概念与操作流程](concepts-and-workflows.md)：了解对象图、route、导出、本地 AI、LLM 建议和常见场景。
3. [设计理念](../design/philosophy.md)：了解为什么文件是事实源、网页为什么只读、为什么内容充分优先于极限 token 压缩。
