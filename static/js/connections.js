// 连接管理应用类
class ConnectionManager {
    constructor() {
        this.connections = [];
        this.selectedConnection = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadConnections();
    }

    bindEvents() {
        // 添加连接按钮
        document.getElementById('addConnectionBtn').addEventListener('click', () => {
            this.clearForm();
        });

        // 保存连接按钮
        document.getElementById('saveConnectionBtn').addEventListener('click', () => {
            this.saveConnection();
        });

        // 测试连接按钮
        document.getElementById('testConnectionBtn').addEventListener('click', () => {
            this.testConnection();
        });

        // 连接按钮
        document.getElementById('connectBtn').addEventListener('click', () => {
            this.connect();
        });

        // 数据库类型切换
        document.getElementById('dbType').addEventListener('change', (e) => {
            this.onDbTypeChange(e.target.value);
        });
    }

    // 加载保存的连接
    loadConnections() {
        const savedConnections = localStorage.getItem('savedConnections');
        if (savedConnections) {
            this.connections = JSON.parse(savedConnections);
            this.renderConnections();
        } else {
            this.renderConnections();
        }
    }

    // 渲染连接列表
    renderConnections() {
        const container = document.getElementById('connectionsList');
        container.innerHTML = '';

        if (this.connections.length === 0) {
            container.innerHTML = `
                <div class="col-12">
                    <div class="text-center py-5 text-muted">
                        <i class="fas fa-database fa-3x mb-3"></i>
                        <p class="mb-0">还没有保存的连接</p>
                        <small>点击"添加连接"开始创建您的第一个连接</small>
                    </div>
                </div>
            `;
            return;
        }

        this.connections.forEach((connection, index) => {
            const col = document.createElement('div');
            col.className = 'col-12 mb-2';
            col.innerHTML = `
                <div class="card connection-card ${this.selectedConnection?.id === connection.id ? 'selected' : ''}" data-connection-id="${connection.id}">
                    <div class="card-body p-3">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <h6 class="card-title mb-1">${connection.name}</h6>
                                <p class="card-text small text-muted">
                                    <i class="fas fa-database"></i> ${connection.dbType} | 
                                    <i class="fas fa-server"></i> ${connection.host}:${connection.port} | 
                                    <i class="fas fa-database"></i> ${connection.database}
                                </p>
                            </div>
                            <div class="connection-actions">
                                <button type="button" class="btn btn-sm btn-outline-danger me-1 delete-connection" data-connection-id="${connection.id}">
                                    <i class="fas fa-trash"></i>
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-success connect-connection" data-connection-id="${connection.id}">
                                    <i class="fas fa-play"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            container.appendChild(col);
        });

        // 绑定连接卡片点击事件
        this.bindConnectionCardEvents();
    }

    // 绑定连接卡片事件
    bindConnectionCardEvents() {
        // 连接卡片点击事件
        const connectionCards = document.querySelectorAll('.connection-card');
        connectionCards.forEach(card => {
            card.addEventListener('click', (e) => {
                // 如果点击的是按钮，不触发选择事件
                if (e.target.closest('button')) {
                    return;
                }
                const connectionId = card.dataset.connectionId;
                this.selectConnection(connectionId);
            });
        });

        // 删除连接按钮事件
        const deleteButtons = document.querySelectorAll('.delete-connection');
        deleteButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const connectionId = button.dataset.connectionId;
                this.deleteConnection(connectionId);
            });
        });

        // 连接按钮事件
        const connectButtons = document.querySelectorAll('.connect-connection');
        connectButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const connectionId = button.dataset.connectionId;
                this.connectToConnection(connectionId);
            });
        });
    }

    // 选择连接
    selectConnection(connectionId) {
        this.selectedConnection = this.connections.find(conn => conn.id === connectionId);
        if (this.selectedConnection) {
            this.fillForm(this.selectedConnection);
            this.renderConnections();
            document.getElementById('connectBtn').disabled = false;
        }
    }

    // 填充表单
    fillForm(connection) {
        document.getElementById('connectionId').value = connection.id;
        document.getElementById('connectionName').value = connection.name;
        document.getElementById('dbType').value = connection.dbType;
        document.getElementById('port').value = connection.port;
        document.getElementById('host').value = connection.host;
        document.getElementById('user').value = connection.user;
        document.getElementById('password').value = connection.password;
        document.getElementById('database').value = connection.database;
    }

    // 清空表单
    clearForm() {
        this.selectedConnection = null;
        document.getElementById('dbConfigForm').reset();
        document.getElementById('connectionId').value = '';
        document.getElementById('connectBtn').disabled = true;
        this.renderConnections();
    }

    // 保存连接
    saveConnection() {
        const formData = new FormData(document.getElementById('dbConfigForm'));
        const connection = {
            id: document.getElementById('connectionId').value || this.generateId(),
            name: document.getElementById('connectionName').value,
            dbType: document.getElementById('dbType').value,
            host: document.getElementById('host').value,
            port: document.getElementById('port').value,
            user: document.getElementById('user').value,
            password: document.getElementById('password').value,
            database: document.getElementById('database').value
        };

        // 检查连接是否已存在
        const existingIndex = this.connections.findIndex(conn => conn.id === connection.id);
        if (existingIndex !== -1) {
            // 更新现有连接
            this.connections[existingIndex] = connection;
            this.showMessage('连接已更新！', 'success');
        } else {
            // 添加新连接
            this.connections.push(connection);
            this.showMessage('连接已保存！', 'success');
        }

        // 保存到本地存储
        localStorage.setItem('savedConnections', JSON.stringify(this.connections));
        this.renderConnections();
    }

    // 生成唯一ID
    generateId() {
        return 'conn_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    }

    // 删除连接
    deleteConnection(connectionId) {
        if (confirm('确定要删除这个连接吗？')) {
            this.connections = this.connections.filter(conn => conn.id !== connectionId);
            localStorage.setItem('savedConnections', JSON.stringify(this.connections));
            if (this.selectedConnection?.id === connectionId) {
                this.clearForm();
            }
            this.renderConnections();
            this.showMessage('连接已删除！', 'success');
        }
    }

    // 测试连接
    async testConnection() {
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
                this.showMessage('数据库连接成功！', 'success');
                document.getElementById('connectBtn').disabled = false;
                // 加载数据库列表
                await this.loadDatabasesList(config);
            } else {
                this.showMessage(`连接失败: ${result.message}`, 'danger');
            }
        } catch (error) {
            this.showMessage(`连接错误: ${error.message}`, 'danger');
        } finally {
            this.hideLoading();
        }
    }

    // 加载数据库列表
    async loadDatabasesList(config) {
        try {
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

    // 渲染数据库datalist
    renderDatabaseDatalist(databases) {
        // 确保datalist元素存在
        let datalist = document.getElementById('databaseOptions');
        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = 'databaseOptions';
            const databaseInput = document.getElementById('database');
            databaseInput.setAttribute('list', 'databaseOptions');
            databaseInput.parentElement.appendChild(datalist);
        }
        
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

    // 连接到数据库
    connect() {
        const config = this.getDbConfig();
        // 将连接信息保存到sessionStorage，以便主应用使用
        sessionStorage.setItem('currentConnection', JSON.stringify(config));
        // 跳转到主应用页面
        window.location.href = '/';
    }

    // 直接连接到指定连接
    connectToConnection(connectionId) {
        const connection = this.connections.find(conn => conn.id === connectionId);
        if (connection) {
            // 将连接信息保存到sessionStorage，以便主应用使用
            const config = {
                db_type: connection.dbType,
                host: connection.host,
                port: connection.port,
                user: connection.user,
                password: connection.password,
                database: connection.database
            };
            sessionStorage.setItem('currentConnection', JSON.stringify(config));
            // 跳转到主应用页面
            window.location.href = '/';
        }
    }

    // 获取数据库配置
    getDbConfig() {
        return {
            db_type: document.getElementById('dbType').value,
            host: document.getElementById('host').value,
            port: document.getElementById('port').value,
            user: document.getElementById('user').value,
            password: document.getElementById('password').value,
            database: document.getElementById('database').value
        };
    }

    // 数据库类型切换处理
    onDbTypeChange(dbType) {
        const portInput = document.getElementById('port');
        if (dbType === 'mysql' && (portInput.value === '1433' || portInput.value === '')) {
            portInput.value = '3306';
        } else if (dbType === 'sqlserver' && (portInput.value === '3306' || portInput.value === '')) {
            portInput.value = '1433';
        }
    }

    // 显示消息
    showMessage(message, type = 'info') {
        // 创建Toast元素
        const toast = document.createElement('div');
        toast.className = `toast align-items-center text-white bg-${type} border-0 position-fixed bottom-0 end-0 m-3`;
        toast.role = 'alert';
        toast.setAttribute('aria-live', 'assertive');
        toast.setAttribute('aria-atomic', 'true');
        toast.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        `;
        
        // 添加到页面
        document.body.appendChild(toast);
        
        // 初始化并显示Toast
        const bsToast = new bootstrap.Toast(toast);
        bsToast.show();
        
        // 3秒后自动移除
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    // 显示加载状态
    showLoading() {
        // 创建全局加载覆盖层
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
            `;
            loadingOverlay.innerHTML = `
                <div class="text-center">
                    <div class="spinner-border" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <div class="mt-2">处理中...</div>
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
}

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new ConnectionManager();
});
