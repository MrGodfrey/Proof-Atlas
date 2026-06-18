# 本地 AI 引用

`Copy local AI reference` 用于把当前对象的稳定定位信息交给本地 AI。

典型复制内容：

```text
ProofAtlas local reference
project: semi-discrete-stochastic-control
atlas_root: /Users/wangyu/code/proofAtlas/examples/semidiscrete/ProofAtlas
workspace_root: /Users/wangyu/code/proofAtlas/examples/semidiscrete
uid: obj_20260611_a7f3
name: main.claim.null_controllability
path: objects/main.claim.null_controllability/object.yml
body:
  - statement.md
```

如果项目配置了论文入口，还会出现：

```text
tex_main: main.tex
```

## 定位规则

`uid` 是永久身份。路径和 `name` 可能在重命名后变化。

本地 AI 收到引用后，应优先用 `uid` 定位：

```bash
npm run atlas -- locate obj_20260611_a7f3 examples/semidiscrete
```

## 选区规则

如果引用包含 `selection`：

```text
selection:
  file: statement.md
  block: b003
  kind: paragraph
  excerpt: "For every h small enough..."
```

本地 AI 应用 `file + excerpt` 查找原文。`block` 是浏览器内部锚点，编辑后可能漂移。

## 为什么不复制全文

本地 AI 能直接读本地文件。复制短引用比复制完整正文更稳定，也更适合后续自动修改对象、依赖和状态。
