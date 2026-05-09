import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

interface HijriDate {
  date: string;
  day: string;
  weekday: { en: string; ar: string };
  month: { number: number; en: string; ar: string };
  year: string;
}

interface GregorianDate {
  date: string;
  weekday: { en: string };
  month: { en: string };
  day: string;
  year: string;
}

interface TimingsData {
  timings: Record<string, string>;
  date: {
    readable: string;
    hijri: HijriDate;
    gregorian: GregorianDate;
  };
  meta: {
    latitude: number;
    longitude: number;
    timezone: string;
  };
}

interface QiblaData {
  latitude: number;
  longitude: number;
  bearing: number;
}

interface City {
  id: string;
  label: string;
  country: string;
  flag: string;
  apiCity: string;
  apiCountry: string;
  timezone: string;
  lat: number;
  lng: number;
}

const CITIES: City[] = [
  { id: "cairo",    label: "Cairo",     country: "Egypt",        flag: "🇪🇬", apiCity: "Cairo",     apiCountry: "Egypt",        timezone: "Africa/Cairo",    lat: 30.0444, lng: 31.2357  },
  { id: "toronto",  label: "Toronto",   country: "Canada",       flag: "🇨🇦", apiCity: "Toronto",   apiCountry: "Canada",       timezone: "America/Toronto", lat: 43.6532, lng: -79.3832 },
  { id: "moscow",   label: "Moscow",    country: "Russia",       flag: "🇷🇺", apiCity: "Moscow",    apiCountry: "Russia",       timezone: "Europe/Moscow",   lat: 55.7558, lng: 37.6173  },
  { id: "mecca",    label: "Mecca",     country: "Saudi Arabia", flag: "🇸🇦", apiCity: "Mecca",     apiCountry: "Saudi Arabia", timezone: "Asia/Riyadh",     lat: 21.3891, lng: 39.8579  },
  { id: "jerusalem",label: "Jerusalem", country: "Palestine",    flag: "🇵🇸", apiCity: "Jerusalem", apiCountry: "Palestine",    timezone: "Asia/Jerusalem",  lat: 31.7683, lng: 35.2137  },
];

const PRAYERS = [
  { key: "Fajr",    label: "Fajr",    arabic: "الفجر",  desc: "Pre-Dawn"  },
  { key: "Sunrise", label: "Sunrise", arabic: "الشروق", desc: "Dawn"      },
  { key: "Dhuhr",   label: "Dhuhr",   arabic: "الظهر",  desc: "Midday"    },
  { key: "Asr",     label: "Asr",     arabic: "العصر",  desc: "Afternoon" },
  { key: "Maghrib", label: "Maghrib", arabic: "المغرب", desc: "Sunset"    },
  { key: "Isha",    label: "Isha",    arabic: "العشاء", desc: "Night"     },
];

const ACTIVE_PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

function getDateString(): string {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const y = now.getFullYear();
  return `${d}-${m}-${y}`;
}

function getCityTime(timezone: string): { h: number; m: number; s: number; display: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const h = get("hour") % 24;
  const m = get("minute");
  const s = get("second");
  const display = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return { h, m, s, display };
}

function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function getNextPrayer(timings: Record<string, string>, cityH: number, cityM: number): { name: string; remainingMinutes: number } {
  const currentMinutes = cityH * 60 + cityM;
  for (const key of ACTIVE_PRAYERS) {
    const prayerMinutes = parseTimeToMinutes(timings[key] || "00:00");
    if (prayerMinutes > currentMinutes) {
      return { name: key, remainingMinutes: prayerMinutes - currentMinutes };
    }
  }
  const fajrMinutes = parseTimeToMinutes(timings["Fajr"] || "00:00");
  return { name: "Fajr", remainingMinutes: 24 * 60 - currentMinutes + fajrMinutes };
}

function getCurrentPrayerPeriod(timings: Record<string, string>, cityH: number, cityM: number): "light" | "dark" {
  const currentMinutes = cityH * 60 + cityM;
  const maghrib = parseTimeToMinutes(timings.Maghrib || "00:00");
  return currentMinutes < maghrib ? "light" : "dark";
}

function formatCountdown(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTime12(timeStr: string): { time: string; period: string } {
  const [hStr, mStr] = timeStr.split(":");
  let h = parseInt(hStr, 10);
  const m = mStr;
  const period = h >= 12 ? "PM" : "AM";
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return { time: `${String(h).padStart(2, "0")}:${m}`, period };
}

/* ── Art Deco helpers ─────────────────────────────────────────────── */

function ArtDecoCorners() {
  return (
    <>
      <span className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2" style={{ borderColor: "hsl(43 72% 48%)" }} />
      <span className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2" style={{ borderColor: "hsl(43 72% 48%)" }} />
      <span className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2" style={{ borderColor: "hsl(43 72% 48%)" }} />
      <span className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2" style={{ borderColor: "hsl(43 72% 48%)" }} />
    </>
  );
}

function ArtDecoDivider({ label }: { label?: string }) {
  return (
    <div className="artdeco-divider my-2">
      <div className="artdeco-diamond" />
      {label && (
        <>
          <span className="text-xs tracking-[0.3em] uppercase gold-text opacity-70 px-2" style={{ fontFamily: "Cinzel, serif" }}>
            {label}
          </span>
          <div className="artdeco-diamond" />
        </>
      )}
      <div className="artdeco-diamond" />
    </div>
  );
}

function CrescentIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M16 4C9.373 4 4 9.373 4 16C4 22.627 9.373 28 16 28C18.5 28 20.8 27.2 22.7 25.8C20.4 25.2 18.4 23.9 17 22.1C15.6 20.3 14.8 18.1 14.8 15.8C14.8 13.5 15.6 11.3 17 9.5C18.4 7.7 20.4 6.4 22.7 5.8C20.8 4.6 18.5 4 16 4Z"
        fill="hsl(43 72% 48%)"
        stroke="hsl(43 80% 60%)"
        strokeWidth="0.5"
      />
      <circle cx="25" cy="8" r="1.5" fill="hsl(43 80% 65%)" />
    </svg>
  );
}

function StarDecoration() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon
        points="10,2 11.5,7.5 17,7.5 12.5,11 14,16.5 10,13 6,16.5 7.5,11 3,7.5 8.5,7.5"
        fill="hsl(43 72% 48%)"
        opacity="0.7"
      />
    </svg>
  );
}

/* ── Qibla Compass ──────────────────────────────────────────────────── */
function QiblaCompass({ bearing, isLoading }: { bearing: number | undefined; isLoading: boolean }) {
  const [showTooltip, setShowTooltip] = useState(false);

  const cx = 60;
  const cy = 60;
  const R = 56;     // outer ring radius
  const Ri = 50;    // inner tick ring radius

  return (
    <div
      className="relative inline-flex flex-col items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      data-testid="compass-qibla"
      style={{ cursor: "default" }}
    >
      {/* Tooltip */}
      {showTooltip && bearing !== undefined && (
        <div
          className="absolute z-50 px-3 py-1.5 text-xs tracking-widest uppercase whitespace-nowrap"
          style={{
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "hsl(230 30% 10%)",
            border: "1px solid hsl(43 72% 48%)",
            color: "hsl(43 85% 68%)",
            fontFamily: "Cinzel, serif",
            letterSpacing: "0.2em",
            boxShadow: "0 0 12px hsl(43 72% 48% / 0.35)",
          }}
        >
          Qibla: {Math.round(bearing)}°
          <span
            className="absolute"
            style={{
              bottom: "-5px", left: "50%", transform: "translateX(-50%)",
              width: 0, height: 0,
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: "5px solid hsl(43 72% 48%)",
            }}
          />
        </div>
      )}

      {/* Compass SVG — 120×120, center at (60,60) */}
      <svg width="120" height="120" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">

        {/* Background fill */}
        <circle cx={cx} cy={cy} r={R} fill="hsl(230 30% 7%)" />
        {/* Outer gold ring */}
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="hsl(43 72% 48%)" strokeWidth="2" />
        {/* Inner decorative ring */}
        <circle cx={cx} cy={cy} r={Ri} fill="none" stroke="hsl(43 40% 28%)" strokeWidth="0.6" />

        {/* Tick marks at every 45° */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
          const major = angle % 90 === 0;
          const rad = (angle - 90) * (Math.PI / 180);
          return (
            <line
              key={angle}
              x1={cx + Ri * Math.cos(rad)} y1={cy + Ri * Math.sin(rad)}
              x2={cx + (major ? 42 : 47) * Math.cos(rad)} y2={cy + (major ? 42 : 47) * Math.sin(rad)}
              stroke={major ? "hsl(43 72% 48%)" : "hsl(43 40% 28%)"}
              strokeWidth={major ? 1.5 : 0.8}
            />
          );
        })}

        {/* Cardinal letters */}
        <text x={cx}    y={cy - 40} textAnchor="middle" dominantBaseline="middle" fontSize="9"  fontFamily="Cinzel,serif" fill="hsl(43 85% 65%)" fontWeight="bold">N</text>
        <text x={cx}    y={cy + 42} textAnchor="middle" dominantBaseline="middle" fontSize="7.5" fontFamily="Cinzel,serif" fill="hsl(43 40% 38%)">S</text>
        <text x={cx+41} y={cy}      textAnchor="middle" dominantBaseline="middle" fontSize="7.5" fontFamily="Cinzel,serif" fill="hsl(43 40% 38%)">E</text>
        <text x={cx-41} y={cy}      textAnchor="middle" dominantBaseline="middle" fontSize="7.5" fontFamily="Cinzel,serif" fill="hsl(43 40% 38%)">W</text>

        {/* ── Needle — rotated by bearing, drawn BEFORE center so pivot covers the gap ── */}
        {bearing !== undefined && !isLoading && (
          <g transform={`rotate(${bearing}, ${cx}, ${cy})`}>
            {/* White tip — points toward Qibla */}
            <polygon
              points={`${cx},${cy - 44}  ${cx - 6},${cy + 4}  ${cx + 6},${cy + 4}`}
              fill="#ffffff"
              stroke="#cccccc"
              strokeWidth="0.5"
              strokeLinejoin="round"
            />
            {/* Red tail — points away */}
            <polygon
              points={`${cx},${cy + 36}  ${cx - 4},${cy + 8}  ${cx + 4},${cy + 8}`}
              fill="#e53935"
              stroke="#ef5350"
              strokeWidth="0.5"
              strokeLinejoin="round"
            />
          </g>
        )}

        {/* Loading spinner */}
        {isLoading && (
          <circle cx={cx} cy={cy} r="20" fill="none" stroke="hsl(43 40% 28%)" strokeWidth="1.5" strokeDasharray="30 100" strokeLinecap="round">
            <animateTransform attributeName="transform" type="rotate" from={`0 ${cx} ${cy}`} to={`360 ${cx} ${cy}`} dur="1.2s" repeatCount="indefinite" />
          </circle>
        )}

        {/* Center cap — covers needle base, sits on top */}
        <circle cx={cx} cy={cy} r="14" fill="hsl(230 30% 10%)" stroke="hsl(43 45% 32%)" strokeWidth="1" />

        {/* Kaaba icon in pure SVG (no foreignObject) */}
        {/* Front face */}
        <rect x={cx - 7} y={cy - 5} width="12" height="10" fill="hsl(43 65% 44%)" />
        {/* Top face */}
        <polygon points={`${cx-7},${cy-5} ${cx-3},${cy-9} ${cx+9},${cy-9} ${cx+5},${cy-5}`} fill="hsl(43 75% 56%)" />
        {/* Right face */}
        <polygon points={`${cx+5},${cy-5} ${cx+9},${cy-9} ${cx+9},${cy+1} ${cx+5},${cy+5}`} fill="hsl(43 45% 30%)" />
        {/* Kiswa gold band */}
        <rect x={cx - 7} y={cy - 1} width="12" height="2" fill="hsl(43 90% 62%)" />
        {/* Pivot dot */}
        <circle cx={cx} cy={cy} r="3" fill="hsl(43 72% 48%)" stroke="hsl(230 30% 7%)" strokeWidth="1" />
      </svg>

      {/* Label */}
      <p
        style={{
          fontFamily: "Cinzel, serif",
          fontSize: "8px",
          letterSpacing: "0.3em",
          color: "hsl(43 40% 35%)",
          textTransform: "uppercase",
          marginTop: "2px",
        }}
      >
        Qibla
      </p>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────── */
export default function Home() {
  const [selectedCity, setSelectedCity] = useState<City>(CITIES[0]);
  const [cityTime, setCityTime] = useState({ h: 0, m: 0, s: 0, display: "00:00:00" });
  const [nextPrayer, setNextPrayer] = useState<{ name: string; remainingMinutes: number } | null>(null);

  const dateStr = getDateString();

  /* Prayer times */
  const { data, isLoading, error } = useQuery<TimingsData>({
    queryKey: ["prayerTimes", selectedCity.id, dateStr],
    queryFn: async () => {
      const url = `https://api.aladhan.com/v1/timingsByCity/${dateStr}?city=${encodeURIComponent(selectedCity.apiCity)}&country=${encodeURIComponent(selectedCity.apiCountry)}&method=2`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch prayer times");
      const json = await res.json();
      return json.data as TimingsData;
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  /* Qibla direction — uses hardcoded city coordinates, fires immediately */
  const { data: qiblaData, isLoading: qiblaLoading } = useQuery<QiblaData>({
    queryKey: ["qibla", selectedCity.id],
    queryFn: async () => {
      const res = await fetch(`https://api.aladhan.com/v1/qibla/${selectedCity.lat}/${selectedCity.lng}`);
      if (!res.ok) throw new Error("Failed to fetch qibla");
      const json = await res.json();
      return json.data as QiblaData;
    },
    staleTime: 24 * 60 * 60 * 1000,
    retry: 2,
  });

  /* Live city clock */
  useEffect(() => {
    const tick = () => {
      const ct = getCityTime(selectedCity.timezone);
      setCityTime(ct);
      if (data?.timings) {
        const np = getNextPrayer(data.timings, ct.h, ct.m);
        setNextPrayer(np);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [selectedCity, data]);

  const hijri = data?.date?.hijri;
  const gregorian = data?.date?.gregorian;
  const prayerPeriod = data?.timings ? getCurrentPrayerPeriod(data.timings, cityTime.h, cityTime.m) : "dark";
  const appBackground =
    prayerPeriod === "light"
      ? "linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(0 0% 98%) 45%, hsl(0 0% 95%) 100%)"
      : "linear-gradient(180deg, hsl(0 0% 0%) 0%, hsl(0 0% 4%) 45%, hsl(0 0% 8%) 100%)";

  return (
    <div className="min-h-screen w-full" style={{ background: appBackground }}>
      {/* Decorative top band */}
      <div
        className="w-full h-1"
        style={{ background: "linear-gradient(90deg, transparent, hsl(43 72% 48%), hsl(43 80% 65%), hsl(43 72% 48%), transparent)" }}
      />

      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* ── Header ──────────────────────────────────────────────── */}
        <header className="relative text-center mb-8">

          {/* Qibla compass — top left */}
          <div className="absolute left-0 top-0" data-testid="compass-wrapper">
            <QiblaCompass bearing={qiblaData?.bearing} isLoading={qiblaLoading && !qiblaData} />
          </div>

          <div className="flex items-center justify-center gap-3 mb-3">
            <StarDecoration />
            <CrescentIcon />
            <StarDecoration />
          </div>

          <h1
            className="gold-gradient-text text-4xl md:text-5xl font-bold tracking-[0.25em] uppercase mb-1"
            style={{ fontFamily: "Cinzel Decorative, Cinzel, serif" }}
            data-testid="text-app-title"
          >
            Salah Timer
          </h1>

          <p
            className="text-xs tracking-[0.4em] uppercase mt-2"
            style={{ color: "hsl(43 35% 55%)", fontFamily: "Cinzel, serif" }}
          >
            Islamic Prayer Times
          </p>

          <ArtDecoDivider />
        </header>

        {/* ── Hijri Date Display ───────────────────────────────────── */}
        {hijri && (
          <div className="relative text-center mb-6 py-5 px-6" style={{ border: "1px solid hsl(43 35% 22%)" }}>
            <ArtDecoCorners />
            <p
              className="text-2xl md:text-3xl font-semibold tracking-widest gold-gradient-text mb-1"
              style={{ fontFamily: "Cinzel, serif" }}
              data-testid="text-hijri-date"
            >
              {hijri.day} {hijri.month.en} {hijri.year} AH
            </p>
            <p
              className="text-lg mb-1"
              style={{ color: "hsl(43 55% 75%)", fontFamily: "Cormorant Garamond, serif", letterSpacing: "0.05em" }}
              data-testid="text-hijri-arabic"
            >
              {hijri.weekday.ar} — {hijri.month.ar}
            </p>
            <p
              className="text-xs tracking-[0.3em] uppercase"
              style={{ color: "hsl(43 25% 50%)", fontFamily: "Cinzel, serif" }}
              data-testid="text-gregorian-date"
            >
              {gregorian?.weekday.en}, {gregorian?.day} {gregorian?.month.en} {gregorian?.year}
            </p>
          </div>
        )}

        {/* ── City Clock ───────────────────────────────────────────── */}
        <div className="text-center mb-6">
          <p
            className="text-4xl md:text-5xl font-bold tracking-[0.15em] gold-text"
            style={{ fontFamily: "Cinzel, serif" }}
            data-testid="text-city-clock"
          >
            {cityTime.display}
          </p>
          <p
            className="text-xs tracking-[0.35em] uppercase mt-1"
            style={{ color: "hsl(43 25% 50%)", fontFamily: "Cinzel, serif" }}
          >
            {selectedCity.label} Local Time
          </p>
        </div>

        {/* ── City Selector ────────────────────────────────────────── */}
        <div className="mb-8">
          <ArtDecoDivider label="Select City" />
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {CITIES.map((city) => {
              const isActive = selectedCity.id === city.id;
              return (
                <button
                  key={city.id}
                  onClick={() => setSelectedCity(city)}
                  className={`relative px-4 py-2.5 border text-xs tracking-[0.2em] uppercase transition-all duration-200 cursor-pointer ${
                    isActive ? "city-btn-active" : "city-btn-inactive"
                  }`}
                  style={{ fontFamily: "Cinzel, serif" }}
                  data-testid={`button-city-${city.id}`}
                >
                  {isActive && <ArtDecoCorners />}
                  <span className="mr-1.5">{city.flag}</span>
                  {city.label}
                  <span
                    className="block text-center mt-0.5"
                    style={{
                      fontSize: "9px",
                      letterSpacing: "0.15em",
                      color: isActive ? "hsl(230 30% 30%)" : "hsl(43 20% 45%)",
                    }}
                  >
                    {city.country}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Next Prayer Banner ───────────────────────────────────── */}
        {nextPrayer && !isLoading && (
          <div
            className="text-center mb-6 py-3 px-6"
            style={{
              background: "linear-gradient(90deg, transparent, hsl(43 50% 12%), transparent)",
              borderTop: "1px solid hsl(43 40% 22%)",
              borderBottom: "1px solid hsl(43 40% 22%)",
            }}
            data-testid="banner-next-prayer"
          >
            <p style={{ color: "hsl(43 35% 55%)", fontFamily: "Cinzel, serif", fontSize: "10px", letterSpacing: "0.35em" }} className="uppercase">
              Next Prayer
            </p>
            <p className="gold-gradient-text text-xl font-bold tracking-widest" style={{ fontFamily: "Cinzel, serif" }}>
              {nextPrayer.name} &mdash; in {formatCountdown(nextPrayer.remainingMinutes)}
            </p>
          </div>
        )}

        {/* ── Loading State ────────────────────────────────────────── */}
        {isLoading && (
          <div className="text-center py-16" data-testid="status-loading">
            <div
              className="inline-block w-10 h-10 border-2 border-t-transparent rounded-full animate-spin mb-4"
              style={{ borderColor: "hsl(43 72% 48%)", borderTopColor: "transparent" }}
            />
            <p className="text-xs tracking-[0.3em] uppercase" style={{ color: "hsl(43 35% 55%)", fontFamily: "Cinzel, serif" }}>
              Fetching Prayer Times
            </p>
          </div>
        )}

        {/* ── Error State ──────────────────────────────────────────── */}
        {error && !isLoading && (
          <div
            className="text-center py-8 px-6 border"
            style={{ borderColor: "hsl(0 50% 30%)", background: "hsl(0 30% 8%)" }}
            data-testid="status-error"
          >
            <p className="text-sm tracking-widest uppercase" style={{ color: "hsl(0 70% 60%)", fontFamily: "Cinzel, serif" }}>
              Unable to Fetch Prayer Times
            </p>
            <p className="text-xs mt-2" style={{ color: "hsl(43 20% 50%)", fontFamily: "Cormorant Garamond, serif" }}>
              Please check your connection and try again
            </p>
          </div>
        )}

        {/* ── Prayer Time Cards ────────────────────────────────────── */}
        {data && !isLoading && (
          <>
            <ArtDecoDivider label="Prayer Times" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-6">
              {PRAYERS.map((prayer) => {
                const timeStr = data.timings[prayer.key] || "--:--";
                const { time, period } = formatTime12(timeStr);
                const isNext = nextPrayer?.name === prayer.key;
                const isSunrise = prayer.key === "Sunrise";

                return (
                  <div
                    key={prayer.key}
                    className={`relative p-4 border transition-all duration-300 ${
                      isNext ? "prayer-card-active" : "prayer-card-normal"
                    }`}
                    data-testid={`card-prayer-${prayer.key.toLowerCase()}`}
                  >
                    {isNext && <ArtDecoCorners />}

                    <p
                      className="text-right mb-1"
                      style={{
                        fontFamily: "Cormorant Garamond, serif",
                        fontSize: "15px",
                        color: isNext ? "hsl(43 80% 65%)" : "hsl(43 25% 48%)",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {prayer.arabic}
                    </p>

                    <div
                      className="h-px mb-2"
                      style={{
                        background: isNext
                          ? "linear-gradient(90deg, hsl(43 72% 48%), transparent)"
                          : "linear-gradient(90deg, hsl(43 35% 22%), transparent)",
                      }}
                    />

                    <p
                      className="text-xs tracking-[0.25em] uppercase mb-0.5"
                      style={{ fontFamily: "Cinzel, serif", color: isNext ? "hsl(43 80% 72%)" : "hsl(43 25% 55%)" }}
                    >
                      {prayer.label}
                    </p>

                    <p
                      className="text-xs mb-2"
                      style={{ fontFamily: "Cormorant Garamond, serif", color: "hsl(43 20% 42%)", letterSpacing: "0.05em" }}
                    >
                      {prayer.desc}
                    </p>

                    <div className="flex items-end gap-1">
                      <p
                        className="text-2xl md:text-3xl font-bold leading-none"
                        style={{
                          fontFamily: "Cinzel, serif",
                          color: isNext ? "hsl(43 80% 68%)" : isSunrise ? "hsl(43 40% 55%)" : "hsl(43 55% 80%)",
                        }}
                        data-testid={`text-time-${prayer.key.toLowerCase()}`}
                      >
                        {time}
                      </p>
                      <p
                        className="text-xs mb-0.5 tracking-widest"
                        style={{ fontFamily: "Cinzel, serif", color: isNext ? "hsl(43 60% 55%)" : "hsl(43 25% 45%)" }}
                      >
                        {period}
                      </p>
                    </div>

                    {isNext && (
                      <div className="mt-2">
                        <p className="text-xs tracking-[0.2em] uppercase" style={{ color: "hsl(43 65% 58%)", fontFamily: "Cinzel, serif" }}>
                          &#9658; Next
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p
              className="text-center mt-6 text-xs tracking-widest uppercase"
              style={{ color: "hsl(43 20% 38%)", fontFamily: "Cinzel, serif" }}
            >
              Method: ISNA &mdash; {data.meta?.timezone}
            </p>
          </>
        )}
      </div>

      {/* Decorative bottom band */}
      <div
        className="w-full h-1 mt-8"
        style={{ background: "linear-gradient(90deg, transparent, hsl(43 72% 48%), hsl(43 80% 65%), hsl(43 72% 48%), transparent)" }}
      />
    </div>
  );
}
