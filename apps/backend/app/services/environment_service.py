import os
import httpx
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, date, timedelta, timezone
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from app.models.environment import EnvironmentLog

# 로거 설정
logger = logging.getLogger("environment_service")

try:
    from zoneinfo import ZoneInfo
    # Verify we can load the timezone database
    _ = ZoneInfo("Asia/Seoul")
    def get_kst_timezone():
        return ZoneInfo("Asia/Seoul")
except Exception:
    def get_kst_timezone():
        return timezone(timedelta(hours=9))

def normalize_to_kst_naive(dt: Optional[datetime]) -> Optional[datetime]:
    """
    Normalizes a datetime to Asia/Seoul (KST, UTC+9) naive datetime.
    If the datetime is offset-aware, it is converted to UTC+9 first,
    and then the timezone info is removed.
    If already naive, it is assumed to represent KST time.
    """
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(get_kst_timezone()).replace(tzinfo=None)
    return dt

# 임시 대표 기상청 관측소 매핑 (MVP 용)
# 주의: 광역 단위의 단순 매핑이므로 실제 상세 기상 관측 값과의 정확도는 다소 낮을 수 있습니다.
MAJOR_STATION_MAP = {
    "서울": "108",
    "부산": "159",
    "대구": "143",
    "인천": "112",
    "광주": "156",
    "대전": "133",
    "울산": "152",
    "경기": "119", # 수원
    "강원": "105", # 강릉
    "충북": "131", # 청주
    "충남": "133", # 대전 (임시)
    "전북": "146", # 전주
    "전남": "156", # 광주 (임시)
    "경북": "143", # 대구 (임시)
    "경남": "155", # 창원
    "제주": "184"
}

# 기상청 생활기상지수 행정구역코드 매핑 (시도 단위)
LIVING_AREA_NO_MAP = {
    "서울": "1100000000",
    "부산": "2600000000",
    "대구": "2700000000",
    "인천": "2800000000",
    "광주": "2900000000",
    "대전": "3000000000",
    "울산": "3100000000",
    "세종": "3600000000",
    "경기": "4100000000",
    "강원": "4200000000",
    "충북": "4300000000",
    "충남": "4400000000",
    "전북": "4500000000",
    "전남": "4600000000",
    "경북": "4700000000",
    "경남": "4800000000",
    "제주": "5000000000"
}

# AirKorea 측정소명 예외 매핑 테이블 (필요시 수동 확장 가능)
AIRKOREA_STATION_MAP = {
    # 예: "서울특별시 강남구": "강남구"
}

# KMA 지상관측(kma_sfctm2) GTS 날씨 코드 매핑 (index 23: WP)
WEATHER_MAP = {
    "3": "황사",
    "4": "안개",
    "5": "진눈깨비",
    "6": "비",
    "7": "눈",
    "8": "소나기",
    "9": "우박"
}

def parse_optional_float(val: str) -> Optional[float]:
    if val in ("-9", "-9.0", "-99.0", "-999", "-999.0"):
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None

def parse_optional_int(val: Optional[str]) -> Optional[int]:
    if val is None:
        return None
    val_str = str(val).strip()
    if val_str in ("", "-", "null", "None", "-9", "-9.0", "-99.0", "-999", "-999.0"):
        return None
    try:
        return int(val_str)
    except ValueError:
        try:
            return int(round(float(val_str)))
        except ValueError:
            return None

def normalize_location(name: str) -> str:
    """
    KMA_STATION_MAP 매핑을 위해 행정구역명을 표준 단축명으로 표준화합니다.
    """
    name = name.strip()
    replacements = {
        "서울특별시": "서울",
        "부산광역시": "부산",
        "대구광역시": "대구",
        "인천광역시": "인천",
        "광주광역시": "광주",
        "대전광역시": "대전",
        "울산광역시": "울산",
        "세종특별자치시": "충남",  # 세종은 대전/충남 인근이므로 충남으로 매핑
        "경기도": "경기",
        "강원도": "강원",
        "강원특별자치도": "강원",
        "충청북도": "충북",
        "충청남도": "충남",
        "전라북도": "전북",
        "전북특별자치도": "전북",
        "전라남도": "전남",
        "경상북도": "경북",
        "경상남도": "경남",
        "제주특별자치도": "제주",
        "제주도": "제주"
    }
    for old, new in replacements.items():
        if name.startswith(old):
            return name.replace(old, new, 1)
    return name

