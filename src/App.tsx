/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from "react";
import { useState, useEffect, FormEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, Brain, Map as MapIcon, Users, Heart, ArrowRight, X, MessageCircle, Clock, MapPin, Search, Loader2, ExternalLink, Send, Sparkles, LogIn, LogOut, AlertCircle, AlertTriangle, Orbit, Archive, Inbox, Bell, Compass, History, Package } from "lucide-react";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { 
  db, auth, googleProvider, 
  collection, addDoc, onSnapshot, query, orderBy, limit, doc, getDoc, runTransaction, serverTimestamp, where, getDocs,
  Timestamp, OperationType, handleFirestoreError, signInWithPopup 
} from "./firebase";
import { User } from "firebase/auth";
import { MapContainer, TileLayer, Marker, useMap, ZoomControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet marker icon issue
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  public state: { hasError: boolean, error: Error | null };
  public props: { children: React.ReactNode };

  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl max-w-md w-full text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-6" />
            <h2 className="text-2xl font-bold mb-4">Something went wrong / 糟糕，出错了</h2>
            <p className="text-slate-600 mb-8 text-sm leading-relaxed">
              The application encountered an unexpected error. This might be due to network or configuration issues.
              <br />
              应用程序遇到了一个意外错误。这可能是由于网络连接或配置问题。
            </p>
            <pre className="bg-slate-100 p-4 rounded-xl text-[10px] text-left overflow-auto mb-8 max-h-40 font-mono">
              {this.state.error?.message}
            </pre>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-colors"
            >
              Refresh Page / 刷新页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// 初始化 Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface EchoMarker {
  id: string;
  x: number;
  y: number;
  lat: number;
  lng: number;
  emotion: 'joy' | 'sadness' | 'relief' | 'regret' | 'peace';
  text: string;
  locationName: string;
  timestamp: string;
  resonanceCount: number;
  uid: string;
  isUserGenerated?: boolean;
}

const translations = {
  zh: {
    appName: "Echo Map",
    appStatus: "AI 情感分析已就绪",
    heroTitle: "记录你的情感回响",
    searchPlaceholder: "搜索地点或地址以查找回响...",
    searchBtn: "搜索",
    loginBtn: "登录以记录回响",
    emotionChallenge: "情绪挑战",
    mapHint: "点击地图上的光点，或点击下方“中央录制”记录此刻",
    syncingMap: "正在同步 Google Maps 地理数据...",
    searchingLocation: "正在定位搜索地点...",
    inputPanelTitle: "捕捉你的情绪",
    inputPanelPlaceholder: "例如：今天在图书馆看书，阳光很好，心情很平静...",
    launchBtn: "发射到地图",
    analyzing: "AI 极速分析中...",
    resonateBtn: "给予共鸣",
    resonated: "已共鸣",
    blindBoxTitle: "正在捕捉宇宙信号...",
    blindBoxSub: "寻找跨越时空的共鸣回响",
    navMap: "回声地图",
    navBlindBox: "共鸣盲盒",
    navRecord: "中央录制",
    navDrawer: "时光抽屉",
    navInbox: "共鸣箱",
    drawerTitle: "时光抽屉",
    drawerSub: "这里存放着你留在世界角落的所有回响",
    drawerEmpty: "抽屉还是空的，去留下你的第一声回响吧",
    inboxTitle: "共鸣箱",
    inboxSub: "来自陌生人的温暖反馈",
    inboxEmpty: "暂时没有新的共鸣消息",
    inboxEmptySub: "当有人对你的回响产生共鸣时，这里会跳动起来",
    careCardDelay: "如果您在浏览器开发者工具（F12）中查看，可以看到系统正在寻找哪种情绪，以及找到了多少个匹配项。",
    matchTitle: "在宇宙的某个角落",
    matchSub: "有人和你有着相似的情绪",
    matchAlone: "你并不孤单",
    matchLocation: "在某个角落",
    challengeTitle: "情绪打卡挑战",
    challengeProgress: "挑战进度",
    challengeBtn: "立即打卡",
    errorTitle: "糟糕，出错了",
    errorSub: "应用程序遇到了一个意外错误。这可能是由于网络连接或配置问题。",
    refreshBtn: "刷新页面",
    footer: "© 2024 Echo Map · Powered by Gemini 3.1 Pro & Google Maps",
  },
  en: {
    appName: "Echo Map",
    appStatus: "AI Emotion Analysis Ready",
    heroTitle: "Record Your Emotional Echoes",
    searchPlaceholder: "Search places or addresses for echoes...",
    searchBtn: "Search",
    loginBtn: "Login to record echoes",
    emotionChallenge: "Challenge",
    mapHint: "Click map dots or use 'Central Record' below to record this moment",
    syncingMap: "Syncing Google Maps data...",
    searchingLocation: "Locating search address...",
    inputPanelTitle: "Capture Your Emotion",
    inputPanelPlaceholder: "e.g. Reading in the library today, the sun is nice, feeling peaceful...",
    launchBtn: "Launch to Map",
    analyzing: "AI Analyzing...",
    resonateBtn: "Give Resonance",
    resonated: "Resonated",
    blindBoxTitle: "Capturing Cosmic Signals...",
    blindBoxSub: "Searching for resonance across space and time",
    navMap: "Echo Map",
    navBlindBox: "Blind Box",
    navRecord: "Record",
    navDrawer: "Drawer",
    navInbox: "Inbox",
    drawerTitle: "Time Drawer",
    drawerSub: "All the echoes you've left in the corners of the world",
    drawerEmpty: "Your drawer is empty, go leave your first echo",
    inboxTitle: "Resonance Box",
    inboxSub: "Warm feedback from strangers",
    inboxEmpty: "No new resonance messages yet",
    inboxEmptySub: "When someone resonates with your echo, it will pulse here",
    careCardDelay: "Check the browser console (F12) to see the matching process.",
    matchTitle: "In a corner of the universe",
    matchSub: "Someone shares a similar emotion",
    matchAlone: "You are not alone",
    matchLocation: "In a corner",
    challengeTitle: "Emotion Challenge",
    challengeProgress: "Challenge Progress",
    challengeBtn: "Check-in Now",
    errorTitle: "Oops, something went wrong",
    errorSub: "The application encountered an unexpected error. This might be due to network or configuration issues.",
    refreshBtn: "Refresh Page",
    footer: "© 2024 Echo Map · Powered by Gemini 3.1 Pro & Google Maps",
  }
};

