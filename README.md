# 湘潭大学计算机学院 MCP

Cloudflare Worker 上的远程 MCP，检索 [计算机学院·网络空间安全学院官网](https://jwxy.xtu.edu.cn/)。

MCP 路径带 UUID：不知道完整地址就 404，减少扫目录。

## 这次更新了什么（1.2.0）

- 不带 UUID 的 `GET /health` 也能探活（旧代码这里是 404）
- 带 UUID 的 `/mcp`、`/sse`、`/messages` 都接到同一套 POST
- GET 探活 SSE 流时返回 **405** 而不是 404，避免客户端误判地址错误
- 客户端 type 必须用 Streamable HTTP，不要选 SSE

## 端点

```
https://xtu-cs-mcp.<你的账号>.workers.dev/c075e7ea-d09c-47f4-a20c-b7d66fe7cbfc/mcp
```

| 路径 | 说明 |
|---|---|
| `GET /health` | 探活，不带 UUID 也可以 |
| `GET /<uuid>/health` | 探活，并返回完整 MCP 路径 |
| `POST /<uuid>/mcp` | MCP 端点（给客户端填这个） |
| 其它乱猜的路径 | 404 |

UUID 默认：`c075e7ea-d09c-47f4-a20c-b7d66fe7cbfc`  
上线可改 `wrangler.toml` 的 `ACCESS_UUID`，改完重新 deploy，客户端 URL 同步改。

```bash
python3 -c "import uuid; print(uuid.uuid4())"
```

## 部署

```bash
cd xtu-cs-mcp
npm i
npx wrangler login
npx wrangler deploy
```

终端会打印 `*.workers.dev` 域名。

## type 怎么填

不要选 `sse`。

| 客户端 | type |
|---|---|
| Cherry Studio | `streamableHttp`（可流式传输的 HTTP） |
| Claude Code / VS Code | `http` |
| Cursor 下拉框 | `streamable-http` |
| Cursor `mcp.json` | 可以不写 type，只写 url |

## 接到客户端

Cursor `mcp.json`：

```json
{
  "mcpServers": {
    "xtu-cs": {
      "url": "https://xtu-cs-mcp.<子域>.workers.dev/c075e7ea-d09c-47f4-a20c-b7d66fe7cbfc/mcp"
    }
  }
}
```

Cherry Studio / Claude Code / VS Code：

```json
{
  "mcpServers": {
    "xtu-cs": {
      "type": "http",
      "url": "https://xtu-cs-mcp.<子域>.workers.dev/c075e7ea-d09c-47f4-a20c-b7d66fe7cbfc/mcp"
    }
  }
}
```

## 自测

```bash
UUID=c075e7ea-d09c-47f4-a20c-b7d66fe7cbfc
BASE=https://xtu-cs-mcp.<子域>.workers.dev

curl -s "$BASE/health"
curl -s "$BASE/$UUID/health"

curl -s "$BASE/$UUID/mcp" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```

## 工具

| 工具 | 作用 |
|---|---|
| `search_college` | 学院官方 Lucene 站内搜索 |
| `get_article` | 拉一篇正文和附件 |
| `list_sections` | 常用栏目入口 |
