// ⚠️ Dán API key của bạn vào đây (lấy từ openweathermap.org sau khi đăng ký)
const API_KEY = "559c79309be167badbf9f6513957b155";

// Lấy sẵn các phần tử HTML mình sẽ cần dùng nhiều lần
const searchForm = document.getElementById("search-form");
const cityInput = document.getElementById("city-input");
const locationBtn = document.getElementById("location-btn");
const errorMessage = document.getElementById("error-message");
const weatherResult = document.getElementById("weather-result");
const hourlyGrid = document.getElementById("hourly-grid");
const forecastGrid = document.getElementById("forecast-grid");
const weatherFx = document.getElementById("weather-fx");
const nightOverlay = document.getElementById("night-overlay");
const localTimeEl = document.getElementById("local-time");
const card = document.querySelector(".card");
const bear = document.getElementById("bear");

const cityNameEl = document.getElementById("city-name");
const weatherIconEl = document.getElementById("weather-icon");
const temperatureEl = document.getElementById("temperature");
const feelsLikeEl = document.getElementById("feels-like");
const conditionEl = document.getElementById("condition");
const humidityEl = document.getElementById("humidity");
const lastUpdatedEl = document.getElementById("last-updated");

let cityTimezoneOffset = 0; // độ lệch múi giờ của thành phố đang xem (tính bằng giây)
let clockIntervalId = null; // để hủy đồng hồ cũ khi search thành phố khác

// ===== Card nghiêng nhẹ theo vị trí con trỏ chuột =====
card.addEventListener("mousemove", (event) => {
  const rect = card.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;

  const centerX = rect.width / 2;
  const centerY = rect.height / 2;

  // Card giờ to hơn nhiều nên nghiêng ít lại (3 độ) cho đỡ chóng mặt
  const rotateX = ((mouseY - centerY) / centerY) * -3;
  const rotateY = ((mouseX - centerX) / centerX) * 3;

  card.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
});

card.addEventListener("mouseleave", () => {
  card.style.transform = "perspective(1200px) rotateX(0deg) rotateY(0deg)";
});

// ===== 1. Tìm theo tên thành phố =====
searchForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const city = cityInput.value.trim();
  if (city === "") return;

  loadWeather({ city });
});

// ===== 2. Tìm theo vị trí hiện tại (GPS trình duyệt) =====
locationBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    showError("Your browser does not support geolocation.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      loadWeather({ lat: latitude, lon: longitude });
    },
    () => {
      showError("Could not get your location. Please allow location access and try again.");
    }
  );
});

// Hàm dùng chung cho cả 2 cách tìm ở trên
// query = { city: "Hanoi" }  hoặc  query = { lat: 21.03, lon: 105.85 }
async function loadWeather(query) {
  const params = query.city
    ? `q=${encodeURIComponent(query.city)}`
    : `lat=${query.lat}&lon=${query.lon}`;

  try {
    const weatherRes = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?${params}&appid=${API_KEY}&units=metric`
    );

    if (weatherRes.status === 401) {
      showError("Invalid or inactive API key. Check script.js, or wait a bit longer if you just created it.");
      return;
    }
    if (weatherRes.status === 404) {
      showError("City not found. Please check the spelling and try again.");
      return;
    }
    if (!weatherRes.ok) {
      showError(`Something went wrong (status ${weatherRes.status}). Please try again.`);
      return;
    }

    const weatherData = await weatherRes.json();
    showWeather(weatherData);

    // Dùng luôn tọa độ trong kết quả thời tiết để gọi forecast —
    // chính xác hơn là gọi lại theo tên thành phố lần nữa.
    // 1 API call này cho cả dữ liệu 24h tới và 5 ngày tới, dùng chung.
    const forecastRes = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${weatherData.coord.lat}&lon=${weatherData.coord.lon}&appid=${API_KEY}&units=metric`
    );

    if (forecastRes.ok) {
      const forecastData = await forecastRes.json();
      showHourly(forecastData);
      showForecast(forecastData);
    }
  } catch (error) {
    showError("Something went wrong. Please check your internet connection.");
  }
}

