/**
 * 湘潭大学计算机学院 · 网络空间安全学院 MCP
 * Cloudflare Worker · Streamable HTTP（无状态 JSON-RPC）
 *
 * 部署后地址：
 *   https://<worker>.workers.dev/<ACCESS_UUID>/mcp
 *
 * 不知道 UUID 的请求一律 404，减少扫目录和滥用。
 */

const DEFAULT_UUID = "c075e7ea-d09c-47f4-a20c-b7d66fe7cbfc";
const COLLEGE = "https://jwxy.xtu.edu.cn";
const UA =
  "Mozilla/5.0 (compatible; XTU-CS-MCP/1.1; +https://jwxy.xtu.edu.cn)";
const PROTOCOL = "2025-03-26";

const SERVER_INFO = {
  name: "xtu-cs-mcp",
  title: "湘潭大学计算机学院检索",
  version: "1.1.0",
};

const TOOLS = [
  {
    name: "search_college",
    description:
      "检索湘潭大学计算机学院·网络空间安全学院官网（jwxy.xtu.edu.cn）新闻、通知、制度、师资等页面。关键词走学院官方 Lucene 站内搜索 search.jsp。",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "中文或英文关键词，例如：转专业、推免、胡凯、培养方案",
        },
        page: {
          type: "integer",
          description: "页码，从 1 开始，默认 1",
          minimum: 1,
          default: 1,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_article",
    description:
      "读取计算机学院官网一篇正文，并尽量列出附件链接。可传相对路径（info/1067/5016.htm）或完整 URL。仅允许 *.xtu.edu.cn。",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "文章地址或 /info/栏目/编号.htm 路径",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "list_sections",
    description: "列出计算机学院官网常用栏目入口，便于继续检索或打开栏目页。",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];

export default {
  async fetch(request, env) {
    const uuid = String(env.ACCESS_UUID || DEFAULT_UUID).toLowerCase();
    const url = new URL(request.url);
    const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);

    if (request.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }));
    }

    if (parts[0]?.toLowerCase() !== uuid) {
      return new Response("Not Found", { status: 404 });
    }

    const rest = parts.slice(1).join("/") || "";

    if (rest === "" || rest === "health") {
      return cors(
        json({
          ok: true,
          service: SERVER_INFO.name,
          version: SERVER_INFO.version,
          mcp: `/${uuid}/mcp`,
        })
      );
    }

    if (rest === "mcp" || rest === "sse") {
      if (request.method === "GET") {
        return cors(
          json({
            message: "XTU CS MCP. POST JSON-RPC to this path.",
            protocol: "MCP Streamable HTTP",
            protocolVersion: PROTOCOL,
          })
        );
      }
      if (request.method !== "POST") {
        return cors(new Response("Method Not Allowed", { status: 405 }));
      }
      return handleMcp(request);
    }

    return new Response("Not Found", { status: 404 });
  },
};

async function handleMcp(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return cors(
      json(
        { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
        400
      )
    );
  }

  if (Array.isArray(body)) {
    const out = [];
    for (const item of body) {
      const res = await dispatch(item);
      if (res) out.push(res);
    }
    return cors(json(out));
  }

  const res = await dispatch(body);
  if (!res) {
    return cors(new Response(null, { status: 202 }));
  }
  return cors(json(res));
}

async function dispatch(msg) {
  if (!msg || typeof msg !== "object") {
    return rpcError(null, -32600, "Invalid Request");
  }
  const { id, method, params } = msg;
  const isNotify = id === undefined || id === null;

  try {
    switch (method) {
      case "initialize":
        return rpcResult(id, {
          protocolVersion: params?.protocolVersion || PROTOCOL,
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: SERVER_INFO,
          instructions:
            "检索湘潭大学计算机学院·网络空间安全学院官网（jwxy.xtu.edu.cn）。先 search_college 找链接，再 get_article 读全文。list_sections 可看常用栏目。",
        });
      case "notifications/initialized":
      case "notifications/cancelled":
      case "notifications/progress":
        return null;
      case "ping":
        return isNotify ? null : rpcResult(id, {});
      case "tools/list":
        return rpcResult(id, { tools: TOOLS });
      case "tools/call":
        return rpcResult(id, await callTool(params || {}));
      case "resources/list":
        return rpcResult(id, { resources: [] });
      case "resources/templates/list":
        return rpcResult(id, { resourceTemplates: [] });
      case "prompts/list":
        return rpcResult(id, { prompts: [] });
      default:
        if (isNotify) return null;
        return rpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    if (isNotify) return null;
    return rpcError(id, -32000, String(err?.message || err));
  }
}

async function callTool(params) {
  const name = params.name;
  const args = params.arguments || {};
  if (name === "search_college") {
    const query = String(args.query || "").trim();
    if (!query) return textResult("请提供 query。", true);
    const page = Math.max(1, Number(args.page || 1) || 1);
    const results = await searchCollege(query, page);
    return textResult(JSON.stringify(results, null, 2));
  }
  if (name === "get_article") {
    const raw = String(args.url || "").trim();
    if (!raw) return textResult("请提供 url。", true);
    const article = await getArticle(raw);
    return textResult(JSON.stringify(article, null, 2));
  }
  if (name === "list_sections") {
    return textResult(JSON.stringify(SECTIONS, null, 2));
  }
  return textResult(`未知工具: ${name}`, true);
}

const SECTIONS = {
  home: `${COLLEGE}/`,
  notices: `${COLLEGE}/tzgg.htm`,
  faculty: `${COLLEGE}/szdw/zzjs/zc/js.htm`,
  staff: `${COLLEGE}/szdw/xzjf.htm`,
  recruit: `${COLLEGE}/szdw/rczp.htm`,
  undergrad_news: `${COLLEGE}/bkjy/zxdt.htm`,
  undergrad_rules: `${COLLEGE}/bkjy/gzzd.htm`,
  majors: `${COLLEGE}/bkjy/zyjs.htm`,
  downloads: `${COLLEGE}/bgfw/cyxz.htm`,
  graduate_news: `${COLLEGE}/yjsjy/zxdt.htm`,
  graduate_rules: `${COLLEGE}/yjsjy/xgzd.htm`,
  student_work: `${COLLEGE}/xsgz/xgtd.htm`,
  search: `${COLLEGE}/search.jsp?wbtreeid=1001`,
};

function textResult(text, isError = false) {
  return {
    content: [{ type: "text", text }],
    isError,
  };
}

async function searchCollege(query, page) {
  const encoded = btoa(unescape(encodeURIComponent(query)));
  let html;
  if (page <= 1) {
    const body = new URLSearchParams({
      lucenenewssearchkey: encoded,
      _lucenesearchtype: "1",
      searchScope: "0",
      showkeycode: query,
    });
    const res = await fetch(`${COLLEGE}/search.jsp?wbtreeid=1001`, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: `${COLLEGE}/index.htm`,
      },
      body,
    });
    if (!res.ok) throw new Error(`搜索失败 HTTP ${res.status}`);
    html = await res.text();
  } else {
    const u = new URL(`${COLLEGE}/search.jsp`);
    u.searchParams.set("wbtreeid", "1001");
    u.searchParams.set("searchScope", "0");
    u.searchParams.set("currentnum", String(page));
    u.searchParams.set("newskeycode2", encoded);
    const res = await fetch(u, {
      headers: { "User-Agent": UA, Referer: `${COLLEGE}/search.jsp` },
    });
    if (!res.ok) throw new Error(`搜索失败 HTTP ${res.status}`);
    html = await res.text();
  }

  const items = parseSearchResults(html);
  return {
    query,
    page,
    source: `${COLLEGE}/search.jsp?wbtreeid=1001`,
    count: items.length,
    items,
  };
}

function parseSearchResults(html) {
  const items = [];
  const seen = new Set();

  const list = html.match(/<ul[^>]*class=["'][^"']*listg2412[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i);
  const chunk = list ? list[1] : html;
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let li;
  while ((li = liRe.exec(chunk))) {
    const block = li[1];
    const hrefM = block.match(/href=["']([^"']+)["']/i);
    if (!hrefM) continue;
    const href = hrefM[1];
    if (!/info\/\d+\/\d+\.htm/i.test(href)) continue;
    const abs = href.startsWith("http")
      ? href
      : new URL(href, COLLEGE + "/").href;
    if (seen.has(abs)) continue;
    seen.add(abs);

    const titleM = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const dateM = block.match(
      /<(?:span|div)[^>]*class=["'][^"']*date[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div)>/i
    ) || block.match(/(\d{4}年\d{1,2}月\d{1,2}日)/);
    const pM = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);

    const title = strip(titleM ? titleM[1] : "").slice(0, 160);
    const date = strip(dateM ? dateM[1] : "");
    const snippet = strip(pM ? pM[1] : "").slice(0, 280);
    if (!title || title.length < 2) continue;
    items.push({
      title,
      date,
      snippet,
      url: abs,
      path: abs.replace(COLLEGE + "/", ""),
    });
  }

  if (items.length) return items.slice(0, 20);

  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    if (!/info\/\d+\/\d+\.htm/i.test(href)) continue;
    const abs = href.startsWith("http")
      ? href
      : new URL(href, COLLEGE + "/").href;
    if (seen.has(abs)) continue;
    seen.add(abs);
    const raw = strip(m[2]);
    const dateMatch = raw.match(/(\d{4}年\d{1,2}月\d{1,2}日)/);
    let title = raw;
    let date = "";
    let snippet = "";
    if (dateMatch) {
      date = dateMatch[1];
      const idx = raw.indexOf(date);
      title = raw.slice(0, idx).trim();
      snippet = raw.slice(idx + date.length).trim();
    }
    if (!title || title.length < 2) continue;
    items.push({
      title: title.slice(0, 160),
      date,
      snippet: snippet.slice(0, 240),
      url: abs,
      path: abs.replace(COLLEGE + "/", ""),
    });
  }
  return items.slice(0, 20);
}

async function getArticle(input) {
  let target = input.trim();
  if (target.startsWith("/")) target = COLLEGE + target;
  if (!/^https?:\/\//i.test(target)) {
    target = `${COLLEGE}/${target.replace(/^\.\//, "")}`;
  }
  const host = new URL(target).hostname;
  if (!host.endsWith("xtu.edu.cn")) {
    throw new Error("只允许读取 xtu.edu.cn 域名页面");
  }
  const res = await fetch(target, {
    headers: { "User-Agent": UA, Referer: COLLEGE + "/" },
  });
  if (!res.ok) throw new Error(`抓取失败 HTTP ${res.status}`);
  const html = await res.text();
  const title =
    strip((html.match(/<title>([\s\S]*?)<\/title>/i) || [, ""])[1])
      .replace(/-?计算机学院·网络空间安全学院$/,
        "")
      .trim() || target;
  const text = extractMain(html);
  const attachments = extractAttachments(html, target);
  return {
    title,
    url: target,
    chars: text.length,
    attachments,
    text: text.slice(0, 14000),
  };
}

function extractAttachments(html, pageUrl) {
  const out = [];
  const seen = new Set();
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const label = strip(m[2]);
    const isFile =
      /\.(pdf|docx?|xlsx?|zip|rar|7z|wps)(?:$|[?#])/i.test(href) ||
      /__local\//i.test(href) ||
      /\/system\/resource\/attach\//i.test(href);
    if (!isFile) continue;
    let abs;
    try {
      abs = new URL(href, pageUrl).href;
    } catch {
      continue;
    }
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push({ name: label.slice(0, 120) || abs.split("/").pop(), url: abs });
  }
  return out;
}

function extractMain(html) {
  let chunk = html;
  const m = html.match(
    /<(?:div|td)[^>]*(?:v_news_content|vsb_content|NewsContent|content)[^>]*>([\s\S]*?)<\/(?:div|td)>/i
  );
  if (m) chunk = m[1];
  chunk = chunk
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, " ");
  const lines = chunk
    .split(/\n+/)
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
  const drop = new Set([
    "学院概况",
    "师资队伍",
    "本科教育",
    "研究生教育",
    "学生工作",
    "招生就业",
    "党务人事",
    "教工之家",
    "国际交流",
    "校友空间",
    "办公服务",
    "湘潭大学首页",
    "首页",
  ]);
  const kept = [];
  for (const l of lines) {
    if (drop.has(l)) continue;
    if (l.startsWith("联系电话：0731")) break;
    if (l.startsWith("Copyright")) break;
    kept.push(l);
  }
  return kept.join("\n").trim();
}

function strip(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(id, code, message, status) {
  const payload = {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  };
  if (status) return json(payload, status);
  return payload;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function cors(res) {
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name, Last-Event-ID"
  );
  headers.set("Access-Control-Expose-Headers", "Mcp-Session-Id");
  return new Response(res.body, { status: res.status, headers });
}
