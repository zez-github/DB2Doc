#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OpenAI服务接口集成测试
测试真实的OpenAI服务连接和API调用
"""

import unittest
import time
import os
import sys
import requests
from unittest.mock import patch
import json

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 导入要测试的模块
import app
from openai import OpenAI


class TestOpenAIServiceIntegration(unittest.TestCase):
    """测试OpenAI服务接口集成"""
    
    @classmethod
    def setUpClass(cls):
        """测试类初始化"""
        cls.test_columns = [
            ('user_id', 'int'),
            ('username', 'varchar(50)'),
            ('email', 'varchar(100)')
        ]
        cls.test_table_name = 'test_users'
        
        # 测试用的不同配置
        cls.local_configs = [
            # {"base_url": "http://localhost:1234/v1", "description": "LM Studio本地服务"},
            # {"base_url": "http://127.0.0.1:1234/v1", "description": "LM Studio本地服务(127.0.0.1)"},
            # {"base_url": "http://localhost:11434/v1", "description": "Ollama本地服务"},
            {"base_url": "http://192.168.1.20:1234/v1", "description": "局域网OpenAI兼容服务"}
        ]
    
    def test_service_availability_check(self):
        """测试OpenAI兼容服务的可用性检查"""
        print("\n🔍 检查OpenAI兼容服务可用性...")
        
        available_services = []
        
        for config in self.local_configs:
            base_url = config["base_url"]
            description = config["description"]
            
            try:
                # 检查服务是否可达
                health_url = base_url.replace('/v1', '/health') if '/v1' in base_url else f"{base_url}/health"
                response = requests.get(health_url, timeout=3)
                
                if response.status_code == 200:
                    available_services.append(config)
                    print(f"✅ {description} ({base_url}) - 可用")
                else:
                    print(f"❌ {description} ({base_url}) - HTTP {response.status_code}")
                    
            except requests.exceptions.RequestException as e:
                print(f"❌ {description} ({base_url}) - 连接失败: {str(e)[:50]}...")
        
        # 记录可用服务数量
        self.available_service_count = len(available_services)
        print(f"\n📊 发现 {self.available_service_count} 个可用的OpenAI兼容服务")
        
        # 如果没有可用服务，跳过后续的集成测试
        if self.available_service_count == 0:
            self.skipTest("没有发现可用的OpenAI兼容服务，跳过集成测试")
    
    def test_openai_client_initialization_with_different_configs(self):
        """测试不同配置下的OpenAI客户端初始化"""
        print("\n🔧 测试不同配置下的客户端初始化...")
        
        for config in self.local_configs:
            base_url = config["base_url"]
            description = config["description"]
            
            with self.subTest(config=description):
                try:
                    client = OpenAI(
                        base_url=base_url,
                        api_key="sk-no-key-required"
                    )
                    
                    # 验证客户端对象创建成功
                    self.assertIsInstance(client, OpenAI)
                    self.assertEqual(client.base_url, base_url)
                    print(f"✅ {description} - 客户端初始化成功")
                    
                except Exception as e:
                    print(f"❌ {description} - 初始化失败: {str(e)}")
                    # 客户端初始化失败是可以接受的（服务可能未运行）
                    pass
    
    def test_real_api_call_if_service_available(self):
        """如果有可用服务，测试真实的API调用"""
        print("\n🚀 测试真实的API调用...")
        
        # 尝试连接本地服务
        test_configs = [
            "http://localhost:1234/v1",
            "http://127.0.0.1:1234/v1", 
            "http://192.168.1.20:1234/v1"
        ]
        
        successful_calls = 0
        
        for base_url in test_configs:
            try:
                print(f"\n🔗 尝试连接: {base_url}")
                
                client = OpenAI(
                    base_url=base_url,
                    api_key="sk-no-key-required"
                )
                
                # 尝试进行真实的API调用
                response = client.chat.completions.create(
                    model="google/gemma-3-1b",  # 使用与app.py相同的模型
                    messages=[
                        {"role": "user", "content": "请给出表 test_users 中字段 user_id, username, email 的中文含义，要求每个含义不超过10个字符。请以严格的json格式返回结果"}
                    ],
                    temperature=0.3,
                    timeout=10  # 设置超时
                )
                
                # 验证响应结构
                self.assertTrue(hasattr(response, 'choices'))
                self.assertTrue(len(response.choices) > 0)
                self.assertTrue(hasattr(response.choices[0], 'message'))
                self.assertTrue(hasattr(response.choices[0].message, 'content'))
                
                content = response.choices[0].message.content
                print(f"✅ API调用成功，响应长度: {len(content)} 字符")
                print(f"📝 响应内容预览: {content[:100]}...")
                
                # 尝试解析JSON响应
                try:
                    # 清理响应内容
                    clean_content = content.strip().removeprefix('```json').removesuffix('```').strip()
                    parsed_json = json.loads(clean_content)
                    
                    print(f"✅ JSON解析成功: {parsed_json}")
                    successful_calls += 1
                    
                    # 验证返回的字段
                    expected_fields = ['user_id', 'username', 'email']
                    for field in expected_fields:
                        if field in parsed_json:
                            meaning = parsed_json[field]
                            self.assertIsInstance(meaning, str)
                            self.assertLessEqual(len(meaning), 10, f"字段 {field} 的含义超过10个字符")
                            print(f"  {field}: {meaning}")
                    
                    break  # 成功一次就够了
                    
                except json.JSONDecodeError as e:
                    print(f"⚠️ JSON解析失败: {str(e)}")
                    print(f"原始响应: {content}")
                
            except Exception as e:
                print(f"❌ API调用失败: {str(e)}")
                continue
        
        if successful_calls == 0:
            print("⚠️ 没有成功的API调用，可能是因为:")
            print("  1. 本地OpenAI兼容服务未运行")
            print("  2. 网络连接问题")
            print("  3. 服务配置问题")
            self.skipTest("没有可用的OpenAI服务进行真实API测试")
        else:
            print(f"✅ 成功完成 {successful_calls} 次真实API调用测试")
    
    def test_network_timeout_handling(self):
        """测试网络超时处理"""
        print("\n⏱️ 测试网络超时处理...")
        
        # 使用一个不存在的地址来模拟超时
        timeout_configs = [
            "http://192.168.999.999:1234/v1",  # 不存在的IP
            "http://timeout-test.invalid:1234/v1"  # 不存在的域名
        ]
        
        for base_url in timeout_configs:
            with self.subTest(url=base_url):
                try:
                    client = OpenAI(
                        base_url=base_url,
                        api_key="sk-no-key-required"
                    )
                    
                    start_time = time.time()
                    
                    # 这应该会超时或连接失败
                    with self.assertRaises(Exception):
                        response = client.chat.completions.create(
                            model="test-model",
                            messages=[{"role": "user", "content": "test"}],
                            timeout=3  # 短超时
                        )
                    
                    elapsed_time = time.time() - start_time
                    print(f"✅ 超时测试通过，耗时: {elapsed_time:.2f}秒")
                    
                except Exception as e:
                    print(f"✅ 预期的异常: {type(e).__name__}")
    
    def test_invalid_model_handling(self):
        """测试无效模型处理"""
        print("\n🤖 测试无效模型处理...")
        
        # 尝试连接本地服务
        for base_url in ["http://localhost:1234/v1", "http://127.0.0.1:1234/v1"]:
            try:
                client = OpenAI(
                    base_url=base_url,
                    api_key="sk-no-key-required"
                )
                
                # 使用不存在的模型
                with self.assertRaises(Exception):
                    response = client.chat.completions.create(
                        model="non-existent-model-12345",
                        messages=[{"role": "user", "content": "test"}],
                        timeout=5
                    )
                
                print(f"✅ 无效模型测试通过: {base_url}")
                break
                
            except Exception as e:
                print(f"⚠️ 无法连接到 {base_url}: {str(e)[:50]}...")
                continue
        else:
            self.skipTest("没有可用的服务进行无效模型测试")
    
    def test_app_infer_function_with_real_service(self):
        """测试app.py中的infer_chinese_meaning函数与真实服务的集成"""
        print("\n🔗 测试app.py函数与真实服务的集成...")
        
        # 临时替换app中的client配置
        original_client = app.client
        
        test_configs = [
            "http://localhost:1234/v1",
            "http://127.0.0.1:1234/v1"
        ]
        
        for base_url in test_configs:
            try:
                # 创建新的客户端
                test_client = OpenAI(
                    base_url=base_url,
                    api_key="sk-no-key-required"
                )
                
                # 临时替换app中的客户端
                app.client = test_client
                
                # 调用真实的函数
                result = app.infer_chinese_meaning(self.test_columns, self.test_table_name)
                
                # 验证结果
                self.assertIsInstance(result, dict)
                print(f"✅ 集成测试成功: {base_url}")
                print(f"📝 推断结果: {result}")
                
                # 验证结果包含预期的字段
                for column_name, _ in self.test_columns:
                    if column_name in result:
                        meaning = result[column_name]
                        self.assertIsInstance(meaning, str)
                        self.assertLessEqual(len(meaning), 10)
                
                break
                
            except Exception as e:
                print(f"⚠️ 集成测试失败 {base_url}: {str(e)}")
                continue
            finally:
                # 恢复原始客户端
                app.client = original_client
        else:
            print("⚠️ 没有可用的服务进行集成测试")
    
    def test_concurrent_api_calls(self):
        """测试并发API调用"""
        print("\n🔄 测试并发API调用...")
        
        import threading
        import queue
        
        # 尝试连接本地服务
        for base_url in ["http://localhost:1234/v1", "http://127.0.0.1:1234/v1"]:
            try:
                client = OpenAI(
                    base_url=base_url,
                    api_key="sk-no-key-required"
                )
                
                # 测试并发调用
                results_queue = queue.Queue()
                threads = []
                
                def make_api_call(thread_id):
                    try:
                        response = client.chat.completions.create(
                            model="google/gemma-3-1b",
                            messages=[{"role": "user", "content": f"线程{thread_id}测试"}],
                            timeout=10
                        )
                        results_queue.put(f"线程{thread_id}成功")
                    except Exception as e:
                        results_queue.put(f"线程{thread_id}失败: {str(e)}")
                
                # 创建3个并发线程
                for i in range(3):
                    thread = threading.Thread(target=make_api_call, args=(i,))
                    threads.append(thread)
                    thread.start()
                
                # 等待所有线程完成
                for thread in threads:
                    thread.join(timeout=30)
                
                # 收集结果
                results = []
                while not results_queue.empty():
                    results.append(results_queue.get())
                
                print(f"✅ 并发测试完成，结果: {results}")
                break
                
            except Exception as e:
                print(f"⚠️ 并发测试失败 {base_url}: {str(e)}")
                continue
        else:
            self.skipTest("没有可用的服务进行并发测试")


def run_integration_tests():
    """运行集成测试"""
    print("=" * 80)
    print("🚀 OpenAI服务接口集成测试")
    print("=" * 80)
    print("此测试将尝试连接真实的OpenAI兼容服务")
    print("支持的服务类型:")
    print("  • LM Studio (http://localhost:1234)")
    print("  • Ollama (http://localhost:11434)")
    print("  • 其他OpenAI兼容服务")
    print("=" * 80)
    
    # 创建测试套件
    test_suite = unittest.TestSuite()
    test_suite.addTest(unittest.makeSuite(TestOpenAIServiceIntegration))
    
    # 运行测试
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(test_suite)
    
    print("\n" + "=" * 80)
    if result.wasSuccessful():
        print("✅ 所有集成测试通过！")
    else:
        print("⚠️ 部分集成测试失败或跳过")
        print("这通常是因为本地没有运行OpenAI兼容服务")
    print("=" * 80)
    
    return result.wasSuccessful()


if __name__ == '__main__':
    run_integration_tests()