const emotionConfig = {
  joy: { color: "bg-orange-400", label: { zh: "喜悦", en: "Joy" }, icon: "😊", shadow: "shadow-orange-400/50" },
  sadness: { color: "bg-blue-400", label: { zh: "忧郁", en: "Sadness" }, icon: "😢", shadow: "shadow-blue-400/50" },
  relief: { color: "bg-green-400", label: { zh: "释怀", en: "Relief" }, icon: "🍃", shadow: "shadow-green-400/50" },
  regret: { color: "bg-purple-400", label: { zh: "遗憾", en: "Regret" }, icon: "🕯️", shadow: "shadow-purple-400/50" },
  peace: { color: "bg-teal-400", label: { zh: "宁静", en: "Peace" }, icon: "🌊", shadow: "shadow-teal-400/50" },
};

export default function App() {
  return (
    <ErrorBoundary>
      <EchoMapApp />
    </ErrorBoundary>
  );
}

// Map Controller to handle center updates
function MapController({ center }: { center: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], map.getZoom());
  }, [center, map]);
  return null;
}

interface CareCard {
  title: string;
  task: string;
  icon: string;
}

const careCards: Record<string, Record<string, CareCard[]>> = {
  zh: {
    sadness: [
      { title: "深呼吸", task: "闭上眼，进行三次深长的呼吸，感受空气进入肺部的过程。", icon: "🫁" },
      { title: "喝杯温水", task: "去倒一杯温热的水，慢慢喝完它，感受温暖流过喉咙。", icon: "🍵" },
      { title: "看窗外", task: "看向窗外最远的地方，数出三样你看到的东西。", icon: "🪟" }
    ],
    regret: [
      { title: "写给过去", task: "在心里对自己说：'没关系，我已经尽力了。'", icon: "✉️" },
      { title: "伸展身体", task: "站起来，双手向上举过头顶，做一个全身的拉伸。", icon: "🧘" },
      { title: "洗个脸", task: "用凉水洗个脸，感受水分带走皮肤上的疲惫。", icon: "🚿" }
    ],
    joy: [
      { title: "分享喜悦", task: "给一个好朋友发个表情包，把这份快乐传递出去。", icon: "🎉" }
    ]
  },
  en: {
    sadness: [
      { title: "Deep Breath", task: "Close your eyes, take three deep breaths, feel the air entering your lungs.", icon: "🫁" },
      { title: "Warm Water", task: "Pour a cup of warm water, drink it slowly, feel the warmth through your throat.", icon: "🍵" },
      { title: "Look Outside", task: "Look at the farthest place outside the window, count three things you see.", icon: "🪟" }
    ],
    regret: [
      { title: "To the Past", task: "Say to yourself: 'It's okay, I've tried my best.'", icon: "✉️" },
      { title: "Stretch", task: "Stand up, raise your hands above your head, do a full body stretch.", icon: "🧘" },
      { title: "Wash Face", task: "Wash your face with cool water, feel the moisture taking away the fatigue.", icon: "🚿" }
    ],
    joy: [
      { title: "Share Joy", task: "Send an emoji to a good friend, pass this happiness on.", icon: "🎉" }
    ]
  }
};