// Hiện dữ liệu thời tiết hiện tại lên giao diện
function showWeather(data) {
  errorMessage.hidden = true;

  cityNameEl.textContent = `${data.name}, ${data.sys.country}`;

  const iconCode = data.weather[0].icon;
  weatherIconEl.src = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
  weatherIconEl.alt = data.weather[0].description;

  temperatureEl.textContent = `${Math.round(data.main.temp)}°C`;
  feelsLikeEl.textContent = `Feels like ${Math.round(data.main.feels_like)}°C`;
  conditionEl.textContent = data.weather[0].description;
  humidityEl.textContent = `Humidity: ${data.main.humidity}%`;

  const now = new Date();
  lastUpdatedEl.textContent = `Last updated: ${now.toLocaleTimeString()}`;

  weatherResult.hidden = false;

  cityTimezoneOffset = data.timezone;
  startLocalClock();

  const condition = data.weather[0].main;
  const daytime = isDaytime(data);

  applyWeatherTheme(condition);
  renderWeatherEffect(condition, daytime);
  updateBearOutfit(condition, data.main.temp, data.wind.speed);
}

// Hiện dự báo theo từng mốc 3 tiếng trong 24 giờ tới.
// (API miễn phí chỉ cho dữ liệu mỗi 3 tiếng — không có mốc từng-giờ-một thật)
function showHourly(data) {
  const tzOffset = data.city.timezone;
  const hourlySeries = buildHourlySeries(data.list, 24); // 24 mốc, mỗi mốc cách nhau 1 tiếng

  hourlyGrid.innerHTML = "";

  hourlySeries.forEach((item) => {
    const hourLabel = formatCityHour(item.dt, tzOffset);

    const hourCard = document.createElement("div");
    hourCard.className = "hour-card";
    hourCard.innerHTML = `
      <p>${hourLabel}</p>
      <img src="https://openweathermap.org/img/wn/${item.icon}.png" alt="${item.description}" />
      <p>${Math.round(item.temp)}°C</p>
    `;
    hourlyGrid.appendChild(hourCard);
  });
}

// Từ các mốc 3 tiếng THẬT của API, tạo ra "totalHours" mốc cách nhau 1 tiếng
function buildHourlySeries(threeHourList, totalHours) {
  const startTime = threeHourList[0].dt; // mốc thật đầu tiên, tính bằng giây (unix time)
  const series = [];

  for (let h = 0; h < totalHours; h++) {
    const targetTime = startTime + h * 3600; // +1 tiếng mỗi vòng lặp
    series.push(interpolateAt(threeHourList, targetTime));
  }

  return series;
}

// Ước lượng nhiệt độ tại 1 thời điểm bất kỳ, dựa vào 2 mốc thật đứng ngay trước/sau nó
function interpolateAt(list, targetTime) {
  // Nếu targetTime nằm trước mốc thật đầu tiên hoặc sau mốc thật cuối cùng,
  // không có gì để nội suy giữa 2 điểm — lấy nguyên giá trị ở đầu/cuối gần nhất
  if (targetTime <= list[0].dt) {
    return pointFrom(list[0], targetTime);
  }
  if (targetTime >= list[list.length - 1].dt) {
    return pointFrom(list[list.length - 1], targetTime);
  }

  for (let i = 0; i < list.length - 1; i++) {
    const before = list[i];
    const after = list[i + 1];

    if (before.dt <= targetTime && targetTime <= after.dt) {
      // progress = 0 nghĩa là đúng ngay mốc "before", = 1 nghĩa là đúng ngay mốc "after"
      const progress = (targetTime - before.dt) / (after.dt - before.dt);
      const temp = before.main.temp + (after.main.temp - before.main.temp) * progress;

      // Icon/mô tả thời tiết không nội suy được (không có "nửa mưa nửa nắng"),
      // nên lấy tạm icon của mốc thật gần targetTime hơn
      const nearest = progress < 0.5 ? before : after;

      return {
        dt: targetTime,
        temp: temp,
        icon: nearest.weather[0].icon,
        description: nearest.weather[0].description,
      };
    }
  }
}

// Dựng 1 điểm dữ liệu "hourly" trực tiếp từ 1 mốc 3 tiếng thật (không nội suy)
function pointFrom(item, targetTime) {
  return {
    dt: targetTime,
    temp: item.main.temp,
    icon: item.weather[0].icon,
    description: item.weather[0].description,
  };
}

