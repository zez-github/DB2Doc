// 应用程序主要逻辑
class DatabaseDocGenerator {
    constructor() {
        this.eventSource = null;
        this.selectedTables = new Set();
        this.generatedFilePath = null;
        this.totalTables = 0;
        this.completedTables = 0;
        this.outputPath = '';
        this.fileName = '';
        this.tableSearchTerm = '';
        this.missingDescTables = new Set();
        this.tablesTotal = 0;

        // 主界面模式（Phase1：浏览/标注/导出）
        this.currentMode = 'browse';
        this.activeTableName = '';
        this.allTableNames = [];
        this.tableMissingMap = new Map(); // tableName -> { missing_total, missing_columns_count, missing_table_comment }

        // 标注/保存状态
        this.dirtyTables = new Set(); // tableName -> 是否有未保存变更
        
        // 增量更新相关属性
        this.incrementalMode = false;
        this.existingDocPath = '';
        this.existingDocContent = '';
        this.existingTables = [];
        this.newTables = [];
        
        // 通知相关属性
        this.originalTitle = document.title; // 保存原始页面标题
        this.titleFlashInterval = null; // 标题闪烁定时器
        this.notificationPermission = 'default'; // 通知权限状态
        
        this.init();
        // 初始化通知权限
        this.initNotificationPermission();
    }

    init() {
        // 检查是否有当前连接
        this.checkCurrentConnection();
        this.initModeTabs();
        this.bindEvents();
        // 兼容旧版本：若方法不存在则跳过
        if (typeof this.loadSavedConfig === 'function') this.loadSavedConfig();
        if (typeof this.loadConnectionHistory === 'function') this.loadConnectionHistory();
        this.setDefaultOutputPath();
        this.initDatabaseManager();
        this.initProgressDrawer();
        this.initLayoutSizing();
        this.setMode('browse');
        // 默认收起右侧助手，仅保留右侧迷你入口
        this.setRightPanelCollapsed(true);
        this.updateGenerateButton();
    }

    setRightPanelCollapsed(collapsed) {
        const rightColumn = document.getElementById('rightColumn');
        const collapseRightBtn = document.getElementById('collapseRightBtn');
        const miniBar = document.getElementById('assistantMiniBar');
        if (!rightColumn) return;

        const shouldCollapse = !!collapsed;
        rightColumn.classList.toggle('collapsed', shouldCollapse);

        // 更新折叠按钮图标/文案（若可见）
        if (collapseRightBtn) {
            const icon = collapseRightBtn.querySelector('i');
            if (icon) {
                icon.className = shouldCollapse ? 'fas fa-chevron-left' : 'fas fa-chevron-right';
            }
            collapseRightBtn.setAttribute('title', shouldCollapse ? '展开侧边助手' : '折叠右侧面板');
        }

        // 迷你操作条：仅在右侧收起时显示
        if (miniBar) {
            miniBar.style.display = shouldCollapse ? 'flex' : 'none';
        }

        // 更新中间列宽度
        if (typeof this.updateMiddleColumnStyle === 'function') {
            this.updateMiddleColumnStyle();
        }
    }

    // 根据头部高度自适应主区域高度（避免写死 64px 后 Tabs 增高导致溢出）
    initLayoutSizing() {
        const update = () => {
            const header = document.getElementById('appHeader');
            const body = document.getElementById('appBody');
            if (!header || !body) return;
            const h = header.offsetHeight || 0;
            body.style.height = `calc(100vh - ${h}px)`;
        };
        this._layoutUpdate = update;
        update();
        window.addEventListener('resize', update);

        // 连接详情展开/收起时，头部高度会变化，需重新计算
        const connCollapse = document.getElementById('currentConnectionCollapse');
        if (connCollapse) {
            connCollapse.addEventListener('shown.bs.collapse', update);
            connCollapse.addEventListener('hidden.bs.collapse', update);
        }
    }