def normalize_living_location(name: str) -> str:
    """
    생활기상지수 API 조회를 위한 행정구역명을 표준 단축명으로 표준화합니다.
    (세종특별자치시는 관측소 매핑과 달리 3600000000으로 고유 매핑)
    """
    name = name.strip()
    replacements = {
        "서울특별시": "서울",
        "부산광역시": "부산",
        "대구광역시": "대구",
        "인천광역시": "인천",
        "광주광역시": "광주",
        "대전광역시": "대전",
        "울산광역시": "울산",
        "세종특별자치시": "세종",
        "세종시": "세종",
        "경기도": "경기",
        "강원도": "강원",
        "강원특별자치도": "강원",
        "충청북도": "충북",
        "충청남도": "충남",
        "전라북도": "전북",
        "전북특별자치도": "전북",
        "전라남도": "전남",
        "경상북도": "경북",
        "경상남도": "경남",
        "제주특별자치도": "제주",
        "제주도": "제주"
    }
    for old, new in replacements.items():
        if name.startswith(old):
            return name.replace(old, new, 1)
    return name

def get_station_for_location(location_name: Optional[str]) -> Optional[str]:
    """
    주어진 위치명을 기준으로 기상청 관측소 코드를 반환하는 순수 함수입니다.
    매치되는 관측소가 없을 경우 서울 등으로 강제 fallback하지 않고 None을 반환합니다.
    """
    if not location_name:
        return None
    normalized = normalize_location(location_name)
    for key, stn in MAJOR_STATION_MAP.items():
        if normalized.startswith(key):
            return stn
    return None

def get_living_area_no(location_name: Optional[str]) -> Optional[str]:
    """
    주어진 위치명을 기준으로 기상청 생활기상지수 행정구역코드를 반환합니다.
    """
    if not location_name:
        return None
    normalized = normalize_living_location(location_name)
    for key, area_no in LIVING_AREA_NO_MAP.items():
        if normalized.startswith(key):
            # API 문서상 강원(4200000000), 전북(4500000000) 등 최신 행정구역 코드 확인 필요.
            # WARNING: 특별자치도 출범에 따라 코드가 달라졌을 가능성 있음. 
            # 만약 응답 에러 발생 시 최신 코드 테이블 재확인 요망.
            return area_no
    return None

def reverse_geocode_kakao(lat: float, lng: float) -> Optional[str]:
    """
    Kakao Local API를 이용하여 좌표(lat, lng)를 주소(location_name)로 변환합니다.
    """
    kakao_key = os.getenv("KAKAO_CLIENT_ID") or os.getenv("KAKAO_API_KEY")
    if not kakao_key:
        logger.warning("Kakao API key (KAKAO_CLIENT_ID or KAKAO_API_KEY) is not set in environment variables.")
        return None

    url = "https://dapi.kakao.com/v2/local/geo/coord2address.json"
    headers = {"Authorization": f"KakaoAK {kakao_key}"}
    params = {"x": lng, "y": lat}

    try:
        with httpx.Client() as client:
            resp = client.get(url, headers=headers, params=params, timeout=10.0)
            if resp.status_code == 200:
                data = resp.json()
                documents = data.get("documents")
                if documents and len(documents) > 0:
                    addr = documents[0].get("address")
                    if addr:
                        return addr.get("address_name")
                    road_addr = documents[0].get("road_address")
                    if road_addr:
                        return road_addr.get("address_name")
            else:
                logger.warning(f"Kakao API returned status code {resp.status_code}: {resp.text}")
    except Exception as e:
        logger.warning(f"Error calling Kakao reverse geocoding: {e}")
    return None

