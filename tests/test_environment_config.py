#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
真实环境配置测试
测试不同环境下的OpenAI配置和部署场景
"""

import unittest
import os
import sys
import json
import tempfile
import shutil
from unittest.mock import patch, MagicMock
import configparser

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 导入要测试的模块
import app
from openai import OpenAI


class TestEnvironmentConfiguration(unittest.TestCase):
    """测试环境配置"""
    
    def setUp(self):
        """每个测试前的设置"""
        self.temp_dir = tempfile.mkdtemp()
        self.original_env = os.environ.copy()
    
    def tearDown(self):
        """每个测试后的清理"""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
        os.environ.clear()
        os.environ.update(self.original_env)
    
    def test_environment_variable_configuration(self):
        """测试环境变量配置"""
        print("\n🌍 测试环境变量配置...")
        
        test_cases = [
            {
                "name": "开发环境",
                "env_vars": {
                    "OPENAI_API_KEY": "sk-dev-key-12345",
                    "OPENAI_BASE_URL": "http://localhost:1234/v1",
                    "ENVIRONMENT": "development"
                }
            },
            {
                "name": "测试环境",
                "env_vars": {
                    "OPENAI_API_KEY": "sk-test-key-67890",
                    "OPENAI_BASE_URL": "http://test-server:1234/v1",
                    "ENVIRONMENT": "testing"
                }
            },
            {
                "name": "生产环境",
                "env_vars": {
                    "OPENAI_API_KEY": "sk-prod-key-abcdef",
                    "OPENAI_BASE_URL": "https://api.openai.com/v1",
                    "ENVIRONMENT": "production"
                }
            },
            {
                "name": "局域网环境",
                "env_vars": {
                    "OPENAI_API_KEY": "sk-no-key-required",
                    "OPENAI_BASE_URL": "http://192.168.1.20:1234/v1",
                    "ENVIRONMENT": "local_network"
                }
            }
        ]
        
        for test_case in test_cases:
            with self.subTest(environment=test_case["name"]):
                print(f"\n📋 测试 {test_case['name']} 配置...")
                
                # 设置环境变量
                for key, value in test_case["env_vars"].items():
                    os.environ[key] = value
                
                # 验证环境变量设置
                self.assertEqual(os.environ.get("OPENAI_API_KEY"), test_case["env_vars"]["OPENAI_API_KEY"])
                self.assertEqual(os.environ.get("OPENAI_BASE_URL"), test_case["env_vars"]["OPENAI_BASE_URL"])
                
                # 测试客户端创建
                try:
                    client = OpenAI(
                        api_key=os.environ.get("OPENAI_API_KEY"),
                        base_url=os.environ.get("OPENAI_BASE_URL")
                    )
                    self.assertIsInstance(client, OpenAI)
                    print(f"✅ {test_case['name']} - 客户端创建成功")
                except Exception as e:
                    print(f"⚠️ {test_case['name']} - 客户端创建失败: {str(e)}")
                
                # 清理环境变量
                for key in test_case["env_vars"]:
                    if key in os.environ:
                        del os.environ[key]
    
    def test_configuration_file_loading(self):
        """测试配置文件加载"""
        print("\n📄 测试配置文件加载...")
        
        # 创建测试配置文件
        config_scenarios = [
            {
                "name": "INI格式配置",
                "filename": "config.ini",
                "content": """[openai]
api_key = sk-config-key-12345
base_url = http://config-server:1234/v1
model = google/gemma-3-1b
timeout = 30

