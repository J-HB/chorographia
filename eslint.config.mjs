import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default tseslint.config(
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    rules: {
      "obsidianmd/ui/sentence-case": ["error", {
        enforceCamelCaseLower: true,
        brands: [
          // Default brands
          "iOS", "iPadOS", "macOS", "Windows", "Android", "Linux",
          "Obsidian", "Obsidian Sync", "Obsidian Publish",
          "Google Drive", "Dropbox", "OneDrive", "iCloud Drive",
          "YouTube", "Slack", "Discord", "Telegram", "WhatsApp", "Twitter", "X",
          "Readwise", "Zotero",
          "Excalidraw", "Mermaid",
          "Markdown", "LaTeX", "JavaScript", "TypeScript", "Node.js",
          "npm", "pnpm", "Yarn", "Git", "GitHub",
          "GitLab", "Notion", "Evernote", "Roam Research", "Logseq", "Anki", "Reddit",
          "VS Code", "Visual Studio Code", "IntelliJ IDEA", "WebStorm", "PyCharm",
          // Plugin-specific brands
          "Chorographia", "OpenAI", "OpenRouter", "Ollama",
        ],
        acronyms: [
          // Default acronyms
          "API", "HTTP", "HTTPS", "URL", "DNS", "TCP", "IP", "SSH", "TLS", "SSL", "FTP", "SFTP", "SMTP",
          "JSON", "XML", "HTML", "CSS", "PDF", "CSV", "YAML", "SQL", "PNG", "JPG", "JPEG", "GIF", "SVG",
          "2FA", "MFA", "OAuth", "JWT", "LDAP", "SAML",
          "SDK", "IDE", "CLI", "GUI", "CRUD", "REST", "SOAP",
          "CPU", "GPU", "RAM", "SSD", "USB",
          "UI", "OK",
          "RSS", "S3", "WebDAV",
          "ID",
          "UUID", "GUID", "SHA", "MD5", "ASCII", "UTF-8", "UTF-16", "DOM", "CDN", "FAQ", "AI", "ML",
          // Plugin-specific acronyms
          "2D", "LLM", "UMAP",
        ],
      }],
    },
  },
);
