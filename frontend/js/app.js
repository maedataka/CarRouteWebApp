/**
 * GCP Routes API - Route Search Application
 * 車のルート検索と地図表示を行うフロントエンドアプリケーション
 */

// グローバル変数
let map;
let routePolyline = null;
let originMarker = null;
let destinationMarker = null;

// 設定
const CONFIG = {
    // バックエンドAPIのURL（開発環境）
    BACKEND_URL: window.BACKEND_URL || 'http://localhost:8000',
    // 日本の中心座標（初期表示用）
    DEFAULT_CENTER: { lat: 35.6812, lng: 139.7671 }, // 東京駅
    DEFAULT_ZOOM: 10,
    // ルートの線スタイル
    ROUTE_STYLE: {
        strokeColor: '#4299e1',
        strokeOpacity: 0.9,
        strokeWeight: 5,
    },
};

/**
 * Google Maps初期化コールバック
 */
function initMap() {
    // 地図の作成
    map = new google.maps.Map(document.getElementById('map'), {
        center: CONFIG.DEFAULT_CENTER,
        zoom: CONFIG.DEFAULT_ZOOM,
        styles: getMapStyles(),
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
    });

    // フォームのイベントリスナーを設定
    setupFormListeners();

    console.log('Map initialized successfully');
}

/**
 * ダークモード用の地図スタイル
 */
