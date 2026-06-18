# Markdown 链接

## 普通链接

```markdown
我们使用 [[main.claim.observability]]。
```

## 自定义显示文字

```markdown
我们使用 [[main.claim.observability|可观测性估计]]。
```

## View 嵌入

```markdown
![[main.claim.null_controllability]]
![[main.claim.null_controllability]]{expanded}
```

嵌入只允许出现在 `views/` 中。对象正文中禁止 `![[...]]`。

## 规则

- `[[...]]` 可以写在对象正文和 view 中。
- `![[...]]` 只能写在 view 中。
- `![[name|text]]` 非法，嵌入不支持显示文字。
- `![[name]] {expanded}` 非法，`{expanded}` 前不能有空格。
- 数学公式、代码块和行内代码里的 `[[...]]` 不会被解析为对象链接。

## 显示约定

- 链接目标是 `display_as: equation` 时，网页渲染为圆括号样式，例如 `(energy identity)`。
- 链接目标是 `role: literature` 或 `display_as: literature_note` 时，网页渲染为方括号样式，例如 `[Boyer 2010]`。
- 其他对象保持普通链接样式。

这个约定只影响网页渲染，不改变 Markdown 源文件和对象身份。

## 公式引用

如果一个公式需要长期引用，建议把公式升格成对象：

```yaml
kind: math
role: claim
display_as: equation
name: main.eq.energy_identity
```

正文中用正常对象链接引用：

```markdown
结合 [[main.eq.energy_identity]] 和 [[main.claim.observability]]，……
```

不要保留 TeX label 形式作为 Atlas 内部引用。
