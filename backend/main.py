"""
GCP Routes API Backend Server
車のルート計算と住所のジオコーディングを提供するFastAPIサーバー
"""

import os
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# 環境変数の読み込み
load_dotenv()

app = FastAPI(
    title="GCP Routes API Backend",
    description="車のルート計算と移動時間を提供するAPI",
    version="1.0.0",
)

# CORS設定
frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# GCP API設定
GCP_API_KEY = os.getenv("GCP_API_KEY")
ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
GEOCODING_API_URL = "https://maps.googleapis.com/maps/api/geocode/json"


# リクエスト/レスポンスモデル
class RouteRequest(BaseModel):
    origin: str  # 出発地の住所
    destination: str  # 目的地の住所


class Coordinates(BaseModel):
    latitude: float
    longitude: float


class RouteResponse(BaseModel):
    distance: str  # 距離（例: "10.5 km"）
    duration: str  # 所要時間（例: "25分"）
    polyline: str  # エンコード済みポリライン
    origin_coords: Coordinates
    destination_coords: Coordinates


class GeocodeResponse(BaseModel):
    address: str
    latitude: float
    longitude: float


async def geocode_address(address: str) -> dict:
    """住所から緯度経度を取得"""
    if not GCP_API_KEY:
        raise HTTPException(status_code=500, detail="GCP_API_KEY is not configured")

    async with httpx.AsyncClient() as client:
        response = await client.get(
            GEOCODING_API_URL,
            params={
                "address": address,
                "key": GCP_API_KEY,
                "language": "ja",
                "region": "JP",
            },
        )

        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Geocoding API error: {response.text}",
            )

        data = response.json()

        if data["status"] != "OK":
            raise HTTPException(
                status_code=400,
                detail=f"Geocoding failed: {data['status']} - {data.get('error_message', 'Unknown error')}",
            )

        location = data["results"][0]["geometry"]["location"]
        return {
            "address": data["results"][0]["formatted_address"],
            "latitude": location["lat"],
            "longitude": location["lng"],
        }


def format_duration(seconds: int) -> str:
    """秒数を読みやすい形式に変換"""
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60

    if hours > 0:
        return f"{hours}時間{minutes}分"
    return f"{minutes}分"


def format_distance(meters: int) -> str:
    """メートルを読みやすい形式に変換"""
    if meters >= 1000:
        km = meters / 1000
        return f"{km:.1f} km"
    return f"{meters} m"


@app.get("/")
async def root():
    """ヘルスチェック"""
    return {"status": "ok", "message": "GCP Routes API Backend is running"}



@app.get("/api/config")
async def get_config():
    """フロントエンド設定を取得するエンドポイント"""
    return {"mapsApiKey": GCP_API_KEY}


@app.get("/api/geocode", response_model=GeocodeResponse)
async def geocode(address: str):
    """住所から緯度経度を取得するエンドポイント"""
    result = await geocode_address(address)
    return GeocodeResponse(**result)


@app.post("/api/route", response_model=RouteResponse)
async def calculate_route(request: RouteRequest):
    """ルートを計算するエンドポイント"""
    if not GCP_API_KEY:
        raise HTTPException(status_code=500, detail="GCP_API_KEY is not configured")

    # 出発地と目的地をジオコーディング
    origin_geo = await geocode_address(request.origin)
    destination_geo = await geocode_address(request.destination)

    # Routes APIリクエストを構築
    route_request = {
        "origin": {
            "location": {
                "latLng": {
                    "latitude": origin_geo["latitude"],
                    "longitude": origin_geo["longitude"],
                }
            }
        },
        "destination": {
            "location": {
                "latLng": {
                    "latitude": destination_geo["latitude"],
                    "longitude": destination_geo["longitude"],
                }
            }
        },
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_UNAWARE",
        "languageCode": "ja",
        "regionCode": "JP",
        "units": "METRIC",
    }

    # Routes APIを呼び出し
    async with httpx.AsyncClient() as client:
        response = await client.post(
            ROUTES_API_URL,
            json=route_request,
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": GCP_API_KEY,
                "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
            },
        )

        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Routes API error: {response.text}",
            )

        data = response.json()

        if "routes" not in data or len(data["routes"]) == 0:
            raise HTTPException(
                status_code=404,
                detail="No route found between the specified locations",
            )

        route = data["routes"][0]

        # 所要時間を秒数として取得（"123s" 形式から数値を抽出）
        duration_str = route.get("duration", "0s")
        duration_seconds = int(duration_str.rstrip("s"))

        return RouteResponse(
            distance=format_distance(route.get("distanceMeters", 0)),
            duration=format_duration(duration_seconds),
            polyline=route.get("polyline", {}).get("encodedPolyline", ""),
            origin_coords=Coordinates(
                latitude=origin_geo["latitude"],
                longitude=origin_geo["longitude"],
            ),
            destination_coords=Coordinates(
                latitude=destination_geo["latitude"],
                longitude=destination_geo["longitude"],
            ),
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
