"""
配置管理 API 模块

提供配置的查询、修改、重置接口：
- GET    /api/settings       - 获取当前生效配置及默认值
- PUT    /api/settings       - 修改配置项
- POST   /api/settings/reset - 重置全部或指定配置项为默认值
"""

from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.db import crud
from app.config import settings, CONFIGURABLE_KEYS


router = APIRouter()


class SettingsUpdate(BaseModel):
    """配置更新请求体"""
    settings: Dict[str, Any]  # 键值对，key 为配置项名称，value 为新值


class SettingsReset(BaseModel):
    """配置重置请求体"""
    keys: Optional[list[str]] = None  # 要重置的配置项列表，为空时重置全部


@router.get("")
async def get_settings(session: AsyncSession = Depends(get_session)):
    """
    获取当前生效的配置值、默认值及元信息。

    返回结构：每个配置项包含 current（当前值）、default（默认值）、label（显示名）、group（分组）。
    """
    user_settings = await crud.get_all_settings(session)
    user_map = {s.key: s.value for s in user_settings}

    result = {}
    for key, meta in CONFIGURABLE_KEYS.items():
        current_value = getattr(settings, key)
        # 确保类型正确返回
        if meta["type"] == "int":
            current_value = int(current_value)
        result[key] = {
            "current": current_value,
            "default": meta["default"],
            "type": meta["type"],
            "label": meta["label"],
            "group": meta["group"],
            "is_custom": key in user_map,
        }
    return {"settings": result}


@router.put("")
async def update_settings(
    request: SettingsUpdate,
    session: AsyncSession = Depends(get_session),
):
    """
    修改配置项。

    校验 key 是否合法，类型是否正确，然后持久化到数据库并更新运行时配置。
    """
    updated = {}
    for key, value in request.settings.items():
        if key not in CONFIGURABLE_KEYS:
            continue

        meta = CONFIGURABLE_KEYS[key]
        # 类型校验和转换
        if meta["type"] == "int":
            try:
                value = int(value)
            except (ValueError, TypeError):
                continue

        # 持久化到数据库
        await crud.upsert_setting(session, key, str(value))
        # 更新运行时配置
        setattr(settings, key, value)
        updated[key] = value

    return {"message": "Settings updated", "updated": updated}


@router.post("/reset")
async def reset_settings(
    request: SettingsReset,
    session: AsyncSession = Depends(get_session),
):
    """
    重置配置项为默认值。

    如果 keys 为空，重置全部配置项。
    """
    if request.keys:
        for key in request.keys:
            if key in CONFIGURABLE_KEYS:
                await crud.delete_setting(session, key)
                default_value = CONFIGURABLE_KEYS[key]["default"]
                setattr(settings, key, default_value)
    else:
        await crud.delete_all_settings(session)
        for key, meta in CONFIGURABLE_KEYS.items():
            setattr(settings, key, meta["default"])

    return {"message": "Settings reset to defaults"}
