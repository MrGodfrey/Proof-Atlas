# 开源仓库发布与 Demo 验证

这篇文档用于把开发仓库里的更新发布到开源仓库，并确认 Cloudflare 在线 Demo 仍然可用。

文档中的路径用变量表示：

- `DEV`：开发仓库根目录。
- `PUB`：开源发布仓库根目录。

在线 Demo：

```text
https://proof-atlas-demo.pages.dev
```

## 基本原则

开源仓库不是开发仓库的完整镜像。它除了发布版代码之外，还包含 README、许可证、GitHub Action、Cloudflare Pages 配置和静态 Demo 模式。同步时要把开发仓库的新功能合进去，但不能覆盖掉开源仓库独有的 Demo 支持。

需要特别保留的内容包括：

- `demo-data` CLI 命令和静态 Demo 读取逻辑
- `.env.demo`
- `wrangler.jsonc`
- `.github/workflows/deploy-demo.yml`
- README 里的 Demo 链接
- `package.json` 里的 `demo:data`、`build:demo`、`dev:demo`、`deploy:demo`
- `.gitignore` 里的 `public/demo-data.json`

## 1. 检查两个仓库状态

```bash
DEV=/path/to/proofAtlas
PUB=/path/to/proof-atlas-open-source

cd "$DEV"
git status --short
git branch --show-current

cd "$PUB"
git status --short
git branch --show-current
```

如果任一仓库有未提交改动，先确认这些改动属于谁、是否要进入本次发布。不要回滚不属于本次发布的改动。

## 2. 比对发布范围

```bash
DEV=/path/to/proofAtlas
PUB=/path/to/proof-atlas-open-source

git diff --no-index --stat "$DEV/src" "$PUB/src" || true
git diff --no-index --stat "$DEV/tests" "$PUB/tests" || true
git diff --no-index --stat "$DEV/examples" "$PUB/examples" || true
git diff --no-index --stat "$DEV/fixtures" "$PUB/fixtures" || true
git diff --no-index --stat "$DEV/wiki" "$PUB/wiki" || true
```

只同步这些发布范围：

- `src/`
- `tests/`
- `examples/`
- `fixtures/`
- `wiki/`
- `.gitignore`

不要同步 `设计框架/`、`.vscode/`、`.DS_Store`、`.codex/`、`node_modules/`、`dist/`、本地 `.atlas/local.yml` 或 `.atlas/suggestions/`。

## 3. 合并代码

对于 `tests/`、`examples/`、`fixtures/`、`wiki/` 这类没有开源仓库专属代码的目录，可以在确认 diff 后用 `rsync` 同步：

```bash
DEV=/path/to/proofAtlas
PUB=/path/to/proof-atlas-open-source

rsync -a --delete --exclude='.DS_Store' "$DEV/tests/" "$PUB/tests/"
rsync -a --delete --exclude='.DS_Store' "$DEV/examples/" "$PUB/examples/"
rsync -a --delete --exclude='.DS_Store' "$DEV/fixtures/" "$PUB/fixtures/"
rsync -a --delete --exclude='.DS_Store' "$DEV/wiki/" "$PUB/wiki/"
```

`src/` 不要默认整目录覆盖。开源仓库的 `src/cli/atlas.ts`、`src/web/App.tsx`、`src/web/styles.css` 里有 Demo 相关逻辑；如果开发仓库也改了这些文件，要手动合并。

## 4. 本地验证开源仓库

在开源仓库执行：

```bash
PUB=/path/to/proof-atlas-open-source

cd "$PUB"

npm ci
npm test
npm run build
npm run build:demo
npm run atlas -- check --strict examples/semidiscrete/ProofAtlas
npm audit --omit=dev
git diff --check
```

`npm run build:demo` 会生成 `public/demo-data.json`，它应该被 git 忽略。

## 5. 部署 Cloudflare Demo

本地验证通过后，在开源仓库执行：

```bash
npx wrangler whoami
npx wrangler pages deploy dist --project-name=proof-atlas-demo --branch=main
```

如果开源仓库的 GitHub Actions 已配置 Cloudflare secrets，推送到 GitHub 后也会通过 `.github/workflows/deploy-demo.yml` 自动部署。手动部署适合在本地先确认 Demo。

## 6. 验证线上 Demo

```bash
curl -fsSI https://proof-atlas-demo.pages.dev/
curl -fsSL https://proof-atlas-demo.pages.dev/demo-data.json \
  | node -e "let s='';const count=v=>Array.isArray(v)?v.length:Object.keys(v??{}).length;process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const d=JSON.parse(s),g=d.graph??{}; console.log(g.config?.title, count(g.objects), count(g.views), count(d.bodies));})"
```

期望结果：

- 首页返回 HTTP 200
- `demo-data.json` 能解析
- 输出包含 `Semi-discrete stochastic controllability`
- 对象数量和视图数量不是 0
- 浏览器打开页面时能看到 `Cloudflare demo` 标记，没有明显报错

## 7. 提交发布

确认 diff 后再提交开源仓库：

```bash
git status --short
git diff --stat
git add -A
git commit -m "Release vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main
git push origin vX.Y.Z
```

如果只是同步 Demo 或文档，不一定需要打版本标签；按实际发布目标决定。
