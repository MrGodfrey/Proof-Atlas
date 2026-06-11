# 本地 AI 工作流

Proof Atlas 同时面向人类读者和本地编辑器 agent。网页复制的是短的本地引用，而不是完整对象正文。

## 引用格式

复制出的引用类似：

```text
ProofAtlas local reference
project: semi-discrete-stochastic-control
root: /path/to/ProofAtlas
uid: obj_20260611_a7f3
name: main.claim.null_controllability
path: objects/main.claim.null_controllability/object.yml
body:
  - statement.md
```

最重要的字段是 `uid`。对象名和路径在重命名后可能变化。

## Agent 规则

Agent 收到引用后，应先定位对象：

```bash
npm run atlas -- locate obj_20260611_a7f3 examples/semidiscrete/ProofAtlas
```

然后读取列出的 Markdown 正文文件，检查边，修改对象，并运行：

```bash
npm run atlas -- check --strict examples/semidiscrete/ProofAtlas
```

## 选区引用

如果复制内容包含 selection，用文件和 excerpt 找回当前文本：

```text
selection:
  file: statement.md
  block: b003
  kind: paragraph
  excerpt: "For every h small enough..."
```

`block` 是浏览器锚点，编辑后可能漂移。更可靠的定位依据是 excerpt。