def fetch_kma_weather_data(station_code: str, captured_at: datetime) -> Tuple[Optional[float], Optional[int], Optional[str]]:
    """
    기상청 API를 호출하여 해당 관측소의 기온(temperature), 습도(humidity), 날씨(weather)를 가져옵니다.
    captured_at 기준 가장 가까운 관측 시간(최대 3개 후보)을 순서대로 탐색합니다.
    """
    KMA_AUTH_KEY = os.getenv("KMA_AUTH_KEY")
    if not KMA_AUTH_KEY:
        logger.warning("KMA_AUTH_KEY is not set in environment variables.")
        return None, None, None

    base_hour = captured_at.replace(minute=0, second=0, microsecond=0)
    candidates = []
    for h in [-2, -1, 0, 1]:
        dt = base_hour + timedelta(hours=h)
        candidates.append(dt)
        
    now = datetime.now(get_kst_timezone()).replace(tzinfo=None)
    valid_candidates = [c for c in candidates if c <= now + timedelta(minutes=5)]
    valid_candidates.sort(key=lambda c: abs((c - captured_at).total_seconds()))
    
    with httpx.Client() as client:
        for target_time in valid_candidates[:3]:
            tm_str = target_time.strftime("%Y%m%d%H00")
            url = f"https://apihub.kma.go.kr/api/typ01/url/kma_sfctm2.php?tm={tm_str}&stn={station_code}&help=0&authKey={KMA_AUTH_KEY}"
            
            try:
                resp = client.get(url, timeout=10.0)
                resp.raise_for_status()
                
                text_data = resp.content.decode('euc-kr', errors='ignore')
                lines = text_data.splitlines()
                
                for line in lines:
                    if line.startswith('#'):
                        continue
                    parts = line.split()
                    if len(parts) >= 14:
                        stn = parts[1]
                        if stn == station_code:
                            temp = parse_optional_float(parts[11])  # TA (기온)
                            hum_val = parse_optional_float(parts[13])  # HM (습도)
                            hum = int(round(hum_val)) if hum_val is not None else None
                            
                            # GTS 날씨 현상 매핑 (index 23: WP)
                            # weather는 별도 초단기예보 SKY/PTY 연동 시 보완 예정이나, 관측 값의 날씨 현상이 매칭되면 수집함
                            weather = None
                            if len(parts) >= 24:
                                wp_code = parts[23].strip()
                                weather = WEATHER_MAP.get(wp_code)
                            
                            if temp is not None or hum is not None or weather is not None:
                                return temp, hum, weather
            except Exception as e:
                logger.warning(f"Error fetching KMA weather data for {tm_str} stn {station_code}: {e}")
                
    return None, None, None

def fetch_kma_living_uv_index(area_no: str, captured_at: datetime) -> Optional[int]:
    """
    기상청 생활기상지수 조회서비스(3.0) API를 호출하여 자외선 지수를 가져옵니다.
    """
    service_key = os.getenv("KMA_LIVING_INDEX_SERVICE_KEY")
    if not service_key:
        logger.warning("KMA_LIVING_INDEX_SERVICE_KEY is not set in environment variables.")
        return None

    time_str = captured_at.strftime("%Y%m%d%H")
    url = "https://apis.data.go.kr/1360000/LivingWthrIdxServiceV5/getUVIdxV5"
    params = {
        "serviceKey": service_key,
        "pageNo": "1",
        "numOfRows": "10",
        "dataType": "JSON",
        "areaNo": area_no,
        "time": time_str
    }
    
    try:
        with httpx.Client() as client:
            resp = client.get(url, params=params, timeout=10.0)
            resp.raise_for_status()
            data = resp.json()
            
            response_data = data.get("response", {})
            header = response_data.get("header", {})
            result_code = header.get("resultCode")
            result_msg = header.get("resultMsg")
            
            if result_code != "00":
                logger.warning(
                    f"KMA Living Index API returned error code {result_code}: {result_msg} "
                    f"for area '{area_no}'"
                )
                return None
                
            body = response_data.get("body", {})
            items_node = body.get("items", [])
            if isinstance(items_node, dict):
                items = items_node.get("item", [])
            else:
                items = items_node
                
            if isinstance(items, dict):
                items = [items]
                
            if not items or len(items) == 0:
                logger.warning(
                    f"KMA Living Index API response does not contain items for area '{area_no}'. "
                    f"Response: {data}"
                )
                return None
                
            item = items[0]
            # h0이 가장 가까운 예보값
            today_val = item.get("today")
            h0_val = item.get("h0")
            
            val = today_val if today_val is not None and today_val != "" else h0_val
            
            if val is not None and val != "":
                try:
                    uv_val = int(val)
                    if 0 <= uv_val <= 15:
                        return uv_val
                    else:
                        logger.warning(f"UV index value '{uv_val}' is out of normal range (0~15). Returning None.")
                        return None
                except ValueError:
                    logger.warning(f"Could not parse UV index value '{val}' as int.")
            return None
    except Exception as e:
        logger.warning(f"Error fetching KMA Living UV index for area {area_no}: {e}")
        
    return None

