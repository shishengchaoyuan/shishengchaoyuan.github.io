// 引入 Node.js 原生文件系统模块，用于读取、写入文件和创建目录
const fs = require('fs');
// 引入 Node.js 原生路径处理模块，用于解析和拼接文件路径
const path = require('path');
// 引入 Node.js 原生加密模块，用于生成 MD5 哈希
const crypto = require('crypto');

// ================= 配置区 =================
// 定义扫描的目标目录为当前目录
const TARGET_DIR = './';
// 定义最终生成的 HTML 文件输出路径
const OUTPUT_FILE = './index.html';
// 定义内容分块 json 缓存的保存目录
const CACHE_DIR = './_index_cache';

// 检查缓存目录是否存在，如果不存在则递归创建该目录
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// 获取当前构建脚本的文件名，防止脚本在扫描目录时把自身也扫描进去
const SELF_NAME = path.basename(__filename);

// 定义生成目录树时需要忽略的文件及文件夹列表
const IGNORE = [
    '.git', 'node_modules', SELF_NAME, 'build.js', 'index.html', '.DS_Store',
    '.github', '_index_cache', 'search_index.json', 'keyword_map.json',
    '.vscode', '.idea', 'dist', 'build', 'out', 'coverage', '.next', '.nojekyll'
];

// 文件扩展名到 Prism.js 语法高亮语言标识的映射字典
const LANG_MAP = {
    '.js': 'javascript', '.html': 'markup', '.css': 'css', '.json': 'json',
    '.py': 'python', '.md': 'markdown', '.java': 'java', '.cpp': 'cpp',
    '.h': 'c', '.ts': 'typescript', '.sh': 'bash'
};

/**
 * 根据文件相对路径生成 MD5 哈希字符串（用于安全文件名）
 * @param {string} relPath - 文件相对路径
 * @returns {string} MD5 16进制字符串
 */
function getPathHash(relPath) {
    return crypto.createHash('md5').update(relPath, 'utf8').digest('hex');
}

/*** 递归生成目录树结构并缓存单文件内容 ***/
function scanDirectory(currentPath) {
    // 获取当前路径的基础名称
    const name = path.basename(currentPath === '.' ? path.resolve(currentPath) : currentPath);
    // 如果属于被忽略的目录/文件，直接返回空字符串
    if (IGNORE.includes(name)) return '';

    let stats;
    try {
        stats = fs.lstatSync(currentPath);
    } catch (err) {
        return '';
    }

    // 如果是软链接，直接跳过
    if (stats.isSymbolicLink()) return '';

    // 计算相对于 TARGET_DIR 的路径，并将 Windows 的反斜杠 \ 统一替换为正斜杠 /
    let relPath = path.relative(path.resolve(TARGET_DIR), path.resolve(currentPath)).replace(/\\/g, '/');
    if (relPath === '') relPath = '.';

    // 如果当前路径是文件夹
    if (stats.isDirectory()) {
        let filesList = [];
        try { filesList = fs.readdirSync(currentPath); } catch (err) { return ''; }

        // 过滤忽略项并生成带属性的对象列表，用于精准排序
        const files = filesList
            .filter(f => !IGNORE.includes(f))
            .map(f => {
                const fullSubPath = path.join(currentPath, f);
                let isDir = false;
                try {
                    isDir = fs.statSync(fullSubPath).isDirectory();
                } catch (e) { }
                return { name: f, isDirectory: isDir };
            })
            .sort((a, b) => {
                // 1. 类型规则：文件排在前面，文件夹排在后面
                if (!a.isDirectory && b.isDirectory) return -1;
                if (a.isDirectory && !b.isDirectory) return 1;

                // 2. 拼音排序规则：同类型之间严格按汉语拼音字母顺序 (A-Z) 升序排列
                return a.name.localeCompare(b.name, 'zh-Hans-CN-u-co-pinyin');
            })
            .map(item => scanDirectory(path.join(currentPath, item.name)))
            .join('');

        // 如果文件夹为空且不是根目录，跳过渲染
        if (!files && currentPath !== TARGET_DIR) return '';

        // 返回文件夹对应的 HTML <ul><li> 结构
        return `<li class="node dir-node" data-path="${relPath}">
                    <div class="label folder"><span class="icon"></span>${name}</div>
                    <ul>${files}</ul>
                </li>`;
    } else {
        // 如果当前路径是文件
        const ext = path.extname(name).toLowerCase();
        // 获取高亮语言类型，默认为 text
        const lang = LANG_MAP[ext] || 'text';

        // 允许缓存和展示内容的文本文件扩展名列表
        const textExtensions = ['.txt', '.md', '.js', '.html', '.css', '.json', '.py', '.c', '.cpp', '.h', '.java', '.ts', '.sh'];
        if (textExtensions.includes(ext)) {
            if (stats.size > 50 * 1024 * 1024) {
                console.log(`⚠️ 文件过大(>50MB)已跳过分块处理: ${relPath}`);
            } else {
                try {
                    // 2. 成功时不打印 log，静默写入缓存
                    const content = fs.readFileSync(currentPath, 'utf8');
                    const safeFileName = getPathHash(relPath) + '.json';
                    fs.writeFileSync(path.join(CACHE_DIR, safeFileName), JSON.stringify({ content: content }));
                } catch (e) {
                    // 3. 读取异常时记录失败
                    console.error(`❌ 缓存失败 (读取错误): ${relPath}`);
                }
            }
        }

        // 返回文件节点的 HTML 结构
        return `<li class="node file-node" data-path="${relPath}">
                    <div class="label file-label" onclick="loadFile(this)" data-lang="${lang}">
                        <span class="icon"></span>
                        <span class="file-name-text">${name}</span>
                        <span class="badge-container"></span>
                    </div>
                </li>`;
    }
}

// 打印开始构建日志
console.log('📦 开始构建轻量级目录树与分块内容缓存...');
// 执行扫描，获取目录树的 HTML 字符串
let treeHtmlBody = scanDirectory(TARGET_DIR);

// 在侧边栏目录树底部追加 25 行空白占位行
let treePaddingSpacer = '';
for (let i = 0; i < 25; i++) {
    treePaddingSpacer += '<li class="tree-padding-row" style="height: 1.5em; list-style: none; pointer-events: none;"></li>';
}
treeHtmlBody += treePaddingSpacer;

