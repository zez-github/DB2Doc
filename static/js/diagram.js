class DatabaseDiagram {
    constructor() {
        this.currentConnection = null;
        this.mermaidData = null;
        this.tablesData = null;
        this.relationships = null;
        this.insights = null;  // 数据洞察
        // 缩放和平移状态
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.isPanning = false;
        this.startX = 0;
        this.startY = 0;
        // Tooltip 元素
        this.tooltip = null;
        this.init();
    }

    init() {
        this.loadConnection();
        this.bindEvents();
        this.bindZoomPanEvents();
        this.initMermaid();
        this.loadGraph();
    }

    initMermaid() {
        if (window.mermaid) {
            mermaid.initialize({
                startOnLoad: false,
                theme: 'default',
                securityLevel: 'loose',
                er: {
                    useMaxWidth: false
                }
            });
        }
    }

    loadConnection() {
        const raw = sessionStorage.getItem('currentConnection');
        if (!raw) {
            window.location.href = '/connections';
            return;
        }
        this.currentConnection = JSON.parse(raw);
        const summary = document.getElementById('diagramConnectionSummary');
        if (summary && this.currentConnection) {
            const dbType = (this.currentConnection.db_type || '').toUpperCase();
            summary.textContent = `${dbType} ${this.currentConnection.host}:${this.currentConnection.port} / ${this.currentConnection.database}`;
        }
    }

    bindEvents() {
        const reloadBtn = document.getElementById('diagramReloadBtn');
        if (reloadBtn) reloadBtn.addEventListener('click', () => this.loadGraph());

        const exportBtn = document.getElementById('diagramExportPngBtn');
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportPng());

        const search = document.getElementById('diagramSearch');
        if (search) search.addEventListener('input', () => this.applySearch(search.value));

        const showInferred = document.getElementById('diagramShowInferred');
        if (showInferred) showInferred.addEventListener('change', () => this.loadGraph());

        const useLLM = document.getElementById('diagramUseLLM');
        if (useLLM) useLLM.addEventListener('change', () => this.loadGraph());

        const threshold = document.getElementById('diagramThreshold');
        const thresholdValue = document.getElementById('diagramThresholdValue');
        if (threshold && thresholdValue) {
            const update = () => {
                const v = Number(threshold.value || 0);
                thresholdValue.textContent = v.toFixed(2);
            };
            threshold.addEventListener('input', update);
            threshold.addEventListener('change', () => this.loadGraph());
            update();
        }
    }

    bindZoomPanEvents() {
        const container = document.getElementById('cy');
        if (!container) return;

        // 缩放按钮
        const zoomInBtn = document.getElementById('zoomInBtn');
        const zoomOutBtn = document.getElementById('zoomOutBtn');
        const zoomResetBtn = document.getElementById('zoomResetBtn');

        if (zoomInBtn) zoomInBtn.addEventListener('click', () => this.zoomIn());
        if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => this.zoomOut());
        if (zoomResetBtn) zoomResetBtn.addEventListener('click', () => this.zoomReset());

        // 鼠标滚轮缩放
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            this.setZoom(this.zoom + delta, e.clientX, e.clientY);
        }, { passive: false });

        // 鼠标拖拽平移
        container.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // 仅左键
            this.isPanning = true;
            this.startX = e.clientX - this.panX;
            this.startY = e.clientY - this.panY;
            container.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isPanning) return;
            this.panX = e.clientX - this.startX;
            this.panY = e.clientY - this.startY;
            this.applyTransform();
        });

        document.addEventListener('mouseup', () => {
            if (this.isPanning) {
                this.isPanning = false;
                const container = document.getElementById('cy');
                if (container) container.style.cursor = 'grab';
            }
        });

        // 双击重置
        container.addEventListener('dblclick', () => this.zoomReset());
    }

    setZoom(newZoom, clientX, clientY) {
        const minZoom = 0.2;
        const maxZoom = 3;
        newZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));

        // 以鼠标位置为中心缩放
        if (clientX !== undefined && clientY !== undefined) {
            const container = document.getElementById('cy');
            if (container) {
                const rect = container.getBoundingClientRect();
                const mouseX = clientX - rect.left;
                const mouseY = clientY - rect.top;

                const zoomRatio = newZoom / this.zoom;
                this.panX = mouseX - (mouseX - this.panX) * zoomRatio;
                this.panY = mouseY - (mouseY - this.panY) * zoomRatio;
            }
        }

        this.zoom = newZoom;
        this.applyTransform();
        this.updateZoomLabel();
    }

    zoomIn() {
        this.setZoom(this.zoom + 0.2);
    }

    zoomOut() {
        this.setZoom(this.zoom - 0.2);
    }

    zoomReset() {
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.applyTransform();
        this.updateZoomLabel();
    }

    applyTransform() {
        const svg = document.querySelector('#cy svg');
        if (svg) {
            svg.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
            svg.style.transformOrigin = '0 0';
        }
    }

    updateZoomLabel() {
        const label = document.getElementById('zoomLevel');
        if (label) {
            label.textContent = `${Math.round(this.zoom * 100)}%`;
        }
    }

    async loadGraph() {
        if (!this.currentConnection) return;

        const showInferred = document.getElementById('diagramShowInferred');
        const useLLM = document.getElementById('diagramUseLLM');
        const thresholdEl = document.getElementById('diagramThreshold');

        const payload = {
            ...this.currentConnection,
            options: {
                include_fk: true,
                include_inferred: !!(showInferred && showInferred.checked),
                use_llm: !!(useLLM && useLLM.checked),
                threshold: thresholdEl ? Number(thresholdEl.value || 0.6) : 0.6,
            }
        };

        const statsEl = document.getElementById('diagramStats');
        if (statsEl) statsEl.textContent = '加载中...';

        const resp = await fetch('/api/graph', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await resp.json();
        if (!result.success) {
            if (statsEl) statsEl.textContent = `失败`;
            alert(`加载失败：${result.message || '未知错误'}`);
            return;
        }
        
        this.mermaidData = result.mermaid;
        this.tablesData = result.tables;
        this.relationships = result.relationships;
        this.insights = result.insights;  // 保存洞察数据
        this.renderGraph(result.mermaid, result.stats);
    }

    async renderGraph(mermaidDSL, stats) {
        const container = document.getElementById('cy');
        if (!container) return;

        if (!window.mermaid) {
            container.innerHTML = '<div class="p-4 text-center text-danger">Mermaid 加载失败（可能网络不可用）</div>';
            return;
        }

        // 清空容器
        container.innerHTML = '';
        
        // 创建 Mermaid 渲染容器
        const mermaidDiv = document.createElement('div');
        mermaidDiv.className = 'mermaid';
        mermaidDiv.style.cssText = 'min-height: 400px; padding: 20px;';
        mermaidDiv.textContent = mermaidDSL;
        container.appendChild(mermaidDiv);

        // 渲染 Mermaid 图
        try {
            await mermaid.run({ nodes: [mermaidDiv] });
            
            // 应用数据洞察视觉效果
            this.applyInsightStyles();
            
            // 绑定 Tooltip 事件
            this.bindTooltipEvents();
            
            // 渲染图例
            this.renderLegend();

            // 更新统计信息
            const statsEl = document.getElementById('diagramStats');
            if (statsEl && stats) {
                let statsText = `${stats.tables_count || 0} 表 · ${stats.relationships_count || 0} 关系`;
                if (stats.core_count > 0) {
                    statsText += ` · ${stats.core_count} 核心`;
                }
                if (stats.isolated_count > 0) {
                    statsText += ` · ${stats.isolated_count} 孤立`;
                }
                statsEl.textContent = statsText;
            }
            
            // 渲染完成后重置缩放和平移
            this.zoomReset();
        } catch (err) {
            container.innerHTML = `<div class="p-4 text-center text-danger">渲染失败：${err.message}</div>`;
        }
    }

    /**
     * 应用数据洞察视觉样式
     * 注意：Mermaid SVG 有内联样式，必须直接操作 SVG 属性而非 CSS 类
     */
    applyInsightStyles() {
        const svg = document.querySelector('#cy svg');
        if (!svg || !this.tablesData) return;

        // 前缀颜色映射
        const prefixColors = {
            sys: '#dbeafe',
            data: '#dcfce7',
            log: '#fef3c7',
            config: '#f3e8ff',
            user: '#fce7f3',
            order: '#ffedd5',
            other: '#f1f5f9'
        };

        // Mermaid ER 图：查找所有实体（表）
        // 结构通常是: g > rect.er.entityBox + text.er.entityLabel
        let matchedCount = 0;
        svg.querySelectorAll('g').forEach(g => {
            // 查找实体框和标签
            const entityBox = g.querySelector('rect.er.entityBox') || g.querySelector('.entityBox');
            const entityLabel = g.querySelector('text.er.entityLabel') || g.querySelector('.entityLabel');
            
            if (!entityBox || !entityLabel) return;
            
            const displayName = entityLabel.textContent?.trim();
            if (!displayName) return;
            
            const result = this.findTableData(displayName);
            if (!result) return;
            
            const { originalName, data: tableData } = result;
            matchedCount++;
            
            // 直接操作 SVG 属性（覆盖内联样式）
            const prefix = tableData.prefix || 'other';
            const bgColor = prefixColors[prefix] || prefixColors.other;
            
            // 设置背景色
            entityBox.setAttribute('fill', bgColor);
            
            // 核心表：金色粗边框 + 阴影
            if (tableData.is_core) {
                entityBox.setAttribute('stroke', '#f59e0b');
                entityBox.setAttribute('stroke-width', '3');
                entityBox.style.filter = 'drop-shadow(0 0 4px rgba(245, 158, 11, 0.5))';
                // 加粗表名
                entityLabel.setAttribute('font-weight', '700');
            }
            
            // 孤立表：灰色虚线边框
            if (tableData.is_isolated) {
                entityBox.setAttribute('stroke', '#9ca3af');
                entityBox.setAttribute('stroke-dasharray', '4 2');
                entityBox.setAttribute('opacity', '0.7');
            }
            
            // 存储原始表名到节点（用于查找 tablesData）
            g.dataset.tableName = originalName;
            g.dataset.tableInfo = JSON.stringify({
                comment: tableData.comment || '',
                columns_count: tableData.columns_count || 0,
                relation_count: tableData.relation_count || 0,
                in_degree: tableData.in_degree || 0,
                out_degree: tableData.out_degree || 0,
                is_core: tableData.is_core || false,
                is_isolated: tableData.is_isolated || false,
                prefix: prefix
            });
        });
        
        console.log(`[Diagram] 已应用视觉样式，匹配 ${matchedCount} 张表`);
    }

    /**
     * 查找表数据（处理 Mermaid 名称转换）
     * 返回 { originalName, data } 或 null
     */
    findTableData(mermaidName) {
        if (!this.tablesData) return null;
        
        // 直接匹配
        if (this.tablesData[mermaidName]) {
            return { originalName: mermaidName, data: this.tablesData[mermaidName] };
        }
        
        // Mermaid 会将特殊字符转换为下划线
        const normalized = mermaidName.replace(/[-.\s]/g, '_');
        for (const [name, data] of Object.entries(this.tablesData)) {
            const normalizedName = name.replace(/[-.\s]/g, '_');
            if (normalizedName === normalized) {
                return { originalName: name, data };
            }
        }
        
        return null;
    }

    /**
     * 绑定 Tooltip 和点击事件
     */
    bindTooltipEvents() {
        const svg = document.querySelector('#cy svg');
        if (!svg) return;

        // 创建 Tooltip 元素
        if (!this.tooltip) {
            this.tooltip = document.createElement('div');
            this.tooltip.className = 'diagram-tooltip';
            this.tooltip.style.display = 'none';
            document.body.appendChild(this.tooltip);
        }

        // 绑定关闭面板按钮
        const closeBtn = document.getElementById('closeDetailPanel');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeDetailPanel());
        }

        // 查找所有已标记表数据的 g 元素
        const tableNodes = svg.querySelectorAll('g[data-table-name]');
        console.log(`[Diagram] 绑定事件到 ${tableNodes.length} 个表节点`);
        
        tableNodes.forEach(node => {
            node.style.cursor = 'pointer';
            
            // 悬停显示简要 Tooltip
            node.addEventListener('mouseenter', (e) => {
                const info = node.dataset.tableInfo;
                if (!info) return;
                
                const data = JSON.parse(info);
                const tableName = node.dataset.tableName || '';
                
                let html = `<div class="tooltip-title">${tableName}`;
                if (data.is_core) {
                    html += '<span class="tooltip-badge badge-core">核心表</span>';
                }
                if (data.is_isolated) {
                    html += '<span class="tooltip-badge badge-isolated">孤立表</span>';
                }
                html += '</div>';
                
                if (data.comment) {
                    html += `<div style="color: #94a3b8; margin-bottom: 4px;">${data.comment}</div>`;
                }
                
                html += `<div>字段数: ${data.columns_count} · 点击查看详情</div>`;
                
                this.tooltip.innerHTML = html;
                this.tooltip.style.display = 'block';
                this.updateTooltipPosition(e);
            });
            
            node.addEventListener('mousemove', (e) => {
                this.updateTooltipPosition(e);
            });
            
            node.addEventListener('mouseleave', () => {
                this.tooltip.style.display = 'none';
            });
            
            // 点击打开详情面板
            node.addEventListener('click', (e) => {
                e.stopPropagation();  // 防止事件冒泡
                const tableName = node.dataset.tableName;
                console.log(`[Diagram] 点击表: ${tableName}`);
                if (tableName) {
                    this.openDetailPanel(tableName);
                }
            });
        });
    }

    updateTooltipPosition(e) {
        if (!this.tooltip) return;
        const x = e.clientX + 12;
        const y = e.clientY + 12;
        
        // 防止超出屏幕
        const rect = this.tooltip.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width - 10;
        const maxY = window.innerHeight - rect.height - 10;
        
        this.tooltip.style.left = `${Math.min(x, maxX)}px`;
        this.tooltip.style.top = `${Math.min(y, maxY)}px`;
    }

    /**
     * 渲染图例
     */
    renderLegend() {
        const container = document.getElementById('cy');
        if (!container) return;
        
        // 移除旧图例
        container.querySelector('.diagram-legend')?.remove();
        
        // 获取前缀分组
        const prefixGroups = this.insights?.prefix_groups || {};
        const prefixList = Object.keys(prefixGroups).filter(p => prefixGroups[p]?.length > 0);
        
        if (prefixList.length === 0) return;
        
        const legend = document.createElement('div');
        legend.className = 'diagram-legend';
        
        // 前缀颜色映射
        const prefixColors = {
            sys: '#dbeafe',
            data: '#dcfce7',
            log: '#fef3c7',
            config: '#f3e8ff',
            user: '#fce7f3',
            order: '#ffedd5',
            other: '#f1f5f9'
        };
        
        let html = '<div style="font-weight: 600; margin-bottom: 6px;">表分组</div>';
        
        prefixList.slice(0, 8).forEach(prefix => {
            const color = prefixColors[prefix] || prefixColors.other;
            const count = prefixGroups[prefix]?.length || 0;
            html += `
                <div class="diagram-legend-item">
                    <div class="diagram-legend-color" style="background: ${color}"></div>
                    <span>${prefix}_ (${count})</span>
                </div>
            `;
        });
        
        // 核心表和孤立表图例
        html += `
            <div style="border-top: 1px solid #e2e8f0; margin: 6px 0; padding-top: 6px;">
                <div class="diagram-legend-item">
                    <div class="diagram-legend-color" style="background: #fff; border: 2px solid #f59e0b;"></div>
                    <span>核心表</span>
                </div>
                <div class="diagram-legend-item">
                    <div class="diagram-legend-color" style="background: #f1f5f9; border: 1px dashed #9ca3af;"></div>
                    <span>孤立表</span>
                </div>
            </div>
        `;
        
        legend.innerHTML = html;
        container.appendChild(legend);
    }

    async exportPng() {
        const container = document.getElementById('cy');
        const svg = container ? container.querySelector('svg') : null;
        if (!svg) {
            alert('没有可导出的图形');
            return;
        }

        // 将 SVG 转换为 PNG
        const svgData = new XMLSerializer().serializeToString(svg);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            
            canvas.toBlob(blob => {
                const link = document.createElement('a');
                link.download = `database_diagram_${Date.now()}.png`;
                link.href = URL.createObjectURL(blob);
                link.click();
                URL.revokeObjectURL(url);
            });
        };

        img.src = url;
    }

    applySearch(term) {
        const container = document.getElementById('cy');
        const svg = container ? container.querySelector('svg') : null;
        if (!svg) return;

        const trimmedTerm = term.trim().toLowerCase();
        
        // 查找所有已标记的表
        const allTableNodes = svg.querySelectorAll('g[data-table-name]');
        
        if (!trimmedTerm) {
            // 清空搜索：恢复所有节点透明度
            allTableNodes.forEach(node => {
                node.style.opacity = '1';
                const entityBox = node.querySelector('.entityBox');
                if (entityBox) {
                    entityBox.style.filter = '';
                }
            });
            return;
        }

        // 匹配的表名集合
        const matchedTables = new Set();

        // 高亮包含搜索词的表名，其他变淡
        allTableNodes.forEach(node => {
            const tableName = node.dataset.tableName || '';
            const tableInfo = node.dataset.tableInfo ? JSON.parse(node.dataset.tableInfo) : {};
            
            // 搜索表名和注释
            const searchText = `${tableName} ${tableInfo.comment || ''}`.toLowerCase();
            
            const entityBox = node.querySelector('.entityBox');
            
            if (searchText.includes(trimmedTerm)) {
                // 匹配：高亮显示
                node.style.opacity = '1';
                if (entityBox) {
                    entityBox.setAttribute('stroke', '#2563eb');
                    entityBox.setAttribute('stroke-width', '3');
                    entityBox.style.filter = 'drop-shadow(0 0 6px rgba(37, 99, 235, 0.6))';
                }
                matchedTables.add(tableName);
            } else {
                // 不匹配：变淡
                node.style.opacity = '0.25';
                if (entityBox) {
                    entityBox.style.filter = '';
                }
            }
        });
        
        console.log(`[Search] 匹配 ${matchedTables.size} 张表`);
    }

    /**
     * 打开表详情面板
     */
    openDetailPanel(tableName) {
        console.log(`[DetailPanel] 打开面板: ${tableName}`);
        
        const panel = document.getElementById('tableDetailPanel');
        if (!panel) {
            console.error('[DetailPanel] 未找到面板元素 #tableDetailPanel');
            return;
        }
        
        const tableData = this.tablesData?.[tableName];
        if (!tableData) {
            console.warn(`[DetailPanel] 未找到表数据: ${tableName}`, Object.keys(this.tablesData || {}));
            return;
        }
        
        console.log(`[DetailPanel] 表数据:`, tableData);
        
        // 更新面板内容
        document.getElementById('detailTableName').textContent = tableName;
        
        // 注释
        const commentEl = document.getElementById('detailTableComment');
        if (tableData.comment) {
            commentEl.textContent = tableData.comment;
            commentEl.style.display = 'block';
        } else {
            commentEl.style.display = 'none';
        }
        
        // 徽章
        const coreBadge = document.getElementById('detailCoreBadge');
        const isolatedBadge = document.getElementById('detailIsolatedBadge');
        coreBadge.style.display = tableData.is_core ? 'inline-block' : 'none';
        isolatedBadge.style.display = tableData.is_isolated ? 'inline-block' : 'none';
        
        // 统计信息
        const statsEl = document.getElementById('detailTableStats');
        statsEl.innerHTML = `
            <span><i class="fas fa-columns text-muted"></i> ${tableData.columns_count || 0} 字段</span>
            <span><i class="fas fa-arrow-right text-success"></i> ${tableData.out_degree || 0} 出</span>
            <span><i class="fas fa-arrow-left text-primary"></i> ${tableData.in_degree || 0} 入</span>
        `;
        
        // 字段列表
        const columnsCountEl = document.getElementById('detailColumnsCount');
        const columnsListEl = document.getElementById('detailColumnsList');
        const columns = tableData.columns || [];
        columnsCountEl.textContent = `(${columns.length})`;
        
        if (columns.length > 0) {
            let columnsHtml = '';
            columns.forEach(([colName, colType, colComment]) => {
                columnsHtml += `
                    <div class="table-detail-column-item">
                        <span class="table-detail-column-name">${colName || ''}</span>
                        <span class="table-detail-column-type">${colType || ''}</span>
                        <span class="table-detail-column-comment">${colComment || ''}</span>
                    </div>
                `;
            });
            columnsListEl.innerHTML = columnsHtml;
        } else {
            columnsListEl.innerHTML = '<div class="table-detail-empty">无字段信息</div>';
        }
        
        // 关联关系
        const relationsCountEl = document.getElementById('detailRelationsCount');
        const relationsListEl = document.getElementById('detailRelationsList');
        const relations = (this.relationships || []).filter(r => 
            r.source === tableName || r.target === tableName
        );
        relationsCountEl.textContent = `(${relations.length})`;
        
        if (relations.length > 0) {
            let relationsHtml = '';
            relations.forEach(rel => {
                const isSource = rel.source === tableName;
                const otherTable = isSource ? rel.target : rel.source;
                const direction = isSource ? '→' : '←';
                const directionText = isSource ? '引用' : '被引用';
                
                let kindBadge = '';
                if (rel.kind === 'fk') {
                    kindBadge = '<span class="badge bg-primary">FK</span>';
                } else {
                    const conf = rel.confidence?.toFixed(2) || '?';
                    kindBadge = `<span class="badge bg-info">推断 ${conf}</span>`;
                }
                
                relationsHtml += `
                    <div class="table-detail-relation-item">
                        ${kindBadge}
                        <span class="table-detail-relation-arrow">${direction}</span>
                        <span class="table-detail-relation-table" data-table="${otherTable}">${otherTable}</span>
                        <span class="text-muted">(${directionText})</span>
                    </div>
                `;
                
                if (rel.reason && rel.kind !== 'fk') {
                    relationsHtml += `<div class="table-detail-relation-reason">${rel.reason}</div>`;
                }
            });
            relationsListEl.innerHTML = relationsHtml;
            
            // 绑定关联表点击事件
            relationsListEl.querySelectorAll('.table-detail-relation-table').forEach(el => {
                el.addEventListener('click', () => {
                    const targetTable = el.dataset.table;
                    if (targetTable) {
                        this.openDetailPanel(targetTable);
                    }
                });
            });
        } else {
            relationsListEl.innerHTML = '<div class="table-detail-empty">无关联关系</div>';
        }
        
        // 打开面板
        panel.classList.add('open');
        
        // 高亮当前选中的表
        this.highlightSelectedTable(tableName);
    }

    /**
     * 关闭详情面板
     */
    closeDetailPanel() {
        const panel = document.getElementById('tableDetailPanel');
        if (panel) {
            panel.classList.remove('open');
        }
        this.clearTableHighlight();
    }

    /**
     * 高亮选中的表
     */
    highlightSelectedTable(tableName) {
        this.clearTableHighlight();
        
        const svg = document.querySelector('#cy svg');
        if (!svg) return;
        
        const node = svg.querySelector(`g[data-table-name="${tableName}"]`);
        if (node) {
            const entityBox = node.querySelector('.entityBox');
            if (entityBox) {
                entityBox.dataset.originalStroke = entityBox.getAttribute('stroke');
                entityBox.dataset.originalStrokeWidth = entityBox.getAttribute('stroke-width');
                entityBox.setAttribute('stroke', '#10b981');
                entityBox.setAttribute('stroke-width', '3');
                entityBox.style.filter = 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.6))';
            }
        }
    }

    /**
     * 清除表高亮
     */
    clearTableHighlight() {
        const svg = document.querySelector('#cy svg');
        if (!svg) return;
        
        svg.querySelectorAll('g[data-table-name]').forEach(node => {
            const entityBox = node.querySelector('.entityBox');
            if (entityBox && entityBox.dataset.originalStroke !== undefined) {
                entityBox.setAttribute('stroke', entityBox.dataset.originalStroke || '#000');
                entityBox.setAttribute('stroke-width', entityBox.dataset.originalStrokeWidth || '1');
                entityBox.style.filter = '';
                delete entityBox.dataset.originalStroke;
                delete entityBox.dataset.originalStrokeWidth;
            }
        });
    }

}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new DatabaseDiagram();
});
