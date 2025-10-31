#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import sys
import time
import json
import psutil
import requests
from datetime import datetime
import logging
from pathlib import Path

class SystemMonitor:
    def __init__(self, config_file='config/config.json'):
        self.config = self.load_config(config_file)
        self.setup_logging()
        self.app_url = f"http://{self.config['app']['host']}:{self.config['app']['port']}"
        
    def load_config(self, config_file):
        """加载配置文件"""
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            print(f"配置文件 {config_file} 不存在")
            return self.get_default_config()
        except json.JSONDecodeError:
            print(f"配置文件 {config_file} 格式错误")
            return self.get_default_config()
    
    def get_default_config(self):
        """获取默认配置"""
        return {
            "app": {"host": "localhost", "port": 5500},
            "logging": {"level": "INFO", "log_dir": "logs"}
        }
    
    def setup_logging(self):
        """设置日志"""
        log_dir = self.config['logging']['log_dir']
        if not os.path.exists(log_dir):
            os.makedirs(log_dir)
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(os.path.join(log_dir, 'monitor.log')),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(__name__)
    
    def check_app_health(self):
        """检查应用健康状态"""
        try:
            response = requests.get(self.app_url, timeout=10)
            if response.status_code == 200:
                self.logger.info("应用健康检查通过")
                return True
            else:
                self.logger.warning(f"应用健康检查失败，状态码: {response.status_code}")
                return False
        except requests.RequestException as e:
            self.logger.error(f"应用健康检查失败: {str(e)}")
            return False
    
    def get_system_stats(self):
        """获取系统统计信息"""
        stats = {
            "timestamp": datetime.now().isoformat(),
            "cpu_percent": psutil.cpu_percent(interval=1),
            "memory_percent": psutil.virtual_memory().percent,
            "disk_percent": psutil.disk_usage('/').percent,
            "network_io": psutil.net_io_counters()._asdict(),
            "process_count": len(psutil.pids())
        }
        return stats
    
    def get_app_stats(self):
        """获取应用统计信息"""
        stats = {
            "timestamp": datetime.now().isoformat(),
            "app_running": self.check_app_health(),
            "log_file_size": self.get_log_file_size(),
            "temp_files_count": self.get_temp_files_count(),
            "python_processes": self.get_python_processes()
        }
        return stats
    
    def get_log_file_size(self):
        """获取日志文件大小"""
        log_dir = self.config['logging']['log_dir']
        total_size = 0
        try:
            for root, dirs, files in os.walk(log_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    total_size += os.path.getsize(file_path)
            return total_size
        except OSError:
            return 0
    
    def get_temp_files_count(self):
        """获取临时文件数量"""
        temp_dir = self.config.get('file_management', {}).get('temp_dir', 'temp')
        if not os.path.exists(temp_dir):
            return 0
        try:
            return len(os.listdir(temp_dir))
        except OSError:
            return 0
    
    def get_python_processes(self):
        """获取Python进程信息"""
        python_processes = []
        for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
            try:
                if 'python' in proc.info['name'].lower():
                    python_processes.append(proc.info)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        return python_processes
    
    def cleanup_old_files(self):
        """清理旧文件"""
        file_config = self.config.get('file_management', {})
        temp_dir = file_config.get('temp_dir', 'temp')
        max_age = file_config.get('max_file_age', 86400)  # 24小时
        
        if not os.path.exists(temp_dir):
            return
        
        current_time = time.time()
        cleaned_count = 0
        
        try:
            for root, dirs, files in os.walk(temp_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    file_age = current_time - os.path.getctime(file_path)
                    if file_age > max_age:
                        os.remove(file_path)
                        cleaned_count += 1
            
            if cleaned_count > 0:
                self.logger.info(f"清理了 {cleaned_count} 个旧文件")
        except OSError as e:
            self.logger.error(f"清理文件时出错: {str(e)}")
    
    def generate_report(self):
        """生成监控报告"""
        system_stats = self.get_system_stats()
        app_stats = self.get_app_stats()
        
        report = {
            "report_time": datetime.now().isoformat(),
            "system": system_stats,
            "application": app_stats
        }
        
        # 保存报告
        reports_dir = "reports"
        if not os.path.exists(reports_dir):
            os.makedirs(reports_dir)
        
        report_file = os.path.join(reports_dir, f"monitor_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
        with open(report_file, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        
        self.logger.info(f"监控报告已保存: {report_file}")
        return report
    
    def print_status(self):
        """打印当前状态"""
        print("\n" + "="*50)
        print("数据库文档生成器 - 系统监控")
        print("="*50)
        
        # 应用状态
        app_healthy = self.check_app_health()
        print(f"应用状态: {'✓ 运行中' if app_healthy else '✗ 未运行'}")
        
        # 系统资源
        cpu_percent = psutil.cpu_percent(interval=1)
        memory_percent = psutil.virtual_memory().percent
        disk_percent = psutil.disk_usage('/').percent
        
        print(f"CPU使用率: {cpu_percent:.1f}%")
        print(f"内存使用率: {memory_percent:.1f}%")
        print(f"磁盘使用率: {disk_percent:.1f}%")
        
        # 日志和临时文件
        log_size = self.get_log_file_size()
        temp_count = self.get_temp_files_count()
        print(f"日志文件大小: {log_size / 1024 / 1024:.1f} MB")
        print(f"临时文件数量: {temp_count}")
        
        # Python进程
        python_procs = self.get_python_processes()
        print(f"Python进程数: {len(python_procs)}")
        
        print("="*50)
        print(f"检查时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("="*50)
    
    def run_continuous_monitoring(self, interval=60):
        """持续监控"""
        self.logger.info("开始持续监控...")
        
        while True:
            try:
                self.print_status()
                self.cleanup_old_files()
                
                # 每小时生成一次报告
                if datetime.now().minute == 0:
                    self.generate_report()
                
                time.sleep(interval)
                
            except KeyboardInterrupt:
                self.logger.info("监控已停止")
                break
            except Exception as e:
                self.logger.error(f"监控过程中出错: {str(e)}")
                time.sleep(interval)

def main():
    """主函数"""
    if len(sys.argv) > 1:
        command = sys.argv[1]
    else:
        command = "status"
    
    monitor = SystemMonitor()
    
    if command == "status":
        monitor.print_status()
    elif command == "report":
        report = monitor.generate_report()
        print("监控报告已生成")
        print(json.dumps(report, indent=2, ensure_ascii=False))
    elif command == "monitor":
        interval = int(sys.argv[2]) if len(sys.argv) > 2 else 60
        monitor.run_continuous_monitoring(interval)
    elif command == "cleanup":
        monitor.cleanup_old_files()
        print("文件清理完成")
    else:
        print("使用方法:")
        print("  python monitor.py status   - 显示当前状态")
        print("  python monitor.py report   - 生成监控报告")
        print("  python monitor.py monitor [间隔秒数] - 持续监控")
        print("  python monitor.py cleanup  - 清理旧文件")

if __name__ == "__main__":
    main()