def get_airkorea_station_name(location_name: Optional[str], lat: Optional[float] = None, lng: Optional[float] = None) -> Optional[str]:
    """
    location_name을 파싱하여 AirKorea 측정소 후보명을 결정합니다.
    시군구 혹은 구 단위 이름을 추출하여 매핑합니다.
    """
    if not location_name:
        logger.warning("get_airkorea_station_name: location_name is empty or None.")
        return None

    # 1. 수동 예외 매핑 테이블 매칭 확인
    for key, val in AIRKOREA_STATION_MAP.items():
        if key in location_name:
            logger.info(f"get_airkorea_station_name: Found manual mapping for '{location_name}' -> '{val}'")
            return val

    # 2. 행정구역명 파싱 규칙 적용
    parts = location_name.split()
    if len(parts) <= 1:
        fallback_val = parts[0] if parts else None
        logger.warning(
            f"get_airkorea_station_name: location_name '{location_name}' contains only one or zero words. "
            f"Falling back to '{fallback_val}'"
        )
        return fallback_val

    # parts[1:] 에서 '구', '군', '시' 순서로 끝나는 단어를 찾아 측정소 후보로 결정
    candidate_gu = None
    candidate_gun = None
    candidate_si = None

    for part in parts[1:]:
        if part.endswith("구"):
            candidate_gu = part
        elif part.endswith("군"):
            candidate_gun = part
        elif part.endswith("시"):
            candidate_si = part

    if candidate_gu:
        return candidate_gu
    if candidate_gun:
        return candidate_gun
    if candidate_si:
        return candidate_si

    # fallback
    fallback_val = parts[1]
    logger.warning(
        f"get_airkorea_station_name: Could not find any parts ending with '구', '군', or '시' in '{location_name}'. "
        f"Falling back to parts[1] '{fallback_val}', which may fail to map to a valid AirKorea station."
    )
    return fallback_val

def fetch_airkorea_pm(station_name: str) -> Tuple[Optional[int], Optional[int]]:
    """
    AirKorea API를 호출하여 해당 측정소의 미세먼지(pm10) 및 초미세먼지(pm25) 수치를 가져옵니다.
    """
    AIRKOREA_SERVICE_KEY = os.getenv("AIRKOREA_SERVICE_KEY")
    if not AIRKOREA_SERVICE_KEY:
        logger.warning("AIRKOREA_SERVICE_KEY is not set in environment variables.")
        return None, None

    url = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty"
    params = {
        "stationName": station_name,
        "dataTerm": "DAILY",
        "pageNo": "1",
        "numOfRows": "1",
        "returnType": "json",
        "ver": "1.3",
        "serviceKey": AIRKOREA_SERVICE_KEY
    }

    try:
        with httpx.Client() as client:
            resp = client.get(url, params=params, timeout=10.0)
            resp.raise_for_status()
            data = resp.json()
            
            response_data = data.get("response", {})
            header = response_data.get("header", {})
            result_code = header.get("resultCode")
            result_msg = header.get("resultMsg")
            
            if result_code is not None and result_code != "00":
                logger.warning(
                    f"AirKorea API returned error code {result_code}: {result_msg} "
                    f"for station '{station_name}'"
                )
                return None, None

            body = response_data.get("body", {})
            total_count = body.get("totalCount", 0)
            items = body.get("items", [])
            
            if not items or len(items) == 0:
                logger.warning(
                    f"AirKorea API response does not contain items (totalCount: {total_count}) "
                    f"for station '{station_name}'. This suggests the station name is invalid or has no data. "
                    f"Response: {data}"
                )
                return None, None
                
            item = items[0]
            pm10 = parse_optional_int(item.get("pm10Value"))
            pm25 = parse_optional_int(item.get("pm25Value"))
            return pm10, pm25
            
    except Exception as e:
        logger.warning(f"Error fetching AirKorea PM data for station {station_name}: {e}")
        
    return None, None