function getMapStyles() {
    return [
        { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
        {
            featureType: 'administrative.country',
            elementType: 'geometry.stroke',
            stylers: [{ color: '#4b6878' }],
        },
        {
            featureType: 'administrative.land_parcel',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#64779e' }],
        },
        {
            featureType: 'administrative.province',
            elementType: 'geometry.stroke',
            stylers: [{ color: '#4b6878' }],
        },
        {
            featureType: 'landscape.man_made',
            elementType: 'geometry.stroke',
            stylers: [{ color: '#334e87' }],
        },
        {
            featureType: 'landscape.natural',
            elementType: 'geometry',
            stylers: [{ color: '#023e58' }],
        },
        {
            featureType: 'poi',
            elementType: 'geometry',
            stylers: [{ color: '#283d6a' }],
        },
        {
            featureType: 'poi',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#6f9ba5' }],
        },
        {
            featureType: 'poi',
            elementType: 'labels.text.stroke',
            stylers: [{ color: '#1d2c4d' }],
        },
        {
            featureType: 'poi.park',
            elementType: 'geometry.fill',
            stylers: [{ color: '#023e58' }],
        },
        {
            featureType: 'poi.park',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#3C7680' }],
        },
        {
            featureType: 'road',
            elementType: 'geometry',
            stylers: [{ color: '#304a7d' }],
        },
        {
            featureType: 'road',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#98a5be' }],
        },
        {
            featureType: 'road',
            elementType: 'labels.text.stroke',
            stylers: [{ color: '#1d2c4d' }],
        },
        {
            featureType: 'road.highway',
            elementType: 'geometry',
            stylers: [{ color: '#2c6675' }],
        },
        {
            featureType: 'road.highway',
            elementType: 'geometry.stroke',
            stylers: [{ color: '#255763' }],
        },
        {
            featureType: 'road.highway',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#b0d5ce' }],
        },
        {
            featureType: 'road.highway',
            elementType: 'labels.text.stroke',
            stylers: [{ color: '#023e58' }],
        },
        {
            featureType: 'transit',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#98a5be' }],
        },
        {
            featureType: 'transit',
            elementType: 'labels.text.stroke',
            stylers: [{ color: '#1d2c4d' }],
        },
        {
            featureType: 'transit.line',
            elementType: 'geometry.fill',
            stylers: [{ color: '#283d6a' }],
        },
        {
            featureType: 'transit.station',
            elementType: 'geometry',
            stylers: [{ color: '#3a4762' }],
        },
        {
            featureType: 'water',
            elementType: 'geometry',
            stylers: [{ color: '#0e1626' }],
        },
        {
            featureType: 'water',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#4e6d70' }],
        },
    ];
}

/**
 * フォームのイベントリスナーを設定
 */
function setupFormListeners() {
    const form = document.getElementById('route-form');
    form.addEventListener('submit', handleFormSubmit);
}

/**
 * フォーム送信ハンドラー
 */
async function handleFormSubmit(event) {
    event.preventDefault();

    const origin = document.getElementById('origin').value.trim();
    const destination = document.getElementById('destination').value.trim();

    if (!origin || !destination) {
        showError('出発地と目的地を入力してください');
        return;
    }

    // UIの更新
    setLoading(true);
    hideError();
    hideResult();

    try {
        // バックエンドAPIを呼び出し
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/route`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ origin, destination }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `HTTPエラー: ${response.status}`);
        }

        const data = await response.json();
        displayRoute(data);
    } catch (error) {
        console.error('Route search failed:', error);
        showError(error.message || 'ルートの検索に失敗しました');
    } finally {
        setLoading(false);
    }
}

/**
 * ルートを地図上に表示
 */
function displayRoute(data) {
    // 既存のルートをクリア
    clearRoute();

    // ポリラインをデコード
    const path = google.maps.geometry.encoding.decodePath(data.polyline);

    // ルートのポリラインを描画
    routePolyline = new google.maps.Polyline({
        path: path,
        geodesic: true,
        ...CONFIG.ROUTE_STYLE,
    });
    routePolyline.setMap(map);

    // 出発地マーカー
    originMarker = new google.maps.Marker({
        position: {
            lat: data.origin_coords.latitude,
            lng: data.origin_coords.longitude,
        },
        map: map,
        title: '出発地',
        label: {
            text: 'A',
            color: 'white',
            fontWeight: 'bold',
        },
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: '#48bb78',
            fillOpacity: 1,
            strokeColor: 'white',
            strokeWeight: 2,
        },
    });

    // 目的地マーカー
    destinationMarker = new google.maps.Marker({
        position: {
            lat: data.destination_coords.latitude,
            lng: data.destination_coords.longitude,
        },
        map: map,
        title: '目的地',
        label: {
            text: 'B',
            color: 'white',
            fontWeight: 'bold',
        },
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: '#ed8936',
            fillOpacity: 1,
            strokeColor: 'white',
            strokeWeight: 2,
        },
    });

    // 地図の表示範囲を調整
    const bounds = new google.maps.LatLngBounds();
    path.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, { padding: 50 });

    // 結果を表示
    showResult(data);
}

/**
 * 既存のルートをクリア
 */
function clearRoute() {
    if (routePolyline) {
        routePolyline.setMap(null);
        routePolyline = null;
    }
    if (originMarker) {
        originMarker.setMap(null);
        originMarker = null;
    }
    if (destinationMarker) {
        destinationMarker.setMap(null);
        destinationMarker = null;
    }
}

/**
 * ローディング状態の設定
 */
function setLoading(isLoading) {
    const btn = document.getElementById('search-btn');
    const btnText = btn.querySelector('.btn-text');
    const btnLoading = btn.querySelector('.btn-loading');

    btn.disabled = isLoading;
    btnText.hidden = isLoading;
    btnLoading.hidden = !isLoading;
}

/**
 * 結果を表示
 */
function showResult(data) {
    const panel = document.getElementById('result-panel');
    document.getElementById('duration').textContent = data.duration;
    document.getElementById('distance').textContent = data.distance;
    document.getElementById('origin-address').textContent =
        document.getElementById('origin').value;
    document.getElementById('destination-address').textContent =
        document.getElementById('destination').value;
    panel.hidden = false;
}

/**
 * 結果を非表示
 */
function hideResult() {
    document.getElementById('result-panel').hidden = true;
}

/**
 * エラーを表示
 */
function showError(message) {
    const panel = document.getElementById('error-panel');
    document.getElementById('error-message').textContent = message;
    panel.hidden = false;
}

/**
 * エラーを非表示
 */
function hideError() {
    document.getElementById('error-panel').hidden = true;
}

// グローバルに公開（Google Maps APIのコールバック用）
window.initMap = initMap;