// Hiện dự báo 5 ngày tới
function showForecast(data) {
  // API trả dữ liệu mỗi 3 tiếng (40 mốc cho 5 ngày) —
  // mình chỉ lấy đúng 1 mốc mỗi ngày, gần giờ trưa (12:00) cho dễ nhìn
  const middayForecasts = data.list.filter((item) => item.dt_txt.includes("12:00:00"));

  forecastGrid.innerHTML = "";

  middayForecasts.slice(0, 5).forEach((item) => {
    const dayName = new Date(item.dt_txt).toLocaleDateString("en-US", { weekday: "short" });
    const icon = item.weather[0].icon;
    const temp = Math.round(item.main.temp);

    const dayCard = document.createElement("div");
    dayCard.className = "forecast-day";
    dayCard.innerHTML = `
      <p>${dayName}</p>
      <img src="https://openweathermap.org/img/wn/${icon}.png" alt="${item.weather[0].description}" />
      <p>${temp}°C</p>
    `;
    forecastGrid.appendChild(dayCard);
  });
}

// Đổi màu nền theo tình trạng thời tiết chính (Clear, Clouds, Rain...)
function applyWeatherTheme(condition) {
  document.body.className = "";

  const themeMap = {
    Clear: "weather-clear",
    Clouds: "weather-clouds",
    Rain: "weather-rain",
    Drizzle: "weather-rain",
    Thunderstorm: "weather-thunderstorm",
    Snow: "weather-snow",
    Mist: "weather-mist",
    Fog: "weather-mist",
    Haze: "weather-mist",
  };

  document.body.classList.add(themeMap[condition] || "weather-clouds");
}

// Chọn trang phục + hiệu ứng cho gấu theo THỜI TIẾT, NHIỆT ĐỘ và GIÓ
// (có thể mặc và bật nhiều món cùng lúc)
function updateBearOutfit(condition, temp, windSpeed) {
  const isHot = temp >= 30;
  const isCold = temp <= 8;
  const isFreezing = temp <= 5;
  const isWindy = windSpeed >= 8; // m/s, khoảng 29 km/h trở lên
  const foggy = ["Mist", "Fog", "Haze"];
  const outfit = [];

  if (condition === "Thunderstorm") {
    // Bão thì trốn vào nhà
    outfit.push("acc-house");
  } else if (condition === "Rain" || condition === "Drizzle") {
    outfit.push("acc-raincoat", "acc-hood", "acc-umbrella", "acc-rainboots");
    outfit.push("fx-puddle", "fx-drips");
    if (isCold) outfit.push("fx-breath");
  } else if (condition === "Snow") {
    outfit.push("acc-jacket", "acc-boots", "acc-snowcap", "fx-breath");
  } else {
    // 1) Phụ kiện + hiệu ứng theo loại thời tiết
    if (condition === "Clear") outfit.push("acc-sunny", "fx-glint");
    else if (condition === "Clouds") outfit.push("acc-flowers", "fx-butterfly");
    else if (foggy.includes(condition)) {
      outfit.push("fx-fog");
      if (!isHot) outfit.push("acc-scarf"); // nóng mà quàng khăn thì kỳ
    }

    // 2) Quần áo + giày theo nhiệt độ
    if (isCold) {
      outfit.push("acc-jacket", "acc-scarf", "acc-boots", "fx-breath");
    } else if (isHot) {
      outfit.push("acc-shorts", "acc-tank", "acc-sandals", "acc-sandals-strap");
      outfit.push("acc-sweat", "acc-icecream", "fx-heat");
    } else if (condition === "Clear") {
      // Nắng dễ chịu: sơ mi hoa + quần đùi + dép xỏ ngón
      outfit.push("acc-aloha", "acc-shorts", "acc-sandals", "acc-sandals-strap");
    } else if (foggy.includes(condition)) {
      outfit.push("acc-sweater", "acc-sneakers");
    } else {
      // Trời đẹp / mây: áo thun + giày thể thao
      outfit.push("acc-tee", "acc-sneakers");
    }
  }

  if (isWindy) outfit.push("fx-wind");

  // Tắt hết món cũ, rồi bật đúng những món trong danh sách
  bear.querySelectorAll(".accessory, .fx").forEach((el) => el.classList.remove("active"));
  outfit.forEach((name) => bear.querySelector(`.${name}`).classList.add("active"));

  // Kính râm che mất mắt thường — ẩn mắt gốc đi cho hợp lý
  bear.classList.toggle("eyes-hidden", outfit.includes("acc-sunny"));

  // Lạnh dưới 5 độ thì gấu run cầm cập
  bear.classList.toggle("shiver", isFreezing && condition !== "Thunderstorm");
}