interface Challenge {
  id: string;
  title: string;
  description: string;
  targetCount: number;
  currentCount: number;
  icon: React.ReactNode;
}

const challenges: Record<string, Challenge> = {
  zh: {
    id: "exam_stress_2024",
    title: "考试周减压挑战",
    description: "在考试周期间，每天记录一次你的情绪回响，释放压力，与校友共鸣。",
    targetCount: 7,
    currentCount: 3, // This would ideally come from Firestore
    icon: <Brain className="w-6 h-6 text-purple-500" />
  },
  en: {
    id: "exam_stress_2024",
    title: "Exam Stress Relief",
    description: "During exam week, record your emotions daily to release pressure and resonate with others.",
    targetCount: 7,
    currentCount: 3,
    icon: <Brain className="w-6 h-6 text-purple-500" />
  }
};

function EchoMapApp() {
  const [user, setUser] = useState<User | null>(null);
  const [markers, setMarkers] = useState<EchoMarker[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<EchoMarker | null>(null);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [mapEmbedUrl, setMapEmbedUrl] = useState("");
  const [mapCenterCoords, setMapCenterCoords] = useState<{ lat: number; lng: number } | null>({ lat: 31.4836457, lng: 121.1590006 });
  
  const [userInput, setUserInput] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showInputPanel, setShowInputPanel] = useState(false);
  const [isLoadingMap, setIsLoadingMap] = useState(true);
  const [hasResonated, setHasResonated] = useState(false);
  const [isResonating, setIsResonating] = useState(false);
  const [activeCareCard, setActiveCareCard] = useState<CareCard | null>(null);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [matchedEcho, setMatchedEcho] = useState<EchoMarker | null>(null);
  const [activeTab, setActiveTab] = useState("map");
  const [isOpeningBlindBox, setIsOpeningBlindBox] = useState(false);
  const [lang, setLang] = useState<"zh" | "en">("zh");

  const t = translations[lang];

  const currentChallenge = challenges[lang];

  // Auth Listener
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Real-time Firestore Listener
  useEffect(() => {
    const q = query(collection(db, "echoes"), orderBy("timestamp", "desc"), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newMarkers: EchoMarker[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          x: data.x,
          y: data.y,
          lat: data.lat,
          lng: data.lng,
          emotion: data.emotion,
          text: data.text,
          locationName: data.locationName,
          timestamp: data.timestamp instanceof Timestamp 
            ? data.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : "未知时间",
          resonanceCount: data.resonanceCount || 0,
          uid: data.uid || "",
          isUserGenerated: data.uid === auth.currentUser?.uid
        };
      });
      setMarkers(newMarkers);
      setIsLoadingMap(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "echoes");
    });

    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Sign in failed:", error);
    }
  };

  const handleSignOut = () => auth.signOut();

  const handleOpenBlindBox = async () => {
    if (!user) {
      handleSignIn();
      return;
    }
    setIsOpeningBlindBox(true);
    try {
      // 随机获取一个回响
      const q = query(collection(db, "echoes"), limit(50));
      const snapshot = await getDocs(q);
      const allEchoes = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as EchoMarker))
        .filter(echo => echo.uid !== auth.currentUser?.uid);

      if (allEchoes.length > 0) {
        const randomMatch = allEchoes[Math.floor(Math.random() * allEchoes.length)];
        setTimeout(() => {
          setMatchedEcho(randomMatch);
          setIsOpeningBlindBox(false);
        }, 2000); // 模拟“捕捉信号”的过程
      } else {
        setIsOpeningBlindBox(false);
      }
    } catch (error) {
      console.error("Blind box failed:", error);
      setIsOpeningBlindBox(false);
    }
  };

  const handleSearch = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    const embedUrl = `https://www.google.com/maps?q=${encodeURIComponent(searchQuery)}&output=embed&z=16`;
    setMapEmbedUrl(embedUrl);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Find the central latitude and longitude coordinates for "${searchQuery}". Return ONLY a JSON object: {"lat": number, "lng": number}.`,
        config: {
          tools: [{ googleMaps: {} }],
          responseMimeType: "application/json"
        }
      });

      let data;
      try {
        data = JSON.parse(response.text || "{}");
        if (data.lat && data.lng) {
          setMapCenterCoords({ lat: data.lat, lng: data.lng });
        }
      } catch (e) {
        console.error("Failed to parse map center coords", e);
      }
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsSearching(false);
    }
  };

  // 新增：AI 情绪分析与地理打点逻辑 (Firestore 版)
  const handleAnalyzeAndPin = async () => {
    if (!userInput.trim() || !auth.currentUser) return;
    setIsAnalyzing(true);

    try {
      // 1. 并行执行：地理位置获取与 AI 情绪分析
      const getPosPromise = new Promise<GeolocationPosition>((res, rej) => 
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: false, timeout: 3000 })
      );

      const aiAnalysisPromise = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze the emotion of the following text. Choose the best category from: joy, sadness, relief, regret, peace.
        Text: "${userInput}"
        Return ONLY the category word.`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
        }
      });

      // 等待两者完成（位置获取失败会回退，不阻塞 AI 结果处理）
      const [posResult, aiResult] = await Promise.allSettled([getPosPromise, aiAnalysisPromise]);
      
      let userLat = 31.483645701648424; // 默认回退坐标 (苏州太仓)
      let userLng = 121.15900068964022;

      if (posResult.status === 'fulfilled') {
        userLat = posResult.value.coords.latitude;
        userLng = posResult.value.coords.longitude;
      } else {
        console.warn("Geolocation failed or timed out, using default coords");
      }

      let detectedEmotion: keyof typeof emotionConfig = 'peace';
      if (aiResult.status === 'fulfilled') {
        const text = aiResult.value.text?.trim().toLowerCase() || 'peace';
        detectedEmotion = (emotionConfig[text as keyof typeof emotionConfig] ? text : 'peace') as keyof typeof emotionConfig;
      }

      // 2. 计算相对坐标 (假设地图范围约 1km)
      const latRange = 0.01; 
      const lngRange = 0.01 / Math.cos((mapCenterCoords?.lat || 0) * Math.PI / 180);
      
      const relX = mapCenterCoords ? 50 + ((userLng - mapCenterCoords.lng) / lngRange) * 100 : 50;
      const relY = mapCenterCoords ? 50 - ((userLat - mapCenterCoords.lat) / latRange) * 100 : 50;

      // 4. 保存到 Firestore
      const echoData = {
        emotion: detectedEmotion,
        text: userInput,
        locationName: "当前位置",
        timestamp: Timestamp.now(),
        x: Math.max(5, Math.min(95, relX)),
        y: Math.max(5, Math.min(95, relY)),
        lat: userLat,
        lng: userLng,
        uid: auth.currentUser.uid,
        resonanceCount: 0
      };

      await addDoc(collection(db, "echoes"), echoData);

      // 5. 情绪匹配功能 (Resonance Matching)
      let foundMatch = false;
      try {
        console.log("Starting matching for emotion:", detectedEmotion);
        // 首先尝试匹配相同情绪的其他用户
        const qSame = query(
          collection(db, "echoes"), 
          where("emotion", "==", detectedEmotion),
          limit(50)
        );
        const snapshotSame = await getDocs(qSame);
        let potentialMatches = snapshotSame.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as EchoMarker))
          .filter(echo => echo.uid !== auth.currentUser?.uid);

        console.log(`Found ${potentialMatches.length} same-emotion matches`);

        // 如果没有相同情绪的，尝试匹配任何其他用户的回响
        if (potentialMatches.length === 0) {
          console.log("No same-emotion match, trying any other user echoes...");
          const qAny = query(
            collection(db, "echoes"),
            limit(50)
          );
          const snapshotAny = await getDocs(qAny);
          potentialMatches = snapshotAny.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as EchoMarker))
            .filter(echo => echo.uid !== auth.currentUser?.uid);
          console.log(`Found ${potentialMatches.length} any-emotion matches`);
        }

        if (potentialMatches.length > 0) {
          const randomMatch = potentialMatches[Math.floor(Math.random() * potentialMatches.length)];
          setMatchedEcho(randomMatch);
          foundMatch = true;
        } else {
          console.log("No other users found in the database yet.");
        }
      } catch (matchError) {
        console.error("Matching failed:", matchError);
      }

      // 触发关怀卡片 (针对低落或特定情绪)
      if (careCards[lang][detectedEmotion]) {
        const cards = careCards[lang][detectedEmotion];
        const randomCard = cards[Math.floor(Math.random() * cards.length)];
        // 如果有匹配成功的共鸣，延迟更久一点再显示关怀卡片，避免重叠
        const delay = foundMatch ? 5000 : 800;
        setTimeout(() => setActiveCareCard(randomCard), delay);
      }

      // 成功后立即重置状态并关闭面板
      setUserInput("");
      setShowInputPanel(false);
    } catch (error) {
      console.error("Analysis or Save failed:", error);
      // 如果是权限错误，调用专门的处理函数
      if (error && typeof error === 'object' && 'code' in error && error.code === 'permission-denied') {
        handleFirestoreError(error, OperationType.CREATE, "echoes");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (selectedMarker && user) {
      const resonanceId = `${user.uid}_${selectedMarker.id}`;
      const resonanceRef = doc(db, "resonances", resonanceId);
      getDoc(resonanceRef).then(docSnap => {
        setHasResonated(docSnap.exists());
      }).catch(err => {
        console.error("Error checking resonance:", err);
      });
    } else {
      setHasResonated(false);
    }
  }, [selectedMarker, user]);

  const handleResonate = async () => {
    if (!selectedMarker || !user || hasResonated || isResonating) return;

    setIsResonating(true);
    const resonanceId = `${user.uid}_${selectedMarker.id}`;
    const resonanceRef = doc(db, "resonances", resonanceId);
    const echoRef = doc(db, "echoes", selectedMarker.id);

    try {
      await runTransaction(db, async (transaction) => {
        const echoDoc = await transaction.get(echoRef);
        if (!echoDoc.exists()) {
          throw new Error("Echo does not exist!");
        }

        const resonanceDoc = await transaction.get(resonanceRef);
        if (resonanceDoc.exists()) {
          throw new Error("Already resonated!");
        }

        const newCount = (echoDoc.data().resonanceCount || 0) + 1;
        transaction.update(echoRef, { resonanceCount: newCount });
        transaction.set(resonanceRef, {
          uid: user.uid,
          echoId: selectedMarker.id,
          timestamp: serverTimestamp()
        });
      });

      setHasResonated(true);
      // Update local selected marker count for immediate feedback
      setSelectedMarker(prev => prev ? { ...prev, resonanceCount: prev.resonanceCount + 1 } : null);
    } catch (error) {
      console.error("Resonance failed:", error);
      handleFirestoreError(error, OperationType.UPDATE, "echoes");
    } finally {
      setIsResonating(false);
    }
  };

  useEffect(() => {
    // 初始位置设为用户指定的娄江新城
    const initialLat = 31.483645701648424;
    const initialLng = 121.15900068964022;
    setMapCenterCoords({ lat: initialLat, lng: initialLng });
    setMapEmbedUrl(`https://www.google.com/maps?q=${initialLat},${initialLng}&output=embed&z=16`);
    
    // 尝试在后台更新到真实位置
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      setMapCenterCoords({ lat: latitude, lng: longitude });
      setMapEmbedUrl(`https://www.google.com/maps?q=${latitude},${longitude}&output=embed&z=16`);
      setIsLoadingMap(false);
    }, () => {
      console.log("Using default initial location");
      setIsLoadingMap(false);
    });
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-100 pb-24">
      {/* Hero Section */}
      <header className="relative overflow-hidden pt-16 pb-8 px-6 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4 fill-current" />
            <span>{t.appName} · {t.appStatus}</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">{t.heroTitle}</h1>
          
          <div className="max-w-xl mx-auto mt-8 space-y-4">
            <form onSubmit={handleSearch} className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full pl-12 pr-32 py-4 bg-white rounded-2xl border border-slate-200 shadow-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <button
                type="submit"
                disabled={isSearching}
                className="absolute right-2 top-2 bottom-2 px-6 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 disabled:bg-slate-400 transition-colors flex items-center gap-2"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : t.searchBtn}
              </button>
            </form>

            <div className="flex items-center justify-center gap-4">
              {user ? (
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setShowChallengeModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-600 rounded-full border border-purple-100 shadow-sm hover:bg-purple-100 transition-all"
                  >
                    <Brain className="w-4 h-4" />
                    <span className="text-sm font-bold">{t.emotionChallenge}</span>
                  </button>
                  <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-slate-200 shadow-sm">
                    <img src={user.photoURL || ""} alt={user.displayName || ""} className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                    <span className="text-sm font-bold">{user.displayName}</span>
                  </div>
                  <button onClick={handleSignOut} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={handleSignIn}
                  className="flex items-center gap-2 px-6 py-3 bg-white text-slate-900 rounded-2xl font-bold border border-slate-200 shadow-xl hover:bg-slate-50 transition-all"
                >
                  <LogIn className="w-5 h-5" />
                  <span>{t.loginBtn}</span>
                </button>
              )}
            </div>
            
            {/* Language Switcher */}
            <div className="flex items-center justify-center mt-4">
              <button
                onClick={() => setLang(lang === "zh" ? "en" : "zh")}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-full border border-slate-200 shadow-sm hover:bg-slate-200 transition-all font-bold text-sm"
              >
                <Orbit className="w-4 h-4" />
                <span>{lang === "zh" ? "EN" : "中文"}</span>
              </button>
            </div>
          </div>
        </motion.div>
      </header>

      {/* Main Content Area based on activeTab */}
      <main className="relative z-0">
        {activeTab === "map" && (
          <section className="max-w-5xl mx-auto px-6 py-8 relative">
            <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <p className="text-slate-500 text-sm">{t.mapHint}</p>
              </div>
              
              <div className="flex gap-2 overflow-x-auto pb-2">
                {Object.entries(emotionConfig).map(([key, config]) => (
                  <div key={key} className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-full border border-slate-100 shadow-sm text-[10px] font-bold uppercase tracking-wider">
                    <span className={`w-2 h-2 rounded-full ${config.color}`} />
                    <span>{config.label[lang]}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative aspect-[16/9] bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl border-8 border-white group">
              {mapCenterCoords && (
                <MapContainer
                  center={[mapCenterCoords.lat, mapCenterCoords.lng]}
                  zoom={16}
                  zoomControl={true}
                  scrollWheelZoom={true}
                  touchZoom={true}
                  doubleClickZoom={true}
                  className="absolute inset-0 z-10 h-full w-full"
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapController center={mapCenterCoords} />
                  
                  {markers.map((marker) => (
                    <Marker
                      key={marker.id}
                      position={[marker.lat, marker.lng]}
                      icon={L.divIcon({
                        className: 'custom-div-icon',
                        html: `
                          <div class="relative group">
                            <span class="absolute inset-0 rounded-full animate-ping opacity-75 ${emotionConfig[marker.emotion].color}"></span>
                            <div class="w-6 h-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-[12px] ${emotionConfig[marker.emotion].color} ${emotionConfig[marker.emotion].shadow}">
                              ${emotionConfig[marker.emotion].icon}
                            </div>
                          </div>
                        `,
                        iconSize: [24, 24],
                        iconAnchor: [12, 12],
                      })}
                      eventHandlers={{
                        click: () => setSelectedMarker(marker),
                      }}
                    />
                  ))}
                </MapContainer>
              )}

              <div className="absolute inset-0 bg-slate-900/5 pointer-events-none z-20" />

              {(isLoadingMap || isSearching) && (
                <div className="absolute inset-0 z-30 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center text-white">
                  <Loader2 className="w-12 h-12 animate-spin mb-4 text-blue-400" />
                  <p className="font-medium animate-pulse">
                    {isSearching ? t.searchingLocation : t.syncingMap}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "drawer" && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto px-6 py-12"
          >
            <div className="bg-white rounded-[3rem] p-10 shadow-xl border border-slate-100">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
                  <Archive className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900">{t.navDrawer}</h2>
                  <p className="text-slate-500 text-sm">{t.drawerSub}</p>
                </div>
              </div>
              <div className="space-y-4">
                {markers.filter(m => m.uid === user?.uid).length > 0 ? (
                  markers.filter(m => m.uid === user?.uid).map(m => (
                    <div key={m.id} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-2xl">{emotionConfig[m.emotion].icon}</span>
                        <div>
                          <p className="text-slate-900 font-bold line-clamp-1">{m.text}</p>
                          <p className="text-slate-400 text-xs">{m.timestamp}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-blue-600">
                        <Heart className="w-4 h-4 fill-current" />
                        <span className="text-xs font-black">{m.resonanceCount}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-20 text-slate-300">
                    <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="font-bold">{t.drawerEmpty}</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === "inbox" && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto px-6 py-12"
          >
            <div className="bg-white rounded-[3rem] p-10 shadow-xl border border-slate-100">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-16 h-16 bg-pink-100 rounded-2xl flex items-center justify-center text-pink-600">
                  <Inbox className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900">{t.navInbox}</h2>
                  <p className="text-slate-500 text-sm">{t.inboxSub}</p>
                </div>
              </div>
              <div className="text-center py-20 text-slate-300">
                <Bell className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="font-bold">{t.inboxEmpty}</p>
                <p className="text-xs mt-2">{t.inboxEmptySub}</p>
              </div>
            </div>
          </motion.div>
        )}
      </main>

      {/* Input Panel Modal */}
      <AnimatePresence>
        {showInputPanel && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl relative"
            >
              <button onClick={() => setShowInputPanel(false)} className="absolute top-6 right-6 p-2 hover:bg-slate-100 rounded-full">
                <X className="w-5 h-5 text-slate-400" />
              </button>
              
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-blue-100 rounded-2xl text-blue-600">
                  <Mic className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">{t.recordTitle}</h3>
                  <p className="text-slate-500 text-sm">{t.recordSub}</p>
                </div>
              </div>

              <textarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder={t.recordPlaceholder}
                className="w-full h-32 p-4 bg-slate-50 rounded-2xl border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none resize-none mb-6 transition-all"
              />

              <button
                onClick={handleAnalyzeAndPin}
                disabled={isAnalyzing || !userInput.trim()}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 disabled:bg-slate-300 transition-all shadow-lg shadow-blue-200"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{t.analyzing}</span>
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    <span>{t.sendBtn}</span>
                  </>
                )}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Care Card Modal */}
      <AnimatePresence>
        {activeCareCard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center px-6 bg-slate-900/40 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl border border-slate-100 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400" />
              
              <div className="text-center">
                <div className="text-5xl mb-6">{activeCareCard.icon}</div>
                <h3 className="text-2xl font-bold text-slate-900 mb-2">{activeCareCard.title}</h3>
                <p className="text-slate-600 leading-relaxed mb-8">
                  {activeCareCard.task}
                </p>
                
                <button
                  onClick={() => setActiveCareCard(null)}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-95"
                >
                  {t.gotIt}
                </button>
              </div>
              
              <div className="mt-6 text-center">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                  {t.careFooter}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Challenge Modal */}
      <AnimatePresence>
        {showChallengeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center px-6 bg-slate-900/40 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-slate-100 relative overflow-hidden"
            >
              <button 
                onClick={() => setShowChallengeModal(false)} 
                className="absolute top-6 right-6 p-2 hover:bg-slate-100 rounded-full z-10"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>

              <div className="flex items-center gap-4 mb-8">
                <div className="p-4 bg-purple-100 rounded-2xl">
                  {currentChallenge.icon}
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">{currentChallenge.title}</h3>
                  <span className="text-xs font-black text-purple-500 uppercase tracking-widest">{t.challengeStatus}</span>
                </div>
              </div>

              <p className="text-slate-600 leading-relaxed mb-8">
                {currentChallenge.description}
              </p>

              <div className="bg-slate-50 rounded-3xl p-6 mb-8">
                <div className="flex justify-between items-end mb-4">
                  <span className="text-sm font-bold text-slate-500">{t.challengeProgress}</span>
                  <span className="text-2xl font-black text-slate-900">
                    {currentChallenge.currentCount}<span className="text-sm text-slate-400 font-bold ml-1">/ {currentChallenge.targetCount}</span>
                  </span>
                </div>
                <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(currentChallenge.currentCount / currentChallenge.targetCount) * 100}%` }}
                    className="h-full bg-gradient-to-r from-purple-500 to-indigo-500"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-4 text-center font-bold uppercase tracking-wider">
                  {t.challengeReward}
                </p>
              </div>

              <button
                onClick={() => {
                  setShowChallengeModal(false);
                  setShowInputPanel(true);
                }}
                className="w-full py-4 bg-purple-600 text-white rounded-2xl font-bold hover:bg-purple-700 transition-all shadow-lg shadow-purple-100 active:scale-95 flex items-center justify-center gap-2"
              >
                <Mic className="w-5 h-5" />
                <span>{t.challengeBtn}</span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Resonance Match Modal */}
      <AnimatePresence>
        {matchedEcho && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center px-6 bg-slate-900/40 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-slate-100 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-400 via-pink-400 to-purple-400" />
              
              <div className="text-center">
                <div className="w-20 h-20 bg-pink-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Heart className="w-10 h-10 text-pink-500 animate-pulse" />
                </div>
                
                <h3 className="text-2xl font-bold text-slate-900 mb-4">{t.matchTitle}</h3>
                
                <div className="bg-slate-50 rounded-3xl p-6 mb-8 text-left border border-slate-100">
                  <p className="text-slate-700 italic mb-4">“{matchedEcho.text}”</p>
                  <div className="flex items-center gap-2 text-slate-400 text-xs font-bold">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{t.matchLocation} {matchedEcho.locationName} {t.matchLocationSuffix}</span>
                  </div>
                </div>

                <p className="text-slate-600 mb-8 font-medium">
                  {t.matchSub}
                </p>
                
                <button
                  onClick={() => setMatchedEcho(null)}
                  className="w-full py-4 bg-pink-500 text-white rounded-2xl font-bold hover:bg-pink-600 transition-all shadow-lg shadow-pink-100 active:scale-95"
                >
                  {t.matchBtn}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Blind Box Loading Overlay */}
      <AnimatePresence>
        {isOpeningBlindBox && (
          <div className="fixed inset-0 z-[150] bg-slate-900 flex flex-col items-center justify-center text-white overflow-hidden">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
              className="relative w-64 h-64 flex items-center justify-center"
            >
              <div className="absolute inset-0 border-2 border-blue-500/20 rounded-full" />
              <div className="absolute inset-4 border border-purple-500/30 rounded-full" />
              <Orbit className="w-12 h-12 text-blue-400 animate-pulse" />
            </motion.div>
            <div className="mt-12 text-center">
              <h2 className="text-2xl font-bold mb-2 tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">{t.blindBoxLoading}</h2>
              <p className="text-slate-400 text-sm animate-pulse">{t.blindBoxSub}</p>
            </div>
            {/* Background Stars Effect */}
            <div className="absolute inset-0 pointer-events-none">
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: Math.random() * 3 + 2, repeat: Infinity, delay: Math.random() * 5 }}
                  className="absolute w-1 h-1 bg-white rounded-full"
                  style={{
                    top: `${Math.random() * 100}%`,
                    left: `${Math.random() * 100}%`
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-[100] px-6 pb-6 pointer-events-none">
        <div className="max-w-lg mx-auto bg-white/80 backdrop-blur-2xl rounded-[2.5rem] shadow-2xl border border-white/50 p-2 flex items-center justify-between pointer-events-auto relative">
          
          {/* Echo Map */}
          <button
            onClick={() => setActiveTab("map")}
            className={`flex flex-col items-center justify-center w-16 h-16 rounded-3xl transition-all ${activeTab === "map" ? "text-blue-600 bg-blue-50" : "text-slate-400 hover:bg-slate-50"}`}
          >
            <Compass className={`w-6 h-6 ${activeTab === "map" ? "animate-pulse" : ""}`} />
            <span className="text-[10px] font-bold mt-1">{t.navMap}</span>
          </button>

          {/* Blind Box */}
          <button
            onClick={handleOpenBlindBox}
            className={`flex flex-col items-center justify-center w-16 h-16 rounded-3xl transition-all ${activeTab === "blindbox" ? "text-purple-600 bg-purple-50" : "text-slate-400 hover:bg-slate-50"}`}
          >
            <Orbit className={`w-6 h-6 ${isOpeningBlindBox ? "animate-spin" : ""}`} />
            <span className="text-[10px] font-bold mt-1">{t.navBlindBox}</span>
          </button>

          {/* Central Recording */}
          <div className="relative -top-6">
            <button
              onClick={() => setShowInputPanel(true)}
              className="w-20 h-20 bg-slate-900 text-white rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex items-center justify-center hover:scale-110 active:scale-95 transition-all group border-4 border-white"
            >
              <div className="absolute inset-0 bg-blue-500 rounded-full opacity-0 group-hover:opacity-20 animate-ping" />
              <Mic className="w-8 h-8" />
            </button>
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{t.navRecord}</span>
            </div>
          </div>

          {/* Time Drawer */}
          <button
            onClick={() => setActiveTab("drawer")}
            className={`flex flex-col items-center justify-center w-16 h-16 rounded-3xl transition-all ${activeTab === "drawer" ? "text-indigo-600 bg-indigo-50" : "text-slate-400 hover:bg-slate-50"}`}
          >
            <Archive className="w-6 h-6" />
            <span className="text-[10px] font-bold mt-1">{t.navDrawer}</span>
          </button>

          {/* Resonance Box */}
          <button
            onClick={() => setActiveTab("inbox")}
            className={`flex flex-col items-center justify-center w-16 h-16 rounded-3xl transition-all ${activeTab === "inbox" ? "text-pink-600 bg-pink-50" : "text-slate-400 hover:bg-slate-50"}`}
          >
            <div className="relative">
              <Inbox className="w-6 h-6" />
              <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-bounce" />
            </div>
            <span className="text-[10px] font-bold mt-1">{t.navInbox}</span>
          </button>

        </div>
      </nav>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedMarker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl relative"
            >
              <button onClick={() => setSelectedMarker(null)} className="absolute top-6 right-6 p-2 hover:bg-slate-100 rounded-full z-10">
                <X className="w-5 h-5 text-slate-400" />
              </button>

              <div className={`h-40 ${emotionConfig[selectedMarker.emotion].color} flex items-center justify-center text-7xl`}>
                {emotionConfig[selectedMarker.emotion].icon}
              </div>

              <div className="p-10">
                <div className="flex items-center gap-3 mb-6">
                  <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest text-white ${emotionConfig[selectedMarker.emotion].color}`}>
                    {emotionConfig[selectedMarker.emotion].label[lang]}
                  </span>
                  <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{selectedMarker.timestamp}</span>
                  </div>
                </div>

                <div className="flex items-start gap-4 mb-10">
                  <MessageCircle className="w-6 h-6 text-blue-500 mt-1 shrink-0" />
                  <p className="text-slate-700 text-lg leading-relaxed italic font-serif">
                    “{selectedMarker.text}”
                  </p>
                </div>

                <div className="flex items-center justify-between pt-8 border-t border-slate-100">
                  <div className="flex items-center gap-2 text-slate-500">
                    <MapPin className="w-4 h-4 text-red-400" />
                    <span className="text-sm font-bold">{selectedMarker.locationName}</span>
                  </div>
                  <button 
                    onClick={handleResonate}
                    disabled={!user || hasResonated || isResonating}
                    className={`flex items-center gap-2 text-sm font-black uppercase tracking-tighter transition-all ${
                      hasResonated ? 'text-green-500 cursor-default' : 'text-blue-600 hover:tracking-normal'
                    }`}
                  >
                    {isResonating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : hasResonated ? (
                      <Heart className="w-4 h-4 fill-current" />
                    ) : (
                      <Heart className="w-4 h-4" />
                    )}
                    {hasResonated ? t.resonateDone : t.resonateBtn}
                    <span className="ml-1 px-2 py-0.5 bg-slate-100 rounded-full text-[10px]">
                      {selectedMarker.resonanceCount}
                    </span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="py-12 text-center text-slate-400 text-xs font-medium tracking-widest uppercase">
        <p>© 2024 Echo Map · Powered by Gemini 3.1 Pro & Google Maps</p>
      </footer>
    </div>
  );
}
