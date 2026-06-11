# 快速开始

## 安装

```bash
git clone git@github.com:MrGodfrey/Proof-Atlas.git
cd Proof-Atlas
npm ci
```

## 校验示例

```bash
npm run atlas -- check examples/semidiscrete/ProofAtlas
npm run atlas -- check --strict examples/semidiscrete/ProofAtlas
```

严格校验应输出：

```text
OK strict check: 0 problem(s).
```

## 启动本地网页

```bash
npm run atlas -- dev examples/semidiscrete/ProofAtlas --port 3217
```

打开：

```text
http://localhost:3217
```

如果端口被占用，dev server 会尝试附近可用端口，并在终端打印实际 URL。

## 创建新项目

```bash
npm run atlas -- init my-paper
```

它会创建：

```text
my-paper/ProofAtlas/
  atlas.yml
  objects/
  views/dashboard.md
  .atlas/aliases.yml
  AGENTS.md
```

创建第一个对象：

```bash
npm run atlas -- new math claim main.claim.some_result "Some result" --project my-paper/ProofAtlas
```

运行新项目：

```bash
npm run atlas -- check --strict my-paper/ProofAtlas
npm run atlas -- dev my-paper/ProofAtlas --port 3217
```

## 常用命令

```bash
npm run atlas -- locate main.claim.null_controllability examples/semidiscrete/ProofAtlas
npm run atlas -- rename old.name new.name examples/semidiscrete/ProofAtlas
npm run atlas -- doctor examples/semidiscrete/ProofAtlas
```

`doctor` 可刷新 `AGENTS.md`，并检查项目结构问题。