// Kiểm tra hiện tại là ngày hay đêm THẬT tại thành phố đó
function isDaytime(data) {
  const nowUnix = Math.floor(Date.now() / 1000);
  return nowUnix >= data.sys.sunrise && nowUnix < data.sys.sunset;
}

// Chạy đồng hồ giờ địa phương, cập nhật mỗi giây
function startLocalClock() {
  if (clockIntervalId) clearInterval(clockIntervalId);

  updateLocalTime();
  clockIntervalId = setInterval(updateLocalTime, 1000);
}

function updateLocalTime() {
  const cityMs = Date.now() + cityTimezoneOffset * 1000;
  const cityDate = new Date(cityMs);

  const hours = String(cityDate.getUTCHours()).padStart(2, "0");
  const minutes = String(cityDate.getUTCMinutes()).padStart(2, "0");
  const seconds = String(cityDate.getUTCSeconds()).padStart(2, "0");

  localTimeEl.textContent = `Local time: ${hours}:${minutes}:${seconds}`;
}

// Đổi 1 mốc thời gian UTC (unix timestamp) + độ lệch múi giờ ra chuỗi "HH:00"
// Dùng cùng cách tính như đồng hồ, để cho ra đúng giờ tại thành phố đó
function formatCityHour(unixTimestamp, timezoneOffsetSeconds) {
  const cityMs = (unixTimestamp + timezoneOffsetSeconds) * 1000;
  const cityDate = new Date(cityMs);
  return `${String(cityDate.getUTCHours()).padStart(2, "0")}:00`;
}

// Tạo hiệu ứng chuyển động phù hợp với từng loại thời tiết
function renderWeatherEffect(condition, isDay) {
  weatherFx.innerHTML = "";

  nightOverlay.classList.toggle("active", !isDay);

  if (!isDay) {
    createParticles("star", 50);
  }

  if (condition === "Clear") {
    const sun = document.createElement("div");
    sun.className = "sun-glow";
    weatherFx.appendChild(sun);
  }

  if (condition === "Clouds") {
    for (let i = 0; i < 3; i++) {
      const cloud = document.createElement("div");
      cloud.className = "cloud-shape";
      cloud.style.top = `${10 + i * 20}%`;
      cloud.style.animationDuration = `${25 + i * 8}s`;
      cloud.style.animationDelay = `-${i * 6}s`;
      weatherFx.appendChild(cloud);
    }
  }

  if (condition === "Rain" || condition === "Drizzle" || condition === "Thunderstorm") {
    createParticles("rain-drop", 45);

    if (condition === "Thunderstorm") {
      const flash = document.createElement("div");
      flash.className = "lightning-flash";
      weatherFx.appendChild(flash);
    }
  }

  if (condition === "Snow") {
    createParticles("snowflake", 40);
  }

  if (condition === "Mist" || condition === "Fog" || condition === "Haze") {
    for (let i = 0; i < 4; i++) {
      const mist = document.createElement("div");
      mist.className = "mist-layer";
      mist.style.top = `${15 + i * 20}%`;
      mist.style.animationDuration = `${18 + i * 4}s`;
      weatherFx.appendChild(mist);
    }
  }
}

// Tạo nhiều hạt (mưa, tuyết, hoặc sao) với vị trí/tốc độ ngẫu nhiên cho tự nhiên
function createParticles(className, count) {
  for (let i = 0; i < count; i++) {
    const particle = document.createElement("div");
    particle.className = className;
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.animationDuration = `${0.6 + Math.random() * 0.8}s`;
    particle.style.animationDelay = `-${Math.random() * 2}s`;

    if (className === "star") {
      particle.style.top = `${Math.random() * 100}%`;
      particle.style.animationDuration = `${1.5 + Math.random() * 2}s`;
    }

    weatherFx.appendChild(particle);
  }
}

// Hiện thông báo lỗi, ẩn kết quả thời tiết cũ đi
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
  weatherResult.hidden = true;
}
