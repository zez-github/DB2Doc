"""
配置模块
"""

import json
import os
from pathlib import Path


def _load_env():
    """尝试加载 .env 文件（若存在）"""
    try:
        from dotenv import load_dotenv  # type: ignore
        load_dotenv()
    except Exception:
        # 不依赖 dotenv 也可运行
        pass


def load_config():
    """加载配置：环境变量优先，其次本地 config.json，最后默认值"""
    _load_env()

    # 默认值
    defaults = {
        "base_url": "http://192.168.1.20:1234/v1",
        "api_key": "sk-no-key-required",
        "timeout": 30,
        "model": "google/gemma-3-1b",
    }

    # 本地配置文件
    file_cfg = {}
    config_path = Path(__file__).parent.parent.parent / 'config' / 'config.json'
    if config_path.exists():
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                file_data = json.load(f)
                file_cfg = file_data.get('ai', {}).get('openai', {})
        except Exception:
            file_cfg = {}

    # 环境变量
    env_cfg = {
        k: v
        for k, v in {
            "base_url": os.getenv("OPENAI_BASE_URL"),
            "api_key": os.getenv("OPENAI_API_KEY"),
            "timeout": int(os.getenv("OPENAI_TIMEOUT", "0")) or None,
            "model": os.getenv("OPENAI_MODEL"),
        }.items()
        if v not in (None, "")
    }

    # 合并：默认 < 文件 < 环境
    openai_cfg = {**defaults, **file_cfg, **env_cfg}

    return {
        "ai": {
            "openai": openai_cfg
        }
    }


# 全局配置对象
config = load_config()