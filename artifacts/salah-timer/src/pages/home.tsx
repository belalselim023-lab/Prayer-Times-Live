import { useState, useEffect, useRef, useCallback } from "react";
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
  method: number; // AlAdhan calculation method
}

const CITIES: City[] = [
  { id: "cairo",     label: "Cairo",     country: "Egypt",        flag: "🇪🇬", apiCity: "Cairo",     apiCountry: "Egypt",        timezone: "Africa/Cairo",    lat: 30.0444, lng: 31.2357,  method: 5  }, // Egyptian General Authority of Survey
  { id: "toronto",   label: "Toronto",   country: "Canada",       flag: "🇨🇦", apiCity: "Toronto",   apiCountry: "Canada",       timezone: "America/Toronto", lat: 43.6532, lng: -79.3832, method: 2  }, // ISNA (standard for North America)
  { id: "moscow",    label: "Moscow",    country: "Russia",       flag: "🇷🇺", apiCity: "Moscow",    apiCountry: "Russia",       timezone: "Europe/Moscow",   lat: 55.7558, lng: 37.6173,  method: 3  }, // Muslim World League
  { id: "mecca",     label: "Mecca",     country: "Saudi Arabia", flag: "🇸🇦", apiCity: "Mecca",     apiCountry: "Saudi Arabia", timezone: "Asia/Riyadh",     lat: 21.3891, lng: 39.8579,  method: 4  }, // Umm Al-Qura University, Mecca
  { id: "jerusalem", label: "Jerusalem", country: "Palestine",    flag: "🇵🇸", apiCity: "Jerusalem", apiCountry: "Palestine",    timezone: "Asia/Jerusalem",  lat: 31.7683, lng: 35.2137,  method: 3  }, // Muslim World League
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

/* ── Compute Qibla bearing locally (no API needed) ──────────────────── */
function computeQibla(lat: number, lng: number): number {
  const MECCA_LAT = 21.4225;
  const MECCA_LNG = 39.8262;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(lat);
  const lat2 = toRad(MECCA_LAT);
  const dLng  = toRad(MECCA_LNG - lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/* Returns DD-MM-YYYY in the given city's timezone (not browser timezone) */
function getCityDateString(timezone: string): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    day:   "2-digit",
    month: "2-digit",
    year:  "numeric",
  }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "00";
  return `${get("day")}-${get("month")}-${get("year")}`;
}

/* Keep a timezone-agnostic version for midnight-refresh comparison */
function getDateString(): string {
  return getCityDateString(Intl.DateTimeFormat().resolvedOptions().timeZone);
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

  // SVG canvas 160×160, compass circle centred at (80,80)
  const cx = 80;
  const cy = 80;
  const R  = 74;   // outer radius
  const Rt = 66;   // tick ring radius

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

      {/* Compass SVG — 160×160 */}
      <svg
        width="160"
        height="160"
        viewBox="0 0 160 160"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block" }}
      >
        <defs>
          <clipPath id="compassClip">
            <circle cx={cx} cy={cy} r={R} />
          </clipPath>
        </defs>

        {/* ── Layer 1: Background ── */}
        <circle cx={cx} cy={cy} r={R} fill="hsl(230 30% 7%)" />

        {/* ── Layer 2: Decorative rings ── */}
        <circle cx={cx} cy={cy} r={R}    fill="none" stroke="hsl(43 72% 48%)" strokeWidth="2.5" />
        <circle cx={cx} cy={cy} r={R-6}  fill="none" stroke="hsl(43 40% 22%)" strokeWidth="0.8" />
        <circle cx={cx} cy={cy} r={Rt}   fill="none" stroke="hsl(43 40% 22%)" strokeWidth="0.6" />

        {/* ── Layer 3: Tick marks ── */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
          const major = angle % 90 === 0;
          const rad = (angle - 90) * (Math.PI / 180);
          const x1 = cx + Rt * Math.cos(rad);
          const y1 = cy + Rt * Math.sin(rad);
          const x2 = cx + (major ? 56 : 62) * Math.cos(rad);
          const y2 = cy + (major ? 56 : 62) * Math.sin(rad);
          return (
            <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={major ? "hsl(43 72% 48%)" : "hsl(43 40% 30%)"}
              strokeWidth={major ? 2 : 0.9}
            />
          );
        })}

        {/* ── Layer 4: Cardinal letters (fixed, don't rotate) ── */}
        <text x={cx}    y={cy-53} textAnchor="middle" dominantBaseline="middle" fontSize="12" fontFamily="Cinzel,serif" fill="hsl(43 85% 68%)" fontWeight="bold">N</text>
        <text x={cx}    y={cy+55} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontFamily="Cinzel,serif" fill="hsl(43 40% 40%)">S</text>
        <text x={cx+55} y={cy}    textAnchor="middle" dominantBaseline="middle" fontSize="10" fontFamily="Cinzel,serif" fill="hsl(43 40% 40%)">E</text>
        <text x={cx-55} y={cy}    textAnchor="middle" dominantBaseline="middle" fontSize="10" fontFamily="Cinzel,serif" fill="hsl(43 40% 40%)">W</text>

        {/* ── Layer 5: Loading spinner ── */}
        {isLoading && (
          <circle cx={cx} cy={cy} r="28" fill="none" stroke="hsl(43 40% 30%)" strokeWidth="2" strokeDasharray="40 130" strokeLinecap="round">
            <animateTransform attributeName="transform" type="rotate" from={`0 ${cx} ${cy}`} to={`360 ${cx} ${cy}`} dur="1.2s" repeatCount="indefinite" />
          </circle>
        )}

        {/* ── Layer 6: Center decorative circle (behind Kaaba, above ticks) ── */}
        <circle cx={cx} cy={cy} r="20" fill="hsl(230 30% 11%)" stroke="hsl(43 50% 30%)" strokeWidth="1.2" />

        {/* ── Layer 7: Kaaba (pure SVG cube, centred at cx,cy) ── */}
        {/* Front face */}
        <rect x={cx-8} y={cy-5} width="14" height="12" fill="hsl(43 60% 38%)" />
        {/* Top face */}
        <polygon points={`${cx-8},${cy-5} ${cx-4},${cy-10} ${cx+10},${cy-10} ${cx+6},${cy-5}`} fill="hsl(43 72% 52%)" />
        {/* Right face */}
        <polygon points={`${cx+6},${cy-5} ${cx+10},${cy-10} ${cx+10},${cy+2} ${cx+6},${cy+7}`} fill="hsl(43 40% 26%)" />
        {/* Kiswa gold band */}
        <rect x={cx-8} y={cy-1} width="14" height="2.5" fill="hsl(43 88% 60%)" />

        {/* ── Layer 8: Needle — LAST so it's always on top ── */}
        {bearing !== undefined && !isLoading && (
          <g transform={`rotate(${bearing}, ${cx}, ${cy})`}>
            {/* Gold/white tip pointing toward Qibla */}
            <polygon
              points={`${cx},${cy-62}  ${cx-7},${cy-14}  ${cx+7},${cy-14}`}
              fill="#fffff0"
              stroke="hsl(43 80% 60%)"
              strokeWidth="1"
              strokeLinejoin="round"
            />
            {/* Red tail pointing away */}
            <polygon
              points={`${cx},${cy+54}  ${cx-5},${cy+16}  ${cx+5},${cy+16}`}
              fill="#d32f2f"
              stroke="#f44336"
              strokeWidth="1"
              strokeLinejoin="round"
            />
            {/* Bright pivot dot at exact centre */}
            <circle cx={cx} cy={cy} r="5" fill="hsl(43 80% 55%)" stroke="hsl(230 30% 8%)" strokeWidth="1.5" />
          </g>
        )}
      </svg>

      {/* Label */}
      <p style={{
        fontFamily: "Cinzel, serif",
        fontSize: "9px",
        letterSpacing: "0.3em",
        color: "hsl(43 40% 36%)",
        textTransform: "uppercase",
        marginTop: "3px",
      }}>
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
  const [adhanEnabled, setAdhanEnabled] = useState(true);
  const [adhanPlaying, setAdhanPlaying] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const audioRef       = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef(false);
  const playedRef      = useRef<Set<string>>(new Set());

  const ADHAN_SOURCES = [
    "https://www.islamcan.com/audio/adhan/azan1.mp3",
    "https://ia800300.us.archive.org/18/items/adhaan_makkah/adhaan_makkah.mp3",
    "https://audio.islamicaudio.net/adhan/adhan.mp3",
  ];

  /* Pre-load audio on mount — tries sources until one loads */
  useEffect(() => {
    let idx = 0;
    const tryLoad = () => {
      if (idx >= ADHAN_SOURCES.length) return;
      const audio = new Audio(ADHAN_SOURCES[idx]);
      audio.preload = "auto";
      audio.volume = 0.85;
      audio.oncanplaythrough = () => { audioRef.current = audio; };
      audio.onerror = () => { idx++; tryLoad(); };
      audio.load();
    };
    tryLoad();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Unlock audio — must be called from a direct user gesture (click) */
  const unlockAudio = useCallback(() => {
    if (audioUnlockedRef.current || !audioRef.current) return;
    const audio = audioRef.current;
    const saved = audio.volume;
    audio.volume = 0;
    audio.play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = saved;
        audioUnlockedRef.current = true;
        setAudioUnlocked(true);
      })
      .catch(() => {
        audio.volume = saved;
      });
  }, []);

  /* Play adhan — reuses pre-loaded element so autoplay is allowed */
  const playAdhan = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.volume = 0.85;
    audio.onplay  = () => setAdhanPlaying(true);
    audio.onended = () => setAdhanPlaying(false);
    audio.onerror = () => setAdhanPlaying(false);
    audio.play().catch(() => setAdhanPlaying(false));
  }, []);

  const stopAdhan = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setAdhanPlaying(false);
  }, []);

  const [dateStr, setDateStr] = useState(() => getCityDateString(selectedCity.timezone));

  /* Prayer times */
  const { data, isLoading, error } = useQuery<TimingsData>({
    queryKey: ["prayerTimes", selectedCity.id, dateStr],
    queryFn: async () => {
      const url = `https://api.aladhan.com/v1/timingsByCity/${dateStr}?city=${encodeURIComponent(selectedCity.apiCity)}&country=${encodeURIComponent(selectedCity.apiCountry)}&method=${selectedCity.method}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch prayer times");
      const json = await res.json();
      return json.data as TimingsData;
    },
    staleTime: 60 * 60 * 1000,   // 1 hour — re-fetches on new day when dateStr changes
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

  /* Live city clock + adhan trigger */
  useEffect(() => {
    const tick = () => {
      const ct = getCityTime(selectedCity.timezone);
      setCityTime(ct);

      /* Auto-refresh when city's local date changes (handles midnight correctly) */
      const today = getCityDateString(selectedCity.timezone);
      setDateStr(prev => prev !== today ? today : prev);
      if (data?.timings) {
        const np = getNextPrayer(data.timings, ct.h, ct.m);
        setNextPrayer(np);

        /* Fire adhan at second 0 of each prayer minute */
        /* Widen to 20s window — handles tabs that wake up mid-second */
        if (ct.s <= 20 && adhanEnabled) {
          const nowMins = ct.h * 60 + ct.m;
          for (const prayerKey of ACTIVE_PRAYERS) {
            const raw = data.timings[prayerKey];
            if (!raw) continue;
            const [ph, pm] = raw.split(":").map(Number);
            if (nowMins === ph * 60 + pm) {
              const key = `${selectedCity.id}-${prayerKey}-${getDateString()}`;
              if (!playedRef.current.has(key)) {
                playedRef.current.add(key);
                playAdhan();
              }
              break;
            }
          }
        }
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [selectedCity, data, adhanEnabled, playAdhan]);

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
            <QiblaCompass
              bearing={qiblaData?.bearing ?? computeQibla(selectedCity.lat, selectedCity.lng)}
              isLoading={false}
            />
          </div>

          {/* Adhan mute toggle — top right */}
          <div className="absolute right-0 top-0 flex flex-col items-center gap-1">
            <button
              onClick={() => {
                unlockAudio();
                if (adhanEnabled) {
                  stopAdhan();
                  setAdhanEnabled(false);
                } else {
                  setAdhanEnabled(true);
                }
              }}
              title={adhanEnabled ? "Mute Adhan" : "Unmute Adhan"}
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: adhanPlaying
                  ? "radial-gradient(circle, hsl(43 80% 20%) 0%, hsl(230 30% 8%) 100%)"
                  : "hsl(230 30% 8%)",
                border: `2px solid ${adhanEnabled ? "hsl(43 72% 48%)" : "hsl(43 25% 28%)"}`,
                boxShadow: adhanPlaying ? "0 0 14px hsl(43 72% 48% / 0.55)" : "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "box-shadow 0.3s, border-color 0.3s",
                outline: "none",
              }}
            >
              {adhanEnabled ? (
                /* Speaker with sound waves */
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <polygon points="3,8 3,16 7,16 13,20 13,4 7,8" fill={adhanPlaying ? "hsl(43 85% 65%)" : "hsl(43 65% 48%)"} />
                  <path d="M16 8.5 C17.5 9.8 18.3 11.1 18.3 12 C18.3 12.9 17.5 14.2 16 15.5"
                    stroke={adhanPlaying ? "hsl(43 85% 65%)" : "hsl(43 65% 48%)"}
                    strokeWidth="1.5" strokeLinecap="round" fill="none" />
                  <path d="M18.5 6 C21 8 22.3 10 22.3 12 C22.3 14 21 16 18.5 18"
                    stroke={adhanPlaying ? "hsl(43 85% 65%)" : "hsl(43 50% 40%)"}
                    strokeWidth="1.5" strokeLinecap="round" fill="none"
                    strokeOpacity={adhanPlaying ? "1" : "0.6"} />
                </svg>
              ) : (
                /* Speaker muted (cross) */
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <polygon points="3,8 3,16 7,16 13,20 13,4 7,8" fill="hsl(43 30% 35%)" />
                  <line x1="16" y1="9" x2="22" y2="15" stroke="hsl(43 30% 35%)" strokeWidth="2" strokeLinecap="round" />
                  <line x1="22" y1="9" x2="16" y2="15" stroke="hsl(43 30% 35%)" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </button>
            {/* Pulsing "LIVE" dot when adhan is playing */}
            {adhanPlaying && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "hsl(43 85% 62%)",
                  display: "inline-block",
                  animation: "pulse 1s ease-in-out infinite",
                }} />
                <span style={{
                  fontFamily: "Cinzel, serif",
                  fontSize: "7px",
                  letterSpacing: "0.25em",
                  color: "hsl(43 72% 55%)",
                  textTransform: "uppercase",
                }}>Adhan</span>
              </div>
            )}
            {!adhanPlaying && (
              <p style={{
                fontFamily: "Cinzel, serif",
                fontSize: "7px",
                letterSpacing: "0.2em",
                color: adhanEnabled ? "hsl(43 40% 36%)" : "hsl(43 20% 28%)",
                textTransform: "uppercase",
                marginTop: 2,
              }}>
                {adhanEnabled ? "Adhan" : "Muted"}
              </p>
            )}
            {/* "Tap to enable" hint — shown until first user gesture unlocks audio */}
            {!audioUnlocked && adhanEnabled && !adhanPlaying && (
              <p style={{
                fontFamily: "Cinzel, serif",
                fontSize: "6px",
                letterSpacing: "0.12em",
                color: "hsl(43 60% 42%)",
                textTransform: "uppercase",
                textAlign: "center",
                marginTop: 1,
                maxWidth: 60,
                lineHeight: 1.4,
              }}>
                tap to enable
              </p>
            )}
            {/* Test button */}
            <button
              onClick={() => {
                unlockAudio();
                adhanPlaying ? stopAdhan() : playAdhan();
              }}
              style={{
                fontFamily: "Cinzel, serif",
                fontSize: "6px",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "hsl(43 60% 45%)",
                background: "none",
                border: "1px solid hsl(43 40% 28%)",
                padding: "2px 6px",
                cursor: "pointer",
                marginTop: 2,
              }}
            >
              {adhanPlaying ? "Stop" : "Test"}
            </button>
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
