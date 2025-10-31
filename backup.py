#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import sys
import shutil
import zipfile
import json
from datetime import datetime
import logging

class BackupManager:
    def __init__(self, config_file='config/config.json'):
        self.config = self.load_config(config_file)
        self.setup_logging()
        self.backup_dir = self.config.get('file_management', {}).get('backup_dir', 'backups')
        self.ensure_backup_dir()
    
    def load_config(self, config_file):
        """加载配置文件"""
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            print(f"配置文件 {config_file} 不存在")
            return {}
        except json.JSONDecodeError:
            print(f"配置文件 {config_file} 格式错误")
            return {}
    
    def setup_logging(self):
        """设置日志"""
        log_dir = self.config.get('logging', {}).get('log_dir', 'logs')
        if not os.path.exists(log_dir):
            os.makedirs(log_dir)
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(os.path.join(log_dir, 'backup.log')),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(__name__)
    
    def ensure_backup_dir(self):
        """确保备份目录存在"""
        if not os.path.exists(self.backup_dir):
            os.makedirs(self.backup_dir)
            self.logger.info(f"创建备份目录: {self.backup_dir}")
    
    def create_backup(self, backup_type='full'):
        """创建备份"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_name = f"backup_{backup_type}_{timestamp}.zip"
        backup_path = os.path.join(self.backup_dir, backup_name)
        
        self.logger.info(f"开始创建备份: {backup_name}")
        
        try:
            with zipfile.ZipFile(backup_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                if backup_type == 'full':
                    self._add_full_backup(zipf)
                elif backup_type == 'config':
                    self._add_config_backup(zipf)
                elif backup_type == 'logs':
                    self._add_logs_backup(zipf)
                elif backup_type == 'docs':
                    self._add_docs_backup(zipf)
                else:
                    self.logger.error(f"未知的备份类型: {backup_type}")
                    return False
            
            backup_size = os.path.getsize(backup_path)
            self.logger.info(f"备份创建成功: {backup_name} ({backup_size / 1024 / 1024:.1f} MB)")
            return backup_path
        
        except Exception as e:
            self.logger.error(f"创建备份失败: {str(e)}")
            if os.path.exists(backup_path):
                os.remove(backup_path)
            return False
    
    def _add_full_backup(self, zipf):
        """添加完整备份内容"""
        # 配置文件
        config_files = ['config/config.json', 'requirements.txt', 'docs/README.md']
        for file in config_files:
            if os.path.exists(file):
                zipf.write(file, f"config/{os.path.basename(file)}")
        
        # 应用文件（按当前项目结构）
        app_files = ['main.py', 'monitor.py', 'backup.py']
        for file in app_files:
            if os.path.exists(file):
                zipf.write(file, f"app/{file}")
        
        # 模板和静态文件
        self._add_directory_to_zip(zipf, 'templates', 'templates')
        self._add_directory_to_zip(zipf, 'static', 'static')
        
        # 日志文件
        self._add_directory_to_zip(zipf, 'logs', 'logs')
        
        # 生成的文档
        for file in os.listdir('.'):
            if file.endswith('.md') and file not in ['README.md']:
                zipf.write(file, f"docs/{file}")
    
    def _add_config_backup(self, zipf):
        """添加配置备份"""
        config_files = ['config/config.json', 'requirements.txt', 'docs/README.md']
        for file in config_files:
            if os.path.exists(file):
                zipf.write(file, f"config/{os.path.basename(file)}")
    
    def _add_logs_backup(self, zipf):
        """添加日志备份"""
        self._add_directory_to_zip(zipf, 'logs', 'logs')
    
    def _add_docs_backup(self, zipf):
        """添加文档备份"""
        for file in os.listdir('.'):
            if file.endswith('.md') and file not in ['README.md']:
                zipf.write(file, f"docs/{file}")
    
    def _add_directory_to_zip(self, zipf, dir_path, arc_path):
        """添加目录到zip文件"""
        if not os.path.exists(dir_path):
            return
        
        for root, dirs, files in os.walk(dir_path):
            for file in files:
                file_path = os.path.join(root, file)
                arc_file_path = os.path.join(arc_path, os.path.relpath(file_path, dir_path))
                zipf.write(file_path, arc_file_path)
    
    def list_backups(self):
        """列出所有备份"""
        if not os.path.exists(self.backup_dir):
            self.logger.info("没有找到备份目录")
            return []
        
        backups = []
        for file in os.listdir(self.backup_dir):
            if file.endswith('.zip') and file.startswith('backup_'):
                file_path = os.path.join(self.backup_dir, file)
                file_size = os.path.getsize(file_path)
                file_time = datetime.fromtimestamp(os.path.getctime(file_path))
                
                backups.append({
                    'name': file,
                    'path': file_path,
                    'size': file_size,
                    'created': file_time
                })
        
        # 按创建时间排序
        backups.sort(key=lambda x: x['created'], reverse=True)
        return backups
    
    def restore_backup(self, backup_file):
        """恢复备份"""
        backup_path = os.path.join(self.backup_dir, backup_file)
        if not os.path.exists(backup_path):
            self.logger.error(f"备份文件不存在: {backup_file}")
            return False
        
        self.logger.info(f"开始恢复备份: {backup_file}")
        
        try:
            with zipfile.ZipFile(backup_path, 'r') as zipf:
                zipf.extractall('.')
            
            self.logger.info(f"备份恢复成功: {backup_file}")
            return True
        
        except Exception as e:
            self.logger.error(f"恢复备份失败: {str(e)}")
            return False
    
    def cleanup_old_backups(self, keep_count=10):
        """清理旧备份"""
        backups = self.list_backups()
        if len(backups) <= keep_count:
            self.logger.info(f"备份数量 ({len(backups)}) 未超过保留数量 ({keep_count})")
            return
        
        old_backups = backups[keep_count:]
        deleted_count = 0
        
        for backup in old_backups:
            try:
                os.remove(backup['path'])
                deleted_count += 1
                self.logger.info(f"删除旧备份: {backup['name']}")
            except Exception as e:
                self.logger.error(f"删除备份失败: {backup['name']} - {str(e)}")
        
        self.logger.info(f"清理完成，删除了 {deleted_count} 个旧备份")
    
    def print_backup_status(self):
        """打印备份状态"""
        print("\n" + "="*50)
        print("数据库文档生成器 - 备份状态")
        print("="*50)
        
        backups = self.list_backups()
        
        if not backups:
            print("没有找到备份文件")
            return
        
        print(f"总备份数量: {len(backups)}")
        print(f"备份目录: {self.backup_dir}")
        
        total_size = sum(backup['size'] for backup in backups)
        print(f"总大小: {total_size / 1024 / 1024:.1f} MB")
        
        print("\n最近的备份:")
        for backup in backups[:5]:  # 显示最近5个备份
            size_mb = backup['size'] / 1024 / 1024
            print(f"  {backup['name']} - {size_mb:.1f} MB - {backup['created'].strftime('%Y-%m-%d %H:%M:%S')}")
        
        print("="*50)

def main():
    """主函数"""
    if len(sys.argv) > 1:
        command = sys.argv[1]
    else:
        command = "status"
    
    backup_manager = BackupManager()
    
    if command == "create":
        backup_type = sys.argv[2] if len(sys.argv) > 2 else "full"
        result = backup_manager.create_backup(backup_type)
        if result:
            print(f"备份创建成功: {result}")
        else:
            print("备份创建失败")
    
    elif command == "list":
        backups = backup_manager.list_backups()
        if backups:
            print("备份列表:")
            for backup in backups:
                size_mb = backup['size'] / 1024 / 1024
                print(f"  {backup['name']} - {size_mb:.1f} MB - {backup['created'].strftime('%Y-%m-%d %H:%M:%S')}")
        else:
            print("没有找到备份文件")
    
    elif command == "restore":
        if len(sys.argv) < 3:
            print("请指定要恢复的备份文件名")
            return
        
        backup_file = sys.argv[2]
        result = backup_manager.restore_backup(backup_file)
        if result:
            print(f"备份恢复成功: {backup_file}")
        else:
            print("备份恢复失败")
    
    elif command == "cleanup":
        keep_count = int(sys.argv[2]) if len(sys.argv) > 2 else 10
        backup_manager.cleanup_old_backups(keep_count)
        print("清理完成")
    
    elif command == "status":
        backup_manager.print_backup_status()
    
    else:
        print("使用方法:")
        print("  python backup.py create [类型]  - 创建备份 (类型: full, config, logs, docs)")
        print("  python backup.py list           - 列出所有备份")
        print("  python backup.py restore <文件> - 恢复指定备份")
        print("  python backup.py cleanup [数量] - 清理旧备份，保留指定数量")
        print("  python backup.py status         - 显示备份状态")

if __name__ == "__main__":
    main()