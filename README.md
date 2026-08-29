# 湘潭大学计算机学院 MCP

Cloudflare Worker 上的远程 MCP，检索 [计算机学院·网络空间安全学院官网](https://jwxy.xtu.edu.cn/)。

路径带 UUID：不知道完整地址就 404，用来减少扫目录和滥用。

## 端点

部署成功后：

```
https://xtu-cs-mcp.<你的账号>.workers.dev/c075e7ea-d09c-47f4-a20c-b7d66fe7cbfc/mcp
```

- 健康检查：`GET /<uuid>` 或 `GET /<uuid>/health`
- MCP：`POST /<uuid>/mcp`（Streamable HTTP / JSON-RPC）
- 错误 UUID 或根路径：`404`

上线前建议把 `wrangler.toml` 里的 `ACCESS_UUID` 换成你自己生成的：

```bash
python3 -c "import uuid; print(uuid.uuid4())"
```

## 部署

需要本机已安装 Node.js，并用能登录 Cloudflare 的账号：

```bash
cd xtu-cs-mcp
npm i
npx wrangler login
npx wrangler deploy
```

终端会打印 `*.workers.dev` 域名，把 UUID 拼到后面即 MCP 地址。

本地调试：

```bash
npx wrangler dev
# 然后 POST http://127.0.0.1:8787/<uuid>/mcp
```

快速自测（把 URL 换成你的）：

```bash
UUID=c075e7ea-d09c-47f4-a20c-b7d66fe7cbfc
BASE=https://xtu-cs-mcp.<子域>.workers.dev

curl -s "$BASE/$UUID/health"

curl -s "$BASE/$UUID/mcp" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'

curl -s "$BASE/$UUID/mcp" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_college","arguments":{"query":"转专业"}}}'
```

## 工具

| 工具 | 作用 |
|---|---|
| `search_college` | 学院官方 Lucene 站内搜索（`POST search.jsp?wbtreeid=1001`，关键词 Base64） |
| `get_article` | 拉取一篇 `info/...htm` 正文，并列出附件 |
| `list_sections` | 常用栏目入口 |

搜索逻辑与官网搜索框一致：

1. 关键词 UTF-8 → Base64
2. 第一页 `POST /search.jsp?wbtreeid=1001`，字段 `lucenenewssearchkey`
3. 后续页 `GET`，字段 `newskeycode2` + `currentnum`

## 接到 Cursor

`~/.cursor/mcp.json` 或项目 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "xtu-cs": {
      "url": "https://xtu-cs-mcp.<子域>.workers.dev/c075e7ea-d09c-47f4-a20c-b7d66fe7cbfc/mcp"
    }
  }
}
```

Claude Desktop / Claude Code 远程 MCP 同样填这个 URL，传输选 Streamable HTTP。

## 安全

- 根路径和错误 UUID 一律 404
- `get_article` 只允许 `*.xtu.edu.cn`
- UUID 是路径密钥，不是登录认证。需要更严可再套 Cloudflare Access，或在 Worker 里校验自定义 Header
- 不要把带 UUID 的完整 URL 发到公开仓库 Issue / 群公告

## 协议

无状态 MCP JSON-RPC：`initialize` / `tools/list` / `tools/call` / `ping`。  
兼容 2025 Streamable HTTP 客户端（单端点 POST）。