// 定义即将生成的 index.html 单文件内嵌源码
const finalTemplate = `
<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
<head>
    <meta charset="UTF-8">
    <!-- 优化 viewport，保障移动端字体不缩放、不乱序 -->
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>项目源码极速预览</title>
    <!-- 引入 Prism.js 代码高亮样式表 -->
    <link href="https://cdn.bootcdn.net/ajax/libs/prism/1.29.0/themes/prism.min.css" rel="stylesheet" id="prism-theme" />
    <style>
        /* CSS 变量定义：暗黑/亮色主题通用变量，增加目录树默认宽度变量 */
        :root {
            --bg-sidebar: #f0f2f5; --bg-main: #ffffff; --text-color: #000000;
            --border-color: #d1d1d1; --header-bg: #e8e8e8; --accent: #005fb8;
            --highlight-line: rgba(255, 221, 0, 0.25); --highlight-kw: #ffcc00;
            --history-bg: #ffffff; --history-hover: #f0f0f0;
            --sidebar-width: 600px; /* 侧边栏默认宽度 */
        }
        [data-theme="dark"] {
            --bg-sidebar: #18181c; --bg-main: #1e1e24; --text-color: #e3e3e6;
            --border-color: #2d2d34; --header-bg: #252529; --accent: #3b82f6;
            --highlight-line: rgba(255, 221, 0, 0.15); --highlight-kw: #eab308;
            --history-bg: #252529; --history-hover: #333338;
        }

        /* 全局页面 Flex 容器，固定屏高 */
        body { 
            margin: 0; display: flex; height: 100vh; 
            font-family: system-ui, -apple-system, sans-serif; 
            background: var(--bg-main); color: var(--text-color); 
            overflow: hidden; -webkit-tap-highlight-color: transparent; 
        }

        /* 
           左侧边栏样式：
           结合 JS 动态调节宽度，收起时利用 calc 动态精准平移当前宽度，彻底解决彻底隐藏问题 
        */
        .sidebar { 
            width: var(--sidebar-width); min-width: 350px; max-width: 1500px; flex-shrink: 0; 
            background: var(--bg-sidebar); border-right: 1px solid var(--border-color); 
            display: flex; flex-direction: column; position: relative;
            transition: margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1), transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); 
            z-index: 1001;
        }
        /* 彻底消除多余残存边距：利用 100% 宽度彻底移出视区 */
        .sidebar.hidden { margin-left: calc(-1 * var(--sidebar-width)); }

        /* 侧边栏右侧垂直宽度拖拽调节条 */
        .sidebar-resizer {
            position: absolute; right: -4px; top: 0; width: 8px; height: 100%;
            cursor: col-resize; z-index: 1002; background: transparent;
            transition: background 0.2s;
        }
        .sidebar-resizer:hover, .sidebar-resizer.is-resizing {
            background: var(--accent); opacity: 0.6;
        }

        /* 侧边栏顶部控制按钮区域 */
        .sidebar-top-tools {
            padding: 10px; border-bottom: 1px solid var(--border-color); display: flex; gap: 6px;
        }
        .sidebar-top-tools button {
            flex: 1; padding: 7px 4px; font-size: 15px; font-weight: 500;
        }

        /* 目录树展示区域 */
        .tree-area { flex-grow: 1; overflow: auto; padding: 10px; -webkit-overflow-scrolling: touch; }
        .tree { list-style: none; padding: 0; margin: 0; white-space: nowrap; display: inline-block; min-width: 100%; }
        .tree ul { list-style: none; padding-left: 18px; margin: 0; display: none; border-left: 1px solid var(--border-color); }
        .open > ul { display: block; }

        /* 右侧主代码展示区及顶部工具栏 */
        .main { flex-grow: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; width: 100%; }
        
        /* 顶部 Header 重构为垂直双层 Flex 布局 */
        .header { 
            position: sticky; top: 0; z-index: 100; padding: 10px 14px; 
            background: var(--header-bg); border-bottom: 1px solid var(--border-color); 
            display: flex; flex-direction: column; gap: 10px; flex-shrink: 0;
        }

        /* 面包屑导航路径区：允许折行 */
        .breadcrumb { 
            width: 100%; font-family: monospace; font-size: 15px; line-height: 1.6; 
            white-space: normal !important; word-break: break-all !important; 
            color: var(--text-color); box-sizing: border-box;
        }
        .breadcrumb b { cursor: pointer; color: var(--accent); text-decoration: underline; padding: 0 2px; }

        /* 底部控制按钮组区：独占 Header 下方整行 */
        .controls { 
            width: 100%; display: flex; align-items: center; justify-content: flex-end; 
            gap: 6px; flex-wrap: wrap; box-sizing: border-box;
        }
        
        input[type="number"] {
            width: 48px; padding: 5px 4px; font-size: 14px; text-align: center;
            border: 1px solid var(--border-color); border-radius: 4px;
            background: var(--bg-main); color: var(--text-color);
        }
        input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { 
            -webkit-appearance: none; appearance: none; margin: 0; 
        }

        button { 
            padding: 6px 12px; font-size: 14px; font-weight: 500; cursor: pointer; 
            border: 1px solid var(--border-color); background: var(--bg-main); 
            color: var(--text-color); border-radius: 4px; white-space: nowrap; transition: all 0.2s;
        }
        button:hover { background: var(--border-color); }
        button:active { background: var(--accent); color: white; }

        /* 搜索输入框与历史记录下拉菜单样式 */
        .search-container {
            padding: 10px; background: var(--bg-sidebar); border-bottom: 1px solid var(--border-color);
            position: sticky; top: 0; z-index: 10; display: flex; flex-direction: column; gap: 8px;
        }

        .search-row { display: flex; align-items: center; gap: 6px; width: 100%; box-sizing: border-box; position: relative; }
        .search-row input[type="text"] {
            flex: 1; min-width: 0; padding: 8px 12px; border: 1px solid var(--border-color);
            border-radius: 20px; background: var(--bg-main); color: var(--text-color); font-size: 13px; outline: none; box-sizing: border-box;
        }

        .global-search-label {
            display: flex; align-items: center; gap: 2px; font-size: 13px;
            white-space: nowrap; user-select: none; color: #888888; font-weight: bold; flex-shrink: 0;
            cursor: not-allowed; opacity: 0.6;
        }
        .global-search-label input[type="checkbox"] { cursor: not-allowed; margin: 0; }

        .history-dropdown {
            position: absolute; top: 100%; left: 10px; right: 10px; background: var(--history-bg);
            border: 1px solid var(--border-color); border-radius: 8px; max-height: 240px; overflow-y: auto; z-index: 2000; display: none; margin-top: 4px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.15);
        }
        .history-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; font-size: 13px; cursor: pointer; border-bottom: 1px solid var(--border-color); }
        .history-item:last-child { border-bottom: none; }
        .history-item:hover { background: var(--history-hover); }
        .history-text { flex-grow: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .history-del { color: #ff4d4f; font-weight: bold; padding: 0 4px; cursor: pointer; margin-left: 8px; }
        .history-clear { text-align: center; color: var(--accent); font-size: 12px; padding: 8px; cursor: pointer; border-top: 1px solid var(--border-color); background: var(--history-bg); font-weight: bold; position: sticky; bottom: 0; }

        .search-counter-badge {
            font-size: 12px; background: #e2e2e2; color: #333333; padding: 3px 8px;
            border-radius: 12px; font-weight: bold; border: 1px solid var(--border-color); white-space: nowrap; display: none; flex-shrink: 0;
        }
        [data-theme="dark"] .search-counter-badge { background: #333333; color: #cccccc; }

        .search-btn {
            padding: 7px 14px; font-size: 13px; background: var(--accent); color: white;
            border: none; border-radius: 20px; cursor: pointer; white-space: nowrap; font-weight: bold; flex-shrink: 0;
        }

        .file-label { display: inline-flex !important; align-items: center; cursor: pointer; vertical-align: middle; font-size: 14px; }
        .file-name-text { white-space: nowrap; }
        .badge-container { display: inline-flex; align-items: center; }

        mark.search-highlight, span.search-highlight {
            background-color: var(--highlight-kw) !important; color: #000000 !important; border-radius: 2px; padding: 0 2px; font-weight: bold; display: inline-block;
        }

        /* 主视图容器及滚动条右侧指示标记 */
        .viewport-wrapper { flex-grow: 1; position: relative; overflow: hidden; display: flex; flex-direction: column; background: var(--bg-main); }
        .code-view { flex-grow: 1; overflow: auto; background: transparent; -webkit-overflow-scrolling: touch; }

        .scrollbar-marker-container { position: absolute; right: 0; top: 0; width: 16px; height: 100%; pointer-events: none; z-index: 1000; background: transparent; }
        .scroll-marker { position: absolute; right: 2px; width: 12px; height: 3px; background-color: #ffaa00; border-radius: 1px; opacity: 0.95; }

        /* 底部匹配上下文片段面板及拉伸条样式 */
        .snippet-workspace {
            height: 180px; min-height: 40px; max-height: 50vh; border-top: 2px solid var(--border-color);
            background: var(--bg-sidebar); display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0; position: relative;
        }
        .resize-handle { height: 8px; width: 100%; cursor: ns-resize; background: transparent; position: absolute; top: 0; left: 0; z-index: 1005; }
        
        .snippet-header { padding: 8px 12px; background: var(--header-bg); border-bottom: 1px solid var(--border-color); font-size: 13px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; }
        .snippet-list { flex-grow: 1; overflow-y: auto; padding: 8px; margin: 0; list-style: none; -webkit-overflow-scrolling: touch; }
        .snippet-item { padding: 8px 10px; border-bottom: 1px solid var(--border-color); cursor: pointer; font-size: 13px; font-family: monospace; display: flex; gap: 12px; align-items: center; }
        .snippet-item:hover { background: var(--border-color); }
        .snippet-line-num { color: var(--accent); font-weight: bold; min-width: 55px; flex-shrink: 0; }
        .snippet-text { white-space: pre; overflow: hidden; text-overflow: ellipsis; flex-grow: 1; }

        .code-container-box {
            font-family: Consolas, Monaco, 'Courier New', monospace;
            font-size: 18px;
            line-height: 1.6;
            padding: 1em 0;
            margin: 0;
            min-width: 100%;
            box-sizing: border-box;
        }
        .code-line-row { display: flex; width: 100%; box-sizing: border-box; }
        .code-line-row.highlighted-row { background-color: var(--highlight-line); }
        .code-line-row.padding-row { opacity: 0.4; }
        .line-num-col {
            display: inline-block; min-width: 3.5em; padding-right: 1em; margin-right: 1em;
            text-align: right; color: #888; user-select: none; border-right: 1px solid var(--border-color); flex-shrink: 0;
        }
        .line-text-col { flex-grow: 1; white-space: pre; }
        .wrap-mode .code-line-row, .wrap-mode .line-text-col { white-space: pre-wrap !important; word-break: break-all !important; }

        .icon { margin-right: 6px; flex-shrink: 0; }
        .folder .icon::before { content: '📁'; }
        .open > .folder .icon::before { content: '📂'; }
        .file-label .icon::before { content: '📄'; }
        .label { display: flex; align-items: center; padding: 6px 8px; cursor: pointer; font-size: 18px; border-radius: 3px; }
        .active-node { background: var(--accent) !important; color: white !important; }
        
        .toggle-btn { 
            position: fixed; bottom: 24px; left: 24px; width: 52px; height: 52px; 
            background: var(--accent); color: white; border-radius: 50%; 
            display: flex; align-items: center; justify-content: center; 
            cursor: pointer; z-index: 1100; box-shadow: 0 4px 16px rgba(0,0,0,0.3); font-size: 22px;
            user-select: none; transition: transform 0.2s ease;
        }
        .toggle-btn:active { transform: scale(0.9); }

        .sidebar-overlay {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.4); z-index: 1000; display: none;
        }

/* 移動端適配：當螢幕寬度小於等於 768px 時生效的媒體查詢 */
@media (max-width: 768px) {
    
    /* 側邊欄抽屜化設置 */
    .sidebar {
        position: fixed;                          /* 脫離文件流，固定定位在頁面最上層 */
        left: 0; 
        top: 0; 
        height: 100vh;                            /* 佔滿整個螢幕高度 */
        width: 85vw !important;                   /* 寬度佔螢幕視窗的 85%（強制覆蓋 inline 樣式） */
        max-width: 360px;                         /* 限制最大寬度為 360px，避免在大螢幕手機上過寬 */
        margin-left: 0 !important;                /* 清除左側外邊距 */
        box-shadow: 4px 0 20px rgba(0,0,0,0.3); /* 增加右側陰影，提升層次感與抽屜視覺效 */
        transform: translateX(-100%);             /* 預設往左平移 100% 寬度，將抽屜徹底隱藏在畫面外 */
        transition: transform 0.25s ease;         /* 設定 0.25 秒的滑動過渡動畫 */
    }

     /* 新增：缩小移动端目录树节点字号 */
    .label {
        font-size: 18px !important;
        padding: 4px 6px !important;             /* 同步缩减上下内边距，让排版更紧凑 */
    }

    /* 新增：优化移动端行号列宽度 */
    .line-num-col {
        min-width: 2.2em !important;             /* 默认是 3.5em，移动端调小 */
        padding-right: 0.4em !important;         /* 缩小右侧内边距 */
        margin-right: 0.5em !important;          /* 缩小与代码文本的间距 */
        font-size: 12px;                         /* 适当微调行号字号，节省空间 */
    }

    /* 側邊欄顯示狀態：當沒有 .hidden 類名時滑出顯示 */
    .sidebar:not(.hidden) { 
        transform: translateX(0);        /* 移回原位（0%），平滑展開抽屜 */
    }

    /* 拖動條設置 */
    .sidebar-resizer { 
        display: none;                   /* 移動端關閉並隱藏側邊欄寬度拖拽調整條 */
    }

    /* 主內容區域適配 */
    .main { 
        width: 100vw;                    /* 主內容區域寬度強制佔滿整個手機螢幕 */
    }

    /* 頁首頂欄適配 */
    .header {
        display: flex !important;                  /* 强制启用 Flex 弹性盒布局 */           
        flex-direction: column !important;         /* 将主轴方向改为垂直方向（上下排列），使面包屑路径在上，按钮区在下 */            
        gap: 8px !important;                       /* 设置上下两行（路径与按钮组）之间的垂直间距为 8px */             
        padding: 8px 10px !important;              /* 调整顶栏内边距：上下 8px，左右 10px，适应移动端紧凑空间 */
            /* 关键修复：顶部增加 14px 内边距，把被状态栏/地址栏遮挡的路径压回可视区域 */
        padding-top: 14px !important;
        padding-bottom: 8px !important;
        padding-left: 10px !important;
        padding-right: 10px !important;
        box-sizing: border-box !important;          /* 保证 Padding 不会额外撑大容器的总宽高 */
        position: relative !important;              /* 确保容器基于正常文档流定位，防止 top 偏移异常 */
        top: 0 !important; 
    }

    /* 麵包屑導航適配 */
    .breadcrumb {        
        width: 100% !important;                     /* 占据第一行的全部宽度 */            
        white-space: normal !important;             /* 取消强制单行限制，允许文本遇到边界时自动换行 */            
        word-break: break-all !important;           /* 遇到超长无空格的文件名或路径时，允许强制断字换行，防止撑破屏幕 */            
        line-height: 1.5 !important;                /* 设置舒适的行高，防止多行路径重叠挤压 */
        font-size: 15px;                            /* 降低字級以適應窄屏顯示 */
    }

    /* 控制按鈕組適配 */
     .controls { 
        width: 100% !important;                     /* 占据第二行的全部宽度 */
        display: flex !important;                   /* 启用 Flex 布局来横向排列内部所有按钮 */
        flex-wrap: nowrap !important;               /* 核心约束：严禁按钮组二次换行，强制所有按钮保持在同一行内 */
        justify-content: flex-end !important;       /* 按钮组整体靠右侧对齐 */
        align-items: center !important;             /* 按钮在垂直方向上居中对齐 */
        gap: 4px !important;                        /* 缩小按钮之间的水平间距为 4px，防止按钮过多导致溢出 */
        overflow-x: auto !important;                /* 保护机制：若在极窄屏幕上按钮总宽超出，允许横向滑动查看，不会挤乱页面 */
        -webkit-overflow-scrolling: touch;          /* 优化 iOS 设备上的滚动流畅度（平滑惯性滑动） */
        justify-content: space-between;             /* 按鈕組兩端對齊，均勻分佈空間 */
        gap: 4px;                                   /* 縮小按鈕間的間距 */
    }

    /* 控制組內的按鈕適配 */
    .controls button { 
        padding: 4px 6px !important;                /* 减少按钮内边距，使其更紧凑 */
        font-size: 15px !important;                 /* 适当缩小字号，确保小屏能容纳更多文本 */
        white-space: nowrap !important;             /* 按钮文字本身禁止换行 */
        flex-shrink: 0 !important;                  /* 核心约束：防止按钮在空间不足时被 Flex 容器无情压缩变窄或变形 */
        flex: 1 0 auto;                             /* 允許按鈕按比例放大伸展，但不自動壓縮，自動適應寬度 */
        text-align: center;                         /* 按鈕文字居中顯示 */
    }

    /* 數字輸入框適配 */
    input[type="number"] { 
        width: 50px;                     /* 固定輸入框寬度為 */
        padding: 4px;                    /* 縮減內邊距 */
        font-size: 15px;                 /* 降低字級 */
    }

    /* 程式碼片段工作區適配 */
    .snippet-workspace { 
        max-height: 40vh;                /* 限制最大高度為螢幕高度的 40%，防止擠壓其他內容 */
    }

    /* 程式碼片段文字適配 */
    .snippet-text { 
        font-size: 12px;                 /* 降低字級 */
    }

    /* 全域搜尋標籤適配 */
    .global-search-label { 
        font-size: 12px;                 /* 降低字級 */
    }

    /* 程式碼容器方塊適配 */
    .code-container-box { 
        font-size: 18px;                 /* 調整程式碼字型大小為 18px 以利手機閱讀 */
    }
}
    </style>
</head>
<body>

    <!-- 移动端遮罩与切换按钮 -->
    <div class="sidebar-overlay" id="sidebarOverlay" onclick="toggleSidebar(true)"></div>
    <div class="toggle-btn" id="menuToggleBtn" onclick="toggleSidebar()">✕</div>

    <!-- 左侧侧边栏（新增可拖拽边框节点） -->
    <div class="sidebar" id="sidebar">
        <!-- 侧边栏宽度拖拽调节手柄 -->
        <div class="sidebar-resizer" id="sidebarResizer"></div>

        <!-- 侧边栏顶部控制按钮 -->
        <div class="sidebar-top-tools">
            <button onclick="treeAction(true)">展开</button>
            <button onclick="treeAction(false)">收起</button>
            <button onclick="locateCurrent()">定位</button>
            <button onclick="switchTheme()">🌓模式</button>
        </div>

        <!-- 搜索控制面板 -->
        <div class="search-container">
            <!-- 树节点（文件名）检索行 -->
            <div class="search-row">
                <input type="text" id="treeSearch" placeholder="文件名..." oninput="triggerTreeSearch()" autocomplete="off">
                <span class="search-counter-badge" id="treeCounter">0</span>
                <div class="history-dropdown" id="treeHistoryDrop"></div>
            </div>
            <!-- 文件内容检索行 -->
            <div class="search-row">
                <label class="global-search-label" title="已禁用全站搜索">
                    <input type="checkbox" id="globalSearchCheck" disabled>全站
                </label>
                <input type="text" id="contentSearch" placeholder="文件内容..." onkeypress="handleContentSearchEnter(event)" oninput="handleContentInput()" autocomplete="off">
                <span class="search-counter-badge" id="contentCounter">0</span>
                <button class="search-btn" id="searchBtn" onclick="triggerContentSearch()">搜索</button>
                <div class="history-dropdown" id="contentHistoryDrop"></div>
            </div>
        </div>

        <!-- 目录树渲染区 -->
        <div class="tree-area">
            <ul class="tree" id="fileTree">${treeHtmlBody}</ul>
        </div>
    </div>

    <!-- 右侧主界面 -->
    <div class="main">
        <!-- 头部导航与操作栏（上下双层布局） -->
        <div class="header">
            <!-- 1. 上层：多行自适应面包屑路径区 -->
            <div class="breadcrumb" id="breadcrumb">点击左侧文件...</div>
            
            <!-- 2. 下层：全功能控制按钮区（最下方独占一行） -->
            <div class="controls">
                <button onclick="toggleSimplifiedTraditional()" id="stConvertBtn" title="切换简体中文/香港繁體">繁體</button>
                <button onclick="restoreOriginalText()" id="restoreBtn" title="还原为文件原始语言">原字体</button>
                <button onclick="jumpToFirst()">首行</button>
                <input type="number" id="jumpInput" placeholder="行" onkeypress="handleEnter(event)">
                <button onclick="doJump()">跳转</button>
                <button onclick="changeFontSize(2)">A+</button>
                <button onclick="changeFontSize(-2)">A-</button>
                <button onclick="toggleWrap()">换行</button>
            </div>
        </div>
        
        <!-- 代码视图展示区 -->
        <div class="viewport-wrapper">
            <div class="scrollbar-marker-container" id="markerContainer"></div>
            <div class="code-view" id="codeViewport">
                <div id="codeViewer" class="code-container-box">Select a file to start...</div>
            </div>
        </div>

        <!-- 底部高亮上下文片段预览面板 -->
        <div class="snippet-workspace" id="snippetWorkspace" style="display: none;">
            <div class="resize-handle" id="workspaceResizer"></div>
            <div class="snippet-header">
                <span>🔍 匹配上下文片段 (点击跳转)</span>
                <span id="snippetCount" style="color: var(--accent)">0 个匹配</span>
            </div>
            <ul class="snippet-list" id="snippetList"></ul>
        </div>
    </div>

    <!-- CDN 加载脚本：MD5 加密、Prism.js 高亮引擎 -->
    <script src="https://cdn.bootcdn.net/ajax/libs/blueimp-md5/2.19.0/js/md5.min.js"></script>
    <script src="https://cdn.bootcdn.net/ajax/libs/prism/1.29.0/prism.min.js"></script>
    <script src="https://cdn.bootcdn.net/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js"></script>

<!-- 香港繁体转换引擎 -->
<script>
    var currentTextMode = 'original'; 

    var S2T_PHRASE_MAP = {
       // 丑 / 醜 的区分
        "子丑寅卯": "子丑寅卯",
        "丑陋": "醜陋",
        "出丑": "出醜",
        "丑态": "醜態",
        "丑角": "丑角", // 京剧/戏曲中“丑角”的“丑”不写作“醜”
        
        // 台 / 臺 的区分
        "台湾": "臺灣",
        "台北": "臺北",
        "台中": "臺中",
        "台南": "臺南",
        "台风": "颱風",
        "讲台": "講臺",
        "阳台": "陽臺",
        "后台": "後臺",
        "台灯": "檯燈",
        "台球": "檯球",
        "一台": "一台", // 量词通常简化或按习惯，可自行增减
        
        // 几 / 幾 的区分
        "茶几": "茶几", // 家具的几
        "几几": "几几",
        "几率": "機率", // 港台通常用“機率”
        "几何": "幾何",
        "几个": "幾個",
        "几天": "幾天",
        "几时": "幾時",
        
        // --- 幹 / 干 / 乾 ---
        "干部": "幹部",
        "树干": "樹幹",
        "干练": "幹練",
        "才干": "才幹",
        "主干": "主幹",
        "干涉": "干涉",
        "干系": "干系",
        "干燥": "乾燥",
        "乾坤": "乾坤",
        "乾杯": "乾杯",
        "饼干": "餅乾",
        "乾隆": "乾隆",

        // --- 徵 / 征 ---
        "特征": "特徵",
        "徵求": "徵求",
        "徵信": "徵信",
        "象征": "象徵",
        "徵兆": "徵兆",
        "长征": "長征",
        "征途": "征途",
        "征伐": "征伐",
        "远征": "遠征",

        // --- 鬥 / 斗 ---
        "战斗": "戰鬥",
        "奋斗": "奮鬥",
        "斗争": "鬥爭",
        "决斗": "決鬥",
        "斗牛": "鬥牛",
        "烟斗": "煙鬥",
        "斗篷": "斗篷",
        "斗室": "斗室",
        "泰斗": "泰斗",

        // --- 鍾 / 鐘 / 钟 ---
        "时钟": "時鐘",
        "闹钟": "鬧鐘",
        "钟表": "鐘表",
        "钟声": "鐘聲",
        "撞钟": "撞鐘",
        "钟点": "鐘點",
        "钟馗": "鍾馗", // 特例：部分人名/神话人物

        // --- 谷 / 穀 ---
        "山谷": "山谷",
        "峡谷": "峽谷",
        "曼谷": "曼谷",
        "谷物": "穀物",
        "稻谷": "稻穀",
        "五谷": "五穀",
        "低谷": "低谷",

        // --- 咸 / 鹹 ---
        "咸菜": "鹹菜",
        "咸鱼": "鹹魚",
        "咸淡": "鹹淡",
        "咸味": "鹹味",
        "咸阳": "咸陽", // 地名特例

        // --- 范 / 範 ---
        "范仲淹": "范仲淹", // 人名特例
        "范冰冰": "范冰冰", // 人名特例
        "模范": "模範",
        "范围": "範圍",
        "防范": "防範",
        "规范": "規範",
        
         // --- 后 / 後 ---
        "后台": "後臺",
        "后台": "後臺",
        "后天": "後天",
        "后来": "後來",
        "后路": "後路",
        "后退": "後退",
        "后院": "後院",
        "身后": "身後",
        "落后": "落後",
        // 注意：姓氏“后”（如后羿）或特定古代职位（皇后、太后）需保持原样或转为繁体“后/後”的区分
        "皇后": "皇后", // 繁体通常写作“皇后”（这里的后不写作後）
        "太后": "太后", // 繁体通常写作“太后”
        "后羿": "后羿", // 人名特例

        // --- 发 / 發 / 髮 ---
        "头发": "頭髮",
        "毛发": "毛髮",
        "理发": "理髮",
        "发卡": "髮卡",
        "发型": "髮型",
        "发奋": "發奮",
        "发展": "發展",
        "发现": "發現",
        "发生": "發生",
        "发射": "發射",
        "发布": "發布",
        "发挥": "發揮",
        "发明": "發明",

        // --- 余 / 餘 ---
        "其余": "其餘",
        "余数": "餘數",
        "余粮": "餘糧",
        "余威": "餘威",
        "盈余": "盈餘",
        "余地": "餘地",
        "业余": "業餘",
        "余姚": "余姚", // 地名/姓氏特例：浙江余姚
        "余秋雨": "余秋雨", // 人名特例

        // --- 里 / 裏 (港台习惯：内部、里面通常用“裏”，而市里、公里、里程用“里”) ---
        "里面": "裏面",
        "这里": "這裡",
        "那里": "那裡",
        "哪里": "哪里", // 也可以写作哪裡，视习惯而定
        "家里": "家裡",
        "心里": "心裡",
        "手里的": "手裡的",
        "公里": "公里",
        "英里": "英里",
        "里程": "里程",
        "邻里": "鄰里",
        "故里": "故里",

         // --- 岳 / 嶽 ---
        "岳父": "岳父",   // 称呼（妻子之父）传统上多用“岳父”，部分也写作“岳父”或“嶽父”，现代规范或日常多用“岳父”
        "岳母": "岳母",   // 同上
        "岳飞": "岳飞",   // 历史人名：民族英雄岳飞，姓氏绝对不能变！
        "岳云": "岳云",   // 岳飞之子
        "岳阳": "岳阳",   // 地名：湖南岳阳
        "岳麓": "岳麓",   // 地名/山名：岳麓山（虽然带山，但作为地名或书院名通常保留“岳麓书院”或用“嶽麓”）——注：地名“岳麓”在港台或规范中常写作“岳麓”或“嶽麓”，为防万一建议保护或根据习惯定义
        
        // 凡是指高大山脉、五岳的，转为繁体“嶽”
        "五岳": "五嶽",
        "东岳": "東嶽",
        "西岳": "西嶽",
        "南岳": "南嶽",
        "北岳": "北嶽",
        "中岳": "中嶽",
        "山岳": "山嶽",
        "岳峙": "嶽峙",

         // --- 系 / 係 / 系 (系统/大学系别 vs 关系/联络) ---
        "关系": "關係",
        "联系": "聯繫",
        "体系": "體系",
        "系列": "系列",       // “系列”的系在繁体中通常也写作“系列”或“係列”，现代标准多用“系列”
        "系统": "系統",
        "直系": "直系",       // 血统关系一般用“直系”或“直係”
        "世系": "世系",
        "干系": "干系",       // 前面提过，指责任牵连，不作“係”
        // 注意：技术代码和英文直译词汇中的“系”（如：操作系统、DOM体系、坐标系）需要妥善处理
        "操作系统": "作業系統",
        "坐标系": "坐標系",

        // --- 制 / 製 (制造/制作 vs 制度/体制) ---
        "制造": "製造",
        "制作": "製作",
        "制成": "製成",
        "制品": "製品",
        "制作者": "製作者",
        "复制": "複製",
        "定制": "定制",       // 量身定制（部分也用“定製”）
        // 而属于规章制度、控制、限制的“制”，保持不变：
        "制度": "制度",
        "体制": "體制",
        "控制": "控制",
        "限制": "限制",
        "制约": "制約",
        "机制": "機制",

        // --- 准 / 準 (标准/准确 vs 准许/准予) ---
        "标准": "標準",
        "准确": "準確",
        "准备": "準備",
        "瞄准": "瞄準",
        "准则": "準則",
        "对准": "對準",
        // 而属于“允许、依照”含义的“准”，保留：
        "批准": "批准",
        "准予": "准予",
        "准许": "准許",
        "准假": "准假",

        // --- 辟 / 闢 (开辟/开拓 vs 辟谣/不经之谈) ---
        "开辟": "開闢",
        "辟谣": "闢謠",
        "精辟": "精辟",       // 形容言论深刻，多写作“精辟”或“精闢”
        "复辟": "復辟",       // 历史政治词汇，固定用“復辟”
        "辟邪": "辟邪",        // 驱邪，多写作“辟邪”或“避邪”

         // --- 历 / 歷 / 曆 (经历/历史 vs 日历/年历/万年历) ---
        "历史": "歷史",
        "经历": "經歷",
        "学历": "學歷",
        "履历": "履歷",
        "历险": "歷險",
        "历来": "歷來",
        "游历": "遊歷",
        // 与时间、历法相关的，必须转为“曆”：
        "日历": "日曆",
        "年历": "年曆",
        "万年历": "萬年曆",
        "历书": "曆書",
        "阳历": "陽曆",
        "阴历": "陰曆",

        // --- 复 / 復 / 複 (恢复/重复/复辟 vs 复杂/复印/複件) ---
        "恢复": "恢復",
        "回复": "回覆",       // 港台日常书信或电子政务中常用“回覆”
        "复活": "復活",
        "复兴": "復興",
        "复辟": "復辟",
        "重复": "重複",       // 兼具“重”和“複”的含义，通常整体转为“重複”
        "往复": "往復",
        // 与繁复、复杂、复制相关的，必须转为“複”：
        "复杂": "複雜",
        "复印": "複印",
        "复件": "複件",
        "复本": "複本",
        "复式": "複式",
        "复合": "複合",
        "复数": "複數",       // 数学概念

        // --- 应 / 應 (应该/应当 vs 答应/应答/反应) ---
        "应该": "應該",
        "应当": "應當",
        "应用": "應用",
        "适应": "適應",
        "反应": "反應",       // 物理或生理反应
        "效应": "效應",
        // 属于“答应、迎合、对付”含义的“应”，保留原样或按规范：
        "答应": "答應",
        "应答": "應答",       // 答应/应答在繁体中也写作“應答”，但部分口语化词汇如“应付”需注意
        "应付": "應付",
        "应景": "應景",

         // --- 表 / 錶 (表格/表面 vs 手表/仪表) ---
        "表格": "表格",       // 数据表格保持“表”
        "表达": "表達",       // 表达保持“表”
        "表现": "表現",       // 表现保持“表”
        "表面": "表面",       // 表面保持“表”
        "手表": "手錶",       // 计时仪器转为“錶”
        "仪表": "儀表",       // 仪表盘/仪器多用“儀表”或“儀錶”
        "地表": "地表",       // 地理表面保持“表”
        "图表": "圖表",       // 图表保持“表”

        // --- 准 / 準 / 躉 (批发/趸交) ---
        "趸交": "躉交",       // 金融/法律用语特例
        "趸船": "躉船",       // 水运码头特例

        // --- 籍 / 藉 (书籍/户籍 vs 慰藉/狼藉) ---
        "书籍": "書籍",
        "户籍": "戶籍",
        "国籍": "國籍",
        "籍贯": "籍貫",
        "慰藉": "慰藉",       // 抚慰，保持“藉”
        "狼藉": "狼藉",       // 乱七八糟，保持“藉”
        "枕藉": "枕藉",       // 互相垫着，保持“藉”
        "借口": "藉口",       // 借口在繁体中也常写作“藉口”或“借口”

        // --- 郁 / 鬱 (浓郁/抑郁 vs 地名姓氏) ---
        "郁金香": "鬱金香",   // 植物
        "浓郁": "濃郁",       // 气味/色彩
        "抑郁": "抑鬱",       // 心情
        "郁南": "郁南",       // 广东地名：郁南县（专名保留）
        "郁达夫": "郁達夫",   // 现代作家名（姓氏保留）

        // --- 咸 / 鹇 (斑鸠/白鹇) ---
        "白鹇": "白鷴",       // 鸟名，简体“鹇”对应繁体“鷴”
        
        // --- 斗 / 鬬 (技术/算法中的斗，防误杀) ---
        "北斗": "北斗",       // 天文星官、北斗导航（保留“斗”）
        "斗转星移": "斗轉星移", // 成语中的星官
        "斗室": "斗室",        // 狭小的房间

         // --- 松 / 鬆 (松树/宽松 vs 放松/松手) ---
        "松树": "松樹",
        "松柏": "松柏",
        "松鼠": "松鼠",
        "松子": "松子",
        "放松": "放鬆",
        "宽松": "寬鬆",
        "松手": "松手",       // 松手/松绑在繁体中也常写作“鬆手”或“鬆綁”，视习惯而定
        "松绑": "鬆綁",
        "松懈": "鬆懈",

        // --- 沈 / 瀋 (姓氏沈 vs 奉天/沈阳) ---
        "沈阳": "瀋陽",       // 辽宁城市（繁体标准用“瀋”）
        "沈河": "瀋河",       // 沈河区
        "沈默": "沈默",       // 姓沈或特定人名中的沈默（或作沉默）
        "沈从文": "沈從文",   // 著名作家姓氏（绝对不能错转成“瀋從文”）

        // --- 蒙 / 矇 / 懞 (内蒙古/启蒙 vs 矇蔽/眼矇) ---
        "内蒙古": "內蒙古",
        "蒙古": "蒙古",
        "启蒙": "啟蒙",
        "蒙古": "蒙古",
        "蒙蔽": "矇蔽",
        "蒙混": "矇混",
        "朦胧": "矇矓",       // 或写作朦朧

        // --- 折 / 摺 (折断/折磨 vs 折子/折扇/折叠) ---
        "折断": "折斷",
        "折磨": "折磨",
        "折现": "折現",
        "折角": "折角",
        "折叠": "摺疊",       // 动词折叠多用“摺”
        "折子": "摺子",
        "折扇": "摺扇",
        "存折": "存摺",

        // --- 吁 / 籲 (长吁短叹 vs 呼吁) ---
        "长吁短叹": "長吁短嘆",
        "吁气": "吁氣",
        "呼吁": "呼籲",       // 呼吁必须转为“籲”
        "吁求": "籲求",

        // --- 筑 / 築 (建筑/构筑 vs 贵州简称筑) ---
        "建筑": "建築",
        "构筑": "構築",
        "筑路": "築路",
        "筑巢": "築巢",
        "贵筑": "貴筑",       // 历史地名

        // --- 姜 / 薑 (姓氏姜 vs 生姜/姜黄) ---
        "姜子牙": "姜子牙",   // 姓氏
        "姜昆": "姜昆",       // 姓氏
        "生姜": "生薑",       // 调味品
        "干姜": "乾薑",
        "姜黄": "薑黃",

        // --- 咸 / 鹇 / 咸 (地名咸阳、咸宁) ---
        "咸阳": "咸陽",
        "咸宁": "咸寧",
        "咸丰": "咸豐",       // 年号通常用“咸豐”

        // --- 筑 / 筇 / 竺 (天竺) ---
        "天竺": "天竺",       // 古印度代称

        // --- 藉 / 借 (慰藉/狼藉 vs 借用/借口) ---
        "慰藉": "慰藉",
        "狼藉": "狼藉",
        "借阅": "借閱",
        "借口": "借口",
        "借给": "借給",

        // --- 游 / 遊 (游泳/游玩 vs 游戏/游标卡尺 - 港台技术词汇常统一用“遊”或“游”) ---
        "游戏": "遊戲",
        "游泳": "游泳",       // 游泳的“游”在繁体中规范也常写作“游泳”或“游泳”
        "游离": "游離",
        "游侠": "游俠",

        // --- 凶 / 兇 (凶手/凶恶 vs 凶吉的凶) ---
        "凶手": "兇手",
        "凶恶": "兇惡",
        "凶兆": "兇兆",
        "凶猛": "兇猛",
        "吉凶": "吉凶",       // 吉凶的凶保持“凶”
        "凶年": "凶年",       // 荒年保持“凶”

        // --- ્યા / 灶 / 竈 (炉灶/灶台) ---
        "炉灶": "爐竈",
        "灶台": "竈臺",
        "灶君": "竈君",
        "锅灶": "鍋竈",

        // --- 泄 / 洩 (泄露/排泄 vs 泄气) ---
        "泄露": "洩露",
        "泄密": "洩密",
        "泄洪": "洩洪",
        "发泄": "發洩",
        "排泄": "排泄",       // 生理代谢用“排泄”
        "泄气": "洩氣",       // 洩气/气馁多用“洩气”或“泄氣”

        // --- 佣 / 傭 (佣金 vs 女佣/雇佣) ---
        "佣金": "佣金",       // 商业酬金用“佣”
        "女佣": "女傭",
        "雇佣": "僱傭",
        "佣工": "傭工",

        // --- 朴 / 樸 (朴素/质朴 vs 姓氏朴) ---
        "朴素": "樸素",
        "质朴": "質樸",
        "古朴": "古樸",
        "纯朴": "純樸",
        "朴树": "朴樹",       // 植物名
        "朴槿惠": "朴槿惠",   // 姓氏（绝不能转成“樸”）
        "朴哥": "朴哥",       // 姓氏

        // --- 须 / 須 / 鬚 (必须/须要 vs 胡须) ---
        "必须": "必須",
        "须要": "須要",
        "无须": "無需",
        "何须": "何須",
        "胡须": "鬍鬚",       // 胡须整体转为“鬍鬚”
        "须眉": "鬚眉",

        // --- 厘 / 釐 (毫米/厘米 vs 厘定/厘金) ---
        "毫米": "毫米",       // 计量单位保持“厘”
        "厘米": "厘米",
        "厘清": "釐清",       // 梳理清楚用“釐”
        "厘定": "釐定",
        "厘金": "釐金",       // 历史税收

        // --- 咸 / 鹺 (盐类) ---
        "鹺人": "鹺人",

        // --- 辟 / 避 (避开/躲避 vs 辟谣) ---
        "避免": "避免",
        "回避": "迴避",
        "避孕": "避孕",
        "避难": "避難",
        // 注意：辨别“辟”（pì，如开辟、辟谣）与“避”（bì，如躲避），千万别把“躲避”写成“躲辟”

        // --- 夸 / 誇 (夸奖/夸大) ---
        "夸奖": "誇獎",
        "夸大": "誇大",
        "夸耀": "誇耀",
        "夸父": "夸父",       // 神话人物“夸父”的夸通常保持“夸”或“誇”

        // --- 划 / 劃 / 𠝹 (规划/划时代 vs 划船/划破) ---
        "规划": "規劃",
        "计划": "計劃",
        "划时代": "劃時代",
        "划分": "劃分",
        "划船": "划船",       // 体育/动作保持“划”或“劃”
        "划破": "划破",

        // --- 脏 / 臟 / 髒 (脏乱 vs 心脏/内脏) ---
        "脏乱": "髒亂",
        "弄脏": "弄髒",
        "心脏": "心臟",
        "内脏": "內臟",
        "肝脏": "肝臟",
        "肾脏": "腎臟",

        // --- 筑 / 筇 (竹名或特例) ---
        "筇竹": "筇竹",

        // --- 获 / 獲 (获得/捕获) ---
        "获得": "獲得",
        "捕获": "捕獲",
        "收获": "收穫",       // 农作物收获繁体常用“收穫”
        "战果": "戰果",
        
        // --- 汇 / 彙 / 匯 (汇报/汇报 vs 汇集/词汇 vs 汇款/汇率) ---
        "汇报": "彙報",       // 向上级报告多用“彙報”或“匯報”
        "汇集": "彙集",
        "词汇": "詞彙",
        "汇编": "彙編",       // 汇编语言、文献汇编
        "汇款": "匯款",       // 资金流动用“匯”
        "汇率": "匯率",
        "汇流": "匯流",
        "字汇": "字彙",

        // --- 制 / 製 (制动/制冷 vs 制造/制表/制服) ---
        "制动": "制動",       // 机械刹车用“制”
        "制冷": "制冷",       // 物理制冷用“制”
        "制衡": "制衡",
        "制裁": "制裁",
        "制造": "製造",       // 生产加工用“製”
        "制表": "製表",       // 制作表格/UI用“製”
        "制服": "製服",       // 服装用“製”
        "制品": "製品",
        "制作": "製作",

        // --- 准 / 準 (准星/准绳 vs 准确/标准/批准) ---
        "准星": "准星",       // 枪械瞄准具保持“准”
        "准绳": "准繩",       // 部分古汉语词汇
        "准确": "準確",       // 標準规范类统一用“準”
        "标准": "標準",
        "批准": "批准",       // 行政审批在港台和大陆均常简写作“批准”或“批准”
        "准许": "准許",
        "准备": "準備",
        "瞄准": "瞄準",

        // --- 游 / 遊 (游戏/游客 vs 游离/游泳) ---
        "游客": "遊客",
        "游览": "遊覽",
        "游园": "遊園",
        "游民": "遊民",

        // --- 范 / 範 (范文/规范/示范) ---
        "范文": "範文",
        "规范": "規範",
        "示范": "示範",
        "防范": "防範",
        "范畴": "範疇",
        "范冰冰": "范冰冰",   // 艺人姓名（绝对不能转成“範冰冰”）
        "范仲淹": "范仲淹"    // 历史人物姓名（按历史规范保留）
    };

    var S2T_CHAR_MAP = {
        "万": "萬", "与": "與", "丑": "醜", "专": "專", "业": "業", "丛": "叢", "东": "東", "丝": "絲",
        "丢": "丟", "两": "兩", "严": "嚴", "丧": "喪", "个": "個", "丰": "豐", "临": "臨", "丽": "麗",
        "举": "舉", "么": "麼", "义": "義", "乌": "烏", "乐": "樂", "乔": "喬", "习": "習", "乡": "鄉",
        "书": "書", "买": "買", "乱": "亂", "乾": "乾", "争": "爭", "事": "事", "于": "於", "亏": "虧",
        "云": "雲", "亘": "亙", "亚": "亞", "产": "產", "亩": "畝", "亲": "親", "亵": "褻", "亿": "億",
        "什": "什", "仆": "僕", "仇": "仇", "今": "今", "介": "介", "仍": "仍", "仓": "倉", "仔": "仔",
        "仕": "仕", "他": "他", "仗": "仗", "付": "付", "仙": "仙", "仝": "仝", "仟": "仟", "仡": "仡",
        "代": "代", "令": "令", "以": "以", "仪": "儀", "伛": "伛", "们": "們", "仰": "仰", "仲": "仲",
        "件": "件", "价": "價", "任": "任", "份": "份", "仿": "仿", "企": "企", "伊": "伊", "伍": "伍",
        "伎": "伎", "伏": "伏", "伐": "伐", "休": "休", "众": "眾", "优": "優", "伙": "夥", "会": "會",
        "伟": "偉", "传": "傳", "伞": "傘", "伤": "傷", "伥": "倀", "伦": "倫", "仓": "倉", "伪": "偽",
        "伫": "佇", "体": "體", "余": "餘", "佣": "傭", "佥": "僉", "侠": "俠", "侣": "侶", "侥": "僥",
        "侦": "偵", "侧": "側", "侨": "僑", "侬": "儂", "侪": "儕", "俾": "俾", "俏": "俏", "俐": "俐",
        "俑": "俑", "俗": "俗", "俘": "俘", "俚": "俚", "保": "保", "俞": "俞", "俟": "俟", "信": "信",
        "俦": "儔", "俨": "儼", "俩": "倆", "俪": "儷", "俭": "儉", "债": "債", "倾": "傾", "倓": "倓",
        "储": "儲", "傩": "儺", "傲": "傲", "催": "催", "傻": "傻", "像": "像", "僚": "僚", "僧": "僧",
        "僭": "僭", "僮": "僮", "雇": "僱", "僵": "僵", "价": "價", "僻": "僻", "儒": "儒", "儡": "儡",
        "充": "充", "兆": "兆", "兄": "兄", "光": "光", "克": "克", "免": "免", "兑": "兌", "兔": "兔",
        "党": "黨", "兒": "兒", "兖": "兗", "兜": "兜", "兢": "兢", "入": "入", "全": "全", "八": "八",
        "公": "公", "六": "六", "共": "共", "关": "關", "兴": "興", "兵": "兵", "其": "其", "具": "具",
        "典": "典", "兹": "茲", "养": "養", "兼": "兼", "兽": "獸", "冀": "冀", "册": "冊", "再": "再",
        "冒": "冒", "冕": "冕", "冗": "冗", "写": "寫", "军": "軍", "农": "農", "冢": "塚", "冤": "冤",
        "冠": "冠", "冥": "冥", "冬": "冬", "冯": "馮", "冰": "冰", "冲": "沖", "决": "決", "况": "況",
        "冷": "冷", "冻": "凍", "净": "淨", "凄": "凄", "准": "準", "凉": "涼", "减": "減", "凑": "湊",
        "凛": "凜", "凝": "凝", "几": "幾", "凡": "凡", "凤": "鳳", "凭": "憑", "凯": "凱", "凰": "凰",
        "凳": "凳", "击": "擊", "函": "函", "凿": "鑿", "刀": "刀", "分": "分", "切": "切", "刊": "刊",
        "刑": "刑", "划": "劃", "刘": "劉", "则": "則", "刚": "剛", "创": "創", "初": "初", "删": "刪",
        "判": "判", "刨": "刨", "利": "利", "别": "別", "刭": "刄", "刮": "刮", "到": "到", "制": "制",
        "刷": "刷", "券": "券", "刹": "剎", "刺": "刺", "刻": "刻", "刽": "劊", "剃": "剃", "削": "削",
        "前": "前", "剖": "剖", "剧": "劇", "剁": "剁", "剂": "劑", "剑": "劍", "剥": "剝", "副": "副", 
        "剩": "剩", "割": "割", "创": "創", "铲": "剷", "剽": "剽", "剿": "剿", "劈": "劈", "艺": "藝",
        "力": "力", "劝": "勸", "办": "辦", "功": "功", "加": "加", "务": "務", "劣": "劣", "动": "動",
        "助": "助", "努": "努", "劫": "劫", "劾": "劾", "势": "勢", "劲": "勁", "勃": "勃", "勇": "勇",
        "勉": "勉", "勋": "勳", "勒": "勒", "勘": "勘", "爱": "愛", "罢": "罷", "备": "備", "贝": "貝",
        "毕": "畢", "笔": "筆", "边": "邊", "宾": "賓", "标": "標", "卜": "卜", "补": "補", "参": "參",
        "长": "長", "车": "車", "齿": "齒", "触": "觸", "辞": "辭", "聪": "聰", "葱": "蔥", "凑": "湊",
        "粗": "粗", "达": "達", "带": "帶", "担": "擔", "单": "單", "胆": "膽", "当": "當", "灯": "燈",
        "邓": "鄧", "敌": "敵", "递": "遞", "淀": "澱", "点": "點", "电": "電", "顶": "頂", "订": "訂",
        "斗": "鬥", "犊": "犢", "独": "獨", "赌": "賭", "镀": "鍍", "断": "斷", "锻": "鍛", "兑": "兌",
        "对": "對", "吨": "噸", "脱": "脫", "夺": "奪", "堕": "墮", "鹅": "鵝", "饵": "餌", "发": "發",
        "法": "法", "烦": "煩", "范": "範", "贩": "販", "饭": "飯", "防": "防", "访": "訪", "纺": "紡",
        "飞": "飛", "非": "非", "废": "廢", "费": "費", "纷": "紛", "坟": "墳", "奋": "奮", "愤": "憤",
        "粪": "糞", "丰": "豐", "风": "風", "枫": "楓", "蜂": "蜂", "缝": "縫", "讽": "諷", "否": "否",
        "扶": "扶", "服": "服", "福": "福", "抚": "撫", "辅": "輔", "腐": "腐", "复": "複", "负": "負",
        "赋": "賦", "妇": "婦", "富": "富", "冈": "岡", "钢": "鋼", "铁": "鐵", "纲": "綱", "高": "高",
        "告": "告", "哥": "哥", "歌": "歌", "阁": "閣", "革": "革", "葛": "葛", "隔": "隔", "个": "個",
        "给": "給", "根": "根", "跟": "跟", "更": "更", "耕": "耕", "工": "工", "弓": "弓", "公": "公",
        "功": "功", "攻": "攻", "宫": "宮", "恭": "恭", "巩": "鞏", "贡": "貢", "勾": "勾", "沟": "溝",
        "钩": "鉤", "苟": "苟", "构": "構", "购": "購", "谷": "穀", "顾": "顧", "固": "固", "故": "故",
        "瓜": "瓜", "刮": "刮", "挂": "掛", "关": "關", "观": "觀", "馆": "館", "管": "管", "贯": "貫",
        "惯": "慣", "归": "歸", "龟": "龜", "规": "規", "闺": "閨", "轨": "軌", "柜": "櫃", "贵": "貴",
        "滚": "滾", "棍": "棍", "郭": "郭", "锅": "鍋", "国": "國", "果": "果", "裹": "裹", "过": "過",
        "海": "海", "害": "害", "函": "函", "韩": "韓", "含": "含", "涵": "涵", "寒": "寒", "喊": "喊",
        "汉": "漢", "汗": "汗", "航": "航", "豪": "豪", "好": "好", "号": "號", "浩": "浩", "喝": "喝",
        "荷": "荷", "盒": "盒", "贺": "賀", "黑": "黑", "痕": "痕", "恒": "恆", "横": "橫", "轰": "轟",
        "红": "紅", "宏": "宏", "洪": "洪", "烘": "烘", "后": "後", "厚": "厚", "吼": "吼", "呼": "呼",
        "忽": "忽", "狐": "狐", "胡": "胡", "壶": "壺", "湖": "湖", "葫": "葫", "糊": "糊", "互": "互",
        "户": "戶", "护": "護", "花": "花", "华": "華", "哗": "嘩", "滑": "滑", "画": "畫", "化": "化",
        "怀": "懷", "淮": "淮", "槐": "槐", "坏": "壞", "欢": "歡", "还": "還", "环": "環", "缓": "緩",
        "幻": "幻", "换": "換", "唤": "喚", "黄": "黃", "灰": "灰", "挥": "揮", "辉": "輝", "徽": "徽",
        "回": "回", "毁": "毀", "悔": "悔", "汇": "匯", "会": "會", "讳": "諱", "绘": "繪", "诲": "誨",
        "慧": "慧", "昏": "昏", "婚": "婚", "浑": "渾", "魂": "魂", "混": "混", "活": "活", "火": "火",
        "货": "貨", "获": "獲", "击": "擊", "饥": "飢", "机": "機", "肌": "肌", "鸡": "雞", "极": "極",
        "集": "集", "及": "及", "急": "急", "疾": "疾", "级": "級", "即": "即", "嫉": "嫉", "挤": "擠",
        "脊": "脊", "几": "幾", "济": "濟", "继": "繼", "吉": "吉", "基": "基", "寄": "寄", "寂": "寂",
        "加": "加", "夹": "夾", "佳": "佳", "家": "家", "嘉": "嘉", "甲": "甲", "贾": "賈", "价": "價",
        "驾": "駕", "架": "架", "假": "假", "嫁": "嫁", "尖": "尖", "坚": "堅", "间": "間", "肩": "肩",
        "艰": "艱", "茧": "繭", "检": "檢", "碱": "鹼", "剪": "剪", "简": "簡", "见": "見", "建": "建",
        "剑": "劍", "健": "健", "舰": "艦", "渐": "漸", "践": "踐", "鉴": "鑑", "键": "鍵", "江": "江",
        "姜": "姜", "将": "將", "浆": "漿", "疆": "疆", "讲": "講", "奖": "獎", "桨": "槳", "蒋": "蔣",
        "绛": "絳", "酱": "醬", "焦": "焦", "胶": "膠", "交": "交", "郊": "郊", "骄": "驕", "浇": "澆",
        "椒": "椒", "礁": "礁", "角": "角", "饺": "餃", "脚": "腳", "搅": "攪", "铰": "鉸", "缴": "繳",
        "叫": "叫", "轿": "轎", "较": "較", "教": "教", "阶": "階", "皆": "皆", "接": "接", "节": "節",
        "劫": "劫", "杰": "傑", "洁": "潔", "捷": "捷", "截": "截", "姐": "姐", "解": "解", "介": "介",
        "戒": "戒", "届": "屆", "界": "界", "借": "借", "巾": "巾", "今": "今", "斤": "斤", "金": "金",
        "津": "津", "筋": "筋", "襟": "襟", "仅": "僅", "紧": "緊", "锦": "錦", "尽": "盡", "近": "近",
        "进": "進", "晋": "晉", "浸": "浸", "茎": "莖", "惊": "驚", "晶": "晶", "精": "精", "睛": "睛",
        "警": "警", "景": "景", "颈": "頸", "静": "靜", "境": "境", "敬": "敬", "镜": "鏡", "径": "徑",
        "竟": "竟", "救": "救", "就": "就", "咎": "咎", "酒": "酒", "九": "九", "旧": "舊", "局": "局",
        "桔": "桔", "菊": "菊", "沮": "沮", "矩": "矩", "举": "舉", "剧": "劇", "巨": "巨", "距": "距",
        "锯": "鋸", "聚": "聚", "卷": "卷", "倦": "倦", "圈": "圈", "绢": "絹", "绝": "絕", "决": "決",
        "爵": "爵", "掘": "掘", "军": "軍", "君": "君", "均": "均", "菌": "菌", "开": "開", "凯": "凱",
        "铠": "鎧", "看": "看", "康": "康", "抗": "抗", "炕": "炕", "考": "考", "烤": "烤", "科": "科",
        "颗": "顆", "壳": "殼", "柯": "柯", "渴": "渴", "克": "克", "客": "客", "肯": "肯", "垦": "墾",
        "啃": "啃", "坑": "坑", "空": "空", "孔": "孔", "恐": "恐", "控": "控", "口": "口", "寇": "寇",
        "扣": "扣", "苦": "苦", "哭": "哭", "裤": "褲", "快": "快", "块": "塊", "筷": "筷", "宽": "寬",
        "款": "款", "匡": "匡", "框": "框", "矿": "礦", "旷": "曠", "况": "況", "亏": "虧", "葵": "葵",
        "魁": "魁", "昆": "昆", "困": "困", "扩": "擴", "阔": "闊", "拉": "拉", "喇": "喇", "蜡": "蠟",
        "来": "來", "兰": "蘭", "拦": "攔", "栏": "欄", "蓝": "藍", "篮": "籃", "览": "覽", "揽": "攬",
        "缆": "纜", "烂": "爛", "滥": "濫", "郎": "郎", "狼": "狼", "廊": "廊", "朗": "朗", "浪": "浪",
        "捞": "撈", "劳": "勞", "牢": "牢", "老": "老", "佬": "佬", "姥": "姥", "烙": "烙", "乐": "樂",
        "勒": "勒", "雷": "雷", "擂": "擂", "累": "累", "泪": "淚", "冷": "冷", "愣": "愣", "黎": "黎",
        "厘": "釐", "离": "離", "漓": "漓", "理": "理", "李": "李", "里": "裏", "礼": "禮", "莉": "莉",
        "梨": "梨", "篱": "籬", "沥": "瀝", "立": "立", "丽": "麗", "利": "利", "励": "勵", "历": "歷",
        "例": "例", "隶": "隸", "栗": "栗", "荔": "荔", "粒": "粒", "连": "連", "帘": "簾", "怜": "憐",
        "涟": "漣", "莲": "蓮", "联": "聯", "链": "鏈", "镰": "鐮", "恋": "戀", "练": "練", "粮": "糧",
        "凉": "涼", "梁": "梁", "良": "良", "两": "兩", "量": "量", "亮": "亮", "俩": "倆", "谅": "諒",
        "辽": "遼", "疗": "療", "燎": "燎", "镣": "鐐", "劣": "劣", "猎": "獵", "裂": "裂", "邻": "鄰",
        "林": "林", "临": "臨", "淋": "淋", "陵": "陵", "铃": "鈴", "零": "零", "龄": "齡", "领": "領",
        "岭": "嶺", "溜": "溜", "刘": "劉", "流": "流", "留": "留", "硫": "硫", "琉": "琉", "柳": "柳",
        "六": "六", "龙": "龍", "咙": "嚨", "笼": "籠", "隆": "隆", "垄": "壟", "拢": "攏", "楼": "樓",
        "漏": "漏", "陋": "陋", "芦": "蘆", "炉": "爐", "鲁": "魯", "陆": "陸", "录": "錄", "鹿": "鹿",
        "禄": "祿", "碌": "碌", "路": "路", "旅": "旅", "铝": "鋁", "缕": "縷", "律": "律", "虑": "慮",
        "率": "率", "绿": "綠", "栾": "欒", "孪": "孿", "峦": "巒", "乱": "亂", "抡": "掄", "轮": "輪",
        "论": "論", "罗": "羅", "逻": "邏", "锣": "鑼", "箩": "籮", "马": "馬", "嘛": "嘛", "麻": "麻",
        "妈": "媽", "玛": "瑪", "码": "碼", "蚂": "螞", "买": "買", "麦": "麥", "迈": "邁", "脉": "脈",
        "瞒": "瞞", "馒": "饅", "蛮": "蠻", "满": "滿", "蔓": "蔓", "慢": "慢", "漫": "漫", "芒": "芒",
        "茫": "茫", "盲": "盲", "猫": "貓", "毛": "毛", "矛": "矛", "茅": "茅", "锚": "錨", "貌": "貌",
        "没": "沒", "眉": "眉", "梅": "梅", "媒": "媒", "煤": "煤", "霉": "黴", "美": "美", "妹": "妹",
        "门": "門", "扪": "捫", "们": "們", "猛": "猛", "蒙": "蒙", "锰": "錳", "梦": "夢", "迷": "迷",
        "谜": "謎", "弥": "彌", "米": "米", "眯": "眯", "棉": "棉", "眠": "眠", "面": "面", "苗": "苗",
        "描": "描", "瞄": "瞄", "渺": "渺", "秒": "秒", "灭": "滅", "民": "民", "名": "名", "明": "明",
        "鸣": "鳴", "铭": "銘", "冥": "冥", "命": "命", "谬": "謬", "摸": "摸", "摩": "摩", "蘑": "蘑",
        "魔": "魔", "抹": "抹", "末": "末", "莫": "莫", "漠": "漠", "墨": "墨", "默": "默", "谋": "謀",
        "某": "某", "母": "母", "亩": "畝", "木": "木", "目": "目", "睦": "睦", "牧": "牧", "模": "模",
        "幕": "幕", "墓": "墓", "暮": "暮", "拿": "拿", "哪": "哪", "呐": "吶", "钠": "鈉", "那": "那",
        "娜": "娜", "纳": "納", "乃": "乃", "奶": "奶", "耐": "耐", "南": "南", "难": "難", "囊": "囊",
        "恼": "惱", "脑": "腦", "闹": "鬧", "呢": "呢", "内": "內", "馁": "餒", "妮": "妮", "尼": "尼",
        "泥": "泥", "倪": "倪", "年": "年", "念": "念", "娘": "娘", "酿": "釀", "鸟": "鳥", "尿": "尿",
        "捏": "捏", "您": "您", "宁": "寧", "凝": "凝", "牛": "牛", "扭": "扭", "纽": "紐", "钮": "鈕",
        "农": "農", "浓": "濃", "奴": "奴", "努": "努", "怒": "怒", "女": "女", "暖": "暖", "欧": "歐",
        "区": "區", "偶": "偶", "怕": "怕", "拍": "拍", "排": "排", "牌": "牌", "派": "派", "攀": "攀",
        "盘": "盤", "判": "判", "叛": "叛", "盼": "盼", "旁": "旁", "刨": "刨", "炮": "砲", "袍": "袍",
        "跑": "跑", "泡": "泡", "陪": "陪", "培": "培", "赔": "賠", "佩": "佩", "沛": "沛", "盆": "盆",
        "碰": "碰", "批": "批", "披": "披", "皮": "皮", "啤": "啤", "脾": "脾", "匹": "匹", "辟": "闢",
        "片": "片", "偏": "偏", "篇": "篇", "编": "編", "漂": "漂", "飘": "飄", "票": "票", "撇": "撇",
        "拼": "拼", "贫": "貧", "频": "頻", "品": "品", "乒": "乒", "聘": "聘", "平": "平", "凭": "憑",
        "瓶": "瓶", "苹": "蘋", "坡": "坡", "泼": "潑", "颇": "頗", "婆": "婆", "迫": "迫", "破": "破",
        "朴": "樸", "仆": "僕", "蒲": "蒲", "普": "普", "浦": "浦", "谱": "譜", "七": "七", "柒": "柒",
        "漆": "漆", "齐": "齊", "其": "其", "奇": "奇", "歧": "歧", "骑": "騎", "棋": "棋", "旗": "旗",
        "乞": "乞", "企": "企", "启": "啟", "起": "起", "气": "氣", "弃": "棄", "汽": "汽", "契": "契",
        "砌": "砌", "器": "器", "恰": "恰", "洽": "洽", "千": "千", "仟": "仟", "签": "簽", "谦": "謙",
        "乾": "乾", "黔": "黔", "铅": "鉛", "迁": "遷", "牵": "牽", "钱": "錢", "钳": "鉗", "潜": "潛",
        "浅": "淺", "遣": "遣", "欠": "欠", "歉": "歉", "枪": "槍", "腔": "腔", "强": "強", "墙": "牆",
        "抢": "搶", "悄": "悄", "巧": "巧", "锹": "鍬", "敲": "敲", "乔": "喬", "侨": "僑", "桥": "橋",
        "瞧": "瞧", "壳": "殼", "琴": "琴", "寻": "尋", "禽": "禽", "勤": "勤", "青": "青", "轻": "輕",
        "氢": "氫", "倾": "傾", "卿": "卿", "情": "情", "晴": "晴", "顷": "頃", "请": "請", "庆": "慶",
        "琼": "瓊", "丘": "丘", "秋": "秋", "求": "求", "球": "球", "驱": "驅", "屈": "屈", "渠": "渠",
        "取": "取", "去": "去", "趣": "趣", "圈": "圈", "全": "全", "权": "權", "泉": "泉", "拳": "拳",
        "犬": "犬", "劝": "勸", "缺": "缺", "却": "卻", "确": "確", "雀": "雀", "让": "讓", "饶": "饒",
        "扰": "擾", "绕": "繞", "惹": "惹", "热": "熱", "人": "人", "仁": "仁", "忍": "忍", "认": "認",
        "任": "任", "扔": "扔", "仍": "仍", "日": "日", "绒": "絨", "荣": "榮", "容": "容", "蓉": "蓉",
        "溶": "溶", "熔": "熔", "融": "融", "柔": "柔", "揉": "揉", "肉": "肉", "如": "如", "茹": "茹",
        "儒": "儒", "乳": "乳", "辱": "辱", "入": "入", "软": "軟", "锐": "銳", "瑞": "瑞", "润": "潤",
        "若": "若", "弱": "弱", "撒": "撒", "洒": "灑", "萨": "薩", "塞": "塞", "赛": "賽", "三": "三",
        "伞": "傘", "散": "散", "桑": "桑", "嗓": "嗓", "扫": "掃", "色": "色", "森": "森", "僧": "僧",
        "杀": "殺", "沙": "沙", "纱": "紗", "砂": "砂", "傻": "傻", "晒": "曬", "删": "刪", "衫": "衫",
        "煽": "煽", "闪": "閃", "陕": "陝", "扇": "扇", "海": "海", "伤": "傷", "商": "商", "赏": "賞",
        "晌": "晌", "上": "上", "尚": "尚", "勺": "勺", "少": "少", "哨": "哨", "邵": "邵", "绍": "紹",
        "奢": "奢", "舌": "舌", "蛇": "蛇", "舍": "捨", "设": "設", "社": "社", "射": "射", "涉": "涉",
        "摄": "攝", "谁": "誰", "申": "申", "伸": "伸", "身": "身", "深": "深", "神": "神", "沈": "瀋",
        "审": "審", "肾": "腎", "甚": "甚", "渗": "滲", "透": "透", "声": "聲", "生": "生", "牲": "牲",
        "升": "升", "绳": "繩", "省": "省", "盛": "盛", "失": "失", "师": "師", "诗": "詩", "尸": "屍",
        "施": "施", "十": "十", "石": "石", "时": "時", "识": "識", "实": "實", "拾": "拾", "蚀": "蝕",
        "食": "食", "史": "史", "矢": "矢", "使": "使", "始": "始", "驶": "駛", "世": "世", "市": "市",
        "示": "示", "士": "士", "仕": "仕", "侍": "侍", "信": "信", "饰": "飾", "视": "視", "试": "試",
        "誓": "誓", "适": "適", "室": "室", "拭": "拭", "释": "釋", "收": "收", "手": "手", "守": "守",
        "首": "首", "受": "受", "授": "授", "售": "售", "兽": "獸", "书": "書", "抒": "抒", "枢": "樞",
        "叔": "叔", "殊": "殊", "梳": "梳", "舒": "舒", "输": "輸", "熟": "熟", "暑": "暑", "属": "屬",
        "鼠": "鼠", "数": "數", "刷": "刷", "耍": "耍", "衰": "衰", "甩": "甩", "帅": "帥", "双": "雙",
        "霜": "霜", "爽": "爽", "水": "水", "税": "稅", "睡": "睡", "顺": "順", "瞬": "瞬", "说": "說",
        "硕": "碩", "朔": "朔", "丝": "絲", "司": "司", "私": "私", "思": "思", "斯": "斯", "死": "死",
        "四": "四", "似": "似", "松": "鬆", "耸": "聳", "颂": "頌", "送": "送", "宋": "宋", "搜": "搜",
        "艘": "艘", "苏": "蘇", "俗": "俗", "诉": "訴", "素": "素", "速": "速", "宿": "宿", "酸": "酸",
        "算": "算", "虽": "雖", "髓": "髓", "随": "隨", "岁": "歲", "碎": "碎", "遂": "遂", "孙": "孫",
        "损": "損", "笋": "筍", "缩": "縮", "所": "所", "琐": "瑣", "索": "索", "塌": "塌", "他": "他",
        "它": "它", "她": "她", "塔": "塔", "踏": "踏", "台": "臺", "胎": "胎", "抬": "抬", "太": "太",
        "态": "態", "泰": "泰", "贪": "貪", "滩": "灘", "摊": "攤", "瘫": "癱", "坛": "壇", "谈": "談",
        "潭": "潭", "坦": "坦", "毯": "毯", "叹": "歎", "碳": "碳", "汤": "湯", "糖": "糖", "趟": "趟",
        "涛": "濤", "掏": "掏", "桃": "桃", "淘": "淘", "萄": "萄", "讨": "討", "套": "套", "特": "特",
        "腾": "騰", "提": "提", "题": "題", "啼": "啼", "体": "體", "替": "替", "天": "天", "添": "添",
        "田": "田", "甜": "甜", "填": "填", "条": "條", "铁": "鐵", "听": "聽", "亭": "亭", "庭": "庭",
        "停": "停", "挺": "挺", "艇": "艇", "通": "通", "同": "同", "桐": "桐", "铜": "銅", "童": "童",
        "统": "統", "痛": "痛", "头": "頭", "投": "投", "透": "透", "图": "圖", "徒": "徒", "途": "途",
        "涂": "塗", "土": "土", "吐": "吐", "兔": "兔", "推": "推", "腿": "腿", "退": "退", "吞": "吞",
        "屯": "屯", "托": "托", "拖": "拖", "脱": "脫", "驼": "駝", "妥": "妥", "椭": "橢", "拓": "拓",
        "蛙": "蛙", "娃": "娃", "瓦": "瓦", "袜": "襪", "歪": "歪", "外": "外", "弯": "彎", "湾": "灣",
        "玩": "玩", "完": "完", "顽": "頑", "挽": "挽", "晚": "晚", "碗": "碗", "万": "萬", "汪": "汪",
        "亡": "亡", "王": "王", "网": "網", "往": "往", "忘": "忘", "旺": "旺", "望": "望", "危": "危",
        "微": "微", "韦": "韋", "围": "圍", "违": "違", "桅": "桅", "唯": "唯", "维": "維", "伟": "偉",
        "伪": "偽", "尾": "尾", "纬": "緯", "未": "未", "味": "味", "畏": "畏", "胃": "胃", "尉": "尉",
        "谓": "謂", "喂": "餵", "慰": "慰", "温": "溫", "文": "文", "纹": "紋", "闻": "聞", "稳": "穩",
        "问": "問", "翁": "翁", "窝": "窩", "我": "我", "卧": "臥", "握": "握", "沃": "沃", "巫": "巫",
        "呜": "嗚", "钨": "鎢", "乌": "烏", "污": "污", "诬": "誣", "无": "無", "吴": "吳", "五": "五",
        "午": "午", "伍": "伍", "武": "武", "舞": "舞", "侮": "侮", "物": "物", "误": "誤", "西": "西",
        "吸": "吸", "希": "希", "昔": "昔", "析": "析", "牺": "犧", "息": "息", "悉": "悉", "惜": "惜",
        "稀": "稀", "锡": "錫", "嘻": "嘻", "溪": "溪", "习": "習", "洗": "洗", "铣": "銑", "戏": "戲",
        "细": "細", "虾": "蝦", "狭": "狹", "峡": "峽", "侠": "俠", "下": "下", "吓": "嚇", "夏": "夏",
        "仙": "仙", "先": "先", "纤": "纖", "鲜": "鮮", "咸": "鹹", "贤": "賢", "弦": "弦", "娴": "嫻",
        "衔": "銜", "闲": "閒", "显": "顯", "险": "險", "县": "縣", "线": "線", "限": "限", "相": "相",
        "香": "香", "厢": "廂", "湘": "湘", "箱": "箱", "襄": "襄", "响": "響", "项": "項", "巷": "巷",
        "橡": "橡", "像": "像", "向": "向", "象": "象", "宵": "宵", "消": "消", "销": "銷", "萧": "蕭",
        "硝": "硝", "霄": "霄", "晓": "曉", "孝": "孝", "效": "效", "校": "校", "笑": "笑", "楔": "楔",
        "协": "協", "邪": "邪", "胁": "脅", "斜": "斜", "谐": "諧", "携": "攜", "叶": "葉", "心": "心",
        "辛": "辛", "新": "新", "忻": "忻", "信": "信", "星": "星", "猩": "猩", "形": "形", "行": "行",
        "幸": "幸", "刑": "刑", "型": "型", "性": "性", "姓": "姓", "杏": "杏", "凶": "凶", "兄": "兄",
        "胸": "胸", "雄": "雄", "熊": "熊", "休": "休", "虚": "虛", "徐": "徐", "许": "許", "叙": "敘",
        "序": "序", "恤": "恤", "续": "續", "轩": "軒", "宣": "宣", "悬": "懸", "旋": "旋", "选": "選",
        "削": "削", "靴": "靴", "雪": "雪", "血": "血", "勋": "勳", "熏": "薰", "寻": "尋", "巡": "巡",
        "询": "詢", "循": "循", "驯": "馴", "训": "訓", "汛": "汛", "压": "壓", "押": "押", "鸦": "鴉",
        "鸭": "鴨", "牙": "牙", "芽": "芽", "崖": "崖", "哑": "啞", "雅": "雅", "亚": "亞", "讶": "訝",
        "烟": "煙", "盐": "鹽", "严": "嚴", "言": "言", "岩": "岩", "炎": "炎", "沿": "沿", "研": "研",
        "延": "延", "页": "頁", "演": "演", "厌": "厭", "宴": "宴", "晏": "晏", "艳": "艷", "验": "驗",
        "砚": "硯", "雁": "雁", "央": "央", "扬": "揚", "羊": "羊", "阳": "陽", "杨": "楊", "佯": "佯",
        "洋": "洋", "仰": "仰", "养": "養", "样": "樣", "腰": "腰", "摇": "搖", "遥": "遙", "尧": "堯",
        "咬": "咬", "药": "藥", "要": "要", "耀": "耀", "爷": "爺", "也": "也", "冶": "冶", "野": "野",
        "业": "業", "夜": "夜", "一": "一", "伊": "伊", "衣": "衣", "医": "醫", "依": "依", "仪": "儀",
        "宜": "宜", "夷": "夷", "移": "移", "遗": "遺", "疑": "疑", "乙": "乙", "已": "已", "以": "以", 
        "议": "議", "亿": "億", "忆": "憶", "亦": "亦", "役": "役", "抑": "抑", "易": "易", "益": "益",
        "溢": "溢", "毅": "毅", "翼": "翼", "因": "因", "阴": "陰", "音": "音", "银": "銀", "饮": "飲",
        "引": "引", "隐": "隱", "英": "英", "樱": "櫻", "鹰": "鷹", "应": "應", "迎": "迎", "映": "映",
        "硬": "硬", "佣": "傭", "拥": "擁", "庸": "庸", "臃": "臃", "永": "永", "咏": "詠", "泳": "泳",
        "勇": "勇", "涌": "湧", "用": "用", "幽": "幽", "优": "優", "悠": "悠", "尤": "尤", "由": "由",
        "邮": "郵", "游": "遊", "犹": "猶", "油": "油", "幼": "幼", "于": "於", "予": "予", "余": "餘",
        "鱼": "魚", "娱": "娛", "渔": "漁", "愉": "愉", "渝": "渝", "舆": "輿", "与": "與", "宇": "宇",
        "羽": "羽", "雨": "雨", "玉": "玉", "域": "域", "吁": "籲", "语": "語", "预": "預", "喻": "喻",
        "御": "御", "裕": "裕", "愈": "愈", "元": "元", "员": "員", "园": "園", "原": "原", "圆": "圓",
        "援": "援", "源": "源", "猿": "猿", "缘": "緣", "远": "遠", "怨": "怨", "院": "院", "愿": "願",
        "约": "約", "月": "月", "岳": "嶽", "悦": "悅", "阅": "閱", "跃": "躍", "越": "越", "云": "雲",
        "匀": "勻", "陨": "隕", "运": "運", "蕴": "蘊", "酝": "醞", "晕": "暈", "杂": "雜", "砸": "砸",
        "灾": "災", "哉": "哉", "栽": "栽", "宰": "宰", "载": "載", "再": "再", "在": "在", "咱": "咱",
        "攒": "攢", "暂": "暫", "赞": "讚", "脏": "臟", "葬": "葬", "遭": "遭", "糟": "糟", "早": "早",
        "藻": "藻", "造": "造", "噪": "噪", "燥": "燥", "则": "則", "择": "擇", "泽": "澤", "责": "責",
        "贼": "賊", "怎": "怎", "增": "增", "赠": "贈", "扎": "札", "榨": "榨", "渣": "渣", "眨": "眨",
        "摘": "摘", "宅": "宅", "窄": "窄", "债": "債", "寨": "寨", "沾": "沾", "粘": "粘", "瞻": "瞻",
        "斩": "斬", "展": "展", "盏": "盞", "占": "佔", "战": "戰", "站": "站", "张": "張", "长": "長",
        "掌": "掌", "丈": "丈", "胀": "脹", "障": "障", "招": "招", "找": "找", "召": "召", "兆": "兆",
        "赵": "趙", "照": "照", "罩": "罩", "著": "著", "贞": "貞", "针": "針", "侦": "偵", "珍": "珍",
        "真": "真", "振": "振", "震": "震", "镇": "鎮", "征": "徵", "争": "爭", "帧": "幀", "挣": "掙",
        "睁": "睜", "蒸": "蒸", "正": "正", "证": "證", "政": "政", "整": "整", "之": "之", "支": "支",
        "枝": "枝", "知": "知", "织": "織", "肢": "肢", "脂": "脂", "执": "執", "直": "直", "值": "值",
        "职": "職", "植": "植", "殖": "殖", "止": "止", "旨": "旨", "址": "址", "指": "指", "至": "至",
        "致": "致", "制": "制", "治": "治", "质": "質", "炙": "炙", "秩": "秩", "智": "智", "滞": "滯",
        "置": "置", "中": "中", "忠": "忠", "钟": "鐘", "种": "種", "肿": "腫", "众": "眾", "重": "重",
        "州": "州", "舟": "舟", "周": "周", "洲": "洲", "轴": "軸", "肘": "肘", "猪": "豬", "诸": "諸",
        "朱": "朱", "诛": "誅", "蛛": "蛛", "竹": "竹", "逐": "逐", "烛": "燭", "主": "主", "著": "著",
        "柱": "柱", "助": "助", "祝": "祝", "住": "住", "注": "注", "贮": "貯", "驻": "駐", "抓": "抓",
        "爪": "爪", "专": "專", "砖": "磚", "转": "轉", "庄": "莊", "装": "裝", "妆": "妝", "撞": "撞",
        "壮": "壯", "状": "狀", "椎": "椎", "锥": "錐", "坠": "墜", "缀": "綴", "准": "準", "捉": "捉",
        "琢": "琢", "兹": "茲", "资": "資", "杂": "雜", "仔": "仔", "紫": "紫", "字": "字", "自": "自",
        "宗": "宗", "综": "綜", "棕": "棕", "总": "總", "纵": "縱", "走": "走", "奏": "奏", "揍": "揍",
        "租": "租", "煮": "煮", "阻": "阻", "组": "組", "祖": "祖", "钻": "鑽", "嘴": "嘴", "最": "最",
        "罪": "罪", "醉": "醉", "尊": "尊", "遵": "遵", "昨": "昨", "左": "左", "佐": "佐", "作": "作",
        "坐": "坐", "座": "座"
    };

    var T2S_PHRASE_MAP = {};
    for (var sPhrase in S2T_PHRASE_MAP) {
        if (S2T_PHRASE_MAP.hasOwnProperty(sPhrase)) {
            T2S_PHRASE_MAP[S2T_PHRASE_MAP[sPhrase]] = sPhrase;
        }
    }

    var T2S_CHAR_MAP = {};
    for (var sChar in S2T_CHAR_MAP) {
        if (S2T_CHAR_MAP.hasOwnProperty(sChar)) {
            T2S_CHAR_MAP[S2T_CHAR_MAP[sChar]] = sChar;
        }
    }

    function convertST(text) {
        if (!text) return "";
        if (currentTextMode === 'original') return text;

        var toTraditional = (currentTextMode === 'traditional');
        var phraseMap = toTraditional ? S2T_PHRASE_MAP : T2S_PHRASE_MAP;
        var charMap = toTraditional ? S2T_CHAR_MAP : T2S_CHAR_MAP;

        var sortedPhrases = Object.keys(phraseMap).sort(function(a, b) {
            return b.length - a.length;
        });

        for (var i = 0; i < sortedPhrases.length; i++) {
            var phrase = sortedPhrases[i];
            var target = phraseMap[phrase];
            var reg = new RegExp(phrase, "g");
            text = text.replace(reg, target);
        }

        var charArray = text.split("");
        for (var j = 0; j < charArray.length; j++) {
            var ch = charArray[j];
            if (charMap[ch]) {
                charArray[j] = charMap[ch];
            }
        }

        return charArray.join("");
    }

    function reRenderAllViews() {
        if (typeof executeTreeSearch === 'function') {
            executeTreeSearch();
        }
        if (typeof currentFile !== 'undefined' && currentFile && typeof buildBreadcrumb === 'function') {
            buildBreadcrumb(currentFile);
        }
        if (typeof currentFileContentCache !== 'undefined' && currentFileContentCache && typeof renderHighlightsAndSnippets === 'function') {
            const rawContentQuery = document.getElementById('contentSearch').value.trim();
            renderHighlightsAndSnippets(rawContentQuery);
        }
    }

    function toggleSimplifiedTraditional() {
        if (currentTextMode === 'traditional') {
            currentTextMode = 'simplified';
        } else {
            currentTextMode = 'traditional';
        }
        
        const btn = document.getElementById('stConvertBtn');
        if (btn) {
            btn.innerText = (currentTextMode === 'traditional') ? "简正" : "繁體";
        }

        reRenderAllViews();
    }

    function restoreOriginalText() {
        currentTextMode = 'original';
        
        const btn = document.getElementById('stConvertBtn');
        if (btn) {
            btn.innerText = "繁體";
        }

        reRenderAllViews();
    }
</script>

    <!-- 侧边栏宽度拖拽与底部面板拖拽调节逻辑 -->
    <script>
        (function() {
            // 1. 侧边栏宽度拖拽调节
            const sidebar = document.getElementById('sidebar');
            const sidebarResizer = document.getElementById('sidebarResizer');
            let isSidebarResizing = false;

            sidebarResizer.addEventListener('mousedown', e => {
                isSidebarResizing = true;
                sidebarResizer.classList.add('is-resizing');
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
            });

            document.addEventListener('mousemove', e => {
                if (!isSidebarResizing) return;
                let newWidth = e.clientX;
                if (newWidth >= 240 && newWidth <= 1500) {
                    document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
                }
            });

            document.addEventListener('mouseup', () => {
                if (isSidebarResizing) {
                    isSidebarResizing = false;
                    sidebarResizer.classList.remove('is-resizing');
                    document.body.style.cursor = 'default';
                    document.body.style.userSelect = '';
                }
            });

            // 2. 底部上下文片段面板拖拽
            const ws = document.getElementById('snippetWorkspace');
            const resizer = document.getElementById('workspaceResizer');
            let isResizing = false;
            resizer.addEventListener('mousedown', () => { isResizing = true; document.body.style.cursor = 'ns-resize'; });
            resizer.addEventListener('touchstart', () => { isResizing = true; }, {passive: true});
            
            document.addEventListener('mousemove', e => {
                if (!isResizing) return;
                const h = window.innerHeight - e.clientY;
                if (h >= 40 && h <= window.innerHeight * 0.85) ws.style.height = h + 'px';
            });
            document.addEventListener('touchmove', e => {
                if (!isResizing) return;
                const h = window.innerHeight - e.touches[0].clientY;
                if (h >= 40 && h <= window.innerHeight * 0.85) ws.style.height = h + 'px';
            }, {passive: true});
            
            document.addEventListener('mouseup', () => { isResizing = false; document.body.style.cursor = 'default'; });
            document.addEventListener('touchend', () => { isResizing = false; });
        })();
    </script>

    <!-- 前端核心 UI 交互逻辑 -->
    <script>
        let currentFile = "";
        let currentFileContentCache = "";
        let currentLang = "text";
        let fontSize = 15;
        let lastLineNum = 1;
        let currentTheme = "light";

        document.getElementById('fileTree').addEventListener('click', e => {
            const f = e.target.closest('.folder');
            if(f) f.parentElement.classList.toggle('open');
        });

        function switchTheme() {
            const body = document.body;
            const themeLink = document.getElementById('prism-theme');
            if (currentTheme === "light") {
                body.setAttribute('data-theme', 'dark');
                themeLink.href = "https://cdn.bootcdn.net/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css";
                currentTheme = "dark";
            } else {
                body.setAttribute('data-theme', 'light');
                themeLink.href = "https://cdn.bootcdn.net/ajax/libs/prism/1.29.0/themes/prism.min.css";
                currentTheme = "light";
            }
            setTimeout(() => {
                if(currentFileContentCache) {
                    const rawContentQuery = document.getElementById('contentSearch').value.trim();
                    renderHighlightsAndSnippets(rawContentQuery);
                }
            }, 50);
        }

        async function loadFile(el) {
            const li = el.closest('.file-node');
            const path = li.getAttribute('data-path');
            if (!path || path === '.') return;
    
            currentLang = el.getAttribute('data-lang') || 'text';
            currentFile = path;
            
            document.querySelectorAll('.label').forEach(l => l.classList.remove('active-node'));
            el.classList.add('active-node');
            buildBreadcrumb(path);
            document.getElementById('markerContainer').innerHTML = "";

            try {
                const md5Name = md5(path) + '.json';
                const res = await fetch('_index_cache/' + md5Name);
                if (!res.ok) throw new Error("File not found");
                const data = await res.json();
                
                currentFileContentCache = data.content;
                lastLineNum = currentFileContentCache.split('\\n').length;
                document.getElementById('jumpInput').placeholder = lastLineNum;
                
                const rawContentQuery = document.getElementById('contentSearch').value.trim();
                renderHighlightsAndSnippets(rawContentQuery);
            } catch (e) { 
                console.error(e);
                alert("加载文件内容失败。"); 
            }
        }

        function buildBreadcrumb(fullPath) {
            const parts = fullPath.split('/');
            const container = document.getElementById('breadcrumb');
            container.innerHTML = "";
            let accPath = "";
            parts.forEach((part, i) => {
                if(i > 0) container.innerHTML += "<span> / </span>";
                accPath += (i === 0 ? part : "/" + part);
                const b = document.createElement('b');
                b.innerText = convertST(part);
                const target = accPath;
                b.onclick = () => locateAction(target);
                container.appendChild(b);
            });
        }

        function toggleWrap() {
            document.body.classList.toggle('wrap-mode');
            if(currentFileContentCache) {
                const rawContentQuery = document.getElementById('contentSearch').value.trim();
                renderHighlightsAndSnippets(rawContentQuery);
            }
        }

        function handleEnter(e) { if(e.key === 'Enter') doJump(); }
        function handleContentSearchEnter(e) { if(e.key === 'Enter') triggerContentSearch(); }
        function jumpToFirst() { document.getElementById('codeViewport').scrollTo({ top: 0, behavior: 'smooth' }); }
        
        function doJump(line) {
            const input = document.getElementById('jumpInput');
            const targetLine = line || input.value || input.placeholder;
            if(!targetLine) return;
            const targetRow = document.getElementById('code-line-' + targetLine);
            if(targetRow) {
                targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const originalBg = targetRow.style.backgroundColor;
                targetRow.style.backgroundColor = "rgba(255,221,0,0.5)";
                setTimeout(() => targetRow.style.backgroundColor = originalBg, 1500);
            }
        }

        function locateAction(path) {
            if(!path) return;
            toggleSidebar(false);

            setTimeout(() => {
                const target = document.querySelector('.node[data-path="' + path + '"]');
                if(target) {
                    let p = target.parentElement;
                    while(p && p.id !== 'fileTree') {
                        if(p.tagName === 'LI') p.classList.add('open');
                        p = p.parentElement;
                    }
                    const label = target.querySelector('.label');
                    document.querySelectorAll('.label').forEach(l => l.classList.remove('active-node'));
                    if(label) {
                        label.classList.add('active-node');
                        label.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                    }
                }
            }, 50);
        }

        function locateCurrent() { if(currentFile) locateAction(currentFile); }
        function changeFontSize(d) { 
            fontSize += d; 
            document.getElementById('codeViewer').style.fontSize = fontSize + 'px'; 
        }
        
        function treeAction(open) {
            domCache.dirs.forEach(dir => { open ? dir.element.classList.add('open') : dir.element.classList.remove('open'); });
        }

        // 彻底收起/显示侧边栏抽屉逻辑
        function toggleSidebar(forceHide = null) {
            const sb = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            const btn = document.getElementById('menuToggleBtn');
            
            let isCurrentlyHidden = sb.classList.contains('hidden');
            let shouldHide = isCurrentlyHidden ? false : true;
            if (forceHide !== null) shouldHide = forceHide;

            if (shouldHide) {
                sb.classList.add('hidden');
                overlay.style.display = 'none';
                btn.innerText = '☰';
            } else {
                sb.classList.remove('hidden');
                if (window.innerWidth <= 768) {
                    overlay.style.display = 'block';
                }
                btn.innerText = '✕';
            }
        }
    </script>

    <!-- 检索与历史记录逻辑 -->
    <script>
        var domCache = { files: [], dirs: [] };

        function buildDomCache() {
            domCache.files = Array.from(document.querySelectorAll('.file-node')).map(node => {
                const label = node.querySelector('.file-label');
                const nameSpan = node.querySelector('.file-name-text');
                const badgeContainer = node.querySelector('.badge-container');
                return {
                    element: node,
                    path: node.getAttribute('data-path'),
                    label: label,
                    nameSpan: nameSpan,
                    badgeContainer: badgeContainer,
                    fileName: nameSpan.innerText.trim()
                };
            });
            
            domCache.dirs = Array.from(document.querySelectorAll('.dir-node')).map(node => {
                const label = node.querySelector('.label');
                let dirText = "";
                for (let n of label.childNodes) {
                    if (n.nodeType === 3 || (n.nodeType === 1 && !n.classList.contains('icon'))) {
                        dirText += n.textContent;
                    }
                }
                dirText = dirText.trim();
                return {
                    element: node,
                    label: label,
                    dirName: dirText
                };
            });
        }

        function debounce(fn, delay) {
            let timer = null;
            return function() {
                clearTimeout(timer);
                timer = setTimeout(() => fn.apply(this, arguments), delay);
            };
        }

        function escapeRegExp(string) {
            if (!string) return '';
            var specicalChars = ['\\\\', '$', '^', '*', '+', '?', '.', '(', ')', '|', '{', '}', '[', ']', '/', ','];
            var result = '';
            for (var i = 0; i < string.length; i++) {
                var ch = string.charAt(i);
                if (specicalChars.indexOf(ch) !== -1) {
                    result += '\\\\' + ch;
                } else {
                    result += ch;
                }
            }
            return result;
        }

        const triggerTreeSearch = debounce(function() { 
            executeTreeSearch(); 
            const q = document.getElementById('treeSearch').value.trim();
            if(q) saveHistory('tree', q);
        }, 700); 

        function handleContentInput() {
            const q = document.getElementById('contentSearch').value.trim();
            if (currentFile && currentFileContentCache) {
                renderHighlightsAndSnippets(q);
            }
        }

        function triggerContentSearch() {
            const q = document.getElementById('contentSearch').value.trim();
            if (currentFile && currentFileContentCache) {
                renderHighlightsAndSnippets(q);
            }
            if(q) saveHistory('content', q);
        }

        function getHistory(type) {
            const data = localStorage.getItem('preview_search_history_' + type);
            return data ? JSON.parse(data) : [];
        }

        function saveHistory(type, query) {
            if (!query) return;
            let list = getHistory(type);
            list = list.filter(item => item !== query); 
            list.unshift(query); 
            localStorage.setItem('preview_search_history_' + type, JSON.stringify(list));
        }

        function deleteHistory(type, query, event) {
            if(event) event.stopPropagation();
            let list = getHistory(type);
            list = list.filter(item => item !== query);
            localStorage.setItem('preview_search_history_' + type, JSON.stringify(list));
            renderHistoryDropdown(type);
        }

        function clearAllHistory(type, event) {
            if(event) event.stopPropagation();
            localStorage.removeItem('preview_search_history_' + type);
            renderHistoryDropdown(type);
        }

        function renderHistoryDropdown(type) {
            const drop = document.getElementById(type === 'tree' ? 'treeHistoryDrop' : 'contentHistoryDrop');
            const list = getHistory(type);

            if (list.length === 0) {
                drop.style.display = 'none';
                return;
            }

            let html = '';
            list.forEach(query => {
                html += \`<div class="history-item" onclick="selectHistoryItem('\${type}', '\${query.replace(/'/g, "\\\\'")}')">
                            <span class="history-text">\${query}</span>
                            <span class="history-del" onclick="deleteHistory('\${type}', '\${query.replace(/'/g, "\\\\'")}', event)">✕</span>
                         </div>\`;
            });
            html += \`<div class="history-clear" onclick="clearAllHistory('\${type}', event)">清空历史记录</div>\`;
            
            drop.innerHTML = html;
            drop.style.display = 'block';
        }

        async function selectHistoryItem(type, value) {
            const input = document.getElementById(type === 'tree' ? 'treeSearch' : 'contentSearch');
            input.value = value;
            document.getElementById(type === 'tree' ? 'treeHistoryDrop' : 'contentHistoryDrop').style.display = 'none';
            
            if (type === 'tree') {
                executeTreeSearch();
            } else {
                triggerContentSearch();
            }
        }

        document.getElementById('treeSearch').addEventListener('focus', () => renderHistoryDropdown('tree'));
        document.getElementById('contentSearch').addEventListener('focus', () => renderHistoryDropdown('content'));

        document.addEventListener('click', e => {
            if (!e.target.closest('#treeSearch') && !e.target.closest('#treeHistoryDrop')) {
                document.getElementById('treeHistoryDrop').style.display = 'none';
            }
            if (!e.target.closest('#contentSearch') && !e.target.closest('#contentHistoryDrop')) {
                document.getElementById('contentHistoryDrop').style.display = 'none';
            }
        });

        function executeTreeSearch() {
            const treeInput = document.getElementById('treeSearch');
            const treeQuery = treeInput.value.trim();
            const hasTreeFilter = treeQuery.length > 0;
            let treeRegex = null;
            if (hasTreeFilter) {
                try { treeRegex = new RegExp('(' + escapeRegExp(treeQuery) + ')', 'gi'); } catch(e){}
            }

            let totalTreeMatches = 0;
            if (domCache.files.length === 0) buildDomCache();

            if (!hasTreeFilter) {
                for (let i = 0; i < domCache.files.length; i++) {
                    const file = domCache.files[i];
                    file.element.style.display = '';
                    file.nameSpan.innerHTML = convertST(file.fileName);
                }
                for (let i = 0; i < domCache.dirs.length; i++) {
                    const dir = domCache.dirs[i];
                    dir.element.style.display = '';
                    const convertedDirName = convertST(dir.dirName);
                    const iconHtml = dir.label.querySelector('.icon').outerHTML;
                    dir.label.innerHTML = iconHtml + convertedDirName;
                }
                const treeCounter = document.getElementById('treeCounter');
                treeCounter.style.display = 'none';
                return;
            }

            const visibleDirsSet = new Set();

            for (let i = 0; i < domCache.files.length; i++) {
                const file = domCache.files[i];
                const convertedName = convertST(file.fileName);
                
                const isMatched = treeRegex && (treeRegex.test(file.fileName) || treeRegex.test(convertedName));
                if (treeRegex) treeRegex.lastIndex = 0;

                if (isMatched) {
                    totalTreeMatches++;
                    file.element.style.display = '';
                    file.nameSpan.innerHTML = convertedName.replace(treeRegex, '<span class="search-highlight">$1</span>');
                    
                    let parent = file.element.parentElement;
                    while (parent && parent.id !== 'fileTree') {
                        if (parent.tagName === 'LI' && parent.classList.contains('dir-node')) {
                            visibleDirsSet.add(parent);
                            parent.classList.add('open');
                        }
                        parent = parent.parentElement;
                    }
                } else {
                    file.element.style.display = 'none';
                }
            }

            for (let i = 0; i < domCache.dirs.length; i++) {
                const dir = domCache.dirs[i];
                const convertedDirName = convertST(dir.dirName);
                const iconHtml = dir.label.querySelector('.icon').outerHTML;

                const dirSelfMatched = treeRegex && (treeRegex.test(dir.dirName) || treeRegex.test(convertedDirName));
                if (treeRegex) treeRegex.lastIndex = 0;

                if (dirSelfMatched) {
                    totalTreeMatches++;
                    dir.label.innerHTML = iconHtml + convertedDirName.replace(treeRegex, '<span class="search-highlight">$1</span>');
                } else {
                    dir.label.innerHTML = iconHtml + convertedDirName;
                }

                if (dirSelfMatched || visibleDirsSet.has(dir.element)) {
                    dir.element.style.display = '';
                    if (dirSelfMatched) {
                        dir.element.classList.add('open');
                    }
                } else {
                    dir.element.style.display = 'none';
                }
            }

            const treeCounter = document.getElementById('treeCounter');
            treeCounter.innerText = totalTreeMatches;
            treeCounter.style.display = 'inline-block';
        }

        function renderHighlightsAndSnippets(rawQuery) {
            const workspace = document.getElementById('snippetWorkspace');
            const snippetList = document.getElementById('snippetList');
            const snippetCount = document.getElementById('snippetCount');
            const viewer = document.getElementById('codeViewer');
            const markerContainer = document.getElementById('markerContainer');

            snippetList.innerHTML = "";
            markerContainer.innerHTML = ""; 

            if (!currentFile || !currentFileContentCache) return;

            const isFuzzy = rawQuery && rawQuery.startsWith('"') && rawQuery.endsWith('"') && rawQuery.length > 2;
            const query = rawQuery ? (isFuzzy ? rawQuery.slice(1, -1) : rawQuery) : ""; 
            
            let displayContent = convertST(currentFileContentCache);
            const lines = displayContent.split('\\n');
            const totalLines = lines.length;
            
            let matchedLinesCount = 0;
            let matchedLinesArray = [];
            
            function escapeHtml(text) { 
                return text.replace(/&/g, "&amp;")
                           .replace(/</g, "&lt;")
                           .replace(/>/g, "&gt;"); 
            }

            let regex = null;
            if (query) {
                try {
                    regex = new RegExp('(' + escapeRegExp(query) + ')', 'gi');
                } catch (e) {
                    console.error("正则构建失败:", e);
                }
            }

            let prismGrammar = Prism.languages[currentLang] || Prism.languages.javascript || Prism.languages.clike;
            let highlightedFullCode = "";
            try {
                highlightedFullCode = Prism.highlight(displayContent, prismGrammar, currentLang);
            } catch(e) {
                highlightedFullCode = escapeHtml(displayContent);
            }

            const highlightedLines = highlightedFullCode.split('\\n');
            let htmlBuffer = "";

            for (let i = 0; i < totalLines; i++) {
                const lineText = lines[i];
                const lineNum = i + 1;
                let colorLineHtml = highlightedLines[i] || escapeHtml(lineText);
                let hasMatch = false;

                if (query) {
                    if (!isFuzzy) {
                        hasMatch = lineText.toLowerCase().includes(query.toLowerCase());
                    } else {
                        const needed = {};
                        for (let c of query.toLowerCase()) needed[c] = (needed[c] || 0) + 1;
                        const lowerLine = lineText.toLowerCase();
                        const hasChars = {};
                        for (let c of lowerLine) if (needed[c]) hasChars[c] = (hasChars[c] || 0) + 1;
                        hasMatch = true;
                        for (let c in needed) {
                            if (!hasChars[c] || hasChars[c] < needed[c]) { hasMatch = false; break; }
                        }
                    }
                }

                if (hasMatch) {
                    matchedLinesCount++;
                    matchedLinesArray.push(lineNum);

                    let highlightedSnippetText = escapeHtml(lineText);
                    if (regex) {
                        highlightedSnippetText = highlightedSnippetText.replace(regex, '<mark class="search-highlight">$1</mark>');
                    }

                    const li = document.createElement('li');
                    li.className = 'snippet-item';
                    li.innerHTML = '<span class="snippet-line-num">第 ' + lineNum + ' 行</span>' +
                                   '<span class="snippet-text">' + highlightedSnippetText + '</span>';
                    li.onclick = function() { doJump(lineNum); };
                    snippetList.appendChild(li);

                    if (regex && !isFuzzy) {
                        colorLineHtml = colorLineHtml.replace(regex, '<mark class="search-highlight">$1</mark>');
                    }
                }

                const rowClass = hasMatch ? "code-line-row highlighted-row" : "code-line-row";
                htmlBuffer += '<div class="' + rowClass + '" id="code-line-' + lineNum + '">' +
                              '<span class="line-num-col">' + lineNum + '</span>' +
                              '<span class="line-text-col">' + (colorLineHtml || ' ') + '</span>' +
                              '</div>';
            }

            for (let pad = 1; pad <= 25; pad++) {
                const padLineNum = totalLines + pad;
                htmlBuffer += '<div class="code-line-row padding-row" id="code-line-' + padLineNum + '">' +
                              '<span class="line-num-col">' + padLineNum + '</span>' +
                              '<span class="line-text-col">&nbsp;</span>' +
                              '</div>';
            }

            viewer.innerHTML = htmlBuffer;

            if (matchedLinesCount > 0) {
                updateScrollMarkers(matchedLinesArray, totalLines);
                workspace.style.display = 'flex';
                snippetCount.innerText = matchedLinesCount + ' 个匹配段落';
            } else {
                workspace.style.display = 'none';
            }
        }

        function updateScrollMarkers(matchedLines, totalLines) {
            const container = document.getElementById('markerContainer');
            container.innerHTML = '';
            matchedLines.forEach(lineNum => {
                const marker = document.createElement('div');
                marker.className = 'scroll-marker';
                const percent = ((lineNum - 1) / totalLines) * 100;
                marker.style.top = percent + '%';
                container.appendChild(marker);
            });
        }
    </script>

<!-- 页面加载完成后的首屏初始化操作 -->
    <script>
        window.addEventListener('DOMContentLoaded', async function() {
            buildDomCache();

            setTimeout(() => {
                toggleSidebar(true);
            }, 50);

            // 自动寻找并加载默认文件（优先 SUMMARY.md，次选 README.md）
            loadDefaultFile();
        });

        function loadDefaultFile() {
            const fileNodes = Array.from(document.querySelectorAll('.file-node'));
            
            // 1. 优先查找 SUMMARY.md
            let targetNode = fileNodes.find(node => {
                const path = (node.getAttribute('data-path') || '').toLowerCase();
                return path.endsWith('summary.md');
            });

            // 2. 如果没找到 SUMMARY.md，查找 README.md
            if (!targetNode) {
                targetNode = fileNodes.find(node => {
                    const path = (node.getAttribute('data-path') || '').toLowerCase();
                    return path.endsWith('readme.md');
                });
            }

            // 3. 确定最终要加载的 label 元素
            let labelToClick = null;
            if (targetNode) {
                labelToClick = targetNode.querySelector('.file-label');
            } else {
                // 4. 若两者都不存在，默认选列表中的第一个文件
                labelToClick = document.querySelector('.file-label');
            }

            // 5. 触发文件加载
            if (labelToClick) {
                loadFile(labelToClick);
            }
        }
    </script>
    
</body>
</html>
`;

// 将最终生成的 SPA 单页 HTML 写入目标 index.html 文件
fs.writeFileSync(OUTPUT_FILE, finalTemplate);

console.log('✨ 构建成功：已被成功更新，完美修复彻底收起与宽度拖拽调节功能！');
