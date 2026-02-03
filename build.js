const fs = require('fs');
const path = require('path');

// ================= 配置区 =================
const TARGET_DIR = './'; 
const OUTPUT_FILE = './index.html';
const IGNORE = ['.git', 'node_modules', 'build.js', 'index.html', '.DS_Store', '.github'];

const LANG_MAP = {
    '.js': 'javascript', '.html': 'markup', '.css': 'css', '.json': 'json',
    '.py': 'python', '.md': 'markdown', '.java': 'java', '.cpp': 'cpp',
    '.h': 'c', '.ts': 'typescript', '.sh': 'bash'
};

/**
 * 递归生成目录树结构
 */
function scanDirectory(currentPath) {
    const name = path.basename(currentPath === '.' ? path.resolve(currentPath) : currentPath);
    const stats = fs.statSync(currentPath);
let relPath = path.relative(path.resolve(TARGET_DIR), path.resolve(currentPath)).replace(/\\/g, '/');
// 如果是根目录文件，relPath 会是文件名；如果是根目录本身，我们才标记为 '.'
if (relPath === '') relPath = '.';

    if (stats.isDirectory()) {
        const files = fs.readdirSync(currentPath)
            .filter(f => !IGNORE.includes(f))
            .sort()
            .map(f => scanDirectory(path.join(currentPath, f)))
            .join('');
        
        return `<li class="node dir-node" data-path="${relPath}">
                    <div class="label folder"><span class="icon"></span>${name}</div>
                    <ul>${files}</ul>
                </li>`;
    } else {
        const ext = path.extname(name).toLowerCase();
        const lang = LANG_MAP[ext] || 'text';

        return `<li class="node file-node" data-path="${relPath}">
                    <div class="label file-label" onclick="loadFile(this)" data-lang="${lang}">
                        <span class="icon"></span>${name}
                    </div>
                </li>`;
    }
}

const treeHtmlBody = scanDirectory(TARGET_DIR);

