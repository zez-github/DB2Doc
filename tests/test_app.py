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
from app.utils import ai_helper as app


class TestOpenAIModelIntegration(unittest.TestCase):
    """测试OpenAI大模型集成功能"""
    
    def setUp(self):
        """测试前的设置"""
        # 模拟完整的列数据格式，包含至少5个元素
        self.test_columns = [
            ('user_id', 'int', 'NO', None, ''),
            ('username', 'varchar(50)', 'NO', None, ''),
            ('email', 'varchar(100)', 'YES', None, ''),
            ('created_at', 'datetime', 'NO', 'CURRENT_TIMESTAMP', '')
        ]
        self.test_table_name = 'users'
        
    def test_infer_chinese_meaning_with_no_client(self):
        """测试当OpenAI客户端未初始化时的情况"""
        # 模拟get_openai_client返回None
        with patch.object(app, 'get_openai_client', return_value=None):
            result = app.infer_chinese_meaning(self.test_columns, self.test_table_name)
            
            # 验证返回空字典
            expected = {}
            self.assertEqual(result, expected)
    
    def test_infer_chinese_meaning_successful_response(self):
        """测试OpenAI API成功响应的情况"""
        # 模拟成功的API响应
        mock_response = MagicMock()
        mock_response.choices[0].message.content = '''{
    "user_id": "用户ID",
    "username": "用户名",
    "email": "邮箱地址",
    "created_at": "创建时间"
}'''
        
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = mock_response
        
        with patch.object(app, 'get_openai_client', return_value=mock_client):
            result = app.infer_chinese_meaning(self.test_columns, self.test_table_name)
            
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
        
        with patch.object(app, 'get_openai_client', return_value=mock_client):
            result = app.infer_chinese_meaning(self.test_columns, self.test_table_name)
            
            expected = {
                "user_id": "用户标识",
                "username": "用户姓名",
                "email": "电子邮件", 
                "created_at": "创建日期"
            }
            self.assertEqual(result, expected)
    
    def test_infer_chinese_meaning_api_exception(self):
        """测试API调用异常的情况"""
        mock_client = MagicMock()
        mock_client.chat.completions.create.side_effect = Exception("API连接失败")
        
        with patch.object(app, 'get_openai_client', return_value=mock_client):
            result = app.infer_chinese_meaning(self.test_columns, self.test_table_name)
            
            # 验证返回空字典
            expected = {}
            self.assertEqual(result, expected)
    
    def test_infer_chinese_meaning_invalid_json_response(self):
        """测试API返回无效JSON的情况"""
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "这不是有效的JSON格式"
        
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = mock_response
        
        with patch.object(app, 'get_openai_client', return_value=mock_client):
            result = app.infer_chinese_meaning(self.test_columns, self.test_table_name)
            
            # 验证返回空字典
            expected = {}
            self.assertEqual(result, expected)
    
    def test_infer_chinese_meaning_empty_columns(self):
        """测试空字段列表的情况"""
        empty_columns = []
        
        # 模拟get_openai_client返回None
        with patch.object(app, 'get_openai_client', return_value=None):
            result = app.infer_chinese_meaning(empty_columns, self.test_table_name)
            
            # 空字段列表应该返回空字典
            self.assertEqual(result, {})
    
    def test_infer_chinese_meaning_single_column(self):
        """测试单个字段的情况"""
        single_column = [('id', 'int', 'NO', None, '')]
        
        mock_response = MagicMock()
        mock_response.choices[0].message.content = '{"id": "主键ID"}'
        
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = mock_response
        
        with patch.object(app, 'get_openai_client', return_value=mock_client):
            result = app.infer_chinese_meaning(single_column, self.test_table_name)
            
            # 验证返回结果
            expected = {"id": "主键ID"}
            self.assertEqual(result, expected)
    
    def test_generate_markdown_function(self):
        """测试generate_markdown函数"""
        # 使用完整的列数据格式
        columns = [
            ('user_id', 'int', 'NO', None, ''),
            ('username', 'varchar(50)', 'NO', None, ''),
            ('email', 'varchar(100)', 'YES', None, '')
        ]
        
        meanings = {
            'user_id': '用户ID',
            'username': '用户名',
            'email': '邮箱地址'
        }
        
        result = app.generate_markdown(columns, meanings)
        
        # 验证Markdown格式
        self.assertIn("| 字段名 | 类型 | 是否可空 | 默认值 | 中文含义 | 注释 |", result)
        self.assertIn("|--------|------|----------|--------|----------|------|", result)
        self.assertIn("| user_id | int | NO |  | 用户ID |  |", result)
        self.assertIn("| username | varchar(50) | NO |  | 用户名 |  |", result)
        self.assertIn("| email | varchar(100) | YES |  | 邮箱地址 |  |", result)
    
    def test_generate_markdown_with_long_meaning(self):
        """测试generate_markdown函数处理超长中文含义的情况"""
        columns = [('description', 'text', 'YES', None, '')]
        meanings = {'description': '这是一个非常长的描述字段用于存储详细信息'}
        
        result = app.generate_markdown(columns, meanings)
        
        # 验证中文含义被正确处理
        self.assertIn("| description | text | YES |  | 这是一个非常长的描述字段用于存储详细信息 |  |", result)
    
    def test_generate_markdown_with_missing_meaning(self):
        """测试generate_markdown函数处理缺失中文含义的情况"""
        columns = [('unknown_field', 'varchar(50)', 'YES', None, '')]
        meanings = {}  # 空的含义字典
        
        result = app.generate_markdown(columns, meanings)
        
        # 验证使用空字符串作为默认含义
        self.assertIn("| unknown_field | varchar(50) | YES |  |  |  |", result)


class TestOpenAIClientInitialization(unittest.TestCase):
    """测试OpenAI客户端初始化"""
    
    def test_get_openai_client_exists(self):
        """测试get_openai_client函数是否存在"""
        # 验证app模块中有get_openai_client函数
        self.assertTrue(hasattr(app, 'get_openai_client'))
    
    def test_get_openai_client_returns_client_or_none(self):
        """测试get_openai_client函数返回值"""
        result = app.get_openai_client()
        # 函数应该返回None或OpenAI客户端对象
        from openai import OpenAI
        self.assertIsInstance(result, (type(None), OpenAI))


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