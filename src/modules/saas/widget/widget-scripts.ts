/**
 * 网页挂件（P1）：
 * - GET /widget.js?k=sk-xxx        下发零依赖 vanilla JS（注入气泡按钮 + iframe）
 * - GET /chat-widget?k=sk-xxx      iframe 容器页（后端直出 HTML，含对话 UI 与 SSE 消费）
 * 挂件经 iframe 隔离宿主页面样式；对话走既有 /saas/visitor/chat/stream（X-Api-Key）。
 */

import { escapeHtml } from '../public/help-template.util';

/** 挂件主脚本：从自身 <script src> 解析 k 与平台地址，创建右下角气泡与 iframe */
export function widgetScript(): string {
  return `(function(){
  var sc = document.currentScript;
  if (!sc || !sc.src) return;
  var url = new URL(sc.src);
  var KEY = url.searchParams.get('k') || '';
  var BASE = url.origin;
  if (!KEY) return;
  var open = false;
  var btn = document.createElement('div');
  btn.setAttribute('data-saas-widget-bubble', '');
  btn.style.cssText = 'position:fixed;right:20px;bottom:20px;width:52px;height:52px;border-radius:50%;background:#2b5cd9;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:2147483000;box-shadow:0 4px 16px rgba(0,0,0,.25);font:600 22px/1 sans-serif;';
  btn.innerHTML = '\\u{1F4AC}';
  btn.title = '在线客服';
  var frame = document.createElement('iframe');
  frame.setAttribute('data-saas-widget-frame', '');
  frame.src = BASE + '/chat-widget?k=' + encodeURIComponent(KEY);
  frame.title = '在线客服';
  frame.style.cssText = 'position:fixed;right:20px;bottom:84px;width:360px;max-width:calc(100vw - 40px);height:560px;max-height:calc(100vh - 120px);border:0;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.28);z-index:2147483000;display:none;background:#fff;';
  btn.onclick = function(){
    open = !open;
    frame.style.display = open ? 'block' : 'none';
  };
  document.body.appendChild(frame);
  document.body.appendChild(btn);
})();`;
}