// ================= HTML 模板 =================
const finalTemplate = `
<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>项目源码极速预览</title>
    <link href="https://cdn.bootcdn.net/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css" rel="stylesheet" id="prism-theme" />
    <link href="https://cdn.bootcdn.net/ajax/libs/prism/1.29.0/plugins/line-numbers/prism-line-numbers.min.css" rel="stylesheet" />
    <style>
        :root {
            --bg-sidebar: #f0f2f5; --bg-main: #ffffff; --text-color: #000000;
            --border-color: #d1d1d1; --header-bg: #e8e8e8; --accent: #005fb8;
        }
        [data-theme="dark"] {
            --bg-sidebar: #1e1e1e; --bg-main: #1e1e1e; --text-color: #cccccc;
            --border-color: #333333; --header-bg: #2d2d2d; --accent: #0e639c;
        }

        body { margin: 0; display: flex; height: 100vh; font-family: system-ui, sans-serif; background: var(--bg-main); color: var(--text-color); overflow: hidden; }

        /* 侧边栏固定宽度 */
        .sidebar { 
            width: 30vw; min-width: 280px; flex-shrink: 0; 
            background: var(--bg-sidebar); border-right: 1px solid var(--border-color); 
            display: flex; flex-direction: column; transition: 0.3s; z-index: 1001;
        }
        .sidebar.hidden { margin-left: -30vw; }

        .tree-area { flex-grow: 1; overflow: auto; padding: 10px; }
        .tree { list-style: none; padding: 0; margin: 0; white-space: nowrap; display: inline-block; min-width: 100%; }
        .tree ul { list-style: none; padding-left: 18px; margin: 0; display: none; border-left: 1px solid var(--border-color); }
        .open > ul { display: block; }

        /* 顶栏工具条：要求置顶 */
        .main { flex-grow: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; }
        .header { 
            position: sticky; top: 0; z-index: 100; /* 置顶核心代码 */
            padding: 8px 15px; background: var(--header-bg); 
            border-bottom: 1px solid var(--border-color); 
            display: flex; align-items: center; gap: 10px; flex-wrap: wrap; /* 适配移动端换行 */
        }

        .breadcrumb { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; font-family: monospace; font-size: 13px; line-height: 1.4; flex: 1; min-width: 200px; }
        .breadcrumb b { cursor: pointer; color: var(--accent); text-decoration: underline; padding: 0 2px; }

        .controls { display: flex; align-items: center; gap: 5px; flex-wrap: nowrap; }
        input[type="number"] { width: 60px; padding: 4px; border: 1px solid var(--border-color); border-radius: 3px; background: var(--bg-main); color: var(--text-color); }
        input::placeholder { color: var(--text-color); opacity: 0.4; } /* 淡色显示末行号 */

        button { 
            padding: 5px 8px; font-size: 12px; cursor: pointer; border: 1px solid var(--border-color); 
            background: var(--header-bg); color: var(--text-color); border-radius: 3px; white-space: nowrap; transition: 0.2s;
        }
        button:hover { background: var(--border-color); }
        button:active { background: var(--accent); color: white; }

        /* 内容区与行号适配 */
        .code-view { flex-grow: 1; overflow: auto; background: var(--bg-main); }
        [data-theme="light"] code[class*="language-"], [data-theme="light"] .token { color: #000000 !important; } 
        pre[class*="language-"] { margin: 0 !important; background: transparent !important; }

        /* 自动换行时的行号固定逻辑 */
        .wrap-mode pre { white-space: pre-wrap !important; word-break: break-all !important; }
        
        /* 移动端特殊处理 */
        @media (max-width: 768px) {
            .sidebar { position: absolute; width: 85vw; height: 100%; box-shadow: 2px 0 10px rgba(0,0,0,0.2); }
            .sidebar.hidden { margin-left: -85vw; }
            .header { gap: 8px; padding: 10px; }
            .breadcrumb { order: 1; width: 100%; margin-bottom: 5px; }
            .controls { order: 2; width: 100%; justify-content: space-between; }
            .controls button {
                padding: 5px 6px; /* 稍微缩小内边距以容纳新按钮 */
                font-size: 11px;
            }
        }

        .icon { margin-right: 6px; }
        .folder .icon::before { content: '📁'; }
        .open > .folder .icon::before { content: '📂'; }
        .file-label .icon::before { content: '📄'; }
        .label { display: flex; align-items: center; padding: 5px 8px; cursor: pointer; font-size: 13px; border-radius: 3px; }
        .active-node { background: var(--accent) !important; color: white !important; }

        .toggle-btn { position: fixed; bottom: 20px; left: 20px; width: 48px; height: 48px; background: var(--accent); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 1100; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
    </style>
</head>
<body class="line-numbers">

    <div class="toggle-btn" onclick="toggleSidebar()">☰</div>

    <div class="sidebar" id="sidebar">
        <div style="padding: 8px; border-bottom: 1px solid var(--border-color); display: flex; gap: 4px;">
            <button style="flex:1" onclick="treeAction(true)">全部展开</button>
            <button style="flex:1" onclick="treeAction(false)">全部收起</button>
            <button style="flex:1" onclick="locateCurrent()">定位</button>
            <button style="flex:1" onclick="switchTheme()">🌓模式</button>
        </div>
        <div class="tree-area">
            <ul class="tree" id="fileTree">${treeHtmlBody}</ul>
        </div>
    </div>

    <div class="main">
        <div class="header">
            <div class="breadcrumb" id="breadcrumb">点击左侧文件...</div>
            
            <div class="controls">
                <button onclick="jumpToFirst()" title="跳转到第一行">首行</button>
                <input type="number" id="jumpInput" placeholder="" onkeypress="handleEnter(event)">
                <button onclick="doJump()">跳转</button>
                <button onclick="changeFontSize(2)">A+</button>
                <button onclick="changeFontSize(-2)">A-</button>
                <button onclick="toggleWrap()">自动换行</button>
            </div>
        </div>
        
        <div class="code-view" id="codeViewport">
            <pre id="preBlock" class="line-numbers"><code id="codeViewer" class="language-text">Select a file to start...</code></pre>
        </div>
    </div>

    <script src="https://cdn.bootcdn.net/ajax/libs/prism/1.29.0/prism.min.js"></script>
    <script src="https://cdn.bootcdn.net/ajax/libs/prism/1.29.0/components/prism-javascript.min.js"></script>
    <script src="https://cdn.bootcdn.net/ajax/libs/prism/1.29.0/components/prism-python.min.js"></script>
    <script src="https://cdn.bootcdn.net/ajax/libs/prism/1.29.0/plugins/line-numbers/prism-line-numbers.min.js"></script>

    <script>
        let currentFile = "";
        let fontSize = 14;
        let lastLineNum = 1;

        // 文件夹点击展开逻辑
        document.getElementById('fileTree').addEventListener('click', e => {
            const f = e.target.closest('.folder');
            if(f) f.parentElement.classList.toggle('open');
        });

        /**
         * 加载文件
         */
        async function loadFile(el) {
            const li = el.closest('.file-node');
            const path = li.getAttribute('data-path');
            const lang = el.getAttribute('data-lang');
            currentFile = path;

            document.querySelectorAll('.label').forEach(l => l.classList.remove('active-node'));
            el.classList.add('active-node');

            buildBreadcrumb(path);

            try {
                const res = await fetch(path);
                let text = await res.text();
                
                // 计算最后一行行号
                const lines = text.split('\\n');
                lastLineNum = lines.length;
                document.getElementById('jumpInput').placeholder = lastLineNum;

                // 需求：底部多出 20 行
                text = text + "\\n".repeat(20);

                const viewer = document.getElementById('codeViewer');
                viewer.textContent = text;
                document.getElementById('preBlock').className = "line-numbers language-" + lang;
                viewer.className = "language-" + lang;
                
                Prism.highlightElement(viewer);
                if(window.innerWidth < 768) toggleSidebar(true); 
            } catch (e) { alert("读取失败，请检查路径。"); }
        }

        // 路径导航分段定位
        function buildBreadcrumb(fullPath) {
            const parts = fullPath.split('/');
            const container = document.getElementById('breadcrumb');
            container.innerHTML = "";
            let accPath = "";
            
            parts.forEach((part, i) => {
                if(i > 0) container.innerHTML += "<span> / </span>";
                accPath += (i === 0 ? part : "/" + part);
                const b = document.createElement('b');
                b.innerText = part;
                const target = accPath;
                b.onclick = () => locateAction(target);
                container.appendChild(b);
            });
        }

        /**
         * 需求 1：自动换行切换并刷新行号
         */
        function toggleWrap() {
            document.body.classList.toggle('wrap-mode');
            // 重新渲染以修正行号位置
            const viewer = document.getElementById('codeViewer');
            Prism.highlightElement(viewer); 
        }

        /**
         * 需求 2：回车键跳转
         */
        function handleEnter(e) {
            if(e.key === 'Enter') doJump();
        }

        /**
         * 需求实现：点击“首行”按钮直接跳转至本文档第一行
         * 逻辑：定位到行号容器中的第一个 span 元素并触发平滑滚动
         */
        function jumpToFirst() {
            // 寻找行号区域内的第一个子元素（即第一行）
            const firstRow = document.querySelector('.line-numbers-rows > span:first-child');
    
            if (firstRow) {
                // 执行平滑滚动，并将该行置于视图中心
                firstRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
                // 视觉反馈：短暂高亮一下第一行的行号区域
                firstRow.style.background = "rgba(0,122,255,0.4)";
                setTimeout(() => {
                    firstRow.style.background = "transparent";
                }, 1000);
            } else {
                // 如果文档还没加载，尝试滚动代码容器顶部
                document.getElementById('codeViewport').scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
        
        /**
         * 需求 3：跳转行号（支持空值跳转 placeholder）
         */
        function doJump() {
            const input = document.getElementById('jumpInput');
            // 如果没输入值，则取占位符（即最后一行）
            const line = input.value || input.placeholder;
            if(!line) return;

            const row = document.querySelector('.line-numbers-rows > span:nth-child(' + line + ')');
            if(row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // 视觉闪烁提醒
                row.style.background = "rgba(255,221,0,0.6)";
                setTimeout(() => row.style.background = "transparent", 1500);
            }
        }

        // ---------------- 其他功能函数 ----------------

        function locateAction(path) {
            if(!path) return;
            document.getElementById('sidebar').classList.remove('hidden');
            const target = document.querySelector(\`.node[data-path="\${path}"]\`);
            if(target) {
                let p = target.parentElement;
                while(p && p.id !== 'fileTree') {
                    if(p.tagName === 'LI') p.classList.add('open');
                    p = p.parentElement;
                }
                const label = target.querySelector('.label');
                document.querySelectorAll('.label').forEach(l => l.classList.remove('active-node'));
                label.classList.add('active-node');
                label.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            }
        }

        function locateCurrent() { if(currentFile) locateAction(currentFile); }

        function changeFontSize(d) {
            fontSize += d;
            document.getElementById('preBlock').style.fontSize = fontSize + 'px';
            Prism.highlightElement(document.getElementById('codeViewer'));
        }

        function switchTheme() {
            const root = document.documentElement;
            const isDark = root.getAttribute('data-theme') === 'dark';
            root.setAttribute('data-theme', isDark ? 'light' : 'dark');
            document.getElementById('prism-theme').href = isDark 
                ? "https://cdn.bootcdn.net/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css"
                : "https://cdn.bootcdn.net/ajax/libs/prism/1.29.0/themes/prism-okaidia.min.css";
        }

        function treeAction(open) {
            document.querySelectorAll('.dir-node').forEach(li => open ? li.classList.add('open') : li.classList.remove('open'));
        }

        function toggleSidebar(forceHide = false) {
            const sb = document.getElementById('sidebar');
            if(forceHide) sb.classList.add('hidden');
            else sb.classList.toggle('hidden');
        }
    </script>
</body>
</html>
`;

fs.writeFileSync(OUTPUT_FILE, finalTemplate);
console.log('✅ 修正完毕：行号动态刷新、回车跳转、置顶功能区、全屏/移动端完美适配。');