import json
import requests
from django.conf import settings
from ponds.models import Pond, Sensor, SensorReading
from django.utils import timezone

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_ponds",
            "description": "列出所有魚池的名稱、位置、ID與水車運作狀態。",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_pond",
            "description": "新增一個魚池。",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "魚池名稱，例如 '魚池 D'"},
                    "location": {"type": "string", "description": "魚池位置，例如 '西區'"}
                },
                "required": ["name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_pond",
            "description": "修改現有魚池的名稱或位置。",
            "parameters": {
                "type": "object",
                "properties": {
                    "pond_id": {"type": "integer", "description": "魚池的 ID"},
                    "name": {"type": "string", "description": "新的魚池名稱"},
                    "location": {"type": "string", "description": "新的魚池位置"}
                },
                "required": ["pond_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_sensor",
            "description": "為特定魚池新增一個感測器。",
            "parameters": {
                "type": "object",
                "properties": {
                    "pond_id": {"type": "integer", "description": "魚池的 ID"},
                    "name": {"type": "string", "description": "感測器代碼/名稱，例如 'PH-04'"},
                    "sensor_type": {
                        "type": "string", 
                        "enum": ["temperature", "ph", "dissolved_oxygen", "water_level", "light", "rain"],
                        "description": "感測器類型"
                    }
                },
                "required": ["pond_id", "name", "sensor_type"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_sensor",
            "description": "修改感測器詳情，例如名稱或狀態（啟用、停用、異常）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "sensor_id": {"type": "integer", "description": "感測器的 ID"},
                    "name": {"type": "string", "description": "感測器的新名稱"},
                    "status": {
                        "type": "string", 
                        "enum": ["active", "inactive", "error"],
                        "description": "感測器的新狀態"
                    }
                },
                "required": ["sensor_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "control_water_wheel",
            "description": "控制特定魚池的水車運作（開啟或關閉）。可以指定特定水車 ID，或不指定以控制該魚池的所有水車。",
            "parameters": {
                "type": "object",
                "properties": {
                    "pond_id": {"type": "integer", "description": "魚池的 ID"},
                    "turn_on": {"type": "boolean", "description": "True 代表開啟水車，False 代表關閉水車"},
                    "wheel_id": {"type": "integer", "description": "選填，特定水車的 ID。如果不指定，則控制該魚池的所有水車。"}
                },
                "required": ["pond_id", "turn_on"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "configure_auto_aeration",
            "description": "配置魚池的自動增氧（水車自動運轉）功能，包含啟用/停用開關以及溶氧量閾值。",
            "parameters": {
                "type": "object",
                "properties": {
                    "pond_id": {"type": "integer", "description": "魚池的 ID"},
                    "enabled": {"type": "boolean", "description": "是否啟用自動增氧運轉功能"},
                    "threshold": {"type": "number", "description": "溶氧量閾值，當溶氧低於此數值（單位 mg/L）時自動啟動水車。預設為 4.0"}
                },
                "required": ["pond_id", "enabled"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_pond_sensor_readings",
            "description": "查詢特定魚池當前的所有感測器讀數與狀態。",
            "parameters": {
                "type": "object",
                "properties": {
                    "pond_id": {"type": "integer", "description": "魚池的 ID"}
                },
                "required": ["pond_id"]
            }
        }
    }
]

# Database Tool Executions
def execute_tool(name, args):
    try:
        if name == "list_ponds":
            ponds = Pond.objects.all()
            data = []
            for p in ponds:
                wheels = p.water_wheels.all()
                wheels_data = [{"id": w.id, "name": w.name, "status": "開啟 (Running)" if w.status == 'on' else "關閉 (Stopped)"} for w in wheels]
                data.append({
                    "id": p.id,
                    "name": p.name,
                    "location": p.location,
                    "water_wheel_status": "開啟 (Spinning)" if p.water_wheel_status else "關閉 (Stopped)",
                    "water_wheels": wheels_data,
                    "auto_aeration_enabled": "啟用" if p.auto_aeration_enabled else "停用",
                    "auto_aeration_threshold": p.auto_aeration_threshold
                })
            return {"status": "success", "ponds": data}

        elif name == "create_pond":
            pond = Pond.objects.create(
                name=args["name"],
                location=args.get("location", "")
            )
            # Create default sensors for the new pond automatically
            sensor_types = [
                ('temperature', f"{pond.name[:6].upper()}-TEMP"),
                ('ph', f"{pond.name[:6].upper()}-PH"),
                ('dissolved_oxygen', f"{pond.name[:6].upper()}-DISS"),
                ('water_level', f"{pond.name[:6].upper()}-WATE"),
            ]
            for stype, sname in sensor_types:
                Sensor.objects.create(pond=pond, name=sname, sensor_type=stype, status='active')
            
            # Create 1 default water wheel
            WaterWheel.objects.create(pond=pond, name="增氧水車 01", status="off")
            
            return {
                "status": "success", 
                "message": f"成功建立魚池 '{pond.name}'（ID: {pond.id}）並已自動配置 4 個感測器（溫度、pH、溶氧、水位）與 1 台水車。",
                "pond_id": pond.id,
                "action_type": "ui_refresh"
            }

        elif name == "update_pond":
            pond = Pond.objects.get(id=args["pond_id"])
            if "name" in args:
                pond.name = args["name"]
            if "location" in args:
                pond.location = args["location"]
            pond.save()
            return {
                "status": "success", 
                "message": f"魚池 ID {pond.id} 已更新，目前名稱：'{pond.name}'，位置：'{pond.location}'。",
                "action_type": "ui_refresh"
            }

        elif name == "create_sensor":
            pond = Pond.objects.get(id=args["pond_id"])
            sensor = Sensor.objects.create(
                pond=pond,
                name=args["name"],
                sensor_type=args["sensor_type"],
                status="active"
            )
            return {
                "status": "success", 
                "message": f"已在魚池 '{pond.name}' 新增感測器 '{sensor.name}' ({sensor.get_sensor_type_display()})。",
                "sensor_id": sensor.id,
                "action_type": "ui_refresh"
            }

        elif name == "update_sensor":
            sensor = Sensor.objects.get(id=args["sensor_id"])
            if "name" in args:
                sensor.name = args["name"]
            if "status" in args:
                sensor.status = args["status"]
            sensor.save()
            return {
                "status": "success", 
                "message": f"感測器 '{sensor.name}' 已更新，狀態：'{sensor.get_status_display()}'。",
                "action_type": "ui_refresh"
            }

        elif name == "control_water_wheel":
            pond = Pond.objects.get(id=args["pond_id"])
            turn_on = args["turn_on"]
            wheel_id = args.get("wheel_id")
            
            status_val = 'on' if turn_on else 'off'
            
            if wheel_id:
                wheel = WaterWheel.objects.get(id=wheel_id, pond=pond)
                wheel.status = status_val
                wheel.save()
                msg = f"已成功將魚池 '{pond.name}' 的水車 '{wheel.name}' {'開啟' if turn_on else '關閉'}！"
            else:
                wheels = WaterWheel.objects.filter(pond=pond)
                wheels.update(status=status_val)
                msg = f"已成功將魚池 '{pond.name}' 的所有水車 ({wheels.count()} 台) {'開啟' if turn_on else '關閉'}！"
                
            # Sync legacy status
            pond.water_wheel_status = pond.water_wheels.filter(status='on').exists()
            pond.save()
            
            return {
                "status": "success", 
                "message": msg,
                "pond_id": pond.id,
                "water_wheel_status": pond.water_wheel_status,
                "action_type": "water_wheel_control"
            }

        elif name == "configure_auto_aeration":
            pond = Pond.objects.get(id=args["pond_id"])
            pond.auto_aeration_enabled = args["enabled"]
            if "threshold" in args:
                pond.auto_aeration_threshold = float(args["threshold"])
            pond.save()
            
            # Immediately check status
            from ponds.views import check_auto_aeration
            check_auto_aeration(pond)
            
            status_str = "啟用" if pond.auto_aeration_enabled else "停用"
            return {
                "status": "success",
                "message": f"已成功為魚池 '{pond.name}' {status_str} 自動增氧功能（閾值：{pond.auto_aeration_threshold} mg/L）。",
                "pond_id": pond.id,
                "auto_aeration_enabled": pond.auto_aeration_enabled,
                "auto_aeration_threshold": pond.auto_aeration_threshold,
                "action_type": "ui_refresh"
            }

        elif name == "get_pond_sensor_readings":
            pond = Pond.objects.get(id=args["pond_id"])
            sensors = Sensor.objects.filter(pond=pond)
            sensor_data = []
            for s in sensors:
                latest_reading = SensorReading.objects.filter(sensor=s).order_by('-timestamp').first()
                val = latest_reading.value if latest_reading else "無數據"
                time_str = latest_reading.timestamp.strftime("%Y-%m-%d %H:%M:%S") if latest_reading else ""
                sensor_data.append({
                    "id": s.id,
                    "name": s.name,
                    "type": s.get_sensor_type_display(),
                    "status": s.get_status_display(),
                    "latest_value": val,
                    "timestamp": time_str
                })
            return {
                "status": "success",
                "pond_name": pond.name,
                "water_wheel": "運作中" if pond.water_wheel_status else "已停止",
                "sensors": sensor_data
            }
            
    except Exception as e:
        return {"status": "error", "message": str(e)}
        
    return {"status": "error", "message": "Unknown function"}

def ask_assistant(user_message, conversation_history=None):
    if conversation_history is None:
        conversation_history = []
        
    api_key = getattr(settings, 'OPENAI_API_KEY', '')
    if not api_key:
        return {
            "response": "錯誤：未設定 OpenAI API 金鑰。請在 gpt-5-mini-api.txt 中放置正確的金鑰。",
            "ui_actions": []
        }
        
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    # System Prompt
    system_prompt = (
        "你是一個智慧水產養殖系統的 AI 助理小助手。\n"
        "你可以為用戶查詢魚池狀態、水車狀態、感測器讀數，並能幫忙新增/修改魚池、新增/修改感測器、以及控制水車。\n"
        "如果用戶的要求需要進行數據庫修改或查詢，請務必使用對應的 Function Calling (Tools)。\n"
        "請用繁體中文親切、專業地回答。\n"
        "請一定要使用 Markdown 語法來排版你的回覆（如粗體、清單、表格等），並搭配合適的表情符號（如 🌊、🟢、🔴、📍、⚙️、📊），使介面極具美感。\n"
        "例如在列出多個魚池狀態時，請使用如下優雅清單格式：\n"
        "🌊 **Pond Alpha (虱目魚)**\n"
        "  - 📍 位置：北區\n"
        "  - ⚙️ 水車：🟢 開啟 (正在運轉)\n"
        "如果執行了修改（如新增魚池、控制水車），請向用戶確認執行完畢。"
    )
    
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(conversation_history)
    messages.append({"role": "user", "content": user_message})
    
    payload = {
        "model": "gpt-4o-mini",
        "messages": messages,
        "tools": TOOLS,
        "tool_choice": "auto"
    }
    
    ui_actions = []
    
    try:
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=25
        )
        
        if response.status_code != 200:
            return {
                "response": f"OpenAI API 錯誤 (代碼: {response.status_code}): {response.text}",
                "ui_actions": []
            }
            
        res_data = response.json()
        choice = res_data["choices"][0]
        message = choice["message"]
        
        # Check if model wants to call tools
        if "tool_calls" in message and message["tool_calls"]:
            tool_calls = message["tool_calls"]
            # Append assistant message that requests tools
            messages.append(message)
            
            for tool_call in tool_calls:
                func_name = tool_call["function"]["name"]
                func_args = json.loads(tool_call["function"]["arguments"])
                
                # Execute db tool
                tool_res = execute_tool(func_name, func_args)
                
                # If tool execution returned a UI action instruction, collect it
                if isinstance(tool_res, dict) and "action_type" in tool_res:
                    ui_actions.append(tool_res)
                    
                # Append tool response
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call["id"],
                    "name": func_name,
                    "content": json.dumps(tool_res, ensure_ascii=False)
                })
                
            # Request final chat answer with tool result included
            payload_followup = {
                "model": "gpt-4o-mini",
                "messages": messages
            }
            
            res_followup = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json=payload_followup,
                timeout=25
            )
            
            if res_followup.status_code == 200:
                followup_data = res_followup.json()
                final_text = followup_data["choices"][0]["message"]["content"]
                return {
                    "response": final_text,
                    "ui_actions": ui_actions
                }
            else:
                return {
                    "response": f"Tool 執行後二次詢問 OpenAI 失敗: {res_followup.text}",
                    "ui_actions": ui_actions
                }
        else:
            return {
                "response": message["content"],
                "ui_actions": []
            }
            
    except Exception as e:
        return {
            "response": f"與 AI 助理通訊時發生異常: {str(e)}",
            "ui_actions": []
        }
