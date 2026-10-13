import React, { useEffect, useState, useRef } from 'react';
import { getSellerPendingOrders, acceptSellerOrder, getSellerConfirmedOrders } from '../services/api';
import { useSmartVoice } from '../context/SmartVoiceContext';
import { SellerCommerceView } from './SellerCommerceView';
import { SellerListings } from './SellerListings';
import { getTranslation } from '../utils/translations';
import { 
    isNewSaleIntent, 
    isMyProductsIntent, 
    isAcceptOrderIntent, 
    isInterestIntent, 
    isHomeIntent, 
    isLogoutIntent 
} from '../utils/voiceMatcher';

export const SellerDashboard = ({ language, user }) => {
    const { 
        setPageContext,
        setScreenInstruction, 
        setGuidePrompt, 
        speak, 
        registerVoiceHandler, 
        unregisterVoiceHandler 
    } = useSmartVoice();
    const t = getTranslation(language);

    const [viewMode, setViewMode] = useState('dashboard'); // 'dashboard' | 'commerce' | 'listings'
    const [pendingOrders, setPendingOrders] = useState([]);
    const [confirmedOrders, setConfirmedOrders] = useState([]);
    const [activePromptOrderId, setActivePromptOrderId] = useState(null);

    const spokenOrdersRef = useRef(new Set());
    const spokenConfirmedRef = useRef(new Set());

    // Screen instructions and 1-Click Guide Prompts
    useEffect(() => {
        if (viewMode !== 'dashboard') return;

        const pageCtx = language === 'ta-IN' ? "விற்பனையாளர் முகப்பு / Seller Home" : "Seller Home";
        setPageContext(pageCtx);

        const instruction = t.screenSellerDashboard || (
            language === 'ta-IN'
                ? "விற்பனையாளர் முகப்பு. புதிய விற்பனை அல்லது தயாரிப்புகளைக் காண மைக்ரோஃபோனை தட்டுங்கள்."
                : "Seller Home. Tap mic to list items, check product listings, or accept buyer interest."
        );
        setScreenInstruction(instruction);

        const guide = t.sellerGuidePrompt || (
            language === 'ta-IN'
                ? "புதிய விற்பனை தொடங்க 'விற்பனை' என்று சொல்லுங்கள். உங்கள் பொருட்களைப் பார்க்க 'பொருட்கள்' என்று சொல்லுங்கள். வாங்குபவர் ஆர்வத்தைக் காண 'ஆர்வம்' அல்லது 'ஏற்றுக்கொள்' என்று சொல்லுங்கள்."
                : "Please say 'New Sale' to list items, 'My Products' to see your listings, or 'Interest' or 'Accept' for buyer invitations."
        );
        setGuidePrompt(guide);

        return () => {
            setPageContext('');
        };
    }, [viewMode, language, setPageContext, setScreenInstruction, setGuidePrompt, t]);

    // Poll for pending orders (Step 2) and confirmed orders (Step 4)
    useEffect(() => {
        if (viewMode !== 'dashboard') return;

        const checkSellerOrders = async () => {
            try {
                // 1. Step 2: Check for interest_expressed orders
                const pendingRes = await getSellerPendingOrders(user.user_id, language);
                const pOrders = pendingRes.orders || [];
                setPendingOrders(pOrders);

                if (pOrders.length > 0) {
                    const latest = pOrders[0];
                    if (!spokenOrdersRef.current.has(latest.order_id)) {
                        spokenOrdersRef.current.add(latest.order_id);
                        setActivePromptOrderId(latest.order_id);

                        // Trigger exact voice notification: "You have a buyer interested. Say 'Accept' to invite."
                        const notification = pendingRes.voice_notification || (
                            language === 'ta-IN'
                                ? "உங்களிடம் ஒரு வாங்குபவர் ஆர்வமாக உள்ளார். அழைக்க 'ஏற்றுக்கொள்' என்று சொல்லுங்கள்."
                                : "You have a buyer interested. Say 'Accept' to invite."
                        );
                        speak(notification, language);
                    }
                }

                // 2. Step 4: Check for confirmed orders (Amount Received)
                const confRes = await getSellerConfirmedOrders(user.user_id, language);
                const cOrders = confRes.confirmed_orders || [];
                setConfirmedOrders(cOrders);

                if (cOrders.length > 0) {
                    const latestConf = cOrders[0];
                    if (!spokenConfirmedRef.current.has(latestConf.order_id)) {
                        spokenConfirmedRef.current.add(latestConf.order_id);

                        // Audio confirmation prompt: "Amount Received: ₹{amount} for {item_title}..."
                        if (latestConf.audio_confirmation_prompt) {
                            speak(latestConf.audio_confirmation_prompt, language);
                        }
                    }
                }
            } catch (err) {
                console.error("Seller order sync error:", err);
            }
        };

        checkSellerOrders();
        const interval = setInterval(checkSellerOrders, 3000);

        return () => clearInterval(interval);
    }, [user.user_id, language, viewMode, speak]);

    // Register active voice command handler for 1-Click Voice Navigation & Actions
    useEffect(() => {
        if (viewMode !== 'dashboard') return;

        const handleVoiceInput = async (spokenText) => {
            if (!spokenText) return;
            console.log("[Seller Voice Input Command Received]:", spokenText);

            // 1. Accept Order Intent: 'ஏற்றுக்கொள்', 'accept', 'ok', 'yes', 'ஆம்'
            if (isAcceptOrderIntent(spokenText)) {
                if (pendingOrders.length > 0) {
                    const targetId = activePromptOrderId || pendingOrders[0].order_id;
                    handleAcceptOrder(targetId);
                    return;
                }
            }

            // 2. My Products / List Intent: 'பொருட்கள்', 'என்', 'my', 'products', 'items', 'list'
            if (isMyProductsIntent(spokenText)) {
                const navMsg = t.navigatingToListings || (
                    language === 'ta-IN' ? "உங்கள் விற்பனைப் பொருட்கள் பக்கத்திற்குச் செல்கிறது..." : "Navigating to Product Listings..."
                );
                speak(navMsg, language);
                setViewMode('listings');
                return;
            }

            // 3. New Sale / Add Product Intent: 'புதிய', 'விற்பனை', 'சேர்', 'add', 'new', 'sell', 'create'
            if (isNewSaleIntent(spokenText)) {
                const navMsg = t.navigatingToSale || (
                    language === 'ta-IN' ? "புதிய விற்பனை பக்கத்திற்குச் செல்கிறது..." : "Navigating to New Sale..."
                );
                speak(navMsg, language);
                setViewMode('commerce');
                return;
            }

            // 4. Buyer Interest Check Intent: 'ஆர்வம்', 'புதிய ஆர்வம்', 'வாங்குபவர்', 'interest'
            if (isInterestIntent(spokenText)) {
                if (pendingOrders.length > 0) {
                    const order = pendingOrders[0];
                    const announceMsg = language === 'ta-IN'
                        ? `உங்களிடம் ஒரு வாங்குபவர் ஆர்வம் உள்ளது. ${order.buyer_name}, ${order.item_title} ${order.quantity} ${order.unit} கேட்கிறார். அழைக்க 'ஏற்றுக்கொள்' என்று சொல்லுங்கள்.`
                        : `You have buyer interest from ${order.buyer_name} for ${order.item_title}. Say 'Accept' to invite.`;
                    speak(announceMsg, language);
                } else {
                    const noMsg = t.noBuyerInterests || (
                        language === 'ta-IN' ? "தற்போது புதிய வாங்குபவர் ஆர்வங்கள் எதுவும் இல்லை." : "There are no new buyer interests at the moment."
                    );
                    speak(noMsg, language);
                }
                return;
            }

            // 5. Home / Back Intent: 'முகப்பு', 'திரும்ப', 'home', 'back'
            if (isHomeIntent(spokenText)) {
                speak(t.navigatingHome || "முகப்பிற்குத் திரும்புகிறது...", language);
                setViewMode('dashboard');
                return;
            }

            // 6. Logout Intent: 'வெளியேறு', 'logout'
            if (isLogoutIntent(spokenText)) {
                sessionStorage.clear();
                window.location.href = '/';
                return;
            }
        };

        registerVoiceHandler(handleVoiceInput);
        return () => unregisterVoiceHandler();
    }, [pendingOrders, activePromptOrderId, viewMode, language, t, speak, registerVoiceHandler, unregisterVoiceHandler]);

    // Step 2: Accept Order
    const handleAcceptOrder = async (orderId) => {
        try {
            const res = await acceptSellerOrder(orderId, user.user_id, language);
            setPendingOrders(prev => prev.filter(o => o.order_id !== orderId));
            setActivePromptOrderId(null);

            if (res.voice_prompt) {
                speak(res.voice_prompt, language);
            }
        } catch (err) {
            console.error("Order acceptance error:", err);
            alert("Could not accept order. Please try again.");
        }
    };

    if (viewMode === 'commerce') {
        return (
            <SellerCommerceView 
                language={language} 
                user={user} 
                onBack={() => setViewMode('dashboard')}
                onViewListings={() => setViewMode('listings')} 
            />
        );
    }
    
    if (viewMode === 'listings') {
        return (
            <SellerListings 
                language={language} 
                user={user} 
                onBack={() => setViewMode('dashboard')}
                onNewSale={() => setViewMode('commerce')}
            />
        );
    }

    return (
        <div className="w-full max-w-4xl mx-auto flex flex-col items-center p-6 text-white pb-36 relative">
            {/* Logout button */}
            <button 
                onClick={() => {
                    sessionStorage.clear();
                    window.location.href = '/';
                }}
                className="absolute top-6 right-6 px-4 py-2 bg-red-600/80 hover:bg-red-500 text-white font-bold rounded-xl text-xs shadow-lg transition-colors"
            >
                {language === 'ta-IN' ? "வெளியேறு" : "Logout"}
            </button>

            <h1 className="text-4xl md:text-5xl font-black text-white mb-2 mt-4 text-center">
                {language === 'ta-IN' ? "வணக்கம்" : "Welcome"}, <span className="text-amber-400">{user.name}!</span>
            </h1>
            <p className="text-gray-400 text-sm mb-8 text-center">
                📍 {user.village || 'Tamil Nadu'} • 🌾 {language === 'ta-IN' ? "விற்பனையாளர் டாஷ்போர்டு" : "Producer Dashboard"}
            </p>

            {/* ─── STEP 2: PENDING BUYER INTEREST NOTIFICATION CARD ─── */}
            {pendingOrders.length > 0 && (
                <div className="w-full bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 border-2 border-amber-400/80 rounded-3xl p-6 shadow-[0_0_40px_rgba(245,158,11,0.3)] mb-8 animate-pulse">
                    <div className="flex items-center gap-3 mb-4">
                        <span className="text-3xl animate-bounce">🔔</span>
                        <div>
                            <span className="text-xs font-black uppercase tracking-wider text-amber-400">
                                {language === 'ta-IN' ? "புதிய வாங்குபவர் ஆர்வம்" : "New Buyer Interest"}
                            </span>
                            <h3 className="text-xl font-black text-white">
                                {language === 'ta-IN' ? "உங்களிடம் ஒரு வாங்குபவர் ஆர்வமாக உள்ளார்!" : "You have a buyer interested!"}
                            </h3>
                        </div>
                    </div>

                    {pendingOrders.map(order => (
                        <div key={order.order_id} className="bg-[#0A1324] border border-amber-500/40 rounded-2xl p-5 mb-3 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <p className="text-lg font-bold text-amber-300">
                                    📦 {order.item_title} • {order.quantity} {order.unit}
                                </p>
                                <p className="text-white text-sm font-semibold mt-1">
                                    👤 {order.buyer_name} ({order.buyer_village}) • 📞 {order.buyer_phone}
                                </p>
                                <p className="text-emerald-400 font-extrabold text-lg mt-1">
                                    ₹{order.total_amount}
                                </p>
                            </div>

                            <button
                                onClick={() => handleAcceptOrder(order.order_id)}
                                className="w-full md:w-auto px-8 py-3.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-black rounded-xl shadow-[0_0_25px_rgba(16,185,129,0.5)] transform hover:scale-105 transition-all text-base flex items-center justify-center gap-2"
                            >
                                <span>🤝</span>
                                <span>{language === 'ta-IN' ? "ஏற்றுக்கொள் (Accept)" : "Say 'Accept' / Tap"}</span>
                            </button>
                        </div>
                    ))}
                    <p className="text-center text-xs text-amber-300/80 mt-2">
                        {language === 'ta-IN'
                            ? "அழைக்க 'ஏற்றுக்கொள்' என்று சொல்லுங்கள் அல்லது பொத்தானை தட்டவும்."
                            : "Say 'Accept' aloud or tap the button above to invite buyer."}
                    </p>
                </div>
            )}

            {/* ─── STEP 4: AMOUNT RECEIVED CONFIRMED CARDS ─── */}
            {confirmedOrders.length > 0 && (
                <div className="w-full mb-8">
                    <h3 className="text-xl font-bold text-emerald-400 mb-4 flex items-center gap-2">
                        <span>💰</span>
                        <span>{language === 'ta-IN' ? "பெறப்பட்ட தொகை & உறுதிப்படுத்தப்பட்ட ஆர்டர்கள்" : "Amount Received & Confirmed Orders"}</span>
                    </h3>

                    <div className="space-y-4">
                        {confirmedOrders.map(order => (
                            <div 
                                key={order.order_id} 
                                className="bg-[#081C26]/90 border-2 border-emerald-500/80 rounded-2xl p-6 shadow-[0_0_35px_rgba(16,185,129,0.3)] flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
                            >
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-emerald-950 text-emerald-300 text-xs font-black uppercase px-3 py-1 rounded-full border border-emerald-600">
                                            {order.status_localized || order.status}
                                        </span>
                                        <span className="text-xs text-gray-400">Order #{order.order_id}</span>
                                    </div>
                                    <h4 className="text-2xl font-black text-white">{order.item_title}</h4>
                                    <p className="text-gray-300 text-sm">
                                        👤 {order.buyer_name} ({order.buyer_village}) • {order.quantity} {order.unit}
                                    </p>
                                </div>

                                <div className="text-right flex md:flex-col items-center md:items-end justify-between w-full md:w-auto">
                                    <div>
                                        <p className="text-xs uppercase tracking-wider text-emerald-400 font-bold">
                                            {language === 'ta-IN' ? "தொகை பெறப்பட்டது" : "Amount Received"}
                                        </p>
                                        <p className="text-3xl font-black text-amber-400">{order.amount_received_display}</p>
                                    </div>
                                    {order.audio_confirmation_prompt && (
                                        <button
                                            onClick={() => speak(order.audio_confirmation_prompt, language)}
                                            className="mt-2 text-xs bg-slate-800 hover:bg-slate-700 text-cyan-300 px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1.5"
                                        >
                                            <span>🔊</span>
                                            <span>{language === 'ta-IN' ? "ஒலியை மீண்டும் கேள்" : "Replay Audio"}</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Seller Action Tiles */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full mt-4">
                <div 
                    onClick={() => setViewMode('commerce')}
                    className="flex flex-col items-center justify-center p-8 bg-[#09152B]/80 rounded-3xl border border-slate-700 hover:border-cyan-500/60 shadow-2xl cursor-pointer hover:scale-[1.02] transition-all"
                >
                    <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-[0_0_35px_rgba(6,182,212,0.6)] flex items-center justify-center mb-4">
                        <span className="text-4xl">🏷️</span>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-1">
                        {language === 'ta-IN' ? "புதிய விற்பனை" : "New Listing"}
                    </h2>
                    <p className="text-gray-400 text-xs text-center">
                        {language === 'ta-IN' ? "3 எளிய படிகளில் பதிவு செய்யுங்கள்" : "List items with 3-step voice wizard"}
                    </p>
                </div>

                <div 
                    onClick={() => setViewMode('listings')}
                    className="flex flex-col items-center justify-center p-8 bg-[#09152B]/80 rounded-3xl border border-slate-700 hover:border-emerald-500/60 shadow-2xl cursor-pointer hover:scale-[1.02] transition-all"
                >
                    <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-600 shadow-[0_0_35px_rgba(16,185,129,0.6)] flex items-center justify-center mb-4">
                        <span className="text-4xl">📋</span>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-1">
                        {language === 'ta-IN' ? "என் விற்பனைப் பொருட்கள்" : "My Active Listings"}
                    </h2>
                    <p className="text-gray-400 text-xs text-center">
                        {language === 'ta-IN' ? "இருப்பு மற்றும் ஆர்வமுள்ள வாங்குபவர்கள்" : "Manage active items & buyers"}
                    </p>
                </div>
            </div>
        </div>
    );
};
