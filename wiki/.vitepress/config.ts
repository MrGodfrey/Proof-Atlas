import { defineConfig } from "vitepress";
import mathjax3 from "markdown-it-mathjax3";

const zhSidebar = [
  {
    text: "入门",
    items: [
      { text: "Wiki 首页", link: "/" },
      { text: "快速开始", link: "/guides/quick-start" },
      { text: "页面和跳转", link: "/guides/navigation" },
      { text: "核心概念与操作流程", link: "/guides/concepts-and-workflows" },
      { text: "本地 AI 工作流", link: "/guides/local-ai" }
    ]
  },
  {
    text: "参考",
    items: [
      { text: "项目路径与最近项目", link: "/reference/projects-and-paths" },
      { text: "文件结构", link: "/reference/file-layout" },
      { text: "对象协议", link: "/reference/object-protocol" },
      { text: "边语义", link: "/reference/edges" },
      { text: "Reference Atlas 与引用来源", link: "/reference/reference-atlases" },
      { text: "Route 与导出", link: "/reference/routes-and-export" },
      { text: "Markdown 链接", link: "/reference/markdown-links" },
      { text: "校验与常见错误", link: "/reference/validation" },
      { text: "LLM suggestion 工作流", link: "/reference/llm-suggestions" }
    ]
  },
  {
    text: "示例与设计",
    items: [
      { text: "半离散论文示例", link: "/examples/semidiscrete-paper" },
      { text: "拆分粒度建议", link: "/examples/splitting-guidelines" },
      { text: "设计理念", link: "/design/philosophy" }
    ]
  }
];

const enSidebar = [
  {
    text: "Getting Started",
    items: [
      { text: "Wiki Home", link: "/en/" },
      { text: "Quick Start", link: "/en/guides/quick-start" },
      { text: "Navigation and UI Controls", link: "/en/guides/navigation" },
      { text: "Concepts and Workflows", link: "/en/guides/concepts-and-workflows" },
      { text: "Local AI Workflow", link: "/en/guides/local-ai" }
    ]
  },
  {
    text: "Reference",
    items: [
      { text: "Projects and Paths", link: "/en/reference/projects-and-paths" },
      { text: "File Layout", link: "/en/reference/file-layout" },
      { text: "Object Protocol", link: "/en/reference/object-protocol" },
      { text: "Edge Semantics", link: "/en/reference/edges" },
      { text: "Reference Atlas and Citation Sources", link: "/en/reference/reference-atlases" },
      { text: "Routes and Export", link: "/en/reference/routes-and-export" },
      { text: "Markdown Links", link: "/en/reference/markdown-links" },
      { text: "Validation and Common Errors", link: "/en/reference/validation" },
      { text: "LLM Suggestion Workflow", link: "/en/reference/llm-suggestions" }
    ]
  },
  {
    text: "Examples and Design",
    items: [
      { text: "Semi-discrete Paper Example", link: "/en/examples/semidiscrete-paper" },
      { text: "Splitting Guidelines", link: "/en/examples/splitting-guidelines" },
      { text: "Design Philosophy", link: "/en/design/philosophy" }
    ]
  }
];

export default defineConfig({
  base: "/wiki/",
  outDir: "../dist/wiki",
  title: "Proof Atlas Wiki",
  description: "Documentation for the Proof Atlas proof graph workbench.",
  lastUpdated: true,
  rewrites: {
    "README.md": "index.md",
    "en/README.md": "en/index.md"
  },
  vite: {
    build: {
      target: "esnext"
    }
  },
  markdown: {
    config(md) {
      md.use(mathjax3);
    }
  },
  themeConfig: {
    logo: undefined,
    outline: {
      level: "deep",
      label: "On this page"
    },
    search: {
      provider: "local"
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/MrGodfrey/Proof-Atlas" }
    ]
  },
  locales: {
    root: {
      label: "中文",
      lang: "zh-CN",
      title: "Proof Atlas Wiki",
      description: "Proof Atlas 证明对象图工作台文档。",
      themeConfig: {
        nav: [
          { text: "指南", link: "/guides/quick-start" },
          { text: "参考", link: "/reference/projects-and-paths" },
          { text: "English", link: "/en/" },
          { text: "Demo", link: "https://proof-atlas-demo.pages.dev" }
        ],
        sidebar: zhSidebar,
        outline: {
          level: "deep",
          label: "本页目录"
        },
        docFooter: {
          prev: "上一页",
          next: "下一页"
        },
        lastUpdated: {
          text: "最后更新"
        },
        darkModeSwitchLabel: "外观",
        sidebarMenuLabel: "菜单",
        returnToTopLabel: "回到顶部"
      }
    },
    en: {
      label: "English",
      lang: "en-US",
      title: "Proof Atlas Wiki",
      description: "Documentation for the Proof Atlas proof graph workbench.",
      themeConfig: {
        nav: [
          { text: "Guides", link: "/en/guides/quick-start" },
          { text: "Reference", link: "/en/reference/projects-and-paths" },
          { text: "中文", link: "/" },
          { text: "Demo", link: "https://proof-atlas-demo.pages.dev" }
        ],
        sidebar: enSidebar
      }
    }
  }
});