    // 初始化模式Tabs（浏览/标注/导出）
    initModeTabs() {
        const tabs = document.querySelectorAll('#modeTabs [data-mode]');
        if (!tabs || tabs.length === 0) return;
        tabs.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.getAttribute('data-mode');
                this.setMode(mode);
            });
        });
    }

    // 切换主界面模式
    setMode(mode) {
        const nextMode = mode || 'browse';
        this.currentMode = nextMode;

        // tabs样式
        const tabs = document.querySelectorAll('#modeTabs [data-mode]');
        tabs.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-mode') === nextMode);
        });

        // workspace切换
        const browse = document.getElementById('browseWorkspace');
        const annotate = document.getElementById('annotateWorkspace');
        const exportWs = document.getElementById('exportWorkspace');
        if (browse) browse.style.display = nextMode === 'browse' ? 'block' : 'none';
        if (annotate) annotate.style.display = nextMode === 'annotate' ? 'block' : 'none';
        if (exportWs) exportWs.style.display = nextMode === 'export' ? 'block' : 'none';

        // 侧边助手区块切换
        const browseAssistant = document.getElementById('browseAssistantSection');
        const exportAssistant = document.getElementById('exportAssistantSection');
        if (browseAssistant) browseAssistant.style.display = (nextMode === 'browse' || nextMode === 'annotate') ? 'block' : 'none';
        if (exportAssistant) exportAssistant.style.display = nextMode === 'export' ? 'block' : 'none';

        // 导出模式才展示导出设置（避免“导出工具”心智污染浏览）
        const outputSection = document.getElementById('outputSection');
        if (outputSection) outputSection.style.display = nextMode === 'export' ? 'block' : 'none';

        // 标注模式：默认开启“仅显示待补充”
        if (nextMode === 'annotate') {
            const filterMissingOnly = document.getElementById('filterMissingOnly');
            if (filterMissingOnly) {
                filterMissingOnly.checked = true;
                this.applyTableFilters();
            }
            this.renderAnnotateMissingList();
        }

        if (nextMode === 'export') {
            this.renderExportHistory();
        }

        // 导出摘要刷新
        this.updateExportSummary();
        this.updateGenerateButton();
    }

    // 简单的HTML转义（避免表名/类型包含特殊字符导致渲染问题）
    escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // 生成安全的DOM id（避免表名包含空格/特殊字符导致label失效）
    makeSafeId(value) {
        return String(value).replace(/[^a-zA-Z0-9\-_:.]/g, '_');
    }

    // 初始化底部进度抽屉（默认收起一行）
    initProgressDrawer() {
        const toggleBtn = document.getElementById('toggleProgressDrawerBtn');
        if (!toggleBtn) return;

        toggleBtn.addEventListener('click', () => {
            this.toggleProgressDrawer();
        });
    }

    // 控制底部抽屉展开/收起
    setProgressDrawerExpanded(expanded) {
        const progressSection = document.getElementById('progressSection');
        const toggleBtn = document.getElementById('toggleProgressDrawerBtn');
        if (!progressSection || !toggleBtn) return;

        if (expanded) {
            progressSection.classList.remove('collapsed');
            toggleBtn.setAttribute('aria-expanded', 'true');
            toggleBtn.setAttribute('title', '收起日志');
            // 展开后滚动到底部，方便看到最新日志
            const logsContainer = document.getElementById('logsContainer');
            if (logsContainer) {
                logsContainer.scrollTop = logsContainer.scrollHeight;
            }
        } else {
            progressSection.classList.add('collapsed');
            toggleBtn.setAttribute('aria-expanded', 'false');
            toggleBtn.setAttribute('title', '展开日志');
        }
    }

    toggleProgressDrawer() {
        const progressSection = document.getElementById('progressSection');
        if (!progressSection) return;
        const isCollapsed = progressSection.classList.contains('collapsed');
        this.setProgressDrawerExpanded(isCollapsed);
    }

    // 进度/下载抽屉出现时，为主体预留“收起一行”的空间
    setBottomDrawerReservedSpace(enabled) {
        const appRoot = document.getElementById('appRoot');
        if (!appRoot) return;
        appRoot.classList.toggle('has-bottom-drawer', !!enabled);
    }

    // 检查当前连接
    checkCurrentConnection() {
        const currentConnection = sessionStorage.getItem('currentConnection');
        if (currentConnection) {
            this.currentConnection = JSON.parse(currentConnection);
            // 显示当前连接信息
            this.displayCurrentConnectionInfo();
            // 获取表列表
            this.getTablesList();
        } else {
            // 如果没有当前连接，跳转到连接管理页面
            window.location.href = '/connections';
        }
    }

    // 显示当前连接信息
    displayCurrentConnectionInfo() {
        const connectionInfoDiv = document.getElementById('currentConnectionInfo');
        const summaryEl = document.getElementById('currentConnectionSummary');
        if (this.currentConnection) {
            const dbType = (this.currentConnection.db_type || '').toUpperCase();
            const host = this.currentConnection.host || '';
            const port = this.currentConnection.port || '';
            const database = this.currentConnection.database || '';
            const user = this.currentConnection.user || '';

            if (summaryEl) {
                summaryEl.textContent = `${dbType} / ${database}（${host}:${port}）`;
                summaryEl.title = `用户: ${user}`;
            }

            if (connectionInfoDiv) connectionInfoDiv.innerHTML = `
                <div><strong>${this.currentConnection.db_type.toUpperCase()}</strong></div>
                <div class="small">${this.currentConnection.host}:${this.currentConnection.port}</div>
                <div class="small">数据库: ${this.currentConnection.database}</div>
                <div class="small">用户: ${this.currentConnection.user}</div>
            `;
        } else {
            if (summaryEl) summaryEl.textContent = '未连接到任何数据库';
            if (connectionInfoDiv) connectionInfoDiv.innerHTML = '<small>未连接到任何数据库</small>';
        }
    }

    bindEvents() {
        // 防止重复绑定事件
        if (this.eventsbound) {
            return;
        }
        this.eventsbound = true;
        
        // 刷新表按钮
        document.getElementById('refreshTablesBtn').addEventListener('click', () => {
            this.getTablesList();
        });
        
        // 右侧面板折叠按钮
        const collapseRightBtn = document.getElementById('collapseRightBtn');
        if (collapseRightBtn) {
            collapseRightBtn.addEventListener('click', () => {
                this.toggleRightPanel();
            });
        }

        // 全选/取消全选按钮
        document.getElementById('selectAllBtn').addEventListener('click', () => {
            this.selectAllTables();
        });

        document.getElementById('deselectAllBtn').addEventListener('click', () => {
            this.deselectAllTables();
        });

        // 文件路径选择按钮
        document.getElementById('selectPathBtn').addEventListener('click', () => {
            this.selectOutputPath();
        });

        // 增量更新相关事件
        document.getElementById('incrementalMode').addEventListener('change', (e) => {
            this.toggleIncrementalMode(e.target.checked);
        });

        document.getElementById('selectDocBtn').addEventListener('click', () => {
            this.selectExistingDoc();
        });

        document.getElementById('selectNewOnlyBtn').addEventListener('click', () => {
            this.selectNewTablesOnly();
        });

        // 生成文档按钮
        document.getElementById('generateBtn').addEventListener('click', () => {
            this.generateDocs();
        });

        // 下载按钮
        document.getElementById('downloadBtn').addEventListener('click', () => {
            this.downloadFile();
        });

        // 预览按钮
        const previewBtn = document.getElementById('previewBtn');
        if (previewBtn) {
            previewBtn.addEventListener('click', () => {
                this.previewDocument();
            });
        }

        // 保存表说明和字段说明按钮
        const saveTableDescBtn = document.getElementById('saveTableDescBtn');
        if (saveTableDescBtn) {
            saveTableDescBtn.addEventListener('click', () => {
                this.saveTableDescription();
            });
        }

        // 生成所有字段说明按钮
        const generateAllFieldsBtn = document.getElementById('generateAllFieldsBtn');
        if (generateAllFieldsBtn) {
            generateAllFieldsBtn.addEventListener('click', () => {
                this.generateAllFieldsDescription();
            });
        }

        // 生成表说明按钮
        const generateTableDescBtn = document.getElementById('generateTableDescBtn');
        if (generateTableDescBtn) {
            generateTableDescBtn.addEventListener('click', () => {
                this.generateTableDescription();
            });
        }

        // 下一处待补充
        const nextMissingBtn = document.getElementById('nextMissingBtn');
        if (nextMissingBtn) {
            nextMissingBtn.addEventListener('click', () => {
                this.gotoNextMissingInCurrentTable();
            });
        }

        // 补齐缺失（仅缺失）
        const generateMissingBtn = document.getElementById('generateMissingBtn');
        if (generateMissingBtn) {
            generateMissingBtn.addEventListener('click', () => {
                this.generateMissingForCurrentTable();
            });
        }

        // 文档查看器相关事件
        this.initDocumentViewer();
        
        // 一键生成所有表描述按钮
        const generateAllTablesBtn = document.getElementById('generateAllTablesBtn');
        if (generateAllTablesBtn) {
            generateAllTablesBtn.addEventListener('click', () => {
                this.generateAllTablesDescription();
            });
        }
        
        // 切换连接按钮
        document.getElementById('changeConnectionBtn').addEventListener('click', () => {
            window.location.href = '/connections';
        });

        // 侧边助手：保存当前表/跳转导出
        const assistantSaveCurrentBtn = document.getElementById('assistantSaveCurrentBtn');
        if (assistantSaveCurrentBtn) {
            assistantSaveCurrentBtn.addEventListener('click', () => {
                this.saveTableDescription();
            });
        }
        const assistantGoExportBtn = document.getElementById('assistantGoExportBtn');
        if (assistantGoExportBtn) {
            assistantGoExportBtn.addEventListener('click', () => {
                this.setMode('export');
            });
        }

        // 标注工具栏
        const annotateRefreshBtn = document.getElementById('annotateRefreshBtn');
        if (annotateRefreshBtn) {
            annotateRefreshBtn.addEventListener('click', () => {
                this.renderAnnotateMissingList();
            });
        }
        const annotateNextBtn = document.getElementById('annotateNextBtn');
        if (annotateNextBtn) {
            annotateNextBtn.addEventListener('click', () => {
                this.gotoNextMissingTable();
            });
        }
        const annotateGenerateSaveAllBtn = document.getElementById('annotateGenerateSaveAllBtn');
        if (annotateGenerateSaveAllBtn) {
            annotateGenerateSaveAllBtn.addEventListener('click', () => {
                this.generateAndSaveAllMissing();
            });
        }

        // 导出历史
        const clearExportHistoryBtn = document.getElementById('clearExportHistoryBtn');
        if (clearExportHistoryBtn) {
            clearExportHistoryBtn.addEventListener('click', () => {
                this.clearExportHistory();
            });
        }

        // 导出完成态动作
        const copyPathBtn = document.getElementById('copyPathBtn');
        if (copyPathBtn) {
            copyPathBtn.addEventListener('click', () => {
                this.copyGeneratedFilePath();
            });
        }
        const openFolderBtn = document.getElementById('openFolderBtn');
        if (openFolderBtn) {
            openFolderBtn.addEventListener('click', () => {
                this.openGeneratedFileFolder();
            });
        }
        const reopenExportBtn = document.getElementById('reopenExportBtn');
        if (reopenExportBtn) {
            reopenExportBtn.addEventListener('click', () => {
                this.setMode('export');
            });
        }

        // 右侧迷你操作条
        const expandAssistantBtn = document.getElementById('expandAssistantBtn');
        if (expandAssistantBtn) {
            expandAssistantBtn.addEventListener('click', () => {
                this.setRightPanelCollapsed(false);
            });
        }
        const miniSaveBtn = document.getElementById('miniSaveBtn');
        if (miniSaveBtn) {
            miniSaveBtn.addEventListener('click', () => {
                this.saveTableDescription();
            });
        }
        const miniExportBtn = document.getElementById('miniExportBtn');
        if (miniExportBtn) {
            miniExportBtn.addEventListener('click', () => {
                this.setMode('export');
            });
        }
    }

    // 设置默认输出路径
    async setDefaultOutputPath() {
        try {
            const response = await fetch('/api/default_path');
            const result = await response.json();
            if (result.success) {
                this.outputPath = result.path;
                document.getElementById('outputPath').value = result.path;
            }
        } catch (error) {
            console.error('获取默认输出路径失败:', error);
            // 使用浏览器默认下载路径
            this.outputPath = '';
        }
    }

    // 选择输出路径
    async selectOutputPath() {
        try {
            const response = await fetch('/api/select_directory');
            const result = await response.json();
            if (result.success) {
                this.outputPath = result.path;
                document.getElementById('outputPath').value = result.path;
                this.updateGenerateButton();
            }
        } catch (error) {
            console.error('选择输出路径失败:', error);
            this.showMessage('选择路径失败', 'danger');
        }
    }

    // 显示加载状态
    showLoading() {
        // 创建全局加载覆盖层（如果不存在）
        let loadingOverlay = document.getElementById('loadingOverlay');
        if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.id = 'loadingOverlay';
            loadingOverlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(255, 255, 255, 0.7);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 9999;
                font-size: 1.2rem;
                color: #007bff;
            `;
            loadingOverlay.innerHTML = `
                <div class="text-center">
                    <div class="spinner-border" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <div class="mt-2">加载中...</div>
                </div>
            `;
            document.body.appendChild(loadingOverlay);
        }
        loadingOverlay.style.display = 'flex';
    }

    // 隐藏加载状态
    hideLoading() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    }

    // 为按钮添加加载状态
    setButtonLoading(buttonId, isLoading, loadingText = '加载中...') {
        const button = document.getElementById(buttonId);
        if (button) {
            if (isLoading) {
                button.disabled = true;
                button.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${loadingText}`;
            } else {
                button.disabled = false;
                // 恢复按钮原始内容
                if (buttonId === 'refreshTablesBtn') {
                    button.innerHTML = '<i class="fas fa-sync-alt"></i> 刷新表';
                } else if (buttonId === 'saveTableDescBtn') {
                    button.innerHTML = '<i class="fas fa-save"></i> 保存';
                } else if (buttonId === 'generateBtn') {
                    button.innerHTML = '<i class="fas fa-file-alt"></i> 导出DB文档';
                }
            }
        }
    }

    // 显示消息 - 使用Toast方式避免页面跳动
    showMessage(message, type = 'info') {
        // 直接调用showToast函数，避免页面跳动
        showToast(message, type);
    }

    // 获取表列表
    async getTablesList(options = {}) {
        const { silent = false } = options || {};
        this.setButtonLoading('refreshTablesBtn', true, '获取中...');
        if (!silent) this.showMessage('正在获取表列表...', 'info');
        
        try {
            const response = await fetch('/api/get_tables', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(this.currentConnection)
            });

            const result = await response.json();
            
            if (result.success) {
                this.displayTables(result.tables);
                if (!silent) this.showMessage(`成功获取到 ${result.tables.length} 个表`, 'success');
            } else {
                if (!silent) this.showMessage(`获取表列表失败: ${result.message}`, 'danger');
            }
        } catch (error) {
            if (!silent) this.showMessage(`获取表列表错误: ${error.message}`, 'danger');
        } finally {
            this.setButtonLoading('refreshTablesBtn', false);
        }
    }

    // 显示表列表
    displayTables(tables) {
        const container = document.getElementById('tablesContainer');
        container.innerHTML = '';
        this.tablesTotal = Array.isArray(tables) ? tables.length : 0;
        this.missingDescTables.clear();
        this.allTableNames = [];
        this.tableMissingMap.clear();

        tables.forEach(tableData => {
            // 处理表数据：如果是数组/元组，取第一个元素作为表名
            let tableName, tableType, tableComment;
            let missingTableComment = false;
            let missingColumnsCount = 0;
            let missingTotal = 0;
            
            if (Array.isArray(tableData)) {
                // 数组格式：[table_name, table_type, table_comment]
                tableName = tableData[0];
                tableType = tableData[1] || '';
                tableComment = tableData[2] || '';
            } else if (typeof tableData === 'object' && tableData !== null) {
                // 新格式（Phase2）：{ table_name, table_type, table_comment, missing_* }
                tableName = tableData.table_name || tableData.name || tableData.tableName;
                tableType = tableData.table_type || tableData.type || '';
                tableComment = tableData.table_comment || tableData.comment || '';
                missingTableComment = !!tableData.missing_table_comment;
                missingColumnsCount = Number(tableData.missing_columns_count || 0);
                missingTotal = Number(tableData.missing_total || 0);
            } else if (typeof tableData === 'string') {
                // 字符串格式：直接是表名
                tableName = tableData;
                tableType = '';
                tableComment = '';
            } else {
                // 其他格式，尝试转换为字符串
                tableName = String(tableData);
                tableType = '';
                tableComment = '';
            }

            if (!tableName) return;
            this.allTableNames.push(tableName);

            const safeTableName = this.escapeHtml(tableName);
            const safeTableType = this.escapeHtml(tableType);
            const checkboxId = `table_${this.makeSafeId(tableName)}`;

            const listItem = document.createElement('div');
            listItem.className = 'list-group-item list-group-item-action';
            listItem.dataset.tableName = tableName;
            // 标记“待补充”（Phase2：来自后端聚合统计；旧格式则默认为未知=0）
            const isMissing = (missingTotal > 0) || missingTableComment || (missingColumnsCount > 0);
            listItem.dataset.missingDesc = isMissing ? '1' : '0';

            this.tableMissingMap.set(tableName, {
                missing_total: missingTotal,
                missing_table_comment: missingTableComment,
                missing_columns_count: missingColumnsCount,
            });

            if (isMissing) {
                this.missingDescTables.add(tableName);
                listItem.classList.add('table-missing-desc');
            }

            listItem.innerHTML = `
                <div class="d-flex align-items-start gap-2">
                    <input class="form-check-input mt-1" type="checkbox" value="${safeTableName}" id="${checkboxId}">
                    <div class="flex-grow-1">
                        <div class="d-flex justify-content-between align-items-start gap-2">
                            <button type="button" class="btn btn-link p-0 table-open-btn" data-table-name="${safeTableName}" title="查看表结构">
                                <strong class="table-name">${safeTableName}</strong>
                                ${tableType && tableType !== 'BASE TABLE' ? `<small class="text-muted ms-1">(${safeTableType})</small>` : ''}
                            </button>
                            <span class="table-flags ms-2"></span>
                        </div>
                        ${tableComment ? `<div class="small text-muted mt-1 text-truncate">${this.escapeHtml(tableComment)}</div>` : ''}
                    </div>
                </div>
            `;
            container.appendChild(listItem);

            // 渲染“待补充”标识（来自后端聚合统计）
            const flags = listItem.querySelector('.table-flags');
            if (flags) {
                flags.innerHTML = isMissing ? '<span class="badge bg-danger">待补充</span>' : '';
            }

            // 添加点击事件
            const checkbox = listItem.querySelector('input[type="checkbox"]');
            const openBtn = listItem.querySelector('.table-open-btn');
            
            // 复选框变化事件
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    this.selectedTables.add(tableName);
                    listItem.classList.add('selected');
                } else {
                    this.selectedTables.delete(tableName);
                    listItem.classList.remove('selected');
                }
                this.updateGenerateButton();
                this.updateTablesStats();
                this.updateExportSummary();
                
                // 如果是增量更新模式，更新新表格信息
                if (this.incrementalMode && this.existingTables.length > 0) {
                    this.updateNewTablesInfo();
                }
            });

            // 查看表详情（避免label点击导致“查看 + 勾选”冲突）
            if (openBtn) {
                openBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.setActiveTable(tableName);
                    this.showTableDetail(tableName);
                });
            }
        });

        // 显示表选择区域
        document.getElementById('tablesSection').style.display = 'block';
        document.getElementById('tablesSection').classList.add('fade-in');
        
        // 显示数据库功能介绍区域
        document.getElementById('dbDescriptionSection').style.display = 'block';
        document.getElementById('dbDescriptionSection').classList.add('fade-in');
        // 导出设置：仅在导出模式显示
        const outputSection = document.getElementById('outputSection');
        if (outputSection) {
            outputSection.style.display = this.currentMode === 'export' ? 'block' : 'none';
            outputSection.classList.toggle('fade-in', this.currentMode === 'export');
        }
        
        // 生成默认文件名
        this.generateFileName();

        // 添加表搜索/筛选功能
        this.initTableSearch();
        this.initTableFilters();
        this.updateTablesStats();
        this.renderAnnotateMissingList();
        this.applyTableFilters();
        this.updateGenerateButton();
    }

    // 初始化表搜索功能
    initTableSearch() {
        const searchInput = document.getElementById('tableSearch');
        if (!searchInput) return;

        if (this.tableSearchBound) return;
        this.tableSearchBound = true;

        searchInput.addEventListener('input', (e) => {
            this.tableSearchTerm = (e.target.value || '').toLowerCase();
            this.applyTableFilters();
        });
    }

    initTableFilters() {
        const filterMissingOnly = document.getElementById('filterMissingOnly');
        if (!filterMissingOnly) return;
        if (this.tableFiltersBound) return;
        this.tableFiltersBound = true;

        filterMissingOnly.addEventListener('change', () => {
            this.applyTableFilters();
        });
    }

    applyTableFilters() {
        const filterMissingOnly = document.getElementById('filterMissingOnly');
        const missingOnly = !!(filterMissingOnly && filterMissingOnly.checked);
        const searchTerm = (this.tableSearchTerm || '').trim();

        const tableItems = document.querySelectorAll('#tablesContainer .list-group-item');
        tableItems.forEach(item => {
            const tableName = (item.dataset.tableName || '').toLowerCase();
            const isMissing = item.dataset.missingDesc === '1';

            const matchSearch = !searchTerm || tableName.includes(searchTerm);
            const matchMissing = !missingOnly || isMissing;

            item.style.display = (matchSearch && matchMissing) ? 'block' : 'none';
        });
    }

    updateTablesStats() {
        const totalBadge = document.getElementById('tablesTotalBadge');
        const selectedBadge = document.getElementById('tablesSelectedBadge');
        const missingBadge = document.getElementById('tablesMissingBadge');

        if (totalBadge) totalBadge.textContent = `总表 ${this.tablesTotal}`;
        if (selectedBadge) selectedBadge.textContent = `已选 ${this.selectedTables.size}`;
        if (missingBadge) missingBadge.textContent = `待补充 ${this.missingDescTables.size}`;

        // 同步导出摘要（若存在）
        this.updateExportSummary();
    }

    // 设置左侧表列表的“当前查看表”（与批量勾选区分）
    setActiveTable(tableName) {
        this.activeTableName = tableName || '';
        const items = document.querySelectorAll('#tablesContainer .list-group-item');
        items.forEach(item => {
            item.classList.toggle('table-active', (item.dataset.tableName === this.activeTableName));
        });
    }

    // 导出模式摘要
    updateExportSummary() {
        const exportSelectedBadge = document.getElementById('exportSelectedBadge');
        const exportMissingBadge = document.getElementById('exportMissingBadge');

        if (exportSelectedBadge) exportSelectedBadge.textContent = `已选 ${this.selectedTables.size}`;

        // 统计“已选表”里有多少是待补充（更贴合导出前校验）
        let missingSelected = 0;
        this.selectedTables.forEach(t => {
            const meta = this.tableMissingMap.get(t);
            if (meta && (Number(meta.missing_total) > 0 || meta.missing_table_comment || Number(meta.missing_columns_count) > 0)) {
                missingSelected += 1;
            }
        });
        if (exportMissingBadge) exportMissingBadge.textContent = `待补充 ${missingSelected}`;
    }

    // 标注模式：渲染“待补充”表清单
    renderAnnotateMissingList() {
        const container = document.getElementById('annotateMissingList');
        if (!container) return;

        const missingTables = Array.from(this.missingDescTables);
        if (missingTables.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted p-4">
                    <i class="fas fa-check-circle fa-2x mb-2 opacity-50"></i>
                    <div class="fw-semibold">暂无待补充项</div>
                    <div class="small">当前库的表与字段注释看起来都已完善</div>
                </div>
            `;
            return;
        }

        container.innerHTML = missingTables.map(name => {
            const meta = this.tableMissingMap.get(name) || {};
            const missingCols = Number(meta.missing_columns_count || 0);
            const missingTbl = meta.missing_table_comment ? 1 : 0;
            const detail = [
                missingTbl ? '缺表说明' : null,
                missingCols ? `缺字段说明 ${missingCols}` : null,
            ].filter(Boolean).join(' / ');
            return `
                <div class="list-group-item d-flex justify-content-between align-items-center gap-2">
                    <div class="text-truncate">
                        <div class="d-flex align-items-center gap-2">
                            <i class="fas fa-table text-primary"></i>
                            <strong class="text-truncate">${this.escapeHtml(name)}</strong>
                            <span class="badge bg-danger">待补充</span>
                        </div>
                        <div class="small text-muted mt-1">${detail}</div>
                    </div>
                    <div class="btn-group btn-group-sm flex-shrink-0">
                        <button type="button" class="btn btn-outline-secondary annotate-open-table" data-table-name="${this.escapeHtml(name)}">
                            <i class="fas fa-eye"></i> 打开
                        </button>
                        <button type="button" class="btn btn-outline-info annotate-generate-missing" data-table-name="${this.escapeHtml(name)}" title="仅生成缺失说明（不保存）">
                            <i class="fas fa-wand-magic-sparkles"></i> 生成缺失
                        </button>
                        <button type="button" class="btn btn-outline-success annotate-generate-save" data-table-name="${this.escapeHtml(name)}" title="生成缺失并保存到数据库">
                            <i class="fas fa-save"></i> 生成并保存
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // 打开该表
        container.querySelectorAll('.annotate-open-table').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-table-name');
                this.setMode('browse');
                this.setActiveTable(target);
                this.showTableDetail(target);
            });
        });
        // 仅生成缺失（不保存）
        container.querySelectorAll('.annotate-generate-missing').forEach(btn => {
            btn.addEventListener('click', async () => {
                const target = btn.getAttribute('data-table-name');
                await this.generateMissingForTable(target, false);
            });
        });
        // 生成并保存
        container.querySelectorAll('.annotate-generate-save').forEach(btn => {
            btn.addEventListener('click', async () => {
                const target = btn.getAttribute('data-table-name');
                await this.generateMissingForTable(target, true);
            });
        });
    }

    // 显示表详情
    async showTableDetail(tableName) {
        this.showLoading();
        
        try {
            const config = {...this.currentConnection};
            config.table_name = tableName;
            
            const response = await fetch('/api/get_table_detail', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(config)
            });

            const result = await response.json();
            
            if (result.success) {
                this.displayTableDetail(tableName, result.table_info, result.fields);
            } else {
                this.showMessage(`获取表详情失败: ${result.message}`, 'danger');
            }
        } catch (error) {
            this.showMessage(`获取表详情错误: ${error.message}`, 'danger');
        } finally {
            this.hideLoading();
        }
    }

    // 显示表详情
    displayTableDetail(tableName, tableInfo, fields) {
        // 更新当前表名
        document.getElementById('currentTableName').textContent = tableName;
        this.setActiveTable(tableName);
        this.updateDirtyIndicator(tableName);
        
        // 尝试从本地存储加载保存的数据
        const savedTableData = this.loadTableDataFromLocalStorage(tableName);
        
        // 更新表说明
        const tableDescription = savedTableData ? savedTableData.tableDescription : (tableInfo.comment || '');
        document.getElementById('tableDescription').value = tableDescription;
        
        // 生成字段表格
        const fieldsTableBody = document.getElementById('fieldsTableBody');
        fieldsTableBody.innerHTML = '';
        
        fields.forEach(field => {
            // 使用保存的字段说明或默认值
            const fieldDescription = savedTableData && savedTableData.fieldDescriptions && savedTableData.fieldDescriptions[field.name] 
                ? savedTableData.fieldDescriptions[field.name] 
                : (field.comment || '');
                
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${field.name}</td>
                <td>${field.type}</td>
                <td>${field.nullable ? '是' : '否'}</td>
                <td>${field.default ? field.default : '-'}</td>
                <td>
                    <textarea class="form-control form-control-sm field-description" rows="1" placeholder="请输入字段说明...">${fieldDescription}</textarea>
                </td>
                <td>
                    <button type="button" class="btn btn-sm btn-outline-info generate-field-desc" data-field-name="${field.name}" title="生成字段说明">
                        <i class="fas fa-brain"></i>
                    </button>
                </td>
            `;
            fieldsTableBody.appendChild(row);
        });
        
        // 绑定字段说明生成按钮事件
        this.bindFieldDescGenerateEvents();
        
        // 为字段说明textarea添加自动调整高度功能
        this.initAutoResizeTextarea();

        // 标记脏状态（用户编辑即视为未保存）
        this.bindDirtyTracking(tableName);
        
        // 显示表详情区域
        document.getElementById('tableDetailSection').style.display = 'block';
        document.getElementById('noTableSelected').style.display = 'none';
    }

    bindDirtyTracking(tableName) {
        const tableDesc = document.getElementById('tableDescription');
        if (tableDesc && !tableDesc.dataset.dirtyBound) {
            tableDesc.dataset.dirtyBound = '1';
            tableDesc.addEventListener('input', () => this.markDirty(tableName));
        }
        const textareas = document.querySelectorAll('#fieldsTableBody .field-description');
        textareas.forEach(t => {
            if (t.dataset.dirtyBound) return;
            t.dataset.dirtyBound = '1';
            t.addEventListener('input', () => this.markDirty(tableName));
        });
    }

    markDirty(tableName) {
        if (!tableName) return;
        this.dirtyTables.add(tableName);
        this.updateDirtyIndicator(tableName);
    }

    clearDirty(tableName) {
        if (!tableName) return;
        this.dirtyTables.delete(tableName);
        this.updateDirtyIndicator(tableName);
    }

    updateDirtyIndicator(tableName) {
        const indicator = document.getElementById('dirtyIndicator');
        if (!indicator) return;
        const isDirty = this.dirtyTables.has(tableName);
        indicator.style.display = isDirty ? 'inline-block' : 'none';
    }

    // 初始化自动调整高度的textarea
    initAutoResizeTextarea() {
        const textareas = document.querySelectorAll('.field-description');
        textareas.forEach(textarea => {
            // 自动调整高度
            const autoResize = () => {
                textarea.style.height = 'auto';
                textarea.style.height = `${textarea.scrollHeight}px`;
            };
            
            // 初始调整
            autoResize();
            
            // 绑定事件
            textarea.addEventListener('input', autoResize);
            textarea.addEventListener('change', autoResize);
            textarea.addEventListener('focus', autoResize);
            
            // 为textarea添加点击事件，方便编辑
            textarea.addEventListener('click', () => {
                textarea.select();
            });
        });
    }

    // 绑定字段说明生成按钮事件
    bindFieldDescGenerateEvents() {
        const generateButtons = document.querySelectorAll('.generate-field-desc');
        generateButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const fieldName = e.target.closest('button').dataset.fieldName;
                this.generateFieldDescription(fieldName);
            });
        });
    }

    // 生成字段说明
    async generateFieldDescription(fieldName) {
        this.showLoading();
        try {
            const dbDescription = document.getElementById('dbDescription').value.trim();
            const currentTableName = document.getElementById('currentTableName').textContent;
            
            const response = await fetch('/api/generate_field_description', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...this.currentConnection,
                    table_name: currentTableName,
                    field_name: fieldName,
                    db_description: dbDescription
                })
            });

            const result = await response.json();
            if (result.success) {
                // 更新字段说明
                const fieldRows = document.querySelectorAll('#fieldsTableBody tr');
                fieldRows.forEach(row => {
                    const fieldNameCell = row.querySelector('td:nth-child(1)');
                    if (fieldNameCell && fieldNameCell.textContent === fieldName) {
                        const descTextarea = row.querySelector('.field-description');
                        if (descTextarea) {
                            descTextarea.value = result.field_description;
                        }
                    }
                });
                this.showMessage('字段说明生成成功！', 'success');
            } else {
                this.showMessage(`生成失败: ${result.message}`, 'danger');
            }
        } catch (error) {
            this.showMessage(`生成错误: ${error.message}`, 'danger');
        } finally {
            this.hideLoading();
        }
    }

    // 生成所有字段说明
    async generateAllFieldsDescription() {
        this.showLoading();
        try {
            const dbDescription = document.getElementById('dbDescription').value.trim();
            const currentTableName = document.getElementById('currentTableName').textContent;
            
            const response = await fetch('/api/generate_all_fields_description', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...this.currentConnection,
                    table_name: currentTableName,
                    db_description: dbDescription
                })
            });

            const result = await response.json();
            if (result.success) {
                // 更新所有字段说明
                const fieldRows = document.querySelectorAll('#fieldsTableBody tr');
                fieldRows.forEach(row => {
                    const fieldNameCell = row.querySelector('td:nth-child(1)');
                    if (fieldNameCell) {
                        const fieldName = fieldNameCell.textContent;
                        const descTextarea = row.querySelector('.field-description');
                        if (descTextarea && result.field_meanings[fieldName]) {
                            descTextarea.value = result.field_meanings[fieldName];
                        }
                    }
                });
                this.showMessage('所有字段说明生成成功！', 'success');
            } else {
                this.showMessage(`生成失败: ${result.message}`, 'danger');
            }
        } catch (error) {
            this.showMessage(`生成错误: ${error.message}`, 'danger');
        } finally {
            this.hideLoading();
        }
    }

    // 生成表说明
    async generateTableDescription() {
        this.showLoading();
        try {
            const dbDescription = document.getElementById('dbDescription').value.trim();
            const currentTableName = document.getElementById('currentTableName').textContent;
            
            const response = await fetch('/api/generate_table_description', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...this.currentConnection,
                    table_name: currentTableName,
                    db_description: dbDescription
                })
            });

            const result = await response.json();
            if (result.success) {
                // 更新表说明
                const tableDescTextarea = document.getElementById('tableDescription');
                if (tableDescTextarea) {
                    tableDescTextarea.value = result.table_description;
                }
                this.showMessage('表说明生成成功！', 'success');
            } else {
                this.showMessage(`生成失败: ${result.message}`, 'danger');
            }
        } catch (error) {
            this.showMessage(`生成错误: ${error.message}`, 'danger');
        } finally {
            this.hideLoading();
        }
    }

    // 一键生成所有表和字段描述
    async generateAllTablesDescription() {
        try {
            const dbDescription = document.getElementById('dbDescription').value.trim();
            
            // 显示确认对话框
            const confirmResult = confirm('确定要一键生成所有表和字段的描述并更新到数据库吗？\n此操作可能需要较长时间，请耐心等待。');
            if (!confirmResult) {
                return;
            }
            
            // 显示进度条
            this.showProgressSection();
            
            // 初始化进度
            this.totalTables = 0;
            this.completedTables = 0;
            
            // 启动日志流，接收实时进度
            this.startLogStreaming();
            
            const response = await fetch('/api/generate_all_tables_description', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...this.currentConnection,
                    db_description: dbDescription
                })
            });

            const result = await response.json();
            if (result.success) {
                this.showMessage(`一键生成完成！共处理 ${result.total_tables} 个表，成功 ${result.success_tables} 个，失败 ${result.failed_tables} 个。`, 'success');
                // 刷新表列表，显示新的表注释
                this.getTablesList();
            } else {
                this.showMessage(`生成失败: ${result.message}`, 'danger');
            }
            
            // 关闭日志流
            if (this.eventSource) {
                this.eventSource.close();
                this.eventSource = null;
            }
            
            // 隐藏进度条
            setTimeout(() => {
                this.hideProgressSection();
            }, 1000);
        } catch (error) {
            this.showMessage(`生成错误: ${error.message}`, 'danger');
            // 关闭日志流
            if (this.eventSource) {
                this.eventSource.close();
                this.eventSource = null;
            }
            this.hideProgressSection();
        }
    }

    // 保存表说明和字段说明到数据库
    saveTableDescription() {
        const currentTableName = document.getElementById('currentTableName').textContent;
        if (!currentTableName) {
            this.showMessage('请先选择一个表！', 'warning');
            return;
        }

        // 获取表说明
        const tableDescription = document.getElementById('tableDescription').value.trim();

        // 获取字段说明
        const fieldDescriptions = {};
        const fieldRows = document.querySelectorAll('#fieldsTableBody tr');
        fieldRows.forEach(row => {
            const fieldName = row.querySelector('td:nth-child(1)').textContent;
            const fieldDesc = row.querySelector('.field-description').value.trim();
            fieldDescriptions[fieldName] = fieldDesc;
        });

        // 构建保存数据
        const saveData = {
            ...this.currentConnection,
            table_name: currentTableName,
            table_description: tableDescription,
            field_descriptions: fieldDescriptions
        };

        // 发送请求到后端保存到数据库
        this.setButtonLoading('saveTableDescBtn', true, '保存中...');
        fetch('/api/save_table_comment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(saveData)
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                this.showMessage('表说明和字段说明已保存到数据库！', 'success');
                // 刷新表详情，确保显示最新的注释
                this.showTableDetail(currentTableName);
                // 清除未保存标记
                this.clearDirty(currentTableName);
                // 刷新左侧表列表状态（Phase2：一次性拉取缺失统计）
                this.getTablesList();
            } else {
                this.showMessage(`保存失败: ${result.message}`, 'danger');
            }
        })
        .catch(error => {
            this.showMessage(`保存失败: ${error.message}`, 'danger');
        })
        .finally(() => {
            this.setButtonLoading('saveTableDescBtn', false);
        });
    }

    // 从本地存储加载表数据 - 兼容旧版本，保留此方法
    loadTableDataFromLocalStorage(tableName) {
        const savedTables = JSON.parse(localStorage.getItem('savedTableData') || '{}');
        const connectionKey = `${this.currentConnection.db_type}_${this.currentConnection.host}_${this.currentConnection.port}_${this.currentConnection.database}`;
        
        if (savedTables[connectionKey] && savedTables[connectionKey][tableName]) {
            return savedTables[connectionKey][tableName];
        }
        return null;
    }

    // 获取所有保存的表数据，用于生成文档时传递给后端 - 兼容旧版本，保留此方法
    getAllSavedTableData() {
        const savedTables = JSON.parse(localStorage.getItem('savedTableData') || '{}');
        const connectionKey = `${this.currentConnection.db_type}_${this.currentConnection.host}_${this.currentConnection.port}_${this.currentConnection.database}`;
        
        return savedTables[connectionKey] || {};
    }

    // 更新左侧列表中表的描述状态
    updateTableDescriptionStatus(tableName) {
        // 找到对应的列表项
        const listItems = document.querySelectorAll('#tablesContainer .list-group-item');
        listItems.forEach(item => {
            const checkbox = item.querySelector('input[type="checkbox"]');
            if (checkbox && checkbox.value === tableName) {
                // 重新检查描述状态
                this.checkTableDescriptionStatus(tableName, item);
            }
        });
    }

    // 生成文件名
    generateFileName() {
        if (this.currentConnection && this.currentConnection.database) {
            const databaseName = this.currentConnection.database;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
            this.fileName = `${databaseName}_文档_${timestamp}.md`;
            document.getElementById('fileName').value = this.fileName;
        }
    }

    // 全选表
    selectAllTables() {
        const checkboxes = document.querySelectorAll('#tablesContainer input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
            const item = checkbox.closest('.list-group-item');
            const name = item?.dataset?.tableName || checkbox.value;
            this.selectedTables.add(name);
            item && item.classList.add('selected');
        });
        this.updateGenerateButton();
        this.updateTablesStats();
    }

    // 取消全选
    deselectAllTables() {
        const checkboxes = document.querySelectorAll('#tablesContainer input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
            const item = checkbox.closest('.list-group-item');
            const name = item?.dataset?.tableName || checkbox.value;
            this.selectedTables.delete(name);
            item && item.classList.remove('selected');
        });
        this.updateGenerateButton();
        this.updateTablesStats();
    }

    // 更新生成按钮状态
    updateGenerateButton() {
        const generateBtn = document.getElementById('generateBtn');
        const hint = document.getElementById('generateHint');

        let reason = '';
        if (this.selectedTables.size === 0) {
            reason = '请选择要导出的表';
        } else if (!this.outputPath) {
            reason = '请选择文档保存路径';
        } else if (this.incrementalMode && this.existingTables.length > 0) {
            const hasNewTable = Array.from(this.selectedTables).some(t => !this.existingTables.includes(t));
            if (!hasNewTable) {
                reason = '增量更新：请至少选择一张“新表”（文档中不存在的表）';
            }
        }

        const disabled = !!reason;
        if (generateBtn) {
            generateBtn.disabled = disabled;
            generateBtn.title = disabled ? reason : '';
        }
        if (hint) {
            hint.textContent = disabled ? reason : '已就绪：点击开始生成';
        }
    }

    // =============== Phase1/2：增量更新（补齐缺失实现，避免点击报错） ===============
    toggleIncrementalMode(enabled) {
        this.incrementalMode = !!enabled;
        const section = document.getElementById('existingDocSection');
        if (section) section.style.display = this.incrementalMode ? 'block' : 'none';

        // 关闭增量时清空状态
        if (!this.incrementalMode) {
            this.existingDocPath = '';
            this.existingDocContent = '';
            this.existingTables = [];
            this.newTables = [];
            const pathInput = document.getElementById('existingDocPath');
            if (pathInput) pathInput.value = '';
            const info = document.getElementById('existingTablesInfo');
            if (info) info.style.display = 'none';
            const selectNewOnlyBtn = document.getElementById('selectNewOnlyBtn');
            if (selectNewOnlyBtn) selectNewOnlyBtn.style.display = 'none';
        }

        this.updateGenerateButton();
    }

    async selectExistingDoc() {
        try {
            // 使用后端 Tk 文件选择（桌面应用体验）
            const pickResp = await fetch('/api/select_markdown_file');
            const pickResult = await pickResp.json();
            if (!pickResult.success) {
                this.showMessage(pickResult.message || '未选择文档', 'warning');
                return;
            }

            this.existingDocPath = pickResult.path;
            const pathInput = document.getElementById('existingDocPath');
            if (pathInput) pathInput.value = pickResult.path;

            // 读取文档内容
            const parseResp = await fetch('/api/parse_doc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ doc_path: pickResult.path })
            });
            const parseResult = await parseResp.json();
            if (!parseResult.success) {
                this.showMessage(parseResult.message || '解析文档失败', 'danger');
                return;
            }

            this.existingDocContent = parseResult.content || '';
            this.existingTables = this.parseExistingTablesFromMarkdown(this.existingDocContent);
            this.updateNewTablesInfo();

            this.showMessage('已选择现有文档，增量更新将仅生成新表内容', 'success');
            this.updateGenerateButton();
        } catch (error) {
            this.showMessage(`选择文档失败: ${error.message}`, 'danger');
        }
    }

    parseExistingTablesFromMarkdown(content) {
        if (!content) return [];
        const tables = new Set();
        const lines = String(content).split('\n');

        // 兼容本项目生成格式：表: table_name - comment / 表: table_name
        const re1 = /^表[:：]\s*([^\s-]+)\s*(?:-|$)/;
        // 兼容标题格式：## 表: xxx / ## xxx
        const re2 = /^##\s*表[:：]\s*(.+)\s*$/;
        const re3 = /^##\s+(.+)\s*$/;

        for (const raw of lines) {
            const line = raw.trim();
            if (!line) continue;
            let m = line.match(re1);
            if (m && m[1]) {
                tables.add(m[1].trim());
                continue;
            }
            m = line.match(re2);
            if (m && m[1]) {
                tables.add(m[1].trim());
                continue;
            }
            // 谨慎：re3 可能误判普通二级标题，这里不默认加入，避免污染 existingTables
        }
        return Array.from(tables);
    }

    updateNewTablesInfo() {
        // 根据当前库表列表与 existingTables 做 diff
        const all = Array.isArray(this.allTableNames) ? this.allTableNames : [];
        const existing = new Set(this.existingTables || []);
        this.newTables = all.filter(t => !existing.has(t));

        const existingInfo = document.getElementById('existingTablesInfo');
        const existingCount = document.getElementById('existingTablesCount');
        const newCount = document.getElementById('newTablesCount');
        if (existingCount) existingCount.textContent = String((this.existingTables || []).length);
        if (newCount) newCount.textContent = String((this.newTables || []).length);
        if (existingInfo) existingInfo.style.display = 'block';

        const selectNewOnlyBtn = document.getElementById('selectNewOnlyBtn');
        if (selectNewOnlyBtn) selectNewOnlyBtn.style.display = 'inline-block';
    }

    selectNewTablesOnly() {
        if (!this.incrementalMode) return;
        if (!Array.isArray(this.newTables) || this.newTables.length === 0) {
            this.showMessage('没有检测到“新表”（文档中不存在的表）', 'warning');
            return;
        }

        // 先清空，再勾选新表
        this.deselectAllTables();
        const newSet = new Set(this.newTables);
        const checkboxes = document.querySelectorAll('#tablesContainer input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            const name = checkbox.value;
            if (newSet.has(name)) {
                checkbox.checked = true;
                this.selectedTables.add(name);
                checkbox.closest('.list-group-item')?.classList.add('selected');
            }
        });

        this.updateTablesStats();
        this.updateGenerateButton();
        this.showMessage(`已勾选 ${this.newTables.length} 张新表`, 'success');
    }

    // =============== Phase3：标注工作流（下一处 / 仅补齐缺失 / 一键生成并保存） ===============
    gotoNextMissingTable() {
        const list = Array.from(this.missingDescTables);
        if (list.length === 0) {
            this.showMessage('暂无待补充项', 'info');
            return;
        }
        const target = list[0];
        this.setMode('browse');
        this.setActiveTable(target);
        this.showTableDetail(target);
        // 进入后直接定位下一处
        setTimeout(() => this.gotoNextMissingInCurrentTable(), 300);
    }

    gotoNextMissingInCurrentTable() {
        const tableName = document.getElementById('currentTableName')?.textContent || '';
        if (!tableName) {
            this.showMessage('请先打开一张表', 'warning');
            return;
        }

        // 1) 表说明为空
        const tableDesc = document.getElementById('tableDescription');
        if (tableDesc && !String(tableDesc.value || '').trim()) {
            tableDesc.focus();
            tableDesc.scrollIntoView({ behavior: 'smooth', block: 'center' });
            this.showMessage('定位到：表说明（待补充）', 'info');
            return;
        }

        // 2) 找第一个字段说明为空
        const rows = document.querySelectorAll('#fieldsTableBody tr');
        for (const row of rows) {
            const fieldNameCell = row.querySelector('td:nth-child(1)');
            const textarea = row.querySelector('.field-description');
            const fieldName = fieldNameCell ? fieldNameCell.textContent : '';
            if (textarea && !String(textarea.value || '').trim()) {
                textarea.focus();
                textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
                this.showMessage(`定位到：字段 ${fieldName}（待补充）`, 'info');
                return;
            }
        }

        this.showMessage('当前表暂无待补充项', 'success');
    }

    async generateMissingForCurrentTable() {
        const tableName = document.getElementById('currentTableName')?.textContent || '';
        if (!tableName) {
            this.showMessage('请先打开一张表', 'warning');
            return;
        }
        await this.generateMissingForTable(tableName, false, true);
    }

    async generateMissingForTable(tableName, saveToDb = false, applyToCurrentUI = false) {
        if (!tableName) return;
        const doSave = !!saveToDb;

        try {
            this.showLoading();
            const dbDescription = document.getElementById('dbDescription')?.value?.trim() || '';

            // 拉表详情，找缺失项
            const detailResp = await fetch('/api/get_table_detail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...this.currentConnection, table_name: tableName })
            });
            const detailResult = await detailResp.json();
            if (!detailResult.success) {
                this.showMessage(`获取表详情失败: ${detailResult.message}`, 'danger');
                return;
            }

            const tableComment = (detailResult.table_info?.comment || '').trim();
            const fields = Array.isArray(detailResult.fields) ? detailResult.fields : [];
            const isCurrent = !!applyToCurrentUI && String(document.getElementById('currentTableName')?.textContent || '').trim() === String(tableName).trim();

            // 默认用数据库注释判断缺失；若当前就在该表详情页，则优先以 UI 当前内容判断“缺失”
            let missingFields = fields.filter(f => !String(f.comment || '').trim()).map(f => f.name);
            let missingTable = !tableComment;
            if (isCurrent) {
                const uiTableDesc = String(document.getElementById('tableDescription')?.value || '').trim();
                missingTable = !uiTableDesc;
                const rows = document.querySelectorAll('#fieldsTableBody tr');
                const uiMissing = [];
                rows.forEach(row => {
                    const nameCell = row.querySelector('td:nth-child(1)');
                    const textarea = row.querySelector('.field-description');
                    const name = String(nameCell ? nameCell.textContent : '').trim();
                    const val = String(textarea ? textarea.value : '').trim();
                    if (name && !val) uiMissing.push(name);
                });
                if (uiMissing.length > 0) missingFields = uiMissing;
            }

            if (!missingTable && missingFields.length === 0) {
                this.showMessage(`表 ${tableName} 暂无缺失项`, 'success');
                return;
            }

            // 生成表说明（缺失才生成）
            let generatedTableDesc = tableComment;
            if (missingTable) {
                const resp = await fetch('/api/generate_table_description', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...this.currentConnection, table_name: tableName, db_description: dbDescription })
                });
                const r = await resp.json();
                if (r.success) {
                    generatedTableDesc = r.table_description || '';
                } else {
                    this.showMessage(`生成表说明失败: ${r.message}`, 'warning');
                }
            }

            // 生成缺失字段说明（逐个生成，便于提示与可控）
            const generatedFields = {};
            for (let i = 0; i < missingFields.length; i++) {
                const fieldName = missingFields[i];
                this.showMessage(`生成缺失字段说明：${tableName}.${fieldName}（${i + 1}/${missingFields.length}）`, 'info');
                const resp = await fetch('/api/generate_field_description', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...this.currentConnection, table_name: tableName, field_name: fieldName, db_description: dbDescription })
                });
                const r = await resp.json();
                if (r.success) {
                    generatedFields[fieldName] = r.field_description || '';
                } else {
                    this.showMessage(`生成字段 ${fieldName} 失败: ${r.message}`, 'warning');
                }
            }

            // 如果当前就在该表详情页，把生成结果回填到 UI
            if (isCurrent) {
                const tableDescEl = document.getElementById('tableDescription');
                if (missingTable && tableDescEl && generatedTableDesc) {
                    tableDescEl.value = generatedTableDesc;
                }
                const rows = document.querySelectorAll('#fieldsTableBody tr');
                rows.forEach(row => {
                    const nameCell = row.querySelector('td:nth-child(1)');
                    const textarea = row.querySelector('.field-description');
                    const name = String(nameCell ? nameCell.textContent : '').trim();
                    if (textarea && Object.prototype.hasOwnProperty.call(generatedFields, name) && String(generatedFields[name] || '').trim()) {
                        textarea.value = generatedFields[name];
                    }
                });
                this.initAutoResizeTextarea();
                this.markDirty(tableName);
            }

            if (doSave) {
                const field_descriptions = {};
                fields.forEach(f => {
                    const existing = String(f.comment || '').trim();
                    field_descriptions[f.name] = existing || (generatedFields[f.name] || '');
                });
                const saveResp = await fetch('/api/save_table_comment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...this.currentConnection,
                        table_name: tableName,
                        table_description: generatedTableDesc || '',
                        field_descriptions
                    })
                });
                const saveResult = await saveResp.json();
                if (saveResult.success) {
                    this.showMessage(`已保存 ${tableName} 的缺失注释到数据库`, 'success');
                    this.clearDirty(tableName);
                } else {
                    this.showMessage(`保存失败: ${saveResult.message}`, 'danger');
                }
            } else {
                this.showMessage(`已生成 ${tableName} 的缺失注释（未保存）`, 'success');
            }

            // 刷新缺失状态与标注清单
            await this.getTablesList({ silent: true });
            this.renderAnnotateMissingList();
        } catch (error) {
            this.showMessage(`补齐缺失失败: ${error.message}`, 'danger');
        } finally {
            this.hideLoading();
        }
    }

    async generateAndSaveAllMissing() {
        const missingTables = Array.from(this.missingDescTables);
        if (missingTables.length === 0) {
            this.showMessage('暂无待补充项', 'info');
            return;
        }
        const ok = confirm(`确定要“一键生成并保存”全部待补充项吗？\n将处理 ${missingTables.length} 张表，可能需要较长时间。`);
        if (!ok) return;

        for (let i = 0; i < missingTables.length; i++) {
            const t = missingTables[i];
            this.showMessage(`批量处理：${t}（${i + 1}/${missingTables.length}）`, 'info');
            // 不强制切换当前表，直接后台生成并保存
            await this.generateMissingForTable(t, true, false);
        }
        this.showMessage('全部待补充项已处理完成', 'success');
    }

    // 生成文档
    async generateDocs() {
        if (this.selectedTables.size === 0) {
            this.showMessage('请先选择要生成文档的表', 'warning');
            return;
        }

        if (!this.outputPath) {
            this.showMessage('请先选择文档保存路径', 'warning');
            return;
        }

        // 增量更新模式验证
        if (this.incrementalMode) {
            if (!this.existingDocPath) {
                this.showMessage('增量更新模式下请先选择现有文档', 'warning');
                return;
            }
            
            // 检查是否有新表格需要生成
            const newTables = Array.from(this.selectedTables).filter(table => !this.existingTables.includes(table));
            if (newTables.length === 0) {
                this.showMessage('所有选中的表格都已存在于文档中，无需生成新内容', 'warning');
                return;
            }
        }

        try {
            this.setButtonLoading('generateBtn', true, '生成中...');
            this.showMessage('正在准备生成文档...', 'info');
            
            const config = {...this.currentConnection};
            config.tables = Array.from(this.selectedTables);
            config.output_path = this.outputPath;
            config.file_name = this.fileName;
            
            // 获取数据库功能介绍
            const dbDescription = document.getElementById('dbDescription').value.trim();
            config.db_description = dbDescription;
            
            // 添加保存的表数据
            config.saved_table_data = this.getAllSavedTableData();
            
            // 增量更新相关配置
            if (this.incrementalMode) {
                config.incremental_mode = true;
                config.existing_doc_path = this.existingDocPath;
                config.existing_doc_content = this.existingDocContent;
                config.existing_tables = this.existingTables;
            } else {
                config.incremental_mode = false;
            }

            // 初始化进度
            this.totalTables = this.selectedTables.size;
            this.completedTables = 0;

            const response = await fetch('/api/generate_docs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(config)
            });

            const result = await response.json();
            
            if (result.success) {
                this.showProgressSection();
                this.startLogStreaming();
                if (this.incrementalMode) {
                    this.showMessage('开始增量更新文档...', 'info');
                } else {
                    this.showMessage('开始生成文档...', 'info');
                }
            } else {
                this.showMessage(`生成失败: ${result.message}`, 'danger');
            }
        } catch (error) {
            this.showMessage(`生成错误: ${error.message}`, 'danger');
        } finally {
            this.setButtonLoading('generateBtn', false);
            this.updateGenerateButton();
        }
    }

    // 显示进度区域
    showProgressSection() {
        const progressSection = document.getElementById('progressSection');
        progressSection.style.display = 'block';
        this.setBottomDrawerReservedSpace(true);
        // 默认收起一行
        this.setProgressDrawerExpanded(false);
        
        // 重置进度条
        const progressBar = document.getElementById('progressBar');
        progressBar.style.width = '0%';
        progressBar.textContent = '0%';
        progressBar.setAttribute('aria-valuenow', '0');
        
        // 重置进度文本
        document.getElementById('progressText').textContent = `0/${this.totalTables} 已完成`;
        
        // 显示当前状态
        const currentStatus = document.getElementById('currentStatus');
        currentStatus.style.display = 'block';
        document.getElementById('currentStatusText').textContent = '准备开始...';
        
        // 清空日志
        document.getElementById('logsContainer').innerHTML = '';
    }

    // 隐藏进度区域
    hideProgressSection() {
        const progressSection = document.getElementById('progressSection');
        progressSection.style.display = 'none';
        this.setBottomDrawerReservedSpace(false);
    }

    // 更新进度显示（SSE progress 消息）
    updateProgress(completed, total, currentTable = '') {
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        const currentStatus = document.getElementById('currentStatus');
        const currentStatusText = document.getElementById('currentStatusText');

        if (!progressBar || !progressText || !currentStatus || !currentStatusText) return;

        const safeTotal = Number(total) || 0;
        const safeCompleted = Number(completed) || 0;
        const percent = safeTotal > 0 ? Math.min(100, Math.round((safeCompleted / safeTotal) * 100)) : 0;

        progressBar.style.width = `${percent}%`;
        progressBar.textContent = `${percent}%`;
        progressBar.setAttribute('aria-valuenow', String(percent));
        progressText.textContent = `${safeCompleted}/${safeTotal} 已完成`;

        currentStatus.style.display = 'block';
        if (currentTable) {
            currentStatusText.textContent = `正在处理：${currentTable}（${safeCompleted}/${safeTotal}）`;
        } else {
            currentStatusText.textContent = `处理中（${safeCompleted}/${safeTotal}）`;
        }
    }

    // 开始日志流
    startLogStreaming() {
        if (this.eventSource) {
            this.eventSource.close();
        }

        this.eventSource = new EventSource('/api/logs');
        const logsContainer = document.getElementById('logsContainer');
        let processedTables = 0;
        const totalTables = this.selectedTables.size;

        this.eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.type === 'log') {
                // 添加日志条目
                const logEntry = document.createElement('div');
                logEntry.className = 'log-entry';
                logEntry.textContent = data.message;
                logsContainer.appendChild(logEntry);
                
                // 自动滚动到底部
                logsContainer.scrollTop = logsContainer.scrollHeight;
            } else if (data.type === 'progress') {
                // 更新进度
                this.updateProgress(data.completed, data.total, data.current_table);
            } else if (data.type === 'complete') {
                // 生成完成
                this.generatedFilePath = data.file_path;
                this.showDownloadSection();
                this.recordExportHistory(data.file_path);
                this.eventSource.close();
                this.eventSource = null;
                
                // 发送完成通知
                this.notifyGenerationComplete(data.file_path);
            } else if (data.type === 'error') {
                // 生成错误
                const logEntry = document.createElement('div');
                logEntry.className = 'log-entry error';
                logEntry.textContent = `错误: ${data.message}`;
                logsContainer.appendChild(logEntry);
                logsContainer.scrollTop = logsContainer.scrollHeight;
                // 出错时自动展开，方便直接看到日志
                this.setProgressDrawerExpanded(true);
                
                this.eventSource.close();
                this.eventSource = null;
                this.showMessage(`生成过程中出错: ${data.message}`, 'danger');
            }
        };

        this.eventSource.onerror = (error) => {
            console.error('EventSource failed:', error);
            this.showMessage('实时日志连接失败', 'warning');
        };
    }

    // 显示下载区域
    showDownloadSection() {
        document.querySelector('.progress-bar').style.width = '100%';
        // 下载区出现时隐藏进度区，避免两个底部层叠
        const progressSection = document.getElementById('progressSection');
        if (progressSection) {
            progressSection.style.display = 'none';
        }
        const downloadSection = document.getElementById('downloadSection');
        downloadSection.style.display = 'block';
        downloadSection.classList.add('fade-in');
        this.setBottomDrawerReservedSpace(true);

        // 渲染下载抽屉信息
        this.updateDownloadDrawer();
    }

    updateDownloadDrawer() {
        const el = document.getElementById('downloadFilePath');
        if (el) {
            el.textContent = this.generatedFilePath || '';
        }
    }

    // 下载文件
    downloadFile() {
        if (this.generatedFilePath) {
            const encodedPath = encodeURIComponent(this.generatedFilePath);
            window.open(`/api/download/${encodedPath}`, '_blank');
        }
    }

    // 复制生成文件路径
    async copyGeneratedFilePath() {
        if (!this.generatedFilePath) {
            this.showMessage('没有可复制的路径', 'warning');
            return;
        }
        try {
            await navigator.clipboard.writeText(this.generatedFilePath);
            this.showMessage('路径已复制到剪贴板', 'success');
        } catch (e) {
            this.showMessage('复制失败，请手动复制', 'warning');
        }
    }

    // 打开生成文件所在文件夹（需要后端在本机运行）
    async openGeneratedFileFolder() {
        if (!this.generatedFilePath) {
            this.showMessage('没有可打开的路径', 'warning');
            return;
        }
        try {
            const resp = await fetch('/api/open_path', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: this.generatedFilePath, open_parent: true })
            });
            const result = await resp.json();
            if (result.success) {
                this.showMessage('已打开文件夹', 'success');
            } else {
                this.showMessage(`打开失败: ${result.message}`, 'warning');
            }
        } catch (e) {
            this.showMessage(`打开失败: ${e.message}`, 'warning');
        }
    }

    // =============== Phase4：导出历史（本地存储） ===============
    getExportHistory() {
        try {
            const raw = localStorage.getItem('exportHistory');
            const data = raw ? JSON.parse(raw) : [];
            return Array.isArray(data) ? data : [];
        } catch {
            return [];
        }
    }

    saveExportHistory(list) {
        try {
            localStorage.setItem('exportHistory', JSON.stringify(list || []));
        } catch {
            // ignore
        }
    }

    recordExportHistory(filePath) {
        if (!filePath) return;
        const now = Date.now();
        const entry = {
            path: filePath,
            file_name: (filePath.split(/[\\/]/).pop() || ''),
            time: now,
            selected_tables: Array.from(this.selectedTables || []),
            selected_count: (this.selectedTables && this.selectedTables.size) ? this.selectedTables.size : 0,
            incremental_mode: !!this.incrementalMode,
        };
        const list = this.getExportHistory();
        // 去重（同路径）
        const filtered = list.filter(x => x && x.path !== entry.path);
        filtered.unshift(entry);
        // 限制长度
        const capped = filtered.slice(0, 20);
        this.saveExportHistory(capped);
        this.renderExportHistory();
    }

    clearExportHistory() {
        const ok = confirm('确定要清空导出历史吗？');
        if (!ok) return;
        this.saveExportHistory([]);
        this.renderExportHistory();
        this.showMessage('已清空导出历史', 'success');
    }

    renderExportHistory() {
        const container = document.getElementById('exportHistoryList');
        if (!container) return;
        const list = this.getExportHistory();
        if (list.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted p-3">
                    <i class="fas fa-inbox mb-2 opacity-50"></i>
                    <div class="small">暂无导出历史</div>
                </div>
            `;
            return;
        }

        container.innerHTML = list.map(item => {
            const name = this.escapeHtml(item.file_name || '');
            const path = this.escapeHtml(item.path || '');
            const time = item.time ? new Date(item.time).toLocaleString('zh-CN') : '';
            const count = Number(item.selected_count || 0);
            const inc = item.incremental_mode ? '<span class="badge bg-info text-dark ms-2">增量</span>' : '';
            return `
                <div class="list-group-item d-flex justify-content-between align-items-center gap-2">
                    <div class="text-truncate">
                        <div class="d-flex align-items-center gap-2">
                            <i class="fas fa-file-alt text-primary"></i>
                            <strong class="text-truncate">${name}</strong>
                            <span class="badge bg-secondary">表 ${count}</span>
                            ${inc}
                        </div>
                        <div class="small text-muted mt-1 text-truncate">${path}</div>
                        <div class="small text-muted">${time}</div>
                    </div>
                    <div class="btn-group btn-group-sm flex-shrink-0">
                        <button type="button" class="btn btn-outline-secondary export-history-preview" data-path="${path}">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button type="button" class="btn btn-outline-primary export-history-download" data-path="${path}">
                            <i class="fas fa-download"></i>
                        </button>
                        <button type="button" class="btn btn-outline-secondary export-history-copy" data-path="${path}">
                            <i class="fas fa-copy"></i>
                        </button>
                        <button type="button" class="btn btn-outline-secondary export-history-open-folder" data-path="${path}">
                            <i class="fas fa-folder-open"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.export-history-preview').forEach(btn => {
            btn.addEventListener('click', async () => {
                const path = btn.getAttribute('data-path');
                this.generatedFilePath = path;
                this.updateDownloadDrawer();
                await this.previewDocument();
            });
        });
        container.querySelectorAll('.export-history-download').forEach(btn => {
            btn.addEventListener('click', () => {
                const path = btn.getAttribute('data-path');
                const encodedPath = encodeURIComponent(path);
                window.open(`/api/download/${encodedPath}`, '_blank');
            });
        });
        container.querySelectorAll('.export-history-copy').forEach(btn => {
            btn.addEventListener('click', async () => {
                const path = btn.getAttribute('data-path');
                try {
                    await navigator.clipboard.writeText(path);
                    this.showMessage('路径已复制到剪贴板', 'success');
                } catch {
                    this.showMessage('复制失败，请手动复制', 'warning');
                }
            });
        });
        container.querySelectorAll('.export-history-open-folder').forEach(btn => {
            btn.addEventListener('click', async () => {
                const path = btn.getAttribute('data-path');
                try {
                    const resp = await fetch('/api/open_path', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path, open_parent: true })
                    });
                    const result = await resp.json();
                    if (result.success) this.showMessage('已打开文件夹', 'success');
                    else this.showMessage(`打开失败: ${result.message}`, 'warning');
                } catch (e) {
                    this.showMessage(`打开失败: ${e.message}`, 'warning');
                }
            });
        });
    }

    // 预览文档
    async previewDocument() {
        if (!this.generatedFilePath) {
            this.showMessage('没有可预览的文档', 'warning');
            return;
        }

        try {
            // 显示预览模态框
            const modal = new bootstrap.Modal(document.getElementById('previewModal'));
            modal.show();

            // 显示加载指示器
            const loadingIndicator = document.getElementById('previewLoadingIndicator');
            const previewContent = document.getElementById('previewContent');
            
            loadingIndicator.style.display = 'block';
            previewContent.innerHTML = '';

            // 获取文档内容
            const encodedPath = encodeURIComponent(this.generatedFilePath);
            const response = await fetch(`/api/preview/${encodedPath}`);
            
            if (response.ok) {
                const result = await response.json();
                
                if (result.success) {
                    // 存储内容以供全屏预览使用
                    this.currentGeneratedContent = result.content;
                    
                    // 解析为表格选项卡格式
                    const tabsData = this.parseMarkdownToTabs(result.content);
                    
                    if (tabsData.tables.length > 1) {
                        // 多表格：在模态框中显示选项卡（由于空间限制，这里简化显示）
                        const htmlContent = this.markdownToHtml(result.content);
                        previewContent.innerHTML = `
                            <div class="alert alert-info">
                                <i class="fas fa-info-circle"></i>
                                检测到 <strong>${tabsData.tables.length}</strong> 个数据库表。
                                建议使用<strong>全屏预览</strong>或<strong>文档查看器</strong>获得更好的选项卡体验。
                            </div>
                            ${htmlContent}
                        `;
                    } else {
                        // 单表格：直接显示
                        const htmlContent = this.markdownToHtml(result.content);
                        previewContent.innerHTML = htmlContent;
                    }
                } else {
                    throw new Error(result.message || '获取文档内容失败');
                }
            } else {
                throw new Error('网络请求失败');
            }

        } catch (error) {
            console.error('预览错误:', error);
            this.showMessage(`预览失败: ${error.message}`, 'danger');
            
            // 显示错误信息
            const previewContent = document.getElementById('previewContent');
            previewContent.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle"></i>
                    预览失败: ${error.message}
                </div>
            `;
        } finally {
            // 隐藏加载指示器
            document.getElementById('previewLoadingIndicator').style.display = 'none';
        }
    }

    // 简单的Markdown转HTML转换器
    markdownToHtml(markdown) {
        if (!markdown) return '';
        
        let html = markdown;
        
        // 转换标题
        html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
        
        // 转换表格
        html = this.convertMarkdownTable(html);
        
        // 转换粗体和斜体
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        // 转换行内代码
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // 转换代码块
        html = html.replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>');
        
        // 转换链接
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
        
        // 转换换行
        html = html.replace(/\n/g, '<br>');
        
        return html;
    }

    // 转换Markdown表格为HTML表格
    convertMarkdownTable(markdown) {
        const lines = markdown.split('\n');
        let html = '';
        let inTable = false;
        let tableRows = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // 检查是否是表格行
            if (line.includes('|')) {
                if (!inTable) {
                    inTable = true;
                    tableRows = [];
                }
                
                // 跳过分隔符行
                if (line.match(/^\|[\s\-\|:]+\|$/)) {
                    continue;
                }
                
                // 处理表格行
                const cells = line.split('|').map(cell => cell.trim());
                // 移除首尾的空元素（由于行首行尾的|导致的）
                if (cells.length > 0 && cells[0] === '') cells.shift();
                if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
                tableRows.push(cells);
                
            } else {
                // 如果之前在表格中，现在结束表格
                if (inTable) {
                    html += this.renderTable(tableRows);
                    tableRows = [];
                    inTable = false;
                }
                
                // 添加非表格行
                html += line + '\n';
            }
        }
        
        // 处理最后的表格
        if (inTable && tableRows.length > 0) {
            html += this.renderTable(tableRows);
        }
        
        return html;
    }

    // 渲染HTML表格
    renderTable(rows) {
        if (rows.length === 0) return '';
        
        // 计算最大列数，确保所有行都有相同的列数
        const maxCols = Math.max(...rows.map(row => row.length));
        
        // 使用简单的table标签，让CSS样式控制显示
        let html = '<table>';
        
        // 表头
        if (rows.length > 0) {
            html += '<thead><tr>';
            for (let i = 0; i < maxCols; i++) {
                const cell = rows[0][i] || '';
                // 清理单元格内容，确保没有特殊字符影响显示
                const cleanCell = String(cell).trim();
                html += `<th>${cleanCell}</th>`;
            }
            html += '</tr></thead>';
        }
        
        // 表体
        if (rows.length > 1) {
            html += '<tbody>';
            for (let i = 1; i < rows.length; i++) {
                html += '<tr>';
                for (let j = 0; j < maxCols; j++) {
                    const cell = rows[i][j] || '';
                    // 清理单元格内容，确保没有特殊字符影响显示
                    const cleanCell = String(cell).trim();
                    html += `<td>${cleanCell}</td>`;
                }
                html += '</tr>';
            }
            html += '</tbody>';
        }
        
        html += '</table>';
        return html;
    }

    // 清理资源
    cleanup() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
    }
    
    // 切换左侧面板的折叠状态
    toggleLeftPanel() {
        // 已移除左侧折叠功能（产品布局简化：左侧导航固定展示）
    }
    
    // 切换右侧面板的折叠状态
    toggleRightPanel() {
        const rightColumn = document.getElementById('rightColumn');
        const collapseRightBtn = document.getElementById('collapseRightBtn');
        const isCollapsed = rightColumn.classList.contains('collapsed');
        // 统一交给 setRightPanelCollapsed 处理（含迷你操作条）
        this.setRightPanelCollapsed(!isCollapsed);
    }
    
    // 更新中间列的样式，根据左侧和右侧列的折叠状态
    updateMiddleColumnStyle() {
        const rightColumn = document.getElementById('rightColumn');
        const middleColumn = document.querySelector('.middle-column');
        
        // 移除所有中间列的样式类
        middleColumn.classList.remove('right-collapsed');
        const isRightCollapsed = rightColumn.classList.contains('collapsed');

        if (isRightCollapsed) {
            // 右侧折叠：中间扩展占满剩余空间
            middleColumn.classList.add('right-collapsed');
        }
    }

    // 检查表和字段的描述状态
    async checkTableDescriptionStatus(tableName, listItem) {
        try {
            const config = {...this.currentConnection};
            config.table_name = tableName;
            
            const response = await fetch('/api/get_table_detail', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(config)
            });

            const result = await response.json();
            if (result.success) {
                const tableInfo = result.table_info;
                const fields = result.fields;
                
                // 检查表说明是否为空
                const hasEmptyTableDescription = !tableInfo.comment || tableInfo.comment.trim() === '';
                
                // 检查字段说明是否有空值
                const hasEmptyFieldDescriptions = fields.some(field => !field.comment || field.comment.trim() === '');
                
                const isMissing = hasEmptyTableDescription || hasEmptyFieldDescriptions;
                listItem.dataset.missingDesc = isMissing ? '1' : '0';
                listItem.classList.toggle('table-missing-desc', isMissing);

                if (isMissing) {
                    this.missingDescTables.add(tableName);
                } else {
                    this.missingDescTables.delete(tableName);
                }

                // 渲染“待补充”标识
                const flags = listItem.querySelector('.table-flags');
                if (flags) {
                    flags.innerHTML = isMissing ? '<span class="badge bg-danger">待补充</span>' : '';
                }

                this.updateTablesStats();
                this.applyTableFilters();
            }
        } catch (error) {
            console.error(`检查表描述状态失败: ${error.message}`);
        }
    }

    // 初始化文档查看器
    initDocumentViewer() {
        // 检查文档查看器相关元素是否存在
        const dropZone = document.getElementById('dropZone');
        if (!dropZone) {
            // 如果文档查看器相关元素不存在，则跳过初始化
            return;
        }

        const fileInput = document.getElementById('fileInput');
        const selectFileBtn = document.getElementById('selectFileBtn');
        const clearFileBtn = document.getElementById('clearFileBtn');
        const copyContentBtn = document.getElementById('copyContentBtn');
        const downloadContentBtn = document.getElementById('downloadContentBtn');

        // 当前文件信息
        this.currentFile = null;
        this.currentFileContent = null;

        // 拖放事件
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileUpload(files[0]);
            }
        });

        // 点击选择文件
        if (selectFileBtn) {
            selectFileBtn.addEventListener('click', () => {
                if (fileInput) {
                    fileInput.click();
                }
            });
        }

        // 文件选择事件
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleFileUpload(e.target.files[0]);
                }
            });
        }

        // 清除文件
        if (clearFileBtn) {
            clearFileBtn.addEventListener('click', () => {
                this.clearFile();
            });
        }

        // 复制内容
        if (copyContentBtn) {
            copyContentBtn.addEventListener('click', () => {
                this.copyContent();
            });
        }

        // 下载文件
        if (downloadContentBtn) {
            downloadContentBtn.addEventListener('click', () => {
                this.downloadCurrentFile();
            });
        }

        // 全屏预览按钮
        const fullscreenBtn = document.getElementById('fullscreenBtn');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => {
                this.openFullscreenPreview();
            });
        }

        // 全屏模式下的按钮
        const fullscreenCopyBtn = document.getElementById('fullscreenCopyBtn');
        if (fullscreenCopyBtn) {
            fullscreenCopyBtn.addEventListener('click', () => {
                this.copyCurrentContent();
            });
        }

        const fullscreenDownloadBtn = document.getElementById('fullscreenDownloadBtn');
        if (fullscreenDownloadBtn) {
            fullscreenDownloadBtn.addEventListener('click', () => {
                this.downloadCurrentContent();
            });
        }

        // 最近打开文件相关
        this.initRecentFiles();
        
        // 监听选项卡切换事件，确保切换到文档查看器时显示最近文件
        const viewerTab = document.getElementById('viewer-tab');
        if (viewerTab) {
            viewerTab.addEventListener('click', () => {
                // 延迟一点时间确保DOM已更新
                setTimeout(() => {
                    this.updateRecentFilesDisplay();
                }, 100);
            });
        }
    }

    // 处理文件上传
    handleFileUpload(file) {
        const dropZone = document.getElementById('dropZone');
        
        // 检查文件类型
        if (!file.name.toLowerCase().endsWith('.md') && !file.name.toLowerCase().endsWith('.markdown')) {
            this.showMessage('请选择 .md 或 .markdown 格式的文件', 'warning');
            dropZone.classList.add('error');
            setTimeout(() => {
                dropZone.classList.remove('error');
            }, 2000);
            return;
        }

        // 检查文件大小（限制为5MB）
        if (file.size > 5 * 1024 * 1024) {
            this.showMessage('文件大小不能超过5MB', 'warning');
            dropZone.classList.add('error');
            setTimeout(() => {
                dropZone.classList.remove('error');
            }, 2000);
            return;
        }

        // 读取文件内容
        const reader = new FileReader();
        reader.onload = (e) => {
            this.currentFile = file;
            this.currentFileContent = e.target.result;
            this.displayFileInfo(file);
            this.previewMarkdown(e.target.result);
            
            // 保存到最近打开列表
            this.saveRecentFile(file, e.target.result);
            
            // 显示成功状态
            dropZone.classList.add('success');
            setTimeout(() => {
                dropZone.classList.remove('success');
            }, 1000);
        };

        reader.onerror = () => {
            this.showMessage('文件读取失败', 'danger');
            dropZone.classList.add('error');
            setTimeout(() => {
                dropZone.classList.remove('error');
            }, 2000);
        };

        reader.readAsText(file, 'UTF-8');
    }

    // 显示文件信息
    displayFileInfo(file) {
        const fileInfoSection = document.getElementById('fileInfoSection');
        const fileInfo = document.getElementById('fileInfo');
        
        const fileSize = this.formatFileSize(file.size);
        const lastModified = new Date(file.lastModified).toLocaleString('zh-CN');
        
        fileInfo.innerHTML = `
            <i class="fas fa-file-alt text-primary"></i>
            <strong>${file.name}</strong>
            <span class="text-muted">| ${fileSize} | ${lastModified}</span>
        `;
        
        fileInfoSection.style.display = 'block';
    }

    // 预览Markdown内容
    previewMarkdown(content) {
        const previewSection = document.getElementById('viewerPreviewSection');
        const previewContent = document.getElementById('viewerPreviewContent');
        
        // 解析为表格选项卡格式
        const tabsData = this.parseMarkdownToTabs(content);
        
        if (tabsData.tables.length > 1) {
            // 多表格：显示选项卡（事件绑定在renderTabsInterface中已经处理）
            this.renderTabsInterface(tabsData, 'viewerPreviewContent', 'tablesTabsContainer', 'tablesTabs');
        } else {
            // 单表格或无表格：直接显示内容
            const htmlContent = this.markdownToHtml(content);
            previewContent.innerHTML = htmlContent;
            document.getElementById('tablesTabsContainer').style.display = 'none';
        }
        
        previewSection.style.display = 'block';
        
        // 滚动到预览区域
        previewSection.scrollIntoView({ behavior: 'smooth' });
    }

    // 清除文件
    clearFile() {
        this.currentFile = null;
        this.currentFileContent = null;
        
        document.getElementById('fileInfoSection').style.display = 'none';
        document.getElementById('viewerPreviewSection').style.display = 'none';
        document.getElementById('fileInput').value = '';
        
        const dropZone = document.getElementById('dropZone');
        dropZone.classList.remove('success', 'error');
        
        this.showMessage('文件已清除', 'info');
    }

    // 复制内容
    copyContent() {
        if (!this.currentFileContent) {
            this.showMessage('没有可复制的内容', 'warning');
            return;
        }

        navigator.clipboard.writeText(this.currentFileContent).then(() => {
            this.showMessage('内容已复制到剪贴板', 'success');
        }).catch(() => {
            // 降级方案：使用textarea
            const textarea = document.createElement('textarea');
            textarea.value = this.currentFileContent;
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                this.showMessage('内容已复制到剪贴板', 'success');
            } catch (err) {
                this.showMessage('复制失败，请手动复制', 'danger');
            }
            document.body.removeChild(textarea);
        });
    }

    // 下载当前文件
    downloadCurrentFile() {
        if (!this.currentFile || !this.currentFileContent) {
            this.showMessage('没有可下载的文件', 'warning');
            return;
        }

        const blob = new Blob([this.currentFileContent], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.currentFile.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showMessage('文件下载已开始', 'success');
    }

    // 格式化文件大小
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 解析Markdown为表格选项卡数据
    parseMarkdownToTabs(markdown) {
        console.log('开始解析Markdown:', markdown.substring(0, 200) + '...');
        
        const lines = markdown.split('\n');
        const tables = [];
        let currentTable = null;
        let tableIndex = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // 检测表格标题 - 支持多种格式
            const tableMatches = [
                line.match(/^表[:：]\s*(.+)$/),               // 表: table_name (数据库生成器格式)
                line.match(/^##\s+表[:：]\s*(.+)/),           // ## 表: table_name
                line.match(/^##\s+(.+表)$/),                 // ## table_name表
                line.match(/^##\s+(.+)$/),                   // ## table_name (任何二级标题)
                line.match(/^#\s+(.+表)$/),                  // # table_name表
                line.match(/^#{1,3}\s+(.+)$/)                // 任何1-3级标题
            ];
            
            // 找到第一个匹配的格式
            let tableMatch = null;
            let tableName = null;
            
            for (const match of tableMatches) {
                if (match && match[1]) {
                    tableMatch = match;
                    tableName = match[1].trim();
                    break;
                }
            }
            
            // 如果找到表格标题
            if (tableMatch) {
                console.log('找到表格标题:', tableName, '行号:', i);
                
                // 保存上一个表格
                if (currentTable) {
                    console.log('保存前一个表格:', currentTable.name, '内容长度:', currentTable.content.length);
                    tables.push(currentTable);
                }
                
                // 开始新表格
                currentTable = {
                    id: `table-${++tableIndex}`,
                    name: tableName,
                    content: '',
                    startLine: i
                };
                
                // 不包含标题行在内容中
                continue;
            }
            
            // 将内容添加到当前表格
            if (currentTable) {
                currentTable.content += line + '\n';
            } else if (i === 0) {
                // 如果第一行就不是标题，创建默认表格
                currentTable = {
                    id: `table-${++tableIndex}`,
                    name: '文档内容',
                    content: line + '\n',
                    startLine: i
                };
            }
        }
        
        // 添加最后一个表格
        if (currentTable) {
            console.log('保存最后一个表格:', currentTable.name, '内容长度:', currentTable.content.length);
            tables.push(currentTable);
        }

        // 如果没有找到表格结构，创建一个默认表格
        if (tables.length === 0) {
            console.log('没有找到表格，创建默认表格');
            tables.push({
                id: 'table-1',
                name: '文档内容',
                content: markdown,
                startLine: 0
            });
        }

        // 清理空表格
        const validTables = tables.filter(table => table.content.trim().length > 0);
        
        console.log('解析完成，有效表格数量:', validTables.length);
        validTables.forEach((table, index) => {
            console.log(`表格 ${index + 1}: ${table.name}, 内容长度: ${table.content.length}`);
        });
        
        if (validTables.length === 0) {
            return {
                tables: [{
                    id: 'table-1',
                    name: '文档内容',
                    content: markdown,
                    startLine: 0
                }],
                totalTables: 1
            };
        }

        return {
            tables: validTables,
            totalTables: validTables.length
        };
    }

    // 渲染表格选项卡界面
    renderTabsInterface(tabsData, contentContainerId, tabsContainerId, tabsListId) {
        const contentContainer = document.getElementById(contentContainerId);
        const tabsContainer = document.getElementById(tabsContainerId);
        const tabsList = document.getElementById(tabsListId);

        // 清空容器
        tabsList.innerHTML = '';
        contentContainer.innerHTML = '';

        // 创建选项卡导航
        tabsData.tables.forEach((table, index) => {
            const tabId = `${table.id}-tab`;
            const isActive = index === 0;

            // 创建选项卡按钮
            const tabButton = document.createElement('li');
            tabButton.className = 'nav-item';
            tabButton.innerHTML = `
                <button class="nav-link ${isActive ? 'active' : ''}" 
                        id="${tabId}" 
                        data-bs-toggle="pill" 
                        data-bs-target="#${table.id}" 
                        type="button" 
                        role="tab" 
                        aria-controls="${table.id}" 
                        aria-selected="${isActive}">
                    <span class="table-index">${index + 1}</span>
                    <i class="fas fa-table"></i>
                    ${table.name}
                </button>
            `;
            tabsList.appendChild(tabButton);

            console.log(`创建选项卡 ${index + 1}:`, {
                tabId: tabId,
                tableId: table.id,
                targetId: `#${table.id}`,
                tableName: table.name,
                isActive: isActive
            });

            // 创建表格内容
            const tableContent = document.createElement('div');
            tableContent.className = `table-content ${isActive ? 'active' : ''}`;
            tableContent.id = table.id;
            tableContent.setAttribute('role', 'tabpanel');
            tableContent.setAttribute('aria-labelledby', tabId);

            // 解析表格内容为HTML
            const htmlContent = this.markdownToHtml(table.content);
            
            // 统计表格信息
            const tableStats = this.getTableStats(table.content);
            
            console.log(`渲染表格 ${table.name}:`, {
                contentLength: table.content.length,
                htmlContentLength: htmlContent.length,
                stats: tableStats
            });
            
            tableContent.innerHTML = `
                <h3>
                    <i class="fas fa-table"></i>
                    ${table.name}
                </h3>
                <div class="table-stats">
                    <h6><i class="fas fa-info-circle"></i> 表格统计</h6>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <div class="stat-number">${tableStats.fields}</div>
                            <div class="stat-label">字段数</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-number">${tableStats.primaryKeys}</div>
                            <div class="stat-label">主键</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-number">${tableStats.indexes}</div>
                            <div class="stat-label">索引</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-number">${tableStats.nullableFields}</div>
                            <div class="stat-label">可空字段</div>
                        </div>
                    </div>
                </div>
                ${htmlContent}
            `;
            
            contentContainer.appendChild(tableContent);
            
            console.log(`表格内容已添加到容器:`, {
                tableId: table.id,
                containerChildren: contentContainer.children.length,
                htmlLength: tableContent.innerHTML.length,
                hasActiveClass: tableContent.classList.contains('active')
            });
        });

        // 显示选项卡容器
        tabsContainer.style.display = 'block';

        // 延迟添加选项卡切换事件，确保DOM完全渲染
        setTimeout(() => {
            this.addTabSwitchEvents(tabsListId, contentContainerId);
        }, 300);
    }

    // 获取表格统计信息
    getTableStats(content) {
        const lines = content.split('\n');
        let fields = 0;
        let primaryKeys = 0;
        let indexes = 0;
        let nullableFields = 0;

        // 简单统计表格行数（排除表头和分隔符）
        let inTable = false;
        for (const line of lines) {
            if (line.includes('|') && !line.match(/^\|[\s\-\|:]+\|$/)) {
                if (!inTable) {
                    inTable = true;
                    continue; // 跳过表头
                }
                fields++;
                
                // 检测主键、索引、可空字段等
                if (line.toLowerCase().includes('primary') || line.toLowerCase().includes('主键')) {
                    primaryKeys++;
                }
                if (line.toLowerCase().includes('index') || line.toLowerCase().includes('索引')) {
                    indexes++;
                }
                if (line.toLowerCase().includes('yes') || line.toLowerCase().includes('null') || line.toLowerCase().includes('可空')) {
                    nullableFields++;
                }
            } else if (inTable && !line.trim()) {
                break; // 表格结束
            }
        }

        return {
            fields: Math.max(0, fields),
            primaryKeys: Math.max(0, primaryKeys),
            indexes: Math.max(0, indexes),
            nullableFields: Math.max(0, nullableFields)
        };
    }

    // 添加选项卡切换事件
    addTabSwitchEvents(tabsListId, contentContainerId) {
        const tabsList = document.getElementById(tabsListId);
        const contentContainer = document.getElementById(contentContainerId);
        
        if (!tabsList || !contentContainer) {
            console.error('选项卡容器不存在:', tabsListId, contentContainerId);
            return;
        }

        const tabButtons = tabsList.querySelectorAll('.nav-link');
        
        if (tabButtons.length === 0) {
            console.warn('没有找到选项卡按钮');
            return;
        }

        console.log('绑定选项卡切换事件:', tabButtons.length, '个按钮');
        console.log('内容容器中的表格数量:', contentContainer.querySelectorAll('.table-content').length);

        tabButtons.forEach((button, index) => {
            // 清除之前的事件监听器（如果有的话）
            button.removeEventListener('click', this.handleTabClick);
            
            // 添加新的事件监听器
            const handleClick = (e) => {
                e.preventDefault();
                console.log('点击选项卡:', index, button.getAttribute('data-bs-target'));
                
                // 获取所有相关元素
                const allContents = contentContainer.querySelectorAll('.table-content');
                console.log('找到的内容元素数量:', allContents.length);
                console.log('所有内容元素的ID:', Array.from(allContents).map(c => c.id));
                
                // 移除所有活动状态
                tabButtons.forEach(btn => btn.classList.remove('active'));
                allContents.forEach(content => {
                    content.classList.remove('active');
                });

                // 添加当前活动状态
                button.classList.add('active');
                
                // 多种方式查找目标元素
                let targetContent = null;
                
                // 方法1：通过data-bs-target属性
                const targetId = button.getAttribute('data-bs-target');
                if (targetId) {
                    const targetElementId = targetId.startsWith('#') ? targetId.substring(1) : targetId;
                    targetContent = contentContainer.querySelector(`#${targetElementId}`);
                    console.log('方法1 - 通过ID查找:', targetElementId, '找到:', !!targetContent);
                }
                
                // 方法2：通过索引查找
                if (!targetContent && index < allContents.length) {
                    targetContent = allContents[index];
                    console.log('方法2 - 通过索引查找:', index, '找到:', !!targetContent);
                }
                
                // 方法3：遍历查找
                if (!targetContent) {
                    const targetId = button.getAttribute('data-bs-target');
                    if (targetId) {
                        const targetElementId = targetId.startsWith('#') ? targetId.substring(1) : targetId;
                        targetContent = Array.from(allContents).find(content => content.id === targetElementId);
                        console.log('方法3 - 遍历查找:', targetElementId, '找到:', !!targetContent);
                    }
                }
                
                if (targetContent) {
                    targetContent.classList.add('active');
                    console.log('激活内容元素:', targetContent.id);
                } else {
                    console.error('未找到目标内容元素:', button.getAttribute('data-bs-target'));
                }
            };
            
            button.addEventListener('click', handleClick);
        });
    }

    // 处理选项卡点击
    handleTabClick(e) {
        e.preventDefault();
        console.log('handleTabClick called');
    }

    // 打开全屏预览
    openFullscreenPreview() {
        if (!this.currentFileContent) {
            this.showMessage('没有可预览的内容', 'warning');
            return;
        }
        
        // 解析内容为选项卡数据
        const tabsData = this.parseMarkdownToTabs(this.currentFileContent);
        
        // 保存当前内容到localStorage，以便在全屏页面中访问
        localStorage.setItem('fullscreenPreviewContent', JSON.stringify(tabsData));
        localStorage.setItem('fullscreenPreviewFileName', this.currentFile ? this.currentFile.name : '未命名文档.md');
        
        // 打开全屏预览页面
        window.open('/fullscreen', '_blank');
    }

    // 从预览打开全屏预览
    openFullscreenFromPreview() {
        if (!this.currentGeneratedContent) {
            this.showMessage('没有可预览的内容', 'warning');
            return;
        }
        
        // 解析内容为选项卡数据
        const tabsData = this.parseMarkdownToTabs(this.currentGeneratedContent);
        
        // 保存当前内容到localStorage，以便在全屏页面中访问
        localStorage.setItem('fullscreenPreviewContent', JSON.stringify(tabsData));
        localStorage.setItem('fullscreenPreviewFileName', this.generatedFilePath ? this.generatedFilePath.split('/').pop() : '生成的文档.md');
        
        // 打开全屏预览页面
        window.open('/fullscreen', '_blank');
    }

    // 复制当前内容（用于全屏模式）
    copyCurrentContent() {
        const content = localStorage.getItem('fullscreenPreviewContent');
        if (content) {
            const parsedContent = JSON.parse(content);
            let fullContent = '';
            parsedContent.tables.forEach(table => {
                fullContent += `## ${table.name}\n${table.content}\n`;
            });
            
            navigator.clipboard.writeText(fullContent).then(() => {
                this.showMessage('内容已复制到剪贴板', 'success');
            }).catch(() => {
                this.showMessage('复制失败，请手动复制', 'danger');
            });
        } else {
            this.showMessage('没有可复制的内容', 'warning');
        }
    }

    // 下载当前内容（用于全屏模式）
    downloadCurrentContent() {
        const content = localStorage.getItem('fullscreenPreviewContent');
        const fileName = localStorage.getItem('fullscreenPreviewFileName') || '未命名文档.md';
        
        if (content) {
            const parsedContent = JSON.parse(content);
            let fullContent = '';
            parsedContent.tables.forEach(table => {
                fullContent += `## ${table.name}\n${table.content}\n`;
            });
            
            const blob = new Blob([fullContent], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showMessage('文件下载已开始', 'success');
        } else {
            this.showMessage('没有可下载的内容', 'warning');
        }
    }

    // 初始化最近打开文件
    initRecentFiles() {
        // 实现最近打开文件功能
        this.updateRecentFilesDisplay();
    }

    // 保存最近打开的文件
    saveRecentFile(file, content) {
        // 实现保存最近打开文件功能
        const recentFiles = JSON.parse(localStorage.getItem('recentFiles') || '[]');
        
        // 检查文件是否已存在
        const existingIndex = recentFiles.findIndex(item => item.name === file.name);
        if (existingIndex !== -1) {
            // 如果已存在，移除旧条目
            recentFiles.splice(existingIndex, 1);
        }
        
        // 添加到最近打开文件列表开头
        recentFiles.unshift({
            name: file.name,
            path: file.name, // 仅保存文件名，不保存完整路径
            size: file.size,
            lastModified: file.lastModified,
            preview: content.substring(0, 200) + '...' // 保存预览内容
        });
        
        // 限制最近文件数量为10个
        if (recentFiles.length > 10) {
            recentFiles.pop();
        }
        
        localStorage.setItem('recentFiles', JSON.stringify(recentFiles));
        
        // 更新显示
        this.updateRecentFilesDisplay();
    }

    // 更新最近打开文件显示
    updateRecentFilesDisplay() {
        const recentFilesList = document.getElementById('recentFilesList');
        if (!recentFilesList) return;
        
        const recentFiles = JSON.parse(localStorage.getItem('recentFiles') || '[]');
        
        if (recentFiles.length === 0) {
            document.getElementById('noRecentFiles').style.display = 'block';
            recentFilesList.innerHTML = '';
            return;
        }
        
        document.getElementById('noRecentFiles').style.display = 'none';
        
        recentFilesList.innerHTML = recentFiles.map(file => `
            <div class="recent-file-item" data-file-name="${file.name}">
                <div class="file-info">
                    <i class="fas fa-file-alt text-primary"></i>
                    <div>
                        <strong>${file.name}</strong>
                        <small class="d-block text-muted">
                            ${this.formatFileSize(file.size)} | ${new Date(file.lastModified).toLocaleString('zh-CN')}
                        </small>
                    </div>
                </div>
                <div class="file-actions">
                    <button class="btn btn-sm btn-outline-secondary" onclick="dbDocGenerator.openRecentFile('${file.name}')">
                        <i class="fas fa-eye"></i> 查看
                    </button>
                </div>
            </div>
        `).join('');
    }

    // 打开最近文件
    openRecentFile(fileName) {
        // 实现打开最近文件功能
        // 注意：这里我们没有保存完整文件路径，所以只能提示用户重新选择文件
        this.showMessage('请重新选择文件以查看完整内容', 'info');
        document.getElementById('fileInput').click();
    }

    // 初始化数据库管理器
    initDatabaseManager() {
        // 实现数据库管理器初始化
    }

    // 初始化通知权限
    initNotificationPermission() {
        // 检查浏览器是否支持通知
        if ('Notification' in window) {
            // 请求通知权限
            Notification.requestPermission().then(permission => {
                this.notificationPermission = permission;
            });
        }
    }

    // 发送生成完成通知
    notifyGenerationComplete(filePath) {
        // 如果浏览器支持通知且已获得权限，则发送通知
        if ('Notification' in window && this.notificationPermission === 'granted') {
            new Notification('文档生成完成', {
                body: `您的数据库文档已成功生成，文件名：${filePath.split('/').pop()}`,
                icon: '/static/img/favicon.ico'
            });
        } else {
            // 否则闪烁页面标题
            this.flashTitle('文档生成完成！');
        }
    }

    // 闪烁页面标题
    flashTitle(message) {
        // 清除之前的定时器
        if (this.titleFlashInterval) {
            clearInterval(this.titleFlashInterval);
        }
        
        let isOriginal = true;
        this.titleFlashInterval = setInterval(() => {
            document.title = isOriginal ? message : this.originalTitle;
            isOriginal = !isOriginal;
        }, 1000);
        
        // 5秒后恢复原始标题
        setTimeout(() => {
            this.restoreTitle();
        }, 5000);
    }

    // 恢复原始页面标题
    restoreTitle() {
        if (this.titleFlashInterval) {
            clearInterval(this.titleFlashInterval);
            this.titleFlashInterval = null;
        }
        document.title = this.originalTitle;
    }
}

// 页面加载完成后初始化应用
let dbDocGenerator;
document.addEventListener('DOMContentLoaded', () => {
    dbDocGenerator = new DatabaseDocGenerator();
});

// 页面关闭时清理资源
window.addEventListener('beforeunload', () => {
    if (dbDocGenerator) {
        dbDocGenerator.cleanup();
    }
});

// Toast消息函数
function showToast(message, type = 'info') {
    // 统一使用固定容器，避免多条 toast 固定定位导致重叠
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container position-fixed top-0 end-0 p-3';
        container.style.zIndex = '9999';
        document.body.appendChild(container);
    }

    // 创建Toast元素
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type} border-0`;
    toast.role = "alert";
    toast.setAttribute("aria-live", "assertive");
    toast.setAttribute("aria-atomic", "true");
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;
    
    // 添加到容器（自然流式堆叠）
    container.appendChild(toast);
    
    // 初始化并显示Toast
    const bsToast = new bootstrap.Toast(toast, { delay: 3000, autohide: true });
    bsToast.show();

    // Toast 隐藏后移除，避免残留
    toast.addEventListener('hidden.bs.toast', () => {
        toast.remove();
    });
}