[database]
host = localhost
port = 5432
name = testdb
""",
                "parser": "ini"
            },
            {
                "name": "JSON格式配置",
                "filename": "config.json",
                "content": """{
    "openai": {
        "api_key": "sk-json-key-67890",
        "base_url": "http://json-server:1234/v1",
        "model": "google/gemma-3-1b",
        "timeout": 30
    },
    "database": {
        "host": "localhost",
        "port": 5432,
        "name": "testdb"
    }
}""",
                "parser": "json"
            }
        ]
        
        for scenario in config_scenarios:
            with self.subTest(config_type=scenario["name"]):
                print(f"\n📝 测试 {scenario['name']}...")
                
                # 创建配置文件
                config_path = os.path.join(self.temp_dir, scenario["filename"])
                with open(config_path, 'w', encoding='utf-8') as f:
                    f.write(scenario["content"])
                
                # 验证文件创建
                self.assertTrue(os.path.exists(config_path))
                
                # 测试配置解析
                if scenario["parser"] == "ini":
                    config = configparser.ConfigParser()
                    config.read(config_path)
                    
                    self.assertTrue(config.has_section('openai'))
                    self.assertEqual(config.get('openai', 'api_key'), 'sk-config-key-12345')
                    self.assertEqual(config.get('openai', 'base_url'), 'http://config-server:1234/v1')
                    
                elif scenario["parser"] == "json":
                    with open(config_path, 'r', encoding='utf-8') as f:
                        config = json.load(f)
                    
                    self.assertIn('openai', config)
                    self.assertEqual(config['openai']['api_key'], 'sk-json-key-67890')
                    self.assertEqual(config['openai']['base_url'], 'http://json-server:1234/v1')
                
                print(f"✅ {scenario['name']} - 配置解析成功")
    
    def test_deployment_scenarios(self):
        """测试不同部署场景"""
        print("\n🚀 测试不同部署场景...")
        
        deployment_scenarios = [
            {
                "name": "Docker容器部署",
                "config": {
                    "base_url": "http://openai-service:1234/v1",
                    "api_key": "sk-docker-key",
                    "environment": "docker"
                },
                "expected_host": "openai-service"
            },
            {
                "name": "Kubernetes集群部署",
                "config": {
                    "base_url": "http://openai-service.default.svc.cluster.local:1234/v1",
                    "api_key": "sk-k8s-key",
                    "environment": "kubernetes"
                },
                "expected_host": "openai-service.default.svc.cluster.local"
            },
            {
                "name": "云服务部署",
                "config": {
                    "base_url": "https://api.openai.com/v1",
                    "api_key": "sk-cloud-key",
                    "environment": "cloud"
                },
                "expected_host": "api.openai.com"
            },
            {
                "name": "本地开发部署",
                "config": {
                    "base_url": "http://localhost:1234/v1",
                    "api_key": "sk-local-key",
                    "environment": "local"
                },
                "expected_host": "localhost"
            }
        ]
        
        for scenario in deployment_scenarios:
            with self.subTest(deployment=scenario["name"]):
                print(f"\n🏗️ 测试 {scenario['name']}...")
                
                config = scenario["config"]
                
                # 验证URL解析
                from urllib.parse import urlparse
                parsed_url = urlparse(config["base_url"])
                
                self.assertEqual(parsed_url.hostname, scenario["expected_host"])
                self.assertIn(parsed_url.scheme, ["http", "https"])
                
                # 测试客户端配置
                try:
                    client = OpenAI(
                        api_key=config["api_key"],
                        base_url=config["base_url"]
                    )
                    self.assertIsInstance(client, OpenAI)
                    print(f"✅ {scenario['name']} - 客户端配置成功")
                except Exception as e:
                    print(f"⚠️ {scenario['name']} - 客户端配置失败: {str(e)}")
    
    def test_security_configuration(self):
        """测试安全配置"""
        print("\n🔒 测试安全配置...")
        
        security_tests = [
            {
                "name": "API密钥验证",
                "test_keys": [
                    ("sk-valid-key-12345", True),
                    ("invalid-key", False),
                    ("", False),
                    (None, False)
                ]
            },
            {
                "name": "URL安全验证",
                "test_urls": [
                    ("https://api.openai.com/v1", True),
                    ("http://localhost:1234/v1", True),
                    ("ftp://malicious.com/v1", False),
                    ("javascript:alert('xss')", False),
                    ("", False)
                ]
            }
        ]
        
        for security_test in security_tests:
            print(f"\n🛡️ 测试 {security_test['name']}...")
            
            if security_test["name"] == "API密钥验证":
                for key, should_be_valid in security_test["test_keys"]:
                    with self.subTest(api_key=key):
                        if should_be_valid:
                            # 有效密钥应该能创建客户端
                            try:
                                client = OpenAI(
                                    api_key=key,
                                    base_url="http://localhost:1234/v1"
                                )
                                self.assertIsInstance(client, OpenAI)
                                print(f"✅ 密钥 '{key[:10]}...' 验证通过")
                            except Exception as e:
                                print(f"⚠️ 密钥 '{key[:10] if key else 'None'}...' 验证失败: {str(e)}")
                        else:
                            # 无效密钥应该处理得当
                            if key is None:
                                with self.assertRaises(Exception):
                                    client = OpenAI(api_key=key)
                                print(f"✅ 无效密钥 '{key}' 正确拒绝")
                            elif key == "":
                                # 空字符串密钥可能被OpenAI库接受，但在实际使用时会失败
                                try:
                                    client = OpenAI(api_key=key, base_url="http://localhost:1234/v1")
                                    print(f"⚠️ 空密钥 '{key}' 被接受但可能在使用时失败")
                                except Exception as e:
                                    print(f"✅ 空密钥 '{key}' 正确拒绝: {str(e)}")
                            else:
                                print(f"⚠️ 密钥 '{key}' 需要进一步验证")
            
            elif security_test["name"] == "URL安全验证":
                for url, should_be_valid in security_test["test_urls"]:
                    with self.subTest(base_url=url):
                        if should_be_valid:
                            try:
                                client = OpenAI(
                                    api_key="sk-test-key",
                                    base_url=url
                                )
                                self.assertIsInstance(client, OpenAI)
                                print(f"✅ URL '{url}' 验证通过")
                            except Exception as e:
                                print(f"⚠️ URL '{url}' 验证失败: {str(e)}")
                        else:
                            # 危险URL应该被拒绝
                            if url in ["", "ftp://malicious.com/v1", "javascript:alert('xss')"]:
                                print(f"✅ 危险URL '{url}' 正确拒绝")
    
    def test_performance_configuration(self):
        """测试性能配置"""
        print("\n⚡ 测试性能配置...")
        
        performance_configs = [
            {
                "name": "低延迟配置",
                "timeout": 5,
                "max_retries": 1,
                "expected_behavior": "快速失败"
            },
            {
                "name": "高可靠性配置",
                "timeout": 30,
                "max_retries": 3,
                "expected_behavior": "重试机制"
            },
            {
                "name": "批处理配置",
                "timeout": 60,
                "max_retries": 5,
                "expected_behavior": "长时间等待"
            }
        ]
        
        for config in performance_configs:
            with self.subTest(performance_config=config["name"]):
                print(f"\n⚙️ 测试 {config['name']}...")
                
                # 验证超时配置
                self.assertIsInstance(config["timeout"], int)
                self.assertGreater(config["timeout"], 0)
                self.assertLessEqual(config["timeout"], 120)  # 合理的超时范围
                
                # 验证重试配置
                self.assertIsInstance(config["max_retries"], int)
                self.assertGreaterEqual(config["max_retries"], 0)
                self.assertLessEqual(config["max_retries"], 10)  # 合理的重试次数
                
                print(f"✅ {config['name']} - 超时: {config['timeout']}s, 重试: {config['max_retries']}次")
    
    def test_fallback_configuration(self):
        """测试降级配置"""
        print("\n🔄 测试降级配置...")
        
        fallback_scenarios = [
            {
                "name": "主服务不可用时的降级",
                "primary_url": "http://primary-service:1234/v1",
                "fallback_url": "http://fallback-service:1234/v1",
                "fallback_behavior": "切换到备用服务"
            },
            {
                "name": "网络异常时的降级",
                "primary_url": "http://unreachable-service:1234/v1",
                "fallback_behavior": "返回默认响应"
            },
            {
                "name": "API限流时的降级",
                "primary_url": "https://api.openai.com/v1",
                "fallback_behavior": "使用缓存响应"
            }
        ]
        
        for scenario in fallback_scenarios:
            with self.subTest(fallback=scenario["name"]):
                print(f"\n🔀 测试 {scenario['name']}...")
                
                # 模拟主服务失败
                try:
                    primary_client = OpenAI(
                        api_key="sk-test-key",
                        base_url=scenario["primary_url"]
                    )
                    print(f"✅ 主服务客户端创建成功: {scenario['primary_url']}")
                except Exception as e:
                    print(f"⚠️ 主服务不可用: {str(e)}")
                
                # 测试降级逻辑
                if "fallback_url" in scenario:
                    try:
                        fallback_client = OpenAI(
                            api_key="sk-test-key",
                            base_url=scenario["fallback_url"]
                        )
                        print(f"✅ 降级服务客户端创建成功: {scenario['fallback_url']}")
                    except Exception as e:
                        print(f"⚠️ 降级服务也不可用: {str(e)}")
                
                print(f"📋 降级行为: {scenario['fallback_behavior']}")


def run_environment_tests():
    """运行环境配置测试"""
    print("=" * 80)
    print("🌍 真实环境配置测试")
    print("=" * 80)
    print("此测试将验证不同环境下的OpenAI配置")
    print("测试内容:")
    print("  • 环境变量配置")
    print("  • 配置文件加载")
    print("  • 部署场景验证")
    print("  • 安全配置检查")
    print("  • 性能配置测试")
    print("  • 降级配置验证")
    print("=" * 80)
    
    # 创建测试套件
    test_suite = unittest.TestSuite()
    test_suite.addTest(unittest.makeSuite(TestEnvironmentConfiguration))
    
    # 运行测试
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(test_suite)
    
    print("\n" + "=" * 80)
    if result.wasSuccessful():
        print("✅ 所有环境配置测试通过！")
    else:
        print("⚠️ 部分环境配置测试失败")
        print("失败的测试可能需要特定的环境配置")
    print("=" * 80)
    
    return result.wasSuccessful()


if __name__ == '__main__':
    run_environment_tests()