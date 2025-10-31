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
        this.bindEvents();
        this.loadSavedConfig();
        this.loadConnectionHistory();
        this.setDefaultOutputPath();
        this.initDatabaseManager();
    }

    bindEvents() {
        // 防止重复绑定事件
        if (this.eventsbound) {
            return;
        }
        this.eventsbound = true;
        
        // 测试连接按钮
        document.getElementById('testConnectionBtn').addEventListener('click', () => {
            this.testConnection();
        });

        // 获取表列表按钮
        document.getElementById('getTablesBtn').addEventListener('click', () => {
            this.getTablesList();
        });

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

        // 表格折叠按钮
        document.getElementById('toggleTablesBtn').addEventListener('click', () => {
            this.toggleTablesCollapse();
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
        document.getElementById('previewBtn').addEventListener('click', () => {
            this.previewDocument();
        });

        // 预览模态框中的下载按钮
        document.getElementById('downloadFromPreviewBtn').addEventListener('click', () => {
            this.downloadFile();
        });

        // 预览模态框中的全屏按钮
        document.getElementById('fullscreenFromPreviewBtn').addEventListener('click', () => {
            this.openFullscreenFromPreview();
        });

        // 数据库类型切换处理
        document.getElementById('dbType').addEventListener('change', (e) => {
            this.onDbTypeChange(e.target.value);
        });

        // 连接历史相关事件
        document.getElementById('connectionHistory').addEventListener('change', (e) => {
            this.loadConnectionFromHistory(e.target.value);
        });

        document.getElementById('deleteConnectionBtn').addEventListener('click', () => {
            this.deleteSelectedConnection();
        });

        document.getElementById('clearFormBtn').addEventListener('click', () => {
            this.clearConnectionForm();
        });

        // 保存配置
        document.getElementById('dbConfigForm').addEventListener('change', () => {
            this.saveConfig();
        });

        // 文档查看器相关事件
        this.initDocumentViewer();
    }

    // 加载保存的配置
    loadSavedConfig() {
        const config = localStorage.getItem('dbConfig');
        if (config) {
            const parsedConfig = JSON.parse(config);
            Object.keys(parsedConfig).forEach(key => {
                const element = document.getElementById(key);
                if (element) {
                    element.value = parsedConfig[key];
                }
            });
        }
    }

    // 保存配置到本地存储
    saveConfig() {
        const config = {
            dbType: document.getElementById('dbType').value,
            host: document.getElementById('host').value,
            port: document.getElementById('port').value,
            user: document.getElementById('user').value,
            password: document.getElementById('password').value,
            database: document.getElementById('database').value
        };
        localStorage.setItem('dbConfig', JSON.stringify(config));
    }

    // 数据库类型切换处理
    onDbTypeChange(dbType) {
        const portInput = document.getElementById('port');
        const currentPort = portInput.value;
        
        // 如果当前端口是默认端口，则自动切换
        if (dbType === 'mysql' && (currentPort === '1433' || currentPort === '')) {
            portInput.value = '3306';
        } else if (dbType === 'sqlserver' && (currentPort === '3306' || currentPort === '')) {
            portInput.value = '1433';
        }
        
        // 保存配置
        this.saveConfig();
    }

    // 获取数据库配置
    getDbConfig() {
        return {
            db_type: document.getElementById('dbType').value,
            host: document.getElementById('host').value,
            user: document.getElementById('user').value,
            password: document.getElementById('password').value,
            port: document.getElementById('port').value,
            database: document.getElementById('database').value
        };
    }

    // 显示加载状态
    showLoading() {
        document.getElementById('loadingOverlay').style.display = 'flex';
    }

    // 隐藏加载状态
    hideLoading() {
        document.getElementById('loadingOverlay').style.display = 'none';
    }

    // 显示消息 - 使用Toast方式避免页面跳动
    showMessage(message, type = 'info') {
        // 直接调用showToast函数，避免页面跳动
        showToast(message, type);
    }

    // 测试数据库连接
    async testConnection() {
        console.log('testConnection called');
        this.showLoading();
        
        try {
            const config = this.getDbConfig();
            const response = await fetch('/api/test_connection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(config)
            });

            const result = await response.json();
            
            if (result.success) {
                console.log('Showing success message');
                this.showMessage('数据库连接成功！', 'success');
                // 连接成功后保存到历史记录
                this.saveConnectionToHistory(config);
                // 加载数据库列表供选择
                await this.loadDatabasesList();
            } else {
                console.log('Showing error message');
                this.showMessage(`连接失败: ${result.message}`, 'danger');
            }
        } catch (error) {
            console.log('Showing catch error message');
            this.showMessage(`连接错误: ${error.message}`, 'danger');
        } finally {
            this.hideLoading();
        }
    }

    // 获取表列表
    async getTablesList() {
        this.showLoading();
        
        try {
            const config = this.getDbConfig();
            const response = await fetch('/api/get_tables', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(config)
            });

            const result = await response.json();
            
            if (result.success) {
                this.displayTables(result.tables);
                this.showMessage(`成功获取到 ${result.tables.length} 个表`, 'success');
            } else {
                this.showMessage(`获取表列表失败: ${result.message}`, 'danger');
            }
        } catch (error) {
            this.showMessage(`获取表列表错误: ${error.message}`, 'danger');
        } finally {
            this.hideLoading();
        }
    }
    
    // 加载数据库列表
    async loadDatabasesList() {
        try {
            const config = this.getDbConfig();
            const payload = {
                db_type: config.db_type,
                host: config.host,
                user: config.user,
                password: config.password,
                port: config.port
            };
            const response = await fetch('/api/list_databases', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (result.success) {
                const databases = Array.isArray(result.databases) ? result.databases : [];
                this.renderDatabaseDatalist(databases);
            } else {
                this.showMessage(`加载数据库列表失败: ${result.message}`, 'warning');
            }
        } catch (error) {
            this.showMessage(`加载数据库列表错误: ${error.message}`, 'danger');
        }
    }


    // 渲染datalist建议
    renderDatabaseDatalist(databases) {
        const datalist = document.getElementById('databaseOptions');
        if (!datalist) return;
        datalist.innerHTML = '';
        if (!Array.isArray(databases) || databases.length === 0) {
            return;
        }
        databases.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            datalist.appendChild(opt);
        });
    }

    // 显示表列表
    displayTables(tables) {
        const container = document.getElementById('tablesContainer');
        container.innerHTML = '';

        tables.forEach(tableData => {
            // 处理表数据：如果是数组/元组，取第一个元素作为表名
            let tableName, tableType, tableComment;
            
            if (Array.isArray(tableData)) {
                // 数组格式：[table_name, table_type, table_comment]
                tableName = tableData[0];
                tableType = tableData[1] || '';
                tableComment = tableData[2] || '';
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

            const checkboxDiv = document.createElement('div');
            checkboxDiv.className = 'col-md-4 col-sm-6 mb-2';
            
            // 构建显示标签，包含表名和类型信息
            let displayLabel = tableName;
            if (tableType && tableType !== 'BASE TABLE') {
                displayLabel += ` (${tableType})`;
            }
            
            checkboxDiv.innerHTML = `
                <div class="table-checkbox-item" title="${tableComment || tableName}">
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" value="${tableName}" id="table_${tableName}">
                        <label class="form-check-label" for="table_${tableName}">
                            ${displayLabel}
                        </label>
                    </div>
                </div>
            `;
            container.appendChild(checkboxDiv);

            // 添加点击事件
            const checkbox = checkboxDiv.querySelector('input[type="checkbox"]');
            const item = checkboxDiv.querySelector('.table-checkbox-item');
            
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    this.selectedTables.add(tableName);
                    item.classList.add('selected');
                } else {
                    this.selectedTables.delete(tableName);
                    item.classList.remove('selected');
                }
                this.updateGenerateButton();
                
                // 如果是增量更新模式，更新新表格信息
                if (this.incrementalMode && this.existingTables.length > 0) {
                    this.updateNewTablesInfo();
                }
            });
        });

        // 显示表选择区域
        document.getElementById('tablesSection').style.display = 'block';
        document.getElementById('tablesSection').classList.add('fade-in');
        
        // 显示数据库功能介绍区域
        document.getElementById('dbDescriptionSection').style.display = 'block';
        document.getElementById('dbDescriptionSection').classList.add('fade-in');
        
        // 显示文件保存设置区域
        document.getElementById('outputSection').style.display = 'block';
        document.getElementById('outputSection').classList.add('fade-in');
        
        // 生成默认文件名
        this.generateFileName();
    }

    // 全选表
    selectAllTables() {
        const checkboxes = document.querySelectorAll('#tablesContainer input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
            this.selectedTables.add(checkbox.value);
            checkbox.closest('.table-checkbox-item').classList.add('selected');
        });
        this.updateGenerateButton();
    }

    // 取消全选
    deselectAllTables() {
        const checkboxes = document.querySelectorAll('#tablesContainer input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
            this.selectedTables.delete(checkbox.value);
            checkbox.closest('.table-checkbox-item').classList.remove('selected');
        });
        this.updateGenerateButton();
    }

    // 更新生成按钮状态
    updateGenerateButton() {
        const generateBtn = document.getElementById('generateBtn');
        generateBtn.disabled = this.selectedTables.size === 0 || !this.outputPath;
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
            const config = this.getDbConfig();
            config.tables = Array.from(this.selectedTables);
            config.output_path = this.outputPath;
            config.file_name = this.fileName;
            
            // 获取数据库功能介绍
            const dbDescription = document.getElementById('dbDescription').value.trim();
            config.db_description = dbDescription;
            
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
        }
    }

    // 显示进度区域
    showProgressSection() {
        const progressSection = document.getElementById('progressSection');
        progressSection.style.display = 'block';
        progressSection.classList.add('slide-down');
        
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
        const downloadSection = document.getElementById('downloadSection');
        downloadSection.style.display = 'block';
        downloadSection.classList.add('fade-in');
    }

    // 下载文件
    downloadFile() {
        if (this.generatedFilePath) {
            const encodedPath = encodeURIComponent(this.generatedFilePath);
            window.open(`/api/download/${encodedPath}`, '_blank');
        }
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

    // 初始化文档查看器
    initDocumentViewer() {
        const dropZone = document.getElementById('dropZone');
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
        selectFileBtn.addEventListener('click', () => {
            fileInput.click();
        });

        dropZone.addEventListener('click', () => {
            fileInput.click();
        });

        // 文件选择事件
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileUpload(e.target.files[0]);
            }
        });

        // 清除文件
        clearFileBtn.addEventListener('click', () => {
            this.clearFile();
        });

        // 复制内容
        copyContentBtn.addEventListener('click', () => {
            this.copyContent();
        });

        // 下载文件
        downloadContentBtn.addEventListener('click', () => {
            this.downloadCurrentFile();
        });

        // 全屏预览按钮
        const fullscreenBtn = document.getElementById('fullscreenBtn');
        fullscreenBtn.addEventListener('click', () => {
            this.openFullscreenPreview();
        });

        // 全屏模式下的按钮
        document.getElementById('fullscreenCopyBtn').addEventListener('click', () => {
            this.copyCurrentContent();
        });

        document.getElementById('fullscreenDownloadBtn').addEventListener('click', () => {
            this.downloadCurrentContent();
        });

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
                
                // 方法3：通过aria-controls属性
                if (!targetContent) {
                    const ariaControls = button.getAttribute('aria-controls');
                    if (ariaControls) {
                        targetContent = contentContainer.querySelector(`#${ariaControls}`);
                        console.log('方法3 - 通过aria-controls查找:', ariaControls, '找到:', !!targetContent);
                    }
                }
                
                if (targetContent) {
                    targetContent.classList.add('active');
                    console.log('成功激活内容:', targetContent.id, '内容长度:', targetContent.innerHTML.length);
                } else {
                    console.error('无法找到目标内容！');
                    console.log('选项卡信息:', {
                        index: index,
                        targetId: targetId,
                        ariaControls: button.getAttribute('aria-controls'),
                        allContentIds: Array.from(allContents).map(c => c.id)
                    });
                }
            };
            
            button.addEventListener('click', handleClick);
        });
    }

    // 打开全屏预览（从文档查看器）
    openFullscreenPreview() {
        if (!this.currentFileContent) {
            this.showMessage('没有可预览的内容', 'warning');
            return;
        }

        this.showFullscreenModal(this.currentFileContent);
    }

    // 从预览模态框打开全屏预览（从生成器预览）
    openFullscreenFromPreview() {
        if (!this.currentGeneratedContent) {
            this.showMessage('没有可预览的内容', 'warning');
            return;
        }

        // 关闭当前预览模态框
        const previewModal = bootstrap.Modal.getInstance(document.getElementById('previewModal'));
        if (previewModal) {
            previewModal.hide();
        }

        this.showFullscreenModal(this.currentGeneratedContent);
    }

    // 显示全屏模态框
    showFullscreenModal(content) {
        const modal = new bootstrap.Modal(document.getElementById('fullscreenModal'));
        modal.show();

        // 等待模态框完全显示后再渲染内容
        setTimeout(() => {
            // 解析内容
            const tabsData = this.parseMarkdownToTabs(content);
            console.log('全屏预览解析到的表格数量:', tabsData.tables.length);
            console.log('表格信息:', tabsData.tables.map(t => ({ name: t.name, contentLength: t.content.length })));
            
            if (tabsData.tables.length > 1) {
                // 多表格：显示选项卡（事件绑定在renderTabsInterface中已经处理）
                this.renderTabsInterface(tabsData, 'fullscreenContent', 'fullscreenTabsContainer', 'fullscreenTabs');
            } else {
                // 单表格或无表格：直接显示内容
                const htmlContent = this.markdownToHtml(content);
                document.getElementById('fullscreenContent').innerHTML = htmlContent;
                document.getElementById('fullscreenTabsContainer').style.display = 'none';
            }
        }, 200);
    }

    // 复制当前内容（智能判断来源）
    copyCurrentContent() {
        const content = this.currentFileContent || this.currentGeneratedContent;
        if (!content) {
            this.showMessage('没有可复制的内容', 'warning');
            return;
        }

        navigator.clipboard.writeText(content).then(() => {
            this.showMessage('内容已复制到剪贴板', 'success');
        }).catch(() => {
            // 降级方案：使用textarea
            const textarea = document.createElement('textarea');
            textarea.value = content;
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

    // 下载当前内容（智能判断来源）
    downloadCurrentContent() {
        const content = this.currentFileContent || this.currentGeneratedContent;
        if (!content) {
            this.showMessage('没有可下载的内容', 'warning');
            return;
        }

        const fileName = this.currentFile ? this.currentFile.name : `database_docs_${new Date().toISOString().slice(0, 19).replace(/[:]/g, '-')}.md`;
        
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showMessage('文件下载已开始', 'success');
    }

    // 初始化最近打开文件
    initRecentFiles() {
        // 清除历史按钮
        document.getElementById('clearHistoryBtn').addEventListener('click', () => {
            this.clearAllRecentFiles();
        });
        
        // 初始化显示
        this.loadRecentFiles();
        this.updateRecentFilesDisplay();
    }

    // 保存文件到最近打开列表
    saveRecentFile(file, content) {
        const recentFiles = this.getRecentFiles();
        
        // 创建文件记录
        const fileRecord = {
            id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            name: file.name,
            size: file.size,
            lastModified: file.lastModified,
            content: content,
            openedAt: new Date().toISOString(),
            preview: this.getContentPreview(content)
        };
        
        // 移除同名文件（如果存在）
        const filteredFiles = recentFiles.filter(f => f.name !== file.name);
        
        // 添加新文件到开头
        filteredFiles.unshift(fileRecord);
        
        // 限制最多3个文件
        const limitedFiles = filteredFiles.slice(0, 3);
        
        // 保存到localStorage
        localStorage.setItem('recentMdFiles', JSON.stringify(limitedFiles));
        
        // 更新显示
        this.updateRecentFilesDisplay();
    }

    // 获取最近打开的文件
    getRecentFiles() {
        try {
            const saved = localStorage.getItem('recentMdFiles');
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error('加载最近文件失败:', error);
            return [];
        }
    }

    // 加载最近打开的文件
    loadRecentFiles() {
        this.recentFiles = this.getRecentFiles();
    }

    // 更新最近打开文件的显示
    updateRecentFilesDisplay() {
        const recentFilesList = document.getElementById('recentFilesList');
        const noRecentFiles = document.getElementById('noRecentFiles');
        
        const recentFiles = this.getRecentFiles();
        
        if (recentFiles.length === 0) {
            recentFilesList.innerHTML = '';
            noRecentFiles.style.display = 'block';
            return;
        }
        
        noRecentFiles.style.display = 'none';
        
        // 生成文件列表HTML
        const filesHtml = recentFiles.map((file, index) => {
            const openedTime = new Date(file.openedAt).toLocaleString('zh-CN');
            const fileSize = this.formatFileSize(file.size);
            
            return `
                <div class="recent-file-item" data-file-id="${file.id}">
                    <div class="recent-file-header">
                        <div class="recent-file-name">
                            <i class="fas fa-file-alt"></i>
                            ${file.name}
                        </div>
                        <button class="recent-file-remove" data-file-id="${file.id}" title="删除此记录">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="recent-file-info">
                        <div class="recent-file-size">${fileSize}</div>
                        <div class="recent-file-time">${openedTime}</div>
                    </div>
                    <div class="recent-file-preview">
                        <div class="recent-file-preview-text">${file.preview}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        recentFilesList.innerHTML = filesHtml;
        
        // 绑定事件
        this.bindRecentFileEvents();
    }

    // 绑定最近文件事件
    bindRecentFileEvents() {
        const recentFilesList = document.getElementById('recentFilesList');
        
        // 点击文件打开
        recentFilesList.addEventListener('click', (e) => {
            const fileItem = e.target.closest('.recent-file-item');
            const removeBtn = e.target.closest('.recent-file-remove');
            
            if (removeBtn) {
                // 删除单个文件
                const fileId = removeBtn.dataset.fileId;
                this.removeRecentFile(fileId);
                e.stopPropagation();
                return;
            }
            
            if (fileItem) {
                // 打开文件
                const fileId = fileItem.dataset.fileId;
                this.openRecentFile(fileId);
            }
        });
    }

    // 打开最近文件
    openRecentFile(fileId) {
        const recentFiles = this.getRecentFiles();
        const file = recentFiles.find(f => f.id === fileId);
        
        if (!file) {
            this.showMessage('文件记录不存在', 'warning');
            return;
        }
        
        // 模拟文件对象
        const fileObj = {
            name: file.name,
            size: file.size,
            lastModified: file.lastModified
        };
        
        // 设置当前文件
        this.currentFile = fileObj;
        this.currentFileContent = file.content;
        
        // 显示文件信息和预览
        this.displayFileInfo(fileObj);
        this.previewMarkdown(file.content);
        
        // 重新保存到最近打开（更新打开时间）
        this.saveRecentFile(fileObj, file.content);
        
        this.showMessage(`已打开文件: ${file.name}`, 'success');
    }

    // 删除单个最近文件记录
    removeRecentFile(fileId) {
        const recentFiles = this.getRecentFiles();
        const filteredFiles = recentFiles.filter(f => f.id !== fileId);
        
        localStorage.setItem('recentMdFiles', JSON.stringify(filteredFiles));
        
        // 添加删除动画
        const fileItem = document.querySelector(`[data-file-id="${fileId}"]`);
        if (fileItem) {
            fileItem.classList.add('removing');
            setTimeout(() => {
                this.updateRecentFilesDisplay();
            }, 300);
        }
        
        this.showMessage('文件记录已删除', 'info');
    }

    // 清除所有最近文件记录
    clearAllRecentFiles() {
        if (confirm('确定要清除所有最近打开的文件记录吗？')) {
            localStorage.removeItem('recentMdFiles');
            this.updateRecentFilesDisplay();
            this.showMessage('所有历史记录已清除', 'info');
        }
    }

    // 获取内容预览
    getContentPreview(content) {
        // 移除markdown语法，获取纯文本预览
        const plainText = content
            .replace(/#{1,6}\s+/g, '') // 移除标题标记
            .replace(/\*\*(.*?)\*\*/g, '$1') // 移除粗体标记
            .replace(/\*(.*?)\*/g, '$1') // 移除斜体标记
            .replace(/`(.*?)`/g, '$1') // 移除代码标记
            .replace(/\[(.*?)\]\(.*?\)/g, '$1') // 移除链接标记
            .replace(/\|/g, ' ') // 移除表格分隔符
            .replace(/\n+/g, ' ') // 替换换行为空格
            .replace(/\s+/g, ' ') // 合并多个空格
            .trim();
        
        // 返回前150个字符作为预览
        return plainText.length > 150 ? plainText.substring(0, 150) + '...' : plainText;
    }

    // ==================== 连接历史管理功能 ====================
    
    // 加载连接历史
    loadConnectionHistory() {
        const history = this.getConnectionHistory();
        const select = document.getElementById('connectionHistory');
        
        // 清空现有选项（保留默认选项）
        select.innerHTML = '<option value="">选择已保存的连接...</option>';
        
        // 添加历史连接选项
        history.forEach(conn => {
            const option = document.createElement('option');
            option.value = conn.id;
            option.textContent = conn.name;
            select.appendChild(option);
        });
    }

    // 获取连接历史记录
    getConnectionHistory() {
        const history = localStorage.getItem('dbConnectionHistory');
        return history ? JSON.parse(history) : [];
    }

    // 保存连接历史记录
    saveConnectionHistory(history) {
        localStorage.setItem('dbConnectionHistory', JSON.stringify(history));
    }

    // 保存连接到历史记录（去重处理）
    saveConnectionToHistory(config) {
        const history = this.getConnectionHistory();
        
        // 生成连接的唯一标识（不包含密码）
        const connectionKey = `${config.db_type}://${config.user}@${config.host}:${config.port}/${config.database}`;
        
        // 检查是否已存在相同连接
        const existingIndex = history.findIndex(conn => 
            conn.dbType === config.db_type &&
            conn.host === config.host &&
            conn.port === config.port &&
            conn.user === config.user &&
            conn.database === config.database
        );

        const now = Date.now();
        
        if (existingIndex !== -1) {
            // 更新现有连接的最后使用时间
            history[existingIndex].lastUsed = now;
        } else {
            // 添加新连接
            const newConnection = {
                id: `conn_${now}`,
                name: this.generateConnectionName(config),
                dbType: config.db_type,
                host: config.host,
                port: config.port,
                user: config.user,
                database: config.database,
                lastUsed: now,
                createdAt: now
            };
            
            history.unshift(newConnection); // 添加到开头
            
            // 限制历史记录数量（最多保存20个）
            if (history.length > 20) {
                history.splice(20);
            }
        }

        // 按最后使用时间排序
        history.sort((a, b) => b.lastUsed - a.lastUsed);
        
        this.saveConnectionHistory(history);
        this.loadConnectionHistory();
    }

    // 生成连接名称
    generateConnectionName(config) {
        const dbTypeMap = {
            'mysql': 'MySQL',
            'sqlserver': 'SQL Server'
        };
        
        const dbTypeName = dbTypeMap[config.db_type] || config.db_type;
        return `${dbTypeName} - ${config.database}@${config.host}`;
    }

    // 从历史记录加载连接配置
    loadConnectionFromHistory(connectionId) {
        if (!connectionId) {
            // 清空删除按钮状态
            document.getElementById('deleteConnectionBtn').disabled = true;
            return;
        }

        const history = this.getConnectionHistory();
        const connection = history.find(conn => conn.id === connectionId);
        
        if (connection) {
            // 填充表单
            document.getElementById('dbType').value = connection.dbType;
            document.getElementById('host').value = connection.host;
            document.getElementById('port').value = connection.port;
            document.getElementById('user').value = connection.user;
            document.getElementById('database').value = connection.database;
            
            // 启用删除按钮
            document.getElementById('deleteConnectionBtn').disabled = false;
            
            // 更新最后使用时间
            connection.lastUsed = Date.now();
            this.saveConnectionHistory(history);
            
            this.showMessage(`已加载连接配置: ${connection.name}`, 'info');
        }
    }

    // 删除选中的连接
    deleteSelectedConnection() {
        const select = document.getElementById('connectionHistory');
        const connectionId = select.value;
        
        if (!connectionId) return;

        const history = this.getConnectionHistory();
        const connection = history.find(conn => conn.id === connectionId);
        
        if (connection && confirm(`确定要删除连接 "${connection.name}" 吗？`)) {
            const newHistory = history.filter(conn => conn.id !== connectionId);
            this.saveConnectionHistory(newHistory);
            this.loadConnectionHistory();
            
            // 清空表单和重置按钮状态
            this.clearConnectionForm();
            this.showMessage('连接已删除', 'info');
        }
    }

    // 选择输出路径
    selectOutputPath() {
        // 优先调用后端系统文件夹选择对话框
        this.openSystemFolderPicker();
    }

    async openSystemFolderPicker() {
        try {
            const resp = await fetch('/api/select_directory');
            if (!resp.ok) throw new Error('接口调用失败');
            const result = await resp.json();
            if (result.success && result.path) {
                this.outputPath = result.path;
                document.getElementById('outputPath').value = this.outputPath;
                this.updateGenerateButton();
                this.showMessage(`已选择保存路径: ${this.outputPath}`, 'success');
            } else if (result.message === '用户取消') {
                this.showMessage('已取消选择路径', 'info');
            } else {
                // 兜底回退到旧的前端对话框
                this.showImprovedPathSelectionDialog();
            }
        } catch (e) {
            // 兜底回退到旧的前端对话框
            this.showImprovedPathSelectionDialog();
        }
    }

    async selectDirectoryModern() {
        // 由于浏览器安全限制，无法获取完整路径，改为提供默认路径选项
        this.showPathSelectionDialog();
    }

    selectDirectoryFallback() {
        // 同样改为路径选择对话框
        this.showPathSelectionDialog();
    }

    showPathSelectionDialog() {
        // 创建路径选择对话框
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">选择文档保存路径</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label class="form-label">请选择或输入完整的保存路径：</label>
                            <div class="d-grid gap-2 mb-3">
                                <button type="button" class="btn btn-outline-primary" onclick="this.selectDefaultPath()">
                                    使用默认路径 (./output)
                                </button>
                                <button type="button" class="btn btn-outline-secondary" onclick="this.selectCurrentPath()">
                                    使用当前目录 (.)
                                </button>
                            </div>
                            <div class="input-group">
                                <span class="input-group-text">自定义路径</span>
                                <input type="text" class="form-control" id="customPathInput" 
                                       placeholder="例如: E:\\Documents\\DB文档" 
                                       value="${this.outputPath || ''}">
                            </div>
                            <div class="form-text">
                                提示：可以使用相对路径（如 ./output）或绝对路径（如 E:\\Documents\\DB文档）
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                        <button type="button" class="btn btn-primary" onclick="this.confirmPathSelection()">确认</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 绑定事件
        const self = this;
        modal.querySelector('.btn-outline-primary').onclick = () => self.selectDefaultPath();
        modal.querySelector('.btn-outline-secondary').onclick = () => self.selectCurrentPath();
        modal.querySelector('.btn-primary').onclick = () => self.confirmPathSelection();
        
        // 显示模态框
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        
        // 模态框关闭后清理
        modal.addEventListener('hidden.bs.modal', () => {
            document.body.removeChild(modal);
        });
    }

    selectDefaultPath() {
        document.getElementById('customPathInput').value = './output';
    }

    selectCurrentPath() {
        document.getElementById('customPathInput').value = '.';
    }

    confirmPathSelection() {
        const customPath = document.getElementById('customPathInput').value.trim();
        if (customPath) {
            this.outputPath = customPath;
            document.getElementById('outputPath').value = this.outputPath;
            this.updateGenerateButton();
            this.showMessage(`已设置保存路径: ${this.outputPath}`, 'success');
            
            // 关闭模态框
            const modal = document.querySelector('.modal.show');
            if (modal) {
                bootstrap.Modal.getInstance(modal).hide();
            }
        } else {
             this.showMessage('请输入有效的路径', 'warning');
         }
     }

    // 生成文件名
    generateFileName() {
        const dbName = document.getElementById('database').value || 'database';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        this.fileName = `${dbName}_文档_${timestamp}.md`;
        document.getElementById('fileName').value = this.fileName;
    }

    // 更新进度
    updateProgress(completed, total, currentTable = '') {
        this.completedTables = completed;
        this.totalTables = total;
        
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
        
        // 更新进度条
        const progressBar = document.getElementById('progressBar');
        progressBar.style.width = `${percentage}%`;
        progressBar.textContent = `${percentage}%`;
        progressBar.setAttribute('aria-valuenow', percentage);
        
        // 更新进度文本
        document.getElementById('progressText').textContent = `${completed}/${total} 已完成`;
        
        // 更新当前状态
        if (currentTable) {
            document.getElementById('currentStatusText').textContent = `正在处理: ${currentTable}`;
        } else if (completed === total && total > 0) {
            document.getElementById('currentStatusText').textContent = '生成完成！';
        }
    }

    // 增量更新相关方法
    toggleIncrementalMode(enabled) {
        this.incrementalMode = enabled;
        const incrementalSection = document.getElementById('incrementalSection');
        const existingDocSection = document.getElementById('existingDocSection');
        const selectNewOnlyBtn = document.getElementById('selectNewOnlyBtn');
        const outputSection = document.getElementById('outputSection');
        
        if (enabled) {
            incrementalSection.style.display = 'block';
            existingDocSection.style.display = 'block';
            selectNewOnlyBtn.style.display = 'inline-block';
            // 增量更新模式下也显示文档保存设置，用于指定保存路径
            if (outputSection) {
                outputSection.style.display = 'block';
            }
        } else {
            incrementalSection.style.display = 'none';
            existingDocSection.style.display = 'none';
            selectNewOnlyBtn.style.display = 'none';
            // 普通模式下显示文档保存设置
            if (outputSection) {
                outputSection.style.display = 'block';
            }
            this.existingDocPath = '';
            this.existingTables = [];
            this.newTables = [];
            document.getElementById('existingDocPath').value = '';
            document.getElementById('existingTablesInfo').innerHTML = '';
        }
    }

    async selectExistingDoc() {
        try {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.md';
            
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.existingDocPath = file.name;
                    document.getElementById('existingDocPath').value = this.existingDocPath;
                    
                    // 直接读取文件内容并解析
                    await this.parseExistingDocFromFile(file);
                }
            };
            
            input.click();
        } catch (error) {
            console.error('选择文档失败:', error);
            this.showMessage('选择文档失败: ' + error.message, 'error');
        }
    }

    async parseExistingDocFromFile(file) {
        try {
            console.log('开始解析文档文件:', file.name);
            this.showLoading();
            
            // 使用FileReader直接读取文件内容
            const content = await this.readFileContent(file);
            console.log('文档内容长度:', content ? content.length : 0);
            console.log('文档内容前500字符:', content ? content.substring(0, 500) : '无内容');
            
            // 保存现有文档内容
            this.existingDocContent = content || '';
            
            // 从文档内容中解析表格名称
            this.existingTables = this.extractTableNamesFromContent(content);
            console.log('提取到的表格名称:', this.existingTables);
            
            this.updateExistingTablesInfo();
            this.updateNewTablesInfo();
            
            if (this.existingTables.length > 0) {
                this.showMessage(`成功解析文档，发现 ${this.existingTables.length} 个表格`, 'success');
            } else {
                this.showMessage('文档解析成功，但未找到表格信息。请检查文档格式是否正确。', 'warning');
                console.warn('未找到表格，文档内容:', content);
            }
        } catch (error) {
            console.error('解析文档失败:', error);
            this.showMessage('解析文档失败: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async parseExistingDoc(docPath) {
        try {
            console.log('开始解析文档:', docPath);
            this.showLoading();
            
            const response = await fetch('/api/parse_doc', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ doc_path: docPath })
            });

            console.log('API响应状态:', response.status, response.statusText);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('API响应结果:', result);
            
            if (result.success) {
                console.log('文档内容长度:', result.content ? result.content.length : 0);
                console.log('文档内容前500字符:', result.content ? result.content.substring(0, 500) : '无内容');
                
                // 从文档内容中解析表格名称
                this.existingTables = this.extractTableNamesFromContent(result.content);
                console.log('提取到的表格名称:', this.existingTables);
                
                this.updateExistingTablesInfo();
                this.updateNewTablesInfo();
                
                if (this.existingTables.length > 0) {
                    this.showMessage(`成功解析文档，发现 ${this.existingTables.length} 个表格`, 'success');
                } else {
                    this.showMessage('文档解析成功，但未找到表格信息。请检查文档格式是否正确。', 'warning');
                    console.warn('未找到表格，文档内容:', result.content);
                }
            } else {
                console.error('解析失败:', result.message || result.error);
                throw new Error(result.message || result.error || '解析文档失败');
            }
        } catch (error) {
            console.error('解析文档失败:', error);
            this.showMessage('解析文档失败: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    // 从markdown内容中提取表格名称
    extractTableNamesFromContent(content) {
        const tableNames = [];
        console.log('开始提取表格名称，内容长度:', content ? content.length : 0);
        
        if (!content) {
            console.warn('文档内容为空');
            return tableNames;
        }
        
        // 支持多种表格标题格式
        const patterns = [
            /^表:\s*(.+)$/gm,           // 表: table_name
            /^##\s*表:\s*(.+)$/gm,     // ## 表: table_name
            /^###\s*表:\s*(.+)$/gm,    // ### 表: table_name
            /^#\s*表:\s*(.+)$/gm,      // # 表: table_name
            /^表\s+(.+)$/gm,           // 表 table_name
            /^##\s*(.+)\s*表$/gm,      // ## table_name 表
            /^###\s*(.+)\s*表$/gm      // ### table_name 表
        ];
        
        patterns.forEach((regex, index) => {
            console.log(`尝试模式 ${index + 1}:`, regex);
            let match;
            regex.lastIndex = 0; // 重置正则表达式状态
            
            while ((match = regex.exec(content)) !== null) {
                const tableName = match[1].trim();
                console.log(`模式 ${index + 1} 匹配到:`, tableName);
                
                if (tableName && !tableNames.includes(tableName)) {
                    tableNames.push(tableName);
                }
            }
        });
        
        console.log('最终提取到的表格名称:', tableNames);
        
        // 如果没有找到表格，输出调试信息
        if (tableNames.length === 0) {
            console.log('未找到表格，文档前1000字符:');
            console.log(content.substring(0, 1000));
            
            // 查找所有可能的表格相关行
            const lines = content.split('\n');
            const possibleTableLines = lines.filter(line => 
                line.includes('表') || line.includes('Table') || line.includes('table')
            );
            console.log('包含"表"字的行:', possibleTableLines);
        }
        
        return tableNames;
    }

    updateExistingTablesInfo() {
        const infoDiv = document.getElementById('existingTablesInfo');
        if (this.existingTables.length > 0) {
            infoDiv.innerHTML = `
                <div class="alert alert-info">
                    <strong>已存在的表格 (${this.existingTables.length}个):</strong><br>
                    ${this.existingTables.join(', ')}
                </div>
            `;
        } else {
            infoDiv.innerHTML = '<div class="alert alert-warning">未找到已存在的表格</div>';
        }
    }

    updateNewTablesInfo() {
        // 获取当前选中的所有表格
        const allSelectedTables = Array.from(this.selectedTables);
        
        // 计算新表格（不在已存在表格中的）
        this.newTables = allSelectedTables.filter(table => !this.existingTables.includes(table));
        
        const infoDiv = document.getElementById('existingTablesInfo');
        const currentInfo = infoDiv.innerHTML;
        
        if (this.newTables.length > 0) {
            infoDiv.innerHTML = currentInfo + `
                <div class="alert alert-success">
                    <strong>将要生成的新表格 (${this.newTables.length}个):</strong><br>
                    ${this.newTables.join(', ')}
                </div>
            `;
        } else if (allSelectedTables.length > 0) {
            infoDiv.innerHTML = currentInfo + `
                <div class="alert alert-warning">
                    所有选中的表格都已存在于文档中，无需生成新内容
                </div>
            `;
        }
    }

    selectNewTablesOnly() {
        // 清空当前选择
        this.selectedTables.clear();
        
        // 获取所有表格复选框
        const checkboxes = document.querySelectorAll('#tablesContainer input[type="checkbox"]');
        
        checkboxes.forEach(checkbox => {
            const tableName = checkbox.value;
            // 只选择不在已存在表格中的表格
            if (!this.existingTables.includes(tableName)) {
                checkbox.checked = true;
                this.selectedTables.add(tableName);
            } else {
                checkbox.checked = false;
            }
        });
        
        this.updateGenerateButton();
        this.updateNewTablesInfo();
    }

    // 切换表格区域的折叠状态
    toggleTablesCollapse() {
        const tablesContent = document.getElementById('tablesContent');
        const toggleIcon = document.getElementById('toggleTablesIcon');
        const toggleText = document.getElementById('toggleTablesText');
        const countBadge = document.querySelector('.tables-count-badge');
        
        if (tablesContent.classList.contains('collapsed')) {
            // 展开
            tablesContent.classList.remove('collapsed');
            toggleIcon.className = 'fas fa-chevron-up';
            toggleText.textContent = '折叠';
            if (countBadge) {
                countBadge.style.display = 'none';
            }
        } else {
            // 折叠
            tablesContent.classList.add('collapsed');
            toggleIcon.className = 'fas fa-chevron-down';
            toggleText.textContent = '展开';
            
            // 显示表格数量徽章
            if (countBadge) {
                const totalTables = document.querySelectorAll('#tablesContainer input[type="checkbox"]').length;
                const selectedTables = document.querySelectorAll('#tablesContainer input[type="checkbox"]:checked').length;
                countBadge.textContent = `${selectedTables}/${totalTables}`;
                countBadge.style.display = 'inline-block';
            }
        }
    }

    // 清空连接表单
    clearConnectionForm() {
        document.getElementById('connectionHistory').value = '';
        document.getElementById('dbType').value = 'mysql';
        document.getElementById('host').value = '';
        document.getElementById('port').value = '3306';
        document.getElementById('user').value = '';
        document.getElementById('password').value = '';
        document.getElementById('database').value = '';
        
        // 禁用删除按钮
        document.getElementById('deleteConnectionBtn').disabled = true;
        
        this.showMessage('表单已清空', 'info');
    }

    // 设置默认输出路径
    async setDefaultOutputPath() {
        if (!this.outputPath) {
            try {
                const resp = await fetch('/api/default_path');
                if (resp.ok) {
                    const result = await resp.json();
                    if (result.success && result.path) {
                        this.outputPath = result.path;
                    } else {
                        this.outputPath = this.getDefaultDownloadsPath();
                    }
                } else {
                    this.outputPath = this.getDefaultDownloadsPath();
                }
            } catch (e) {
                this.outputPath = this.getDefaultDownloadsPath();
            }
            document.getElementById('outputPath').value = this.outputPath;
            this.updateGenerateButton();
        }
    }

    // 获取默认Downloads路径
    getDefaultDownloadsPath() {
        // 后端不可用时的兜底：使用项目下的 output 目录
        return './output';
    }

    // 显示改进的路径选择对话框
    showImprovedPathSelectionDialog() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        
        const defaultPath = this.getDefaultDownloadsPath();
        
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close" onclick="this.parentElement.parentElement.remove()">&times;</span>
                <h3>选择文档保存路径</h3>
                <div style="margin: 20px 0;">
                    <p><strong>默认路径：</strong> ${defaultPath}</p>
                    <button id="useDefaultPath" class="btn btn-primary" style="margin: 10px 5px;">使用默认路径</button>
                    <button id="selectCustomPath" class="btn btn-secondary" style="margin: 10px 5px;">选择自定义路径</button>
                </div>
                <div id="customPathSection" style="display: none; margin-top: 20px;">
                    <label for="customPathInput">自定义路径：</label>
                    <input type="text" id="customPathInput" placeholder="请输入完整路径，如：C:\\Users\\YourName\\Documents" style="width: 100%; margin: 10px 0; padding: 8px;">
                    <div style="margin-top: 10px;">
                        <button id="confirmCustomPath" class="btn btn-primary">确认</button>
                        <button id="cancelCustomPath" class="btn btn-secondary">取消</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 绑定事件
        document.getElementById('useDefaultPath').onclick = () => {
            this.outputPath = defaultPath;
            document.getElementById('outputPath').value = this.outputPath;
            this.updateGenerateButton();
            this.showMessage(`已设置保存路径为：${this.outputPath}`, 'success');
            modal.remove();
        };
        
        document.getElementById('selectCustomPath').onclick = () => {
            document.getElementById('customPathSection').style.display = 'block';
            document.getElementById('customPathInput').focus();
        };
        
        document.getElementById('confirmCustomPath').onclick = () => {
            const customPath = document.getElementById('customPathInput').value.trim();
            if (customPath) {
                this.outputPath = customPath;
                document.getElementById('outputPath').value = this.outputPath;
                this.updateGenerateButton();
                this.showMessage(`已设置保存路径为：${this.outputPath}`, 'success');
                modal.remove();
            } else {
                this.showMessage('请输入有效的路径', 'error');
            }
        };
        
        document.getElementById('cancelCustomPath').onclick = () => {
            document.getElementById('customPathSection').style.display = 'none';
        };
        
        // 点击模态框外部关闭
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        };
        
        // ESC键关闭
        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', escHandler);
            }
        });
    }

    // ==================== 数据库管理器功能 ====================
    
    initDatabaseManager() {
        // 初始化数据库管理器相关属性
        this.dbManagerData = {
            currentDocument: null,
            parsedTables: [],
            searchResults: [],
            currentFilter: {
                tables: true,
                fields: true,
                comments: true
            }
        };
        
        this.bindDatabaseManagerEvents();
        
        // 添加延迟重试机制，确保在标签页内容完全加载后也能绑定事件
        setTimeout(() => {
            this.bindDatabaseManagerEvents();
        }, 100);
    }
    
    bindDatabaseManagerEvents() {
        // 防止重复绑定事件
        if (this.dbManagerEventsbound) {
            return;
        }
        
        // 文件加载事件
        const fileInput = document.getElementById('dbManagerFileInput');
        const loadDocBtn = document.getElementById('loadDocBtn');
        
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.loadDatabaseDocument(e.target.files[0]);
                }
            });
        }
        
        if (loadDocBtn) {
            loadDocBtn.addEventListener('click', () => {
                fileInput?.click();
            });
        }
        
        // 搜索事件
        const searchInput = document.getElementById('globalSearchInput');
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.performSearch(e.target.value);
            });
        }
        
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                searchInput.value = '';
                this.performSearch('');
            });
        }
        
        // 过滤器事件
        const filterCheckboxes = ['filterTables', 'filterFields', 'filterComments'];
        filterCheckboxes.forEach(id => {
            const checkbox = document.getElementById(id);
            if (checkbox) {
                checkbox.addEventListener('change', () => {
                    this.updateSearchFilters();
                });
            }
        });
        
        // 拖放支持
        const searchResultsList = document.getElementById('searchResultsList');
        if (searchResultsList) {
            searchResultsList.addEventListener('dragover', (e) => {
                e.preventDefault();
                searchResultsList.classList.add('drag-over');
            });
            
            searchResultsList.addEventListener('dragleave', (e) => {
                e.preventDefault();
                searchResultsList.classList.remove('drag-over');
            });
            
            searchResultsList.addEventListener('drop', (e) => {
                e.preventDefault();
                searchResultsList.classList.remove('drag-over');
                
                const files = e.dataTransfer.files;
                if (files.length > 0 && files[0].name.endsWith('.md')) {
                    this.loadDatabaseDocument(files[0]);
                }
            });
        }

        // 全屏按钮事件
        const dbManagerFullscreenBtn = document.getElementById('dbManagerFullscreenBtn');
        if (dbManagerFullscreenBtn && !dbManagerFullscreenBtn.hasAttribute('data-event-bound')) {
            dbManagerFullscreenBtn.addEventListener('click', () => {
                this.toggleDatabaseManagerFullscreen();
            });
            dbManagerFullscreenBtn.setAttribute('data-event-bound', 'true');
        }
        
        // 标记事件已绑定
        this.dbManagerEventsbound = true;
    }

    toggleDatabaseManagerFullscreen() {
        const dbManager = document.getElementById('db-manager');
        const dbManagerFullscreenBtn = document.getElementById('dbManagerFullscreenBtn');
        const fullscreenIcon = dbManagerFullscreenBtn ? dbManagerFullscreenBtn.querySelector('i') : null;
        
        if (!dbManager || !dbManagerFullscreenBtn) {
            return;
        }
        
        if (dbManager.classList.contains('db-manager-fullscreen')) {
            // 退出全屏
            dbManager.classList.remove('db-manager-fullscreen');
            if (fullscreenIcon) fullscreenIcon.className = 'fas fa-expand';
            dbManagerFullscreenBtn.title = '全屏显示';
            document.body.style.overflow = '';
        } else {
            // 进入全屏
            dbManager.classList.add('db-manager-fullscreen');
            if (fullscreenIcon) fullscreenIcon.className = 'fas fa-compress';
            dbManagerFullscreenBtn.title = '退出全屏';
            document.body.style.overflow = 'hidden';
        }
    }
    
    async loadDatabaseDocument(file) {
        try {
            const content = await this.readFileContent(file);
            this.dbManagerData.currentDocument = {
                name: file.name,
                content: content,
                size: file.size,
                lastModified: file.lastModified
            };
            
            // 解析文档
            this.parseDatabaseDocument(content);
            
            // 更新UI
            this.updateDatabaseManagerUI();
            
            this.showMessage(`成功加载文档: ${file.name}`, 'success');
        } catch (error) {
            console.error('加载文档失败:', error);
            this.showMessage('加载文档失败，请检查文件格式', 'danger');
        }
    }
    
    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file, 'utf-8');
        });
    }
    
    parseDatabaseDocument(content) {
        const tables = [];
        const lines = content.split('\n');
        let currentTable = null;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // 检测表名（支持多种格式：## 表名、表: 表名、# 表名）
            if (line.startsWith('表: ') || 
                (line.startsWith('## ') && !line.includes('数据库文档')) ||
                (line.startsWith('# ') && !line.includes('数据库文档'))) {
                
                if (currentTable) {
                    tables.push(currentTable);
                }
                
                let tableName = '';
                if (line.startsWith('表: ')) {
                    tableName = line.replace('表: ', '').trim();
                } else if (line.startsWith('## ')) {
                    tableName = line.replace('## ', '').trim();
                } else if (line.startsWith('# ')) {
                    tableName = line.replace('# ', '').trim();
                }
                
                currentTable = {
                    name: tableName,
                    fields: [],
                    lineNumber: i + 1,
                    description: ''
                };
                continue;
            }
            
            // 检测表格行（参考文档查看器的解析逻辑）
            if (currentTable && line.includes('|')) {
                // 跳过分隔符行（如 |---|---|---|）
                if (line.match(/^\|[\s\-\|:]+\|$/)) {
                    continue;
                }
                
                // 解析表格行
                const cells = line.split('|').map(cell => cell.trim());
                
                // 移除首尾的空元素（由于行首行尾的|导致的）
                if (cells.length > 0 && cells[0] === '') cells.shift();
                if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
                
                if (cells.length === 0) continue;
                
                // 检查是否是表头行（包含"字段"、"类型"等关键词）
                const isHeaderRow = cells.some(cell => 
                    cell.includes('字段名') || 
                    cell.includes('字段') || 
                    cell.includes('类型') || 
                    cell.includes('数据类型') ||
                    cell.includes('是否可空') ||
                    cell.includes('默认值') ||
                    cell.includes('中文含义') ||
                    cell.includes('中文说明') ||
                    cell.includes('注释') ||
                    cell.includes('Field') ||
                    cell.includes('Type')
                );
                
                // 跳过表头行
                if (isHeaderRow) {
                    continue;
                }
                
                // 解析字段数据行
                if (cells.length >= 2) {
                    const field = {
                        name: cells[0] || '',
                        lineNumber: i + 1,
                        index: currentTable.fields.length
                    };
                    
                    // 根据列数判断格式
                    if (cells.length >= 6) {
                        // 6列格式：字段名 | 类型 | 是否可空 | 默认值 | 中文含义 | 注释
                        field.type = cells[1] || '';
                        field.nullable = cells[2] || '';
                        field.defaultValue = cells[3] || '';
                        field.description = cells[4] || '';  // 中文含义
                        field.comment = cells[5] || '';      // 注释
                    } else if (cells.length >= 3) {
                        // 3列格式：字段名称 | 数据类型 | 中文说明
                        field.type = cells[1] || '';
                        field.description = cells[2] || '';  // 中文说明
                        field.nullable = '';
                        field.defaultValue = '';
                        field.comment = '';
                    } else {
                        // 最少2列：字段名 | 类型
                        field.type = cells[1] || '';
                        field.description = '';
                        field.nullable = '';
                        field.defaultValue = '';
                        field.comment = '';
                    }
                    
                    currentTable.fields.push(field);
                }
            }
        }
        
        // 添加最后一个表
        if (currentTable) {
            tables.push(currentTable);
        }
        
        this.dbManagerData.parsedTables = tables;
        console.log('解析到的表:', tables);
    }
    
    updateDatabaseManagerUI() {
        // 更新统计信息
        const stats = document.getElementById('searchStats');
        if (stats) {
            const tableCount = this.dbManagerData.parsedTables.length;
            const fieldCount = this.dbManagerData.parsedTables.reduce((sum, table) => sum + table.fields.length, 0);
            stats.textContent = `共 ${tableCount} 个表，${fieldCount} 个字段`;
        }
        
        // 初次加载时只显示表，字段默认折叠
        const allResults = [];
        this.dbManagerData.parsedTables.forEach(table => {
            // 添加表本身
            allResults.push({
                type: 'table',
                table: table,
                matchText: table.name,
                description: `表 - ${table.fields.length} 个字段`,
                collapsed: true // 标记表的字段是否折叠
            });
            
            // 字段在初次加载时不显示，只在搜索时显示
        });
        
        this.displaySearchResults(allResults);
    }
    
    performSearch(query) {
        if (!query.trim()) {
            this.updateDatabaseManagerUI();
            return;
        }
        
        const results = [];
        const searchTerm = query.toLowerCase();
        const tablesWithMatchedFields = new Set(); // 记录有匹配字段的表
        
        this.dbManagerData.parsedTables.forEach(table => {
            let tableAdded = false;
            
            // 搜索表名
            if (this.dbManagerData.currentFilter.tables && table.name.toLowerCase().includes(searchTerm)) {
                results.push({
                    type: 'table',
                    table: table,
                    matchText: table.name,
                    description: `表: ${table.name} (${table.fields.length} 个字段)`,
                    collapsed: false // 搜索时展开显示字段
                });
                tableAdded = true;
            }
            
            // 搜索字段
            if (this.dbManagerData.currentFilter.fields || this.dbManagerData.currentFilter.comments) {
                const matchedFields = [];
                
                table.fields.forEach(field => {
                    let matched = false;
                    let matchText = '';
                    
                    if (this.dbManagerData.currentFilter.fields && field.name.toLowerCase().includes(searchTerm)) {
                        matched = true;
                        matchText = field.name;
                    }
                    
                    if (this.dbManagerData.currentFilter.comments && field.description.toLowerCase().includes(searchTerm)) {
                        matched = true;
                        matchText = matchText || field.description;
                    }
                    
                    if (matched) {
                        matchedFields.push({
                            type: 'field',
                            table: table,
                            field: field,
                            matchText: matchText,
                            description: `${table.name}.${field.name} - ${field.description}`
                        });
                        tablesWithMatchedFields.add(table.name);
                    }
                });
                
                // 如果有匹配的字段但表还没有添加，先添加表
                if (matchedFields.length > 0 && !tableAdded) {
                    results.push({
                        type: 'table',
                        table: table,
                        matchText: table.name,
                        description: `表: ${table.name} (${matchedFields.length} 个匹配字段)`,
                        collapsed: false // 搜索时展开显示字段
                    });
                }
                
                // 添加匹配的字段
                results.push(...matchedFields);
            }
        });
        
        this.dbManagerData.searchResults = results;
        this.displaySearchResults(results);
    }
    
    displaySearchResults(results) {
        const container = document.getElementById('searchResultsList');
        if (!container) return;
        
        if (results.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted p-4">
                    <i class="fas fa-search fa-2x mb-3 opacity-50"></i>
                    <p class="mb-0">没有找到匹配的结果</p>
                </div>
            `;
            return;
        }
        
        const html = results.map((result, index) => {
            const isTable = result.type === 'table';
            const icon = isTable ? 'fas fa-table' : 'fas fa-columns';
            const badgeClass = isTable ? 'bg-primary' : 'bg-secondary';
            const badgeText = isTable ? '表' : '字段';
            
            // 为字段项使用更小的样式
            if (!isTable) {
                return `
                    <div class="list-group-item list-group-item-action py-2" data-result-index="${index}" style="border-left: 3px solid #6c757d; margin-left: 10px;">
                        <div class="d-flex w-100 justify-content-between align-items-center">
                            <div class="flex-grow-1">
                                <div class="d-flex align-items-center">
                                    <i class="${icon} me-2 text-muted" style="font-size: 0.8rem;"></i>
                                    <small class="mb-0 fw-medium">${this.highlightText(result.matchText, this.getCurrentSearchTerm())}</small>
                                    <span class="badge ${badgeClass} ms-2" style="font-size: 0.65rem;">${badgeText}</span>
                                </div>
                                <div class="text-muted" style="font-size: 0.7rem; margin-left: 1.2rem;">${result.field.type} - ${result.field.description || '无描述'}</div>
                            </div>
                            <small class="text-muted">
                                <i class="fas fa-arrow-right" style="font-size: 0.7rem;"></i>
                            </small>
                        </div>
                    </div>
                `;
            } else {
                // 表格项添加展开/折叠功能
                const isCollapsed = result.collapsed !== false; // 默认折叠，但搜索时可能展开
                const toggleIcon = isCollapsed ? 'fas fa-chevron-right' : 'fas fa-chevron-down';
                
                return `
                    <div class="list-group-item list-group-item-action" data-result-index="${index}" data-table-name="${result.table.name}">
                        <div class="d-flex w-100 justify-content-between align-items-start">
                            <div class="flex-grow-1">
                                <div class="d-flex align-items-center mb-1">
                                    <i class="${toggleIcon} me-2 table-toggle-icon" style="cursor: pointer; color: #6c757d;" data-table-name="${result.table.name}"></i>
                                    <i class="${icon} me-2"></i>
                                    <h6 class="mb-0">${this.highlightText(result.matchText, this.getCurrentSearchTerm())}</h6>
                                    <span class="badge ${badgeClass} ms-2">${badgeText}</span>
                                </div>
                                <p class="mb-1 text-muted small">${result.description}</p>
                            </div>
                            <small class="text-muted">
                                <i class="fas fa-arrow-right"></i>
                            </small>
                        </div>
                    </div>
                `;
            }
        }).join('');
        
        container.innerHTML = html;
        
        // 绑定点击事件
        container.querySelectorAll('.list-group-item').forEach((item, index) => {
            item.addEventListener('click', (e) => {
                // 如果点击的是展开/折叠图标，处理展开/折叠逻辑
                if (e.target.classList.contains('table-toggle-icon')) {
                    e.stopPropagation();
                    this.toggleTableFields(e.target.dataset.tableName);
                    return;
                }
                
                // 否则显示详情
                this.showResultDetail(results[index]);
            });
        });
    }
    
    getCurrentSearchTerm() {
        const searchInput = document.getElementById('globalSearchInput');
        return searchInput ? searchInput.value : '';
    }
    
    toggleTableFields(tableName) {
        // 找到对应的表
        const table = this.dbManagerData.parsedTables.find(t => t.name === tableName);
        if (!table) return;
        
        // 获取当前搜索词
        const searchTerm = this.getCurrentSearchTerm();
        
        // 找到表项的DOM元素
        const tableItem = document.querySelector(`[data-table-name="${tableName}"]`);
        if (!tableItem) return;
        
        // 获取展开/折叠图标
        const toggleIcon = tableItem.querySelector('.table-toggle-icon');
        if (!toggleIcon) return;
        
        // 检查当前状态
        const isCurrentlyCollapsed = toggleIcon.classList.contains('fa-chevron-right');
        
        if (isCurrentlyCollapsed) {
            // 展开：显示字段
            toggleIcon.classList.remove('fa-chevron-right');
            toggleIcon.classList.add('fa-chevron-down');
            
            // 在表项后面插入字段项
            const fieldResults = table.fields.map(field => ({
                type: 'field',
                table: table,
                field: field,
                matchText: field.name,
                description: `${table.name}.${field.name} - ${field.description}`
            }));
            
            // 生成字段HTML
            const fieldsHtml = fieldResults.map((result, index) => {
                const icon = 'fas fa-columns';
                const badgeClass = 'bg-secondary';
                const badgeText = '字段';
                
                return `
                    <div class="list-group-item list-group-item-action py-2 table-field-item" data-table-name="${tableName}" style="border-left: 3px solid #6c757d; margin-left: 10px;">
                        <div class="d-flex w-100 justify-content-between align-items-center">
                            <div class="flex-grow-1">
                                <div class="d-flex align-items-center">
                                    <i class="${icon} me-2 text-muted" style="font-size: 0.8rem;"></i>
                                    <small class="mb-0 fw-medium">${this.highlightText(result.matchText, searchTerm)}</small>
                                    <span class="badge ${badgeClass} ms-2" style="font-size: 0.65rem;">${badgeText}</span>
                                </div>
                                <div class="text-muted" style="font-size: 0.7rem; margin-left: 1.2rem;">${result.field.type} - ${result.field.description || '无描述'}</div>
                            </div>
                            <small class="text-muted">
                                <i class="fas fa-arrow-right" style="font-size: 0.7rem;"></i>
                            </small>
                        </div>
                    </div>
                `;
            }).join('');
            
            // 插入字段HTML
            tableItem.insertAdjacentHTML('afterend', fieldsHtml);
            
            // 为新插入的字段项绑定点击事件
            const newFieldItems = document.querySelectorAll(`[data-table-name="${tableName}"].table-field-item`);
            newFieldItems.forEach((item, index) => {
                item.addEventListener('click', () => {
                    this.showResultDetail(fieldResults[index]);
                });
            });
            
        } else {
            // 折叠：隐藏字段
            toggleIcon.classList.remove('fa-chevron-down');
            toggleIcon.classList.add('fa-chevron-right');
            
            // 移除所有该表的字段项
            const fieldItems = document.querySelectorAll(`[data-table-name="${tableName}"].table-field-item`);
            fieldItems.forEach(item => item.remove());
        }
    }
    
    highlightText(text, searchTerm) {
        if (!searchTerm) return text;
        
        const regex = new RegExp(`(${searchTerm})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }
    
    showResultDetail(result) {
        const titleElement = document.getElementById('detailPanelTitle');
        const contentElement = document.getElementById('detailPanelContent');
        
        if (!titleElement || !contentElement) return;
        
        // 无论是表还是字段，都显示表详情
        this.showTableDetail(result.table, titleElement, contentElement);
        
        // 确保右侧详情面板滚动到顶部，让用户能看到详情内容
        const detailPanel = contentElement.closest('.overflow-auto');
        if (detailPanel) {
            detailPanel.scrollTop = 0;
        }
    }
    
    showTableDetail(table, titleElement, contentElement) {
        titleElement.innerHTML = `
            <i class="fas fa-table"></i> 
            表详情: ${table.name}
        `;
        
        const fieldsHtml = table.fields.map((field, index) => {
            // 处理是否可空的显示
            let nullableDisplay = '-';
            if (field.nullable) {
                if (field.nullable.toUpperCase() === 'NO') {
                    nullableDisplay = '<span class="badge bg-danger">NO</span>';
                } else if (field.nullable.toUpperCase() === 'YES') {
                    nullableDisplay = '<span class="badge bg-success">YES</span>';
                } else {
                    nullableDisplay = field.nullable;
                }
            }
            
            // 处理默认值的显示
            const defaultValueDisplay = field.defaultValue ? `<code>${field.defaultValue}</code>` : '-';
            
            // 处理中文含义显示 - 优先显示description，如果没有则显示comment作为fallback
            let descriptionDisplay = field.description || '';
            if (!descriptionDisplay && field.comment) {
                descriptionDisplay = field.comment;
            }
            descriptionDisplay = descriptionDisplay || '无说明';
            
            // 处理注释显示 - 如果description存在，则comment作为额外注释；否则显示为空
            let commentDisplay = '-';
            if (field.description && field.comment && field.comment !== field.description) {
                commentDisplay = field.comment;
            } else if (!field.description && !field.comment) {
                commentDisplay = '-';
            }
            
            return `
                <tr>
                    <td class="text-center">${index + 1}</td>
                    <td><code>${field.name}</code></td>
                    <td><span class="badge bg-info">${field.type}</span></td>
                    <td class="text-center">${nullableDisplay}</td>
                    <td class="text-center">${defaultValueDisplay}</td>
                    <td>${descriptionDisplay}</td>
                    <td>${commentDisplay}</td>
                </tr>
            `;
        }).join('');
        
        contentElement.innerHTML = `
            <!-- 基本信息一行展示 -->
            <div class="alert alert-info mb-3 py-2">
                <div class="d-flex align-items-center justify-content-between">
                    <div class="d-flex align-items-center">
                        <i class="fas fa-table me-2"></i>
                        <strong>表名:</strong>
                        <code class="ms-2 me-3">${table.name}</code>
                        <strong>字段数量:</strong>
                        <span class="badge bg-primary ms-2 me-3">${table.fields.length}</span>
                        <strong>文档位置:</strong>
                        <span class="text-muted ms-2">第 ${table.lineNumber} 行</span>
                    </div>
                </div>
            </div>
            
            <!-- 字段信息表格 -->
            <div class="card">
                <div class="card-header py-2">
                    <h6 class="mb-0">
                        <i class="fas fa-columns"></i> 字段列表
                    </h6>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th class="text-center" style="width: 50px;">#</th>
                                    <th style="width: 150px;">字段名</th>
                                    <th style="width: 120px;">数据类型</th>
                                    <th class="text-center" style="width: 80px;">是否可空</th>
                                    <th style="width: 100px;">默认值</th>
                                    <th style="width: 250px;">中文含义</th>
                                    <th style="width: 250px;">注释</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${fieldsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }
    

    
    updateSearchFilters() {
        this.dbManagerData.currentFilter = {
            tables: document.getElementById('filterTables')?.checked || false,
            fields: document.getElementById('filterFields')?.checked || false,
            comments: document.getElementById('filterComments')?.checked || false
        };
        
        // 重新执行搜索
        const searchInput = document.getElementById('globalSearchInput');
        if (searchInput) {
            this.performSearch(searchInput.value);
        }
    }

    // 通知相关方法
    async initNotificationPermission() {
        if ('Notification' in window) {
            this.notificationPermission = Notification.permission;
            if (this.notificationPermission === 'default') {
                // 在用户开始生成文档时请求权限，而不是立即请求
                console.log('浏览器通知权限未设置，将在生成文档时请求权限');
            }
        } else {
            console.log('此浏览器不支持桌面通知');
        }
    }

    async requestNotificationPermission() {
        if ('Notification' in window && this.notificationPermission === 'default') {
            try {
                this.notificationPermission = await Notification.requestPermission();
                return this.notificationPermission === 'granted';
            } catch (error) {
                console.error('请求通知权限失败:', error);
                return false;
            }
        }
        return this.notificationPermission === 'granted';
    }

    showDesktopNotification(title, message, options = {}) {
        if (this.notificationPermission === 'granted') {
            const notification = new Notification(title, {
                body: message,
                icon: '/static/favicon.ico', // 使用网站图标
                badge: '/static/favicon.ico',
                tag: 'db-doc-generation', // 防止重复通知
                requireInteraction: true, // 需要用户交互才会消失
                ...options
            });

            // 点击通知时聚焦到窗口
            notification.onclick = () => {
                window.focus();
                notification.close();
                this.stopTitleFlash(); // 停止标题闪烁
            };

            // 5秒后自动关闭
            setTimeout(() => {
                notification.close();
            }, 5000);

            return notification;
        }
        return null;
    }

    startTitleFlash(message = '文档生成完成！') {
        if (this.titleFlashInterval) {
            this.stopTitleFlash();
        }

        let isOriginal = true;
        this.titleFlashInterval = setInterval(() => {
            document.title = isOriginal ? message : this.originalTitle;
            isOriginal = !isOriginal;
        }, 1000); // 每秒切换一次

        // 10秒后自动停止闪烁
        setTimeout(() => {
            this.stopTitleFlash();
        }, 10000);
    }

    stopTitleFlash() {
        if (this.titleFlashInterval) {
            clearInterval(this.titleFlashInterval);
            this.titleFlashInterval = null;
            document.title = this.originalTitle; // 恢复原始标题
        }
    }

    playNotificationSound() {
        try {
            // 创建一个简单的提示音
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.2);

            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
        } catch (error) {
            console.log('无法播放提示音:', error);
        }
    }

    async notifyGenerationComplete(filePath) {
        const message = `数据库文档生成完成！文件已保存到: ${filePath}`;
        
        // 1. 显示Toast通知
        this.showMessage('🎉 数据库文档生成完成！', 'success');
        
        // 2. 请求并显示桌面通知
        const hasPermission = await this.requestNotificationPermission();
        if (hasPermission) {
            this.showDesktopNotification(
                'DB2Doc - 文档生成完成',
                message,
                {
                    icon: '/static/favicon.ico'
                }
            );
        }
        
        // 3. 开始页面标题闪烁
        this.startTitleFlash('🎉 文档生成完成！');
        
        // 4. 播放提示音
        this.playNotificationSound();
        
        // 5. 如果页面不可见，添加页面可见性监听
        if (document.hidden) {
            const handleVisibilityChange = () => {
                if (!document.hidden) {
                    this.stopTitleFlash();
                    document.removeEventListener('visibilitychange', handleVisibilityChange);
                }
            };
            document.addEventListener('visibilitychange', handleVisibilityChange);
        }
    }
}

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.app = new DatabaseDocGenerator();
    window.app.init(); // 调用初始化方法
    
    // 添加标签页切换事件监听器
    const dbManagerTab = document.querySelector('a[href="#db-manager"]');
    if (dbManagerTab) {
        dbManagerTab.addEventListener('shown.bs.tab', () => {
            // 重新绑定全屏按钮事件（仅绑定全屏按钮，避免重复绑定其他事件）
            const dbManagerFullscreenBtn = document.getElementById('dbManagerFullscreenBtn');
            if (dbManagerFullscreenBtn && !dbManagerFullscreenBtn.hasAttribute('data-event-bound')) {
                dbManagerFullscreenBtn.addEventListener('click', () => {
                    window.app.toggleDatabaseManagerFullscreen();
                });
                dbManagerFullscreenBtn.setAttribute('data-event-bound', 'true');
            }
        });
    }
    
    // 表单验证
    const form = document.getElementById('dbConfigForm');
    const inputs = form.querySelectorAll('input[required]');
    
    inputs.forEach(input => {
        input.addEventListener('blur', () => {
            if (input.value.trim() === '') {
                input.classList.add('is-invalid');
            } else {
                input.classList.remove('is-invalid');
            }
        });
    });
    
    // 页面卸载时清理资源
    window.addEventListener('beforeunload', () => {
        window.app.cleanup();
    });
});

// Toast 消息显示函数
function showToast(message, type = 'info') {
    console.log('showToast called with:', message, type);
    const toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        console.error('Toast container not found');
        return;
    }

    // 创建唯一的 toast ID
    const toastId = 'toast-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    
    // 根据类型设置样式
    const typeClasses = {
        'success': 'text-bg-success',
        'error': 'text-bg-danger',
        'warning': 'text-bg-warning',
        'info': 'text-bg-info'
    };
    
    const typeIcons = {
        'success': 'fas fa-check-circle',
        'error': 'fas fa-exclamation-circle',
        'warning': 'fas fa-exclamation-triangle',
        'info': 'fas fa-info-circle'
    };
    
    const bgClass = typeClasses[type] || typeClasses['info'];
    const iconClass = typeIcons[type] || typeIcons['info'];
    
    // 创建 toast HTML
    const toastHtml = `
        <div id="${toastId}" class="toast ${bgClass}" role="alert" aria-live="assertive" aria-atomic="true" data-bs-autohide="true" data-bs-delay="5000">
            <div class="toast-header">
                <i class="${iconClass} me-2"></i>
                <strong class="me-auto">系统消息</strong>
                <small class="text-muted">刚刚</small>
                <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="toast-body">
                ${message}
            </div>
        </div>
    `;
    
    // 添加到容器
    toastContainer.insertAdjacentHTML('beforeend', toastHtml);
    
    // 获取新创建的 toast 元素
    const toastElement = document.getElementById(toastId);
    
    // 初始化并显示 toast
    const toast = new bootstrap.Toast(toastElement);
    toast.show();
    
    // 监听 toast 隐藏事件，自动移除 DOM 元素
    toastElement.addEventListener('hidden.bs.toast', () => {
        toastElement.remove();
    });
}