/** iframe 容器页（单页自包含：内联 CSS/JS，fetch 流式消费 SSE） */
export function chatWidgetPage(opts: {
  apiKey: string;
  origin: string;
  tenantName: string;
}): string {
  const config = JSON.stringify({
    apiKey: opts.apiKey,
    origin: opts.origin,
    tenantName: opts.tenantName,
  });
  const page = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.tenantName)} · 在线客服</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; background: #fff; color: #1f2329; }
  #head { padding: 12px 16px; background: #2b5cd9; color: #fff; font-weight: 600; display: flex; align-items: center; gap: 8px; }
  #head .dot { width: 8px; height: 8px; border-radius: 50%; background: #6ee7a0; }
  #msgs { position: absolute; top: 50px; bottom: 60px; left: 0; right: 0; overflow-y: auto; padding: 14px 12px; background: #f7f8fa; }
  .msg { max-width: 82%; margin: 8px 0; padding: 8px 12px; border-radius: 12px; font-size: 14px; line-height: 1.6; word-break: break-word; white-space: pre-wrap; }
  .user { margin-left: auto; background: #2b5cd9; color: #fff; border-bottom-right-radius: 4px; }
  .bot { background: #fff; border: 1px solid #e5e6eb; border-bottom-left-radius: 4px; }
  .sys { max-width: 100%; text-align: center; color: #86909c; font-size: 12px; background: none; }
  .arts { margin: 6px 0 2px; }
  .arts a { display: block; font-size: 12px; color: #2b5cd9; background: #eef3ff; border-radius: 8px; padding: 6px 10px; margin: 4px 0; text-decoration: none; }
  #form { position: absolute; bottom: 0; left: 0; right: 0; height: 60px; display: flex; gap: 8px; padding: 10px; background: #fff; border-top: 1px solid #e5e6eb; }
  #input { flex: 1; border: 1px solid #e5e6eb; border-radius: 10px; padding: 8px 12px; font-size: 14px; outline: none; }
  #input:focus { border-color: #2b5cd9; }
  #send { border: 0; background: #2b5cd9; color: #fff; border-radius: 10px; padding: 0 18px; font-size: 14px; cursor: pointer; }
  #send:disabled { opacity: .5; cursor: not-allowed; }
</style>
</head>
<body>
<div id="head"><span class="dot"></span><span id="tenant"></span> · 在线客服</div>
<div id="msgs"></div>
<form id="form"><input id="input" placeholder="请输入你的问题…" autocomplete="off" maxlength="2000"><button id="send" type="submit">发送</button></form>
<script>
(function(){
  var CFG = $CONFIG;
  var msgs = document.getElementById('msgs');
  var form = document.getElementById('form');
  var input = document.getElementById('input');
  var send = document.getElementById('send');
  document.getElementById('tenant').textContent = CFG.tenantName;
  document.title = CFG.tenantName + ' · 在线客服';

  var vid = localStorage.getItem('saas_widget_vid');
  if (!vid) { vid = 'v-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem('saas_widget_vid', vid); }
  var convKey = 'saas_widget_conv_' + CFG.apiKey.slice(0, 16);
  var conversationId = localStorage.getItem(convKey) || undefined;

  function add(cls, text) {
    var el = document.createElement('div');
    el.className = 'msg ' + cls;
    el.textContent = text;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    return el;
  }
  function addArticles(articles) {
    if (!articles || !articles.length) return;
    var box = document.createElement('div');
    box.className = 'msg bot arts';
    box.appendChild(document.createTextNode('相关资料：'));
    articles.forEach(function(a) {
      var link = document.createElement('a');
      link.href = a.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = a.title;
      box.appendChild(link);
    });
    msgs.appendChild(box);
    msgs.scrollTop = msgs.scrollHeight;
  }

  add('sys', '你好，有什么可以帮你？');

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || send.disabled) return;
    input.value = '';
    add('user', text);
    send.disabled = true;
    var bot = add('bot', '');

    // 相关文章推荐
    fetch(CFG.origin + '/api/v1/saas/visitor/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': CFG.apiKey },
      body: JSON.stringify({ q: text })
    }).then(function(r){ return r.json(); }).then(function(j){
      if (j && j.code === 0) addArticles(j.data);
    }).catch(function(){});

    try {
      var res = await fetch(CFG.origin + '/api/v1/saas/visitor/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': CFG.apiKey, 'Accept': 'text/event-stream' },
        body: JSON.stringify({ visitorId: vid, conversationId: conversationId, message: text }),
        signal: AbortSignal.timeout ? AbortSignal.timeout(120000) : undefined
      });
      if (!res.ok || !res.body) { bot.textContent = '服务暂不可用，请稍后再试'; return; }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      for (;;) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        var sep;
        while ((sep = buffer.indexOf('\\n\\n')) >= 0) {
          var frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          frame.split('\\n').forEach(function(line) {
            if (line.indexOf('data:') !== 0) return;
            var payload = line.slice(5).trim();
            if (!payload) return;
            var d;
            try { d = JSON.parse(payload); } catch (err) { return; }
            if (d.conversationId && !conversationId) { conversationId = d.conversationId; localStorage.setItem(convKey, conversationId); }
            if (d.delta) { bot.textContent += d.delta; msgs.scrollTop = msgs.scrollHeight; }
            if (d.done && d.code) { bot.textContent = d.message || '出错了，请稍后再试'; }
          });
        }
      }
      if (!bot.textContent) bot.textContent = '(无回答)';
    } catch (err) {
      bot.textContent = '网络异常，请稍后再试';
    } finally {
      send.disabled = false;
    }
  });
})();
</script>
</body>
</html>`;
  return page.replace('$CONFIG', config);
}
