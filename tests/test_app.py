#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
app.py中OpenAI大模型功能的单元测试
测试infer_chinese_meaning函数在各种情况下的表现
"""

import unittest
from unittest.mock import patch, MagicMock, Mock
import json
import sys
import os

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 导入要测试的模块
import app


class TestOpenAIModelIntegration(unittest.TestCase):
    """测试OpenAI大模型集成功能"""
    
    def setUp(self):
        """测试前的设置"""
        self.test_columns = [
            ('user_id', 'int'),
            ('username', 'varchar(50)'),
            ('email', 'varchar(100)'),
            ('created_at', 'datetime')
        ]
        self.test_table_name = 'users'
        
    def test_infer_chinese_meaning_with_no_client(self):
        """测试当OpenAI客户端未初始化时的情况"""
        # 模拟client为None的情况
        with patch.object(app, 'client', None):
            result = app.infer_chinese_meaning(self.test_columns, self.test_table_name)
            
            # 验证返回默认值（字段名作为中文含义）
            expected = {
                'user_id': 'user_id',
                'username': 'username', 
                'email': 'email',
                'created_at': 'created_at'
            }
            self.assertEqual(result, expected)
    
    @patch('builtins.print')
    def test_infer_chinese_meaning_with_no_client_prints_message(self, mock_print):
        """测试当OpenAI客户端未初始化时是否打印正确的消息"""
        with patch.object(app, 'client', None):
            app.infer_chinese_meaning(self.test_columns, self.test_table_name)
            mock_print.assert_called_with('OpenAI大模型未初始化，返回默认值')
    
    def test_infer_chinese_meaning_successful_response(self):
        """测试OpenAI API成功响应的情况"""
        # 模拟成功的API响应
        mock_response = MagicMock()
        mock_response.choices[0].message.content = '''```json
{
    "user_id": "用户ID",
    "username": "用户名",
    "email": "邮箱地址",
    "created_at": "创建时间"
}
```'''
        
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = mock_response
        
        with patch.object(app, 'client', mock_client):
            result = app.infer_chinese_meaning(self.test_columns, self.test_table_name)
            
            # 验证API调用参数
            mock_client.chat.completions.create.assert_called_once_with(
                model="google/gemma-3-1b",
                messages=[{
                    "role": "user", 
                    "content": f"请给出表 {self.test_table_name} 中字段 user_id, username, email, created_at 的中文含义，要求每个含义不超过10个字符。请以严格的json格式返回结果"
                }],
                temperature=0.3
            )
            
            # 验证返回结果
            expected = {
                "user_id": "用户ID",
                "username": "用户名", 
                "email": "邮箱地址",
                "created_at": "创建时间"
            }
            self.assertEqual(result, expected)
    
    def test_infer_chinese_meaning_json_without_code_blocks(self):
        """测试API返回纯JSON（无代码块标记）的情况"""
        mock_response = MagicMock()
        mock_response.choices[0].message.content = '''{
    "user_id": "用户标识",
    "username": "用户姓名",
    "email": "电子邮件",
    "created_at": "创建日期"
}'''
        
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = mock_response
        
        with patch.object(app, 'client', mock_client):
            result = app.infer_chinese_meaning(self.test_columns, self.test_table_name)
            
            expected = {
                "user_id": "用户标识",
                "username": "用户姓名",
                "email": "电子邮件", 
                "created_at": "创建日期"
            }
            self.assertEqual(result, expected)
    
    @patch('builtins.print')
    def test_infer_chinese_meaning_api_exception(self, mock_print):
        """测试API调用异常的情况"""
        mock_client = MagicMock()
        mock_client.chat.completions.create.side_effect = Exception("API连接失败")
        
        with patch.object(app, 'client', mock_client):
            result = app.infer_chinese_meaning(self.test_columns, self.test_table_name)
            
            # 验证异常被捕获并打印错误信息
            mock_print.assert_called_with("AI推断字段含义失败: API连接失败")
            
            # 验证返回默认值
            expected = {
                'user_id': 'user_id',
                'username': 'username',
                'email': 'email', 
                'created_at': 'created_at'
            }
            self.assertEqual(result, expected)
    
    @patch('builtins.print')
    def test_infer_chinese_meaning_invalid_json_response(self, mock_print):
        """测试API返回无效JSON的情况"""
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "这不是有效的JSON格式"
        
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = mock_response
        
        with patch.object(app, 'client', mock_client):
            result = app.infer_chinese_meaning(self.test_columns, self.test_table_name)
            
            # 验证JSON解析错误被捕获
            self.assertTrue(mock_print.called)
            error_message = mock_print.call_args[0][0]
            self.assertTrue(error_message.startswith("AI推断字段含义失败:"))
            
            # 验证返回默认值
            expected = {
                'user_id': 'user_id',
                'username': 'username',
                'email': 'email',
                'created_at': 'created_at'
            }
            self.assertEqual(result, expected)
    
    def test_infer_chinese_meaning_empty_columns(self):
        """测试空字段列表的情况"""
        empty_columns = []
        
        # 模拟成功的API响应
        mock_response = MagicMock()
        mock_response.choices[0].message.content = '{}'
        
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = mock_response
        
        with patch.object(app, 'client', mock_client):
            result = app.infer_chinese_meaning(empty_columns, self.test_table_name)
            
            # 空字段列表应该返回空字典
            self.assertEqual(result, {})
    
    def test_infer_chinese_meaning_single_column(self):
        """测试单个字段的情况"""
        single_column = [('id', 'int')]
        
        mock_response = MagicMock()
        mock_response.choices[0].message.content = '{"id": "主键ID"}'
        
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = mock_response
        
        with patch.object(app, 'client', mock_client):
            result = app.infer_chinese_meaning(single_column, self.test_table_name)
            
            # 验证API调用参数中的字段列表
            call_args = mock_client.chat.completions.create.call_args
            self.assertIn("id", call_args[1]['messages'][0]['content'])
            
            # 验证返回结果
            expected = {"id": "主键ID"}
            self.assertEqual(result, expected)
    
    def test_generate_markdown_function(self):
        """测试generate_markdown函数"""
        columns_meanings = [
            ('user_id', 'int'),
            ('username', 'varchar(50)'),
            ('email', 'varchar(100)')
        ]
        
        meanings = {
            'user_id': '用户ID',
            'username': '用户名',
            'email': '邮箱地址'
        }
        
        result = app.generate_markdown(columns_meanings, meanings)
        
        # 验证Markdown格式
        self.assertIn("| 字段名称 | 数据类型 | 中文说明 |", result)
        self.assertIn("| -------- | -------- | -------- |", result)
        self.assertIn("| user_id | int | 用户ID |", result)
        self.assertIn("| username | varchar(50) | 用户名 |", result)
        self.assertIn("| email | varchar(100) | 邮箱地址 |", result)
    
    def test_generate_markdown_with_long_meaning(self):
        """测试generate_markdown函数处理超长中文含义的情况"""
        columns_meanings = [('description', 'text')]
        meanings = {'description': '这是一个非常长的描述字段用于存储详细信息'}
        
        result = app.generate_markdown(columns_meanings, meanings)
        
        # 验证中文含义被截断到10个字符
        self.assertIn("| description | text | 这是一个非常长的描述 |", result)
    
    def test_generate_markdown_with_missing_meaning(self):
        """测试generate_markdown函数处理缺失中文含义的情况"""
        columns_meanings = [('unknown_field', 'varchar(50)')]
        meanings = {}  # 空的含义字典
        
        result = app.generate_markdown(columns_meanings, meanings)
        
        # 验证使用字段名作为默认含义（截断到10个字符）
        self.assertIn("| unknown_field | varchar(50) | unknown_fi |", result)


class TestOpenAIClientInitialization(unittest.TestCase):
    """测试OpenAI客户端初始化"""
    
    def test_client_exists(self):
        """测试客户端对象是否存在"""
        # 验证app模块中有client属性
        self.assertTrue(hasattr(app, 'client'))
        
    def test_client_type_when_initialized(self):
        """测试客户端初始化成功时的类型"""
        if app.client is not None:
            # 如果客户端初始化成功，应该是OpenAI类型
            from openai import OpenAI
            self.assertIsInstance(app.client, OpenAI)
        else:
            # 如果客户端为None，说明初始化失败，这也是预期的情况
            self.assertIsNone(app.client)


def run_tests():
    """运行所有测试"""
    # 创建测试套件
    test_suite = unittest.TestSuite()
    
    # 添加测试类
    test_suite.addTest(unittest.makeSuite(TestOpenAIModelIntegration))
    test_suite.addTest(unittest.makeSuite(TestOpenAIClientInitialization))
    
    # 运行测试
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(test_suite)
    
    # 返回测试结果
    return result.wasSuccessful()


if __name__ == '__main__':
    print("=" * 60)
    print("开始测试 app.py 中的 OpenAI 大模型功能")
    print("=" * 60)
    
    success = run_tests()
    
    print("\n" + "=" * 60)
    if success:
        print("✅ 所有测试通过！OpenAI大模型集成功能正常")
    else:
        print("❌ 部分测试失败，请检查相关功能")
    print("=" * 60)