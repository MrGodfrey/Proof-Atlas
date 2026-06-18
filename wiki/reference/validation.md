# 校验与常见错误

普通校验：

```bash
npm run atlas -- check examples/semidiscrete
```

严格校验：

```bash
npm run atlas -- check --strict examples/semidiscrete
```

## strict 模式会失败的错误

- 重复 `uid`
- 重复 `name`
- 非法 `kind`
- 非法 `role`
- 非法 `display_as`
- 非法 `importance`
- 非法 `status`
- 非法 `priority`
- 非法 `provenance`
- 非法 `atlas_type`
- 非法 `references.mounts`
- 非法 `citation` 或 `source_result`
- 非法 edge type 或 edge ref schema
- `body` 指向不存在的 Markdown 文件
- `edges` 指向不存在对象
- hard `requires` / hard `uses` 投影中存在环
- route 缺少 `uid`、`title` 或 `target`
- route `type` 不是 `route`
- route `profile` 不是 `meaning`、`proof`、`audit` 或 `history`
- route `target`、`proof_choices`、`boundaries`、`representation` 或 `render.order_hints` 引用不存在对象
- route `claim -> proof` 选择不成立
- route `representation` 值不是 `full`、`statement`、`summary`、`reference` 或 `omit`
- proof/meaning route 中 hard dependency 被设置为 `omit` 或低于表示粒度下限
- proof/meaning route 中 hard dependency 需要 `statement` 但无法按 v1 规则抽取
- Markdown 链接指向不存在对象
- view 嵌入不存在对象
- 对象正文中出现 `![[...]]`
- 对象正文中出现 TeX 宏定义 `\newcommand`、`\renewcommand` 或 `\def`
- 普通项目中定义本地 `source.*` 对象
- `source.*` 对象缺少 `citation.bibkey`
- `citation.bibkey` 不在当前项目或挂载 Reference Atlas 的 Bib registry 中
- Reference Atlas 挂载 id 重复或找不到本机路径
- `bib-registry.yml` 指向不存在的 BibTeX 文件
- 同一个 BibTeX key 出现在冲突的 trust 组中
- 使用 `rejected` 引用来源

## 常见 warning

warning 不一定让普通构图失败，但会出现在网页顶部构建状态和 `npm run atlas -- check` 输出中：

- `alias_reference`：仍在使用旧 alias；建议改成当前对象名。
- `folder_name_mismatch`：对象目录名和 `object.yml` 里的 `name` 不一致；通常应使用 `npm run atlas -- rename` 修正。
- `object_body_h1`：对象正文以一级标题开头；对象标题已经由 `object.yml` 提供，正文不应再写 H1。
- `embed_option_spacing`：`![[name]] {expanded}` 中 `{expanded}` 前多了空格，应写成 `![[name]]{expanded}`。
- `status_kind_combo`：`kind` 和 `status` 组合不符合推荐用法。
- `blocks_from_non_issue`：非 issue 对象写了 `blocks`。
- `proves_shape`：非 proof / proof_fragment 对象写了 `proves`。
- `uses_points_to_proof`：`uses` 指向 proof 对象；通常应使用 proof 的 `proves` 和 `uses` 建模。
- `claim_uses_own_proof`：claim 的 `uses` 指向证明自己的 proof。
- `claim_uses_dependency`：claim 写了证明依赖型 `uses`；通常应移动到对应 proof 的 `uses`。
- `needs_confirmation`：route 有多个合理 proof 候选，resolver 使用了确定性默认选择，但建议人工确认。
- `profile_target_mismatch`：route profile 和 target role 不太匹配，例如对非 claim 对象强制使用 `proof` profile。
- `citation_bibfile_deprecated`：对象手写了 `citation.bibfile`；BibTeX 文件应由 `bib-registry.yml` 派生。
- `unverified_external_dependency`：proof hard-uses 未核验外部结果，需要人工确认来源可信度。

## Reference Atlas 检查

普通项目可以在 `atlas.yml` 声明：

```yaml
references:
  mounts:
    - id: shared-reference-atlas
      mode: readonly
```

如果本机没有配置挂载路径，严格校验会报告 `missing_reference_atlas_mount`。此时系统不会继续把同一批 `source.*` 边和 Markdown 链接报成普通断链，避免一次缺少挂载产生大量噪音。

挂载成功后，系统会加载 Reference Atlas 对象和 `bib-registry.yml`。`source.*` 对象必须有 `citation.bibkey`，trust 由 Bib registry 派生。`rejected` 来源不可使用；`unverified` 外部结果可以显示，但 proof hard-use 时会给 warning。

## TeX 宏检查

代码块中的 TeX 宏不会报错，因为它们只是代码文本。

普通正文和数学环境中的宏定义会报错。对象正文应直接写可渲染的数学内容，不应携带 preamble 配置。

## 维护清单

改对象时检查：

1. `object.yml` 的 `uid` 不变。
2. `name` 改动必须用 `npm run atlas -- rename`。
3. 新 body 文件必须列入 `body`。
4. 正文里的普通链接目标存在。
5. view 里的嵌入目标存在。
6. `edges` 只写正向边。
7. `requires` 和 `uses` 的 hard 投影无环。
8. `views/*.route.yml` 中的 target、proof choices、boundary 和 representation 引用仍然有效。
9. `status` 和 `kind` 组合合理。
10. 不在对象正文中写 `![[...]]`。
11. 不在对象正文数学环境中定义 TeX 宏。
12. 若使用 `source.*` 对象，确认 Reference Atlas 已挂载，且相关 `citation.bibkey` 在 Bib registry 中。
13. 提交前运行 `npm run atlas -- check --strict <paper-root>` 或 `npm run atlas -- check --strict <ProofAtlas path>`。
