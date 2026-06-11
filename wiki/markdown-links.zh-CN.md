# Markdown 链接和 View

Proof Atlas 使用两种链接形式。

## 对象链接

对象正文和 view 中都可以使用对象链接：

```markdown
The proof uses [[main.claim.observability]].
```

自定义显示文字：

```markdown
The proof uses [[main.claim.observability|the observability estimate]].
```

对象链接指向 `name`，不是 `uid`，因为它们需要可读。改名时请使用 `atlas rename`。

## View 嵌入

嵌入只放在 `views/` 中：

```markdown
![[main.claim.null_controllability]]
![[main.proof.lr_iteration]]{expanded}
```

`{expanded}` 表示网页默认展开对象正文。不加时，view 先显示紧凑对象卡片。

不要在对象正文文件中放 `![[...]]` 嵌入。

## 显示规则

- `display_as: equation` 的对象渲染成公式引用样式。
- 文献 note 渲染成 citation 样式。
- 其他对象渲染为普通对象链接。

这些规则只影响网页显示，不改变 Markdown 和 YAML 源文件。