def _fetch_pm_for_location(resolved_location_name: str) -> Tuple[Optional[int], Optional[int]]:
    try:
        airkorea_station = get_airkorea_station_name(resolved_location_name)
        if airkorea_station:
            return fetch_airkorea_pm(airkorea_station)
    except Exception as e:
        logger.warning(f"Failed to fetch AirKorea PM: {e}")
    return None, None


def _fetch_weather_for_station(
    station_code: str, captured_at: datetime
) -> Tuple[Optional[float], Optional[int], Optional[str]]:
    try:
        return fetch_kma_weather_data(station_code, captured_at)
    except Exception as e:
        logger.warning(f"Failed to fetch KMA weather: {e}")
    return None, None, None


def _fetch_uv_for_location(resolved_location_name: str, captured_at: datetime) -> Optional[int]:
    try:
        area_no = get_living_area_no(resolved_location_name)
        if area_no:
            return fetch_kma_living_uv_index(area_no, captured_at)
    except Exception as e:
        logger.warning(f"Failed to fetch KMA UV index: {e}")
    return None


def _parallel_fetch_environment_metrics(
    resolved_location_name: str,
    station_code: Optional[str],
    captured_at: datetime,
) -> Tuple[Optional[float], Optional[int], Optional[str], Optional[int], Optional[int], Optional[int]]:
    """AirKorea·KMA 날씨·UV를 병렬 조회. (temp, hum, weather, uv_index, pm10, pm25)"""
    temp, hum, weather = None, None, None
    uv_index = None
    pm10, pm25 = None, None

    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = []
        futures.append(executor.submit(_fetch_pm_for_location, resolved_location_name))
        futures.append(executor.submit(_fetch_uv_for_location, resolved_location_name, captured_at))
        if station_code:
            futures.append(
                executor.submit(_fetch_weather_for_station, station_code, captured_at)
            )

        pm10, pm25 = futures[0].result()
        uv_index = futures[1].result()
        if station_code:
            temp, hum, weather = futures[2].result()

    return temp, hum, weather, uv_index, pm10, pm25


def create_environment_log_from_capture(
    db: Session,
    user_id: int,
    source: str,
    captured_at: datetime,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    location_name: Optional[str] = None,
    diet_log_id: Optional[int] = None
) -> EnvironmentLog:
    """
    제공된 정보를 바탕으로 KMA 및 AirKorea 데이터를 페치한 뒤 EnvironmentLog를 생성하여 반환합니다.
    DB 커밋은 호출자에게 위임합니다.
    """
    # Ensure captured_at is naive KST datetime to avoid TypeError when comparing with datetime.now()
    captured_at = normalize_to_kst_naive(captured_at)

    # 0. 중복 방지 정책: 동일한 diet_log_id로 생성된 기록이 이미 있으면 해당 로그 반환
    if diet_log_id:
        existing = db.query(EnvironmentLog).filter(EnvironmentLog.diet_log_id == diet_log_id).first()
        if existing:
            logger.info(f"EnvironmentLog with diet_log_id {diet_log_id} already exists. Returning existing log.")
            return existing

    resolved_location_name = location_name
    # 1. location_name이 없고 lat, lng가 있으면 Kakao reverse geocoding 시도
    if not resolved_location_name and lat is not None and lng is not None:
        try:
            resolved_location_name = reverse_geocode_kakao(lat, lng)
        except Exception as e:
            logger.warning(f"Failed to reverse geocode: {e}")

    temp, hum, weather = None, None, None
    uv_index = None
    pm10, pm25 = None, None

    # 2. 위치명 확정 후 외부 API 병렬 조회 (역지오코딩은 선행 필요)
    if resolved_location_name:
        station_code = None
        try:
            station_code = get_station_for_location(resolved_location_name)
        except Exception as e:
            logger.warning(f"Failed to get KMA station code: {e}")

        temp, hum, weather, uv_index, pm10, pm25 = _parallel_fetch_environment_metrics(
            resolved_location_name, station_code, captured_at
        )
        
    env_log = EnvironmentLog(
        user_id=user_id,
        logged_at=captured_at.date(),
        lat=lat,
        lng=lng,
        location_name=resolved_location_name or location_name,
        temperature=temp,
        humidity=hum,
        pm10=pm10,
        pm25=pm25,
        uv_index=uv_index,
        weather=weather,
        source=source,
        captured_at=captured_at,
        diet_log_id=diet_log_id
    )
    db.add(env_log)
    return